import { it } from '@effect/vitest';
import { BunServices } from '@effect/platform-bun';
import { DateTime, Effect, FileSystem, Layer, Path, Random } from 'effect';
import * as Option from 'effect/Option';
import { describe, expect, vi } from 'vitest';

import { ensureReferenceClone, SHARED_DIR_ENV } from '../src/reference/clone.ts';
import { dynamicEnvLayer, setEnv, unsetEnv } from '../src/reference/test-env-provider.ts';

const VERSION_MARKER = '.claude-code-effect-version';

const TestLayer = Layer.merge(BunServices.layer, dynamicEnvLayer);

const run = <A, E>(
	effect: Effect.Effect<A, E, BunServices.BunServices>,
): Effect.Effect<A, E> => effect.pipe(Effect.provide(TestLayer));

const fakePopulatedClone = (dir: string, tag: string) =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		yield* fs.makeDirectory(path.join(dir, '.git'), { recursive: true });
		yield* fs.writeFileString(path.join(dir, VERSION_MARKER), tag);
	});

const mkTmp = (label: string) =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const now = yield* DateTime.now;
		const suffix = yield* Random.nextInt;
		const tmpdir = yield* fs.makeTempDirectoryScoped({ prefix: 'cce-rc-' });
		const dir = path.join(tmpdir, `${label}-${DateTime.toEpochMillis(now)}-${suffix}`);
		yield* fs.makeDirectory(dir, { recursive: true });
		return dir;
	});

const fileExists = (path: string) =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		return yield* fs.exists(path).pipe(
			Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
		);
	});

const readFile = (path: string) =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		return yield* fs.readFileString(path);
	});

const isSymlinkTo = (path: string, expectedTarget: string) =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		return yield* fs.readLink(path).pipe(
			Effect.match({
				onFailure: () => false,
				onSuccess: (target) => target === expectedTarget,
			}),
		);
	});

const isDirectory = (path: string) =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const info = yield* fs.stat(path).pipe(Effect.option);
		return Option.match(info, {
			onNone: () => false,
			onSome: (i) => i.type === 'Directory',
		});
	});

const setMtimeMs = (path: string, mtimeMs: number) =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const seconds = mtimeMs / 1000;
		yield* fs.utimes(path, seconds, seconds);
	});

