import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { EFFECT_SMOL_REPO } from './effect-version.ts';

const VERSION_MARKER = '.claude-code-effect-version';

const readClonedTag = (refDir: string): string | null => {
	try {
		const text = readFileSync(join(refDir, VERSION_MARKER), 'utf8').trim();
		return text === '' ? null : text;
	} catch {
		return null;
	}
};

/**
 * Ensure a shallow clone of Effect-TS/effect-smol exists at
 * `${projectDir}/.references/effect-v4/` pinned to `effect@<version>`.
 *
 * Idempotent: skips when the marker file matches. Re-clones on mismatch.
 * Atomic: clone happens in a sibling .cloning/ dir and is renamed into place.
 * Fail-silent: returns false on any failure rather than throwing — never
 * blocks a Claude Code session.
 *
 * Returns true if the clone is present-and-current after the call.
 */
export const ensureReferenceClone = (
	projectDir: string,
	version: string
): boolean => {
	const refsParent = join(projectDir, '.references');
	const refDir = join(refsParent, 'effect-v4');
	const tmpDir = `${refDir}.cloning`;
	const tag = `effect@${version}`;

	if (existsSync(join(refDir, '.git'))) {
		if (readClonedTag(refDir) === tag) return true;
		try {
			rmSync(refDir, { recursive: true, force: true });
		} catch {
			return false;
		}
	}

	try {
		mkdirSync(refsParent, { recursive: true });
		if (existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}

		const result = spawnSync(
			'git',
			['clone', '--depth', '1', '--branch', tag, EFFECT_SMOL_REPO, tmpDir],
			{ stdio: ['ignore', 'ignore', 'pipe'] }
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
		renameSync(tmpDir, refDir);
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
