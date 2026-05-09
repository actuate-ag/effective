import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureReferenceClone, SHARED_DIR_ENV } from '../src/reference/clone.ts';

const VERSION_MARKER = '.claude-code-effect-version';

const fakePopulatedClone = (dir: string, tag: string): void => {
	mkdirSync(join(dir, '.git'), { recursive: true });
	writeFileSync(join(dir, VERSION_MARKER), tag);
};

const mkTmp = (label: string): string => {
	const dir = join(
		tmpdir(),
		`cce-rc-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(dir, { recursive: true });
	return dir;
};

describe('ensureReferenceClone (shared mode)', () => {
	let projectDir: string;
	let sharedDir: string;

	beforeEach(() => {
		projectDir = mkTmp('proj');
		sharedDir = join(mkTmp('shared-parent'), 'effect-v4');
		process.env[SHARED_DIR_ENV] = sharedDir;
	});

	afterEach(() => {
		delete process.env[SHARED_DIR_ENV];
		try {
			rmSync(projectDir, { recursive: true, force: true });
		} catch {
			// ignore
		}
		try {
			rmSync(sharedDir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it('symlinks projectDir/.references/effect-v4 to the shared clone when shared dir matches version', () => {
		fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');

		const ok = ensureReferenceClone(projectDir, '4.0.0-beta.57');
		expect(ok).toBe(true);

		const projectRef = join(projectDir, '.references', 'effect-v4');
		expect(lstatSync(projectRef).isSymbolicLink()).toBe(true);
		expect(readlinkSync(projectRef)).toBe(sharedDir);
		expect(readFileSync(join(projectRef, VERSION_MARKER), 'utf8').trim()).toBe(
			'effect@4.0.0-beta.57',
		);
	});

	it('is idempotent when the symlink already points at the shared dir', () => {
		fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');
		const projectRef = join(projectDir, '.references', 'effect-v4');
		mkdirSync(join(projectDir, '.references'), { recursive: true });
		symlinkSync(sharedDir, projectRef, 'dir');

		const ok = ensureReferenceClone(projectDir, '4.0.0-beta.57');
		expect(ok).toBe(true);
		expect(readlinkSync(projectRef)).toBe(sharedDir);
	});

	it('warns and skips re-clone when shared dir is at a different version', () => {
		fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		const ok = ensureReferenceClone(projectDir, '4.0.0-beta.59');

		expect(ok).toBe(true);
		expect(readFileSync(join(sharedDir, VERSION_MARKER), 'utf8').trim()).toBe(
			'effect@4.0.0-beta.57',
		);
		const messages = stderr.mock.calls.map((c) => String(c[0])).join('');
		expect(messages).toMatch(/shared reference clone is at effect@4\.0\.0-beta\.57/);
		expect(messages).toMatch(/this project pins effect@4\.0\.0-beta\.59/);
		stderr.mockRestore();
	});

	it('refuses to overwrite a real directory at projectDir/.references/effect-v4', () => {
		fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');
		const projectRef = join(projectDir, '.references', 'effect-v4');
		mkdirSync(projectRef, { recursive: true });
		writeFileSync(join(projectRef, 'sentinel.txt'), 'do not touch');
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		const ok = ensureReferenceClone(projectDir, '4.0.0-beta.57');

		expect(ok).toBe(false);
		expect(lstatSync(projectRef).isDirectory()).toBe(true);
		expect(lstatSync(projectRef).isSymbolicLink()).toBe(false);
		expect(readFileSync(join(projectRef, 'sentinel.txt'), 'utf8')).toBe('do not touch');
		expect(stderr.mock.calls.map((c) => String(c[0])).join('')).toMatch(
			/already exists as a real directory/,
		);
		stderr.mockRestore();
	});

	it('refuses to repoint a symlink that targets somewhere else', () => {
		fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');
		const elsewhere = mkTmp('elsewhere');
		fakePopulatedClone(elsewhere, 'effect@4.0.0-beta.57');
		const projectRef = join(projectDir, '.references', 'effect-v4');
		mkdirSync(join(projectDir, '.references'), { recursive: true });
		symlinkSync(elsewhere, projectRef, 'dir');
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		const ok = ensureReferenceClone(projectDir, '4.0.0-beta.57');

		expect(ok).toBe(false);
		expect(readlinkSync(projectRef)).toBe(elsewhere);
		expect(stderr.mock.calls.map((c) => String(c[0])).join('')).toMatch(
			/symlink pointing somewhere other than/,
		);
		stderr.mockRestore();
		try {
			rmSync(elsewhere, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it('backs off when a fresh .cloning sibling exists', () => {
		const tmpDir = `${sharedDir}.cloning`;
		mkdirSync(tmpDir, { recursive: true });
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		const ok = ensureReferenceClone(projectDir, '4.0.0-beta.57');

		expect(ok).toBe(false);
		expect(existsSync(sharedDir)).toBe(false);
		expect(existsSync(tmpDir)).toBe(true);
		expect(stderr.mock.calls.map((c) => String(c[0])).join('')).toMatch(
			/another session appears to be cloning/,
		);
		stderr.mockRestore();
	});

	it('cleans up a stale .cloning sibling (older than the in-flight window)', () => {
		// Note: this test verifies the staleness check fires, but we don't have
		// network in test, so the subsequent git clone will fail. The point is
		// the stale dir gets removed before the clone is attempted.
		const tmpDir = `${sharedDir}.cloning`;
		mkdirSync(tmpDir, { recursive: true });
		const old = new Date(Date.now() - 10 * 60 * 1000);
		utimesSync(tmpDir, old, old);
		// sanity
		expect(Date.now() - statSync(tmpDir).mtimeMs).toBeGreaterThan(90_000);
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		ensureReferenceClone(projectDir, '4.0.0-beta.57');

		// The stale .cloning was removed by isCloneInFlight, then the actual
		// clone may or may not succeed depending on network. Either way the
		// stale-detection warning should NOT have fired.
		const messages = stderr.mock.calls.map((c) => String(c[0])).join('');
		expect(messages).not.toMatch(/another session appears to be cloning/);
		stderr.mockRestore();
	});
});

describe('ensureReferenceClone (per-project mode)', () => {
	let projectDir: string;

	beforeEach(() => {
		projectDir = mkTmp('proj-only');
		delete process.env[SHARED_DIR_ENV];
	});

	afterEach(() => {
		try {
			rmSync(projectDir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it('is a no-op when projectDir clone is at the requested version', () => {
		const projectRef = join(projectDir, '.references', 'effect-v4');
		fakePopulatedClone(projectRef, 'effect@4.0.0-beta.57');

		const ok = ensureReferenceClone(projectDir, '4.0.0-beta.57');
		expect(ok).toBe(true);
		expect(lstatSync(projectRef).isSymbolicLink()).toBe(false);
	});
});
