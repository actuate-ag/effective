import { spawnSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { EFFECT_SMOL_REPO } from './effect-version.ts';

export const SHARED_DIR_ENV = 'CLAUDE_CODE_EFFECT_REFERENCE_DIR';
const VERSION_MARKER = '.claude-code-effect-version';
/** Treat an existing .cloning dir as live if it was modified within this window. */
const IN_FLIGHT_CLONE_MS = 90_000;

const warn = (message: string): void => {
	process.stderr.write(`claude-code-effect: ${message}\n`);
};

const readClonedTag = (refDir: string): string | null => {
	try {
		const text = readFileSync(join(refDir, VERSION_MARKER), 'utf8').trim();
		return text === '' ? null : text;
	} catch {
		return null;
	}
};

/**
 * If a sibling `.cloning` directory exists and was modified recently, another
 * session is mid-clone. Back off rather than racing the rename.
 */
const isCloneInFlight = (tmpDir: string): boolean => {
	if (!existsSync(tmpDir)) return false;
	try {
		const mtimeMs = statSync(tmpDir).mtimeMs;
		if (Date.now() - mtimeMs < IN_FLIGHT_CLONE_MS) return true;
	} catch {
		// fall through to clean up
	}
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// ignore — the next clone will try again
	}
	return false;
};

interface CloneOptions {
	/** When true, refuse to re-clone on version mismatch (shared-mode safety). */
	readonly strictVersion: boolean;
}

const cloneInto = (
	dir: string,
	version: string,
	opts: CloneOptions,
): boolean => {
	const tmpDir = `${dir}.cloning`;
	const tag = `effect@${version}`;

	if (existsSync(join(dir, '.git'))) {
		const existingTag = readClonedTag(dir);
		if (existingTag === tag) return true;

		if (opts.strictVersion) {
			warn(
				`shared reference clone is at ${existingTag ?? '(unknown)'}, but ` +
					`this project pins ${tag}. Skipping update to protect other ` +
					`projects using the shared clone. Either align effect versions ` +
					`across your projects, or unset ${SHARED_DIR_ENV} to use a ` +
					`per-project clone.`,
			);
			return true;
		}

		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			return false;
		}
	}

	if (isCloneInFlight(tmpDir)) {
		warn(`another session appears to be cloning into ${tmpDir}; skipping`);
		return false;
	}

	try {
		mkdirSync(dirname(dir), { recursive: true });

		const result = spawnSync(
			'git',
			['clone', '--depth', '1', '--branch', tag, EFFECT_SMOL_REPO, tmpDir],
			{ stdio: ['ignore', 'ignore', 'pipe'] },
		);
		if (result.status !== 0) {
			try {
				rmSync(tmpDir, { recursive: true, force: true });
			} catch {
				// ignore
			}
			return false;
		}

		writeFileSync(join(tmpDir, VERSION_MARKER), tag);
		renameSync(tmpDir, dir);
		return true;
	} catch {
		try {
			if (existsSync(tmpDir)) {
				rmSync(tmpDir, { recursive: true, force: true });
			}
		} catch {
			// ignore
		}
		return false;
	}
};

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
): boolean => {
	try {
		mkdirSync(dirname(projectRefDir), { recursive: true });
	} catch {
		return false;
	}

	let stat;
	try {
		stat = lstatSync(projectRefDir);
	} catch {
		try {
			symlinkSync(sharedDir, projectRefDir, 'dir');
			return true;
		} catch (err) {
			warn(
				`failed to create symlink ${projectRefDir} -> ${sharedDir}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
			return false;
		}
	}

	if (stat.isSymbolicLink()) {
		try {
			if (readlinkSync(projectRefDir) === sharedDir) return true;
		} catch {
			// fall through to warning
		}
		warn(
			`${projectRefDir} is a symlink pointing somewhere other than ${sharedDir}; ` +
				`leaving it untouched. Remove it to use the shared clone.`,
		);
		return false;
	}

	warn(
		`${projectRefDir} already exists as a real directory. Remove it (or ` +
			`unset ${SHARED_DIR_ENV}) to use the shared clone.`,
	);
	return false;
};

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
 * failure rather than throwing — never blocks a Claude Code session.
 */
export const ensureReferenceClone = (
	projectDir: string,
	version: string,
): boolean => {
	const projectRefDir = join(projectDir, '.references', 'effect-v4');
	const sharedDir = process.env[SHARED_DIR_ENV];

	if (sharedDir === undefined || sharedDir === '') {
		return cloneInto(projectRefDir, version, { strictVersion: false });
	}

	const cloned = cloneInto(sharedDir, version, { strictVersion: true });
	if (!cloned) return false;

	return ensureProjectSymlink(projectRefDir, sharedDir);
};