describe('ensureReferenceClone (shared mode)', () => {
	const setupShared = Effect.gen(function*() {
		const projectDir = yield* mkTmp('proj');
		const sharedParent = yield* mkTmp('shared-parent');
		const path = yield* Path.Path;
		const sharedDir = path.join(sharedParent, 'effect-v4');
		yield* setEnv(SHARED_DIR_ENV, sharedDir);
		yield* Effect.addFinalizer(() => unsetEnv(SHARED_DIR_ENV));
		return { projectDir, sharedDir };
	});

	it.live('symlinks projectDir/.references/effect-v4 to the shared clone when shared dir matches version', () =>
		Effect.gen(function*() {
			const { projectDir, sharedDir } = yield* setupShared;
			const path = yield* Path.Path;
			yield* fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');

			const ok = yield* ensureReferenceClone(projectDir, '4.0.0-beta.57');
			expect(ok).toBe(true);

			const projectRef = path.join(projectDir, '.references', 'effect-v4');
			expect(yield* isSymlinkTo(projectRef, sharedDir)).toBe(true);
			const marker = yield* readFile(path.join(projectRef, VERSION_MARKER));
			expect(marker.trim()).toBe('effect@4.0.0-beta.57');
		}).pipe(Effect.scoped, run));

	it.live('is idempotent when the symlink already points at the shared dir', () =>
		Effect.gen(function*() {
			const { projectDir, sharedDir } = yield* setupShared;
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			yield* fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');

			const projectRef = path.join(projectDir, '.references', 'effect-v4');
			yield* fs.makeDirectory(path.join(projectDir, '.references'), { recursive: true });
			yield* fs.symlink(sharedDir, projectRef);

			const ok = yield* ensureReferenceClone(projectDir, '4.0.0-beta.57');
			expect(ok).toBe(true);
			expect(yield* isSymlinkTo(projectRef, sharedDir)).toBe(true);
		}).pipe(Effect.scoped, run));

	it.live('warns and skips re-clone when shared dir is at a different version', () =>
		Effect.gen(function*() {
			const { projectDir, sharedDir } = yield* setupShared;
			const path = yield* Path.Path;
			yield* fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');
			const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

			const ok = yield* ensureReferenceClone(projectDir, '4.0.0-beta.59');

			expect(ok).toBe(true);
			const marker = yield* readFile(path.join(sharedDir, VERSION_MARKER));
			expect(marker.trim()).toBe('effect@4.0.0-beta.57');
			const messages = stderr.mock.calls.map((c) => String(c[0])).join('');
			expect(messages).toMatch(/shared reference clone is at effect@4\.0\.0-beta\.57/);
			expect(messages).toMatch(/this project pins effect@4\.0\.0-beta\.59/);
			stderr.mockRestore();
		}).pipe(Effect.scoped, run));

	it.live('refuses to overwrite a real directory at projectDir/.references/effect-v4', () =>
		Effect.gen(function*() {
			const { projectDir, sharedDir } = yield* setupShared;
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			yield* fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');
			const projectRef = path.join(projectDir, '.references', 'effect-v4');
			yield* fs.makeDirectory(projectRef, { recursive: true });
			yield* fs.writeFileString(path.join(projectRef, 'sentinel.txt'), 'do not touch');
			const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

			const ok = yield* ensureReferenceClone(projectDir, '4.0.0-beta.57');

			expect(ok).toBe(false);
			expect(yield* isDirectory(projectRef)).toBe(true);
			expect(yield* isSymlinkTo(projectRef, sharedDir)).toBe(false);
			expect((yield* readFile(path.join(projectRef, 'sentinel.txt')))).toBe('do not touch');
			expect(stderr.mock.calls.map((c) => String(c[0])).join('')).toMatch(
				/already exists as a real directory/,
			);
			stderr.mockRestore();
		}).pipe(Effect.scoped, run));

	it.live('refuses to repoint a symlink that targets somewhere else', () =>
		Effect.gen(function*() {
			const { projectDir, sharedDir } = yield* setupShared;
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;
			yield* fakePopulatedClone(sharedDir, 'effect@4.0.0-beta.57');
			const elsewhere = yield* mkTmp('elsewhere');
			yield* fakePopulatedClone(elsewhere, 'effect@4.0.0-beta.57');
			const projectRef = path.join(projectDir, '.references', 'effect-v4');
			yield* fs.makeDirectory(path.join(projectDir, '.references'), { recursive: true });
			yield* fs.symlink(elsewhere, projectRef);
			const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

			const ok = yield* ensureReferenceClone(projectDir, '4.0.0-beta.57');

			expect(ok).toBe(false);
			expect(yield* isSymlinkTo(projectRef, elsewhere)).toBe(true);
			expect(stderr.mock.calls.map((c) => String(c[0])).join('')).toMatch(
				/symlink pointing somewhere other than/,
			);
			stderr.mockRestore();
		}).pipe(Effect.scoped, run));

	it.live('backs off when a fresh .cloning sibling exists', () =>
		Effect.gen(function*() {
			const { projectDir, sharedDir } = yield* setupShared;
			const fs = yield* FileSystem.FileSystem;
			const tmpDir = `${sharedDir}.cloning`;
			yield* fs.makeDirectory(tmpDir, { recursive: true });
			const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

			const ok = yield* ensureReferenceClone(projectDir, '4.0.0-beta.57');

			expect(ok).toBe(false);
			expect(yield* fileExists(sharedDir)).toBe(false);
			expect(yield* fileExists(tmpDir)).toBe(true);
			expect(stderr.mock.calls.map((c) => String(c[0])).join('')).toMatch(
				/another session appears to be cloning/,
			);
			stderr.mockRestore();
		}).pipe(Effect.scoped, run));

	it.live('cleans up a stale .cloning sibling (older than the in-flight window)', () =>
		Effect.gen(function*() {
			// Note: this test verifies the staleness check fires, but we don't have
			// network in test, so the subsequent git clone will fail. The point is
			// the stale dir gets removed before the clone is attempted.
			const { projectDir, sharedDir } = yield* setupShared;
			const fs = yield* FileSystem.FileSystem;
			const now = yield* DateTime.now;
			const tmpDir = `${sharedDir}.cloning`;
			yield* fs.makeDirectory(tmpDir, { recursive: true });
			const tenMinutesAgoMs = DateTime.toEpochMillis(now) - 10 * 60 * 1000;
			yield* setMtimeMs(tmpDir, tenMinutesAgoMs);
			// sanity
			const info = yield* fs.stat(tmpDir);
			const mtimeMs = Option.map(info.mtime, (d) => d.getTime()).pipe(
				Option.getOrElse(() => 0),
			);
			expect(DateTime.toEpochMillis(now) - mtimeMs).toBeGreaterThan(90_000);
			const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

			yield* ensureReferenceClone(projectDir, '4.0.0-beta.57');

			const messages = stderr.mock.calls.map((c) => String(c[0])).join('');
			expect(messages).not.toMatch(/another session appears to be cloning/);
			stderr.mockRestore();
		}).pipe(Effect.scoped, run));
});

describe('ensureReferenceClone (per-project mode)', () => {
	it.live('is a no-op when projectDir clone is at the requested version', () =>
		Effect.gen(function*() {
			yield* unsetEnv(SHARED_DIR_ENV);
			const projectDir = yield* mkTmp('proj-only');
			const path = yield* Path.Path;
			const projectRef = path.join(projectDir, '.references', 'effect-v4');
			yield* fakePopulatedClone(projectRef, 'effect@4.0.0-beta.57');

			const ok = yield* ensureReferenceClone(projectDir, '4.0.0-beta.57');
			expect(ok).toBe(true);
			expect(yield* isSymlinkTo(projectRef, '')).toBe(false);
		}).pipe(Effect.scoped, run));
});
