import { Effect, FileSystem, Path, pipe } from 'effect';
import * as Arr from 'effect/Array';
import * as Option from 'effect/Option';

const HARD_SKIP_DIRS = new Set(['.git', 'node_modules', '.references']);
const DEFAULT_EXTENSIONS: ReadonlyArray<string> = ['.ts', '.tsx'];

export interface WalkOptions {
	readonly extensions: ReadonlyArray<string>;
	readonly recursive: boolean;
	readonly followSymlinks: boolean;
	readonly respectGitignore: boolean;
}

export const defaultWalkOptions: WalkOptions = {
	extensions: DEFAULT_EXTENSIONS,
	recursive: true,
	followSymlinks: false,
	respectGitignore: true,
};

const matchesExtension = (
	filename: string,
	extensions: ReadonlyArray<string>,
): boolean => extensions.some((ext) => filename.endsWith(ext));

/**
 * Walk a directory tree (or yield a single file path), filtering to files
 * with one of the configured extensions, skipping hidden git/node/references
 * directories, and optionally skipping symlinks.
 *
 * Pure tree walk — no gitignore awareness. For gitignore filtering, see
 * {@link gitTrackedFiles}.
 */
export const walkDirectory = (
	root: string,
	options: WalkOptions,
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;

		const rootInfo = yield* fs.stat(root).pipe(Effect.option);
		if (Option.isNone(rootInfo)) return [] as ReadonlyArray<string>;

		if (rootInfo.value.type === 'File') {
			return matchesExtension(root, options.extensions)
				? ([root] as ReadonlyArray<string>)
				: ([] as ReadonlyArray<string>);
		}
		if (rootInfo.value.type !== 'Directory') return [] as ReadonlyArray<string>;

		const recurse = (
			dir: string,
		): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
			Effect.gen(function*() {
				const entries = yield* fs.readDirectory(dir).pipe(
					Effect.match({
						onFailure: () => [] as ReadonlyArray<string>,
						onSuccess: (xs) => xs,
					}),
				);

				const collected = yield* Effect.forEach(entries, (entry) =>
					Effect.gen(function*() {
						if (HARD_SKIP_DIRS.has(entry)) return [] as ReadonlyArray<string>;
						const full = path.join(dir, entry);

						if (!options.followSymlinks) {
							const linkOpt = yield* fs.readLink(full).pipe(
								Effect.match({
									onFailure: () => Option.none<string>(),
									onSuccess: Option.some,
								}),
							);
							if (Option.isSome(linkOpt)) return [] as ReadonlyArray<string>;
						}

						const info = yield* fs.stat(full).pipe(Effect.option);
						if (Option.isNone(info)) return [] as ReadonlyArray<string>;

						if (info.value.type === 'Directory') {
							return options.recursive
								? yield* recurse(full)
								: ([] as ReadonlyArray<string>);
						}
						if (
							info.value.type === 'File' &&
							matchesExtension(entry, options.extensions)
						) {
							return [full] as ReadonlyArray<string>;
						}
						return [] as ReadonlyArray<string>;
					}),
				);
				return collected.flatMap((xs) => xs);
			});

		return yield* recurse(root);
	});

/**
 * List the absolute paths of files tracked by (or untracked-but-not-ignored
 * under) git for `cwd`, filtered to the given extensions. Falls back to
 * `Option.none` when:
 *  - git isn't on PATH
 *  - cwd isn't inside a git repository
 *  - the spawn fails for any other reason
 *
 * Caller decides whether to fall back to a tree walk on `Option.none`.
 *
 * Boundary use of `Bun.spawnSync`: the v4 ChildProcess API exposes stdout as
 * a Sink, which is harder to drive synchronously for a one-shot read. Since
 * the audit CLI is itself a one-shot process, a synchronous spawn at the
 * runtime boundary is appropriate.
 */
export const gitTrackedFiles = (
	cwd: string,
	extensions: ReadonlyArray<string>,
): Effect.Effect<Option.Option<ReadonlyArray<string>>, never, Path.Path> =>
	Effect.gen(function*() {
		const path = yield* Path.Path;

		const text = yield* Effect.try({
			try: () => {
				const proc = Bun.spawnSync({
					cmd: [
						'git',
						'-C',
						cwd,
						'ls-files',
						'--cached',
						'--others',
						'--exclude-standard',
					],
					stdin: 'ignore',
					stdout: 'pipe',
					stderr: 'ignore',
				});
				return proc.success ? proc.stdout.toString('utf8') : null;
			},
			catch: () => null,
		}).pipe(
			Effect.match({
				onFailure: () => null,
				onSuccess: (s) => s,
			}),
		);

		if (text === null || text === '') return Option.none<ReadonlyArray<string>>();

		const lines = pipe(
			text.split('\n'),
			Arr.filter((line) => line !== ''),
		);
		const filtered = pipe(
			lines,
			Arr.filter((rel) => extensions.some((ext) => rel.endsWith(ext))),
			Arr.map((rel) => path.resolve(cwd, rel)),
		);
		return Option.some(filtered);
	});
