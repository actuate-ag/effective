import { Clock, Config, Effect, FileSystem, Path, pipe } from 'effect';
import * as Option from 'effect/Option';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

import { EFFECT_SMOL_REPO } from './version.ts';

export const SHARED_DIR_ENV = 'CLAUDE_CODE_EFFECT_REFERENCE_DIR';
const VERSION_MARKER = '.claude-code-effect-version';
/** Treat an existing .cloning dir as live if it was modified within this window. */
const IN_FLIGHT_CLONE_MS = 90_000;

/**
 * Boundary write to `process.stderr`: the harness owns its diagnostic output
 * channel. A `Console` layer override would be more idiomatic in domain code,
 * but this module is the runtime adapter — direct stderr is appropriate.
 */
const warn = (message: string): Effect.Effect<void> =>
	Effect.sync(() => {
		process.stderr.write(`claude-code-effect: ${message}\n`);
	});

const readClonedTag = (
	refDir: string,
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		return yield* fs.readFileString(path.join(refDir, VERSION_MARKER)).pipe(
			Effect.match({
				onFailure: () => Option.none<string>(),
				onSuccess: (text) => {
					const trimmed = text.trim();
					return trimmed === '' ? Option.none<string>() : Option.some(trimmed);
				},
			}),
		);
	});

/**
 * If a sibling `.cloning` directory exists and was modified recently, another
 * session is mid-clone. Back off rather than racing the rename.
 */
const isCloneInFlight = (
	tmpDir: string,
): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(tmpDir).pipe(
			Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
		);
		if (!exists) return false;

		const info = yield* fs.stat(tmpDir).pipe(Effect.option);
		const now = yield* Clock.currentTimeMillis;
		const ageMs = pipe(
			info,
			Option.flatMap((s) => s.mtime),
			Option.map((m) => now - m.getTime()),
			Option.getOrElse(() => Number.POSITIVE_INFINITY),
		);
		if (ageMs < IN_FLIGHT_CLONE_MS) return true;

		yield* fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore);
		return false;
	});

interface CloneOptions {
	/** When true, refuse to re-clone on version mismatch (shared-mode safety). */
	readonly strictVersion: boolean;
}

const runGitClone = (
	tmpDir: string,
	tag: string,
): Effect.Effect<boolean, never, ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem> =>
	Effect.gen(function*() {
		const command = ChildProcess.make('git', [
			'clone',
			'--depth',
			'1',
			'--branch',
			tag,
			EFFECT_SMOL_REPO,
			tmpDir,
		], {
			stdin: 'ignore',
			stdout: 'ignore',
			stderr: 'ignore',
		});

		return yield* Effect.scoped(
			Effect.gen(function*() {
				const handle = yield* command;
				const exit = yield* handle.exitCode;
				return exit === 0;
			}),
		).pipe(Effect.match({ onFailure: () => false, onSuccess: (b) => b }));
	});

const cloneInto = (
	dir: string,
	version: string,
	opts: CloneOptions,
): Effect.Effect<
	boolean,
	never,
	FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const tmpDir = `${dir}.cloning`;
		const tag = `effect@${version}`;
		const gitDir = path.join(dir, '.git');

		const hasGit = yield* fs.exists(gitDir).pipe(Effect.match({ onFailure: () => false, onSuccess: (b) => b }));
		if (hasGit) {
			const existingTagOpt = yield* readClonedTag(dir);
			const existingTag = Option.getOrElse(existingTagOpt, () => '(unknown)');
			if (Option.isSome(existingTagOpt) && existingTagOpt.value === tag) return true;

			if (opts.strictVersion) {
				yield* warn(
					`shared reference clone is at ${existingTag}, but ` +
						`this project pins ${tag}. Skipping update to protect other ` +
						`projects using the shared clone. Either align effect versions ` +
						`across your projects, or unset ${SHARED_DIR_ENV} to use a ` +
						`per-project clone.`,
				);
				return true;
			}

			const removed = yield* fs.remove(dir, { recursive: true }).pipe(
				Effect.match({ onFailure: () => false, onSuccess: () => true }),
			);
			if (!removed) return false;
		}

		if (yield* isCloneInFlight(tmpDir)) {
			yield* warn(`another session appears to be cloning into ${tmpDir}; skipping`);
			return false;
		}

		const parentDir = path.dirname(dir);
		const parentMade = yield* fs.makeDirectory(parentDir, { recursive: true }).pipe(
			Effect.match({ onFailure: () => false, onSuccess: () => true }),
		);
		if (!parentMade) return false;

		const cloneOk = yield* runGitClone(tmpDir, tag);
		if (!cloneOk) {
			yield* fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore);
			return false;
		}

		const markerWritten = yield* fs.writeFileString(path.join(tmpDir, VERSION_MARKER), tag).pipe(
			Effect.match({ onFailure: () => false, onSuccess: () => true }),
		);
		if (!markerWritten) {
			yield* fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore);
			return false;
		}

		const renamed = yield* fs.rename(tmpDir, dir).pipe(
			Effect.match({ onFailure: () => false, onSuccess: () => true }),
		);
		if (!renamed) {
			yield* fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore);
			return false;
		}

		return true;
	});

