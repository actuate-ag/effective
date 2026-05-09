import { it } from '@effect/vitest';
import { BunServices } from '@effect/platform-bun';
import { Effect, Path } from 'effect';
import { describe, expect } from 'vitest';

import { loadPatterns } from '../src/patterns/load.ts';

const patternsDir = Effect.gen(function*() {
	const path = yield* Path.Path;
	return path.resolve(__dirname, '..', 'patterns');
});

const loadCatalog = Effect.gen(function*() {
	const dir = yield* patternsDir;
	return yield* loadPatterns(dir);
}).pipe(Effect.provide(BunServices.layer));

describe('loadPatterns', () => {
	it.effect('loads every pattern file in the catalog', () =>
		loadCatalog.pipe(
			Effect.tap((patterns) => Effect.sync(() => expect(patterns.length).toBe(46))),
		));

	it.effect('every loaded pattern has a name and a detector', () =>
		loadCatalog.pipe(
			Effect.tap((patterns) =>
				Effect.sync(() => {
					patterns.forEach((p) => {
						expect(p.name, `pattern at ${p.sourcePath} missing name`).not.toBe('');
						expect(p.detector, `pattern ${p.name} missing detector`).toBeDefined();
					});
				})
			),
		));

	it.effect('every pattern has a non-empty guidance body', () =>
		loadCatalog.pipe(
			Effect.tap((patterns) =>
				Effect.sync(() => {
					patterns.forEach((p) => {
						expect(p.guidance.length, `${p.name} has empty guidance`).toBeGreaterThan(0);
					});
				})
			),
		));

	it.effect('every pattern has a recognized severity', () =>
		loadCatalog.pipe(
			Effect.tap((patterns) =>
				Effect.sync(() => {
					const valid = new Set(['critical', 'high', 'medium', 'warning', 'info']);
					patterns.forEach((p) => {
						expect(valid.has(p.level), `${p.name} has bogus level ${p.level}`).toBe(true);
					});
				})
			),
		));

	it.effect('pattern names are unique', () =>
		loadCatalog.pipe(
			Effect.tap((patterns) =>
				Effect.sync(() => {
					const names = patterns.map((p) => p.name);
					expect(new Set(names).size, 'duplicate pattern names').toBe(names.length);
				})
			),
		));
});