/**
 * Make `<projectDir>/.references/effect-v4` resolve to `sharedDir`.
 *
 * Behavior:
 * - Missing: create the symlink.
 * - Already a symlink to `sharedDir`: no-op.
 * - Anything else (real directory, symlink elsewhere): warn + refuse.
 *
 * The skill bodies and CLAUDE.md fragment reference `.references/effect-v4/...`
 * literally, so this symlink is what makes shared mode transparent to them.
 */
const ensureProjectSymlink = (
	projectRefDir: string,
	sharedDir: string,
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const parentMade = yield* fs.makeDirectory(path.dirname(projectRefDir), { recursive: true })
			.pipe(Effect.match({ onFailure: () => false, onSuccess: () => true }));
		if (!parentMade) return false;

		// Use lstat-equivalent: stat with `followSymlink: false` not exposed; we use
		// readLink (fails on non-symlink) + exists (follows symlinks) to discriminate.
		const linkTarget = yield* fs.readLink(projectRefDir).pipe(
			Effect.match({
				onFailure: () => Option.none<string>(),
				onSuccess: Option.some,
			}),
		);

		if (Option.isSome(linkTarget)) {
			if (linkTarget.value === sharedDir) return true;
			yield* warn(
				`${projectRefDir} is a symlink pointing somewhere other than ${sharedDir}; ` +
					`leaving it untouched. Remove it to use the shared clone.`,
			);
			return false;
		}

		const existsAsRealDir = yield* fs.exists(projectRefDir).pipe(
			Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
		);
		if (existsAsRealDir) {
			yield* warn(
				`${projectRefDir} already exists as a real directory. Remove it (or ` +
					`unset ${SHARED_DIR_ENV}) to use the shared clone.`,
			);
			return false;
		}

		const result = yield* fs.symlink(sharedDir, projectRefDir).pipe(
			Effect.match({
				onFailure: (cause) => Option.some(cause.message),
				onSuccess: () => Option.none<string>(),
			}),
		);
		if (Option.isSome(result)) {
			yield* warn(`failed to create symlink ${projectRefDir} -> ${sharedDir}: ${result.value}`);
			return false;
		}
		return true;
	});

const readSharedDir: Effect.Effect<Option.Option<string>> = Effect.gen(function*() {
	const opt = yield* Config.option(Config.string(SHARED_DIR_ENV));
	return Option.flatMap(opt, (s) => (s === '' ? Option.none<string>() : Option.some(s)));
}).pipe(
	Effect.match({
		onFailure: () => Option.none<string>(),
		onSuccess: (o) => o,
	}),
);

/**
 * Ensure a shallow clone of Effect-TS/effect-smol is available to the project.
 *
 * Per-project mode (default): clone at `<projectDir>/.references/effect-v4`
 * pinned to `effect@<version>`. Re-clones on version mismatch.
 *
 * Shared mode (CLAUDE_CODE_EFFECT_REFERENCE_DIR set): clone once at the
 * shared path, then symlink `<projectDir>/.references/effect-v4` to it.
 * Refuses to re-clone on version mismatch (would hose other projects);
 * warns instead and leaves the existing clone in place.
 *
 * Atomic via .cloning/ tmpdir + rename. Fail-silent: returns false on any
 * failure rather than failing — never blocks a Claude Code session.
 */
export const ensureReferenceClone = (
	projectDir: string,
	version: string,
): Effect.Effect<
	boolean,
	never,
	FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner
> =>
	Effect.gen(function*() {
		const path = yield* Path.Path;
		const projectRefDir = path.join(projectDir, '.references', 'effect-v4');
		const sharedDir = yield* readSharedDir;

		if (Option.isNone(sharedDir)) {
			return yield* cloneInto(projectRefDir, version, { strictVersion: false });
		}

		const cloned = yield* cloneInto(sharedDir.value, version, { strictVersion: true });
		if (!cloned) return false;

		return yield* ensureProjectSymlink(projectRefDir, sharedDir.value);
	});
