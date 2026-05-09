import { it } from '@effect/vitest';
import { BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';
import { join } from 'node:path';
import { describe, expect } from 'vitest';

import { loadPatterns } from '../src/patterns/load.ts';

const PATTERNS_DIR = join(__dirname, '..', 'patterns');

describe('loadPatterns', () => {
	it.effect('loads every pattern file in the catalog', () =>
		loadPatterns(PATTERNS_DIR).pipe(
			Effect.tap((patterns) => Effect.sync(() => expect(patterns.length).toBe(46))),
			Effect.provide(BunServices.layer),
		));

	it.effect('every loaded pattern has a name and a detector', () =>
		loadPatterns(PATTERNS_DIR).pipe(
			Effect.tap((patterns) =>
				Effect.sync(() => {
					patterns.forEach((p) => {
						expect(p.name, `pattern at ${p.sourcePath} missing name`).not.toBe('');
						expect(p.detector, `pattern ${p.name} missing detector`).toBeDefined();
					});
				})
			),
			Effect.provide(BunServices.layer),
		));

	it.effect('every pattern has a non-empty guidance body', () =>
		loadPatterns(PATTERNS_DIR).pipe(
			Effect.tap((patterns) =>
				Effect.sync(() => {
					patterns.forEach((p) => {
						expect(p.guidance.length, `${p.name} has empty guidance`).toBeGreaterThan(0);
					});
				})
			),
			Effect.provide(BunServices.layer),
		));

	it.effect('every pattern has a recognized severity', () =>
		loadPatterns(PATTERNS_DIR).pipe(
			Effect.tap((patterns) =>
				Effect.sync(() => {
					const valid = new Set(['critical', 'high', 'medium', 'warning', 'info']);
					patterns.forEach((p) => {
						expect(valid.has(p.level), `${p.name} has bogus level ${p.level}`).toBe(true);
					});
				})
			),
			Effect.provide(BunServices.layer),
		));

	it.effect('pattern names are unique', () =>
		loadPatterns(PATTERNS_DIR).pipe(
			Effect.tap((patterns) =>
				Effect.sync(() => {
					const names = patterns.map((p) => p.name);
					expect(new Set(names).size, 'duplicate pattern names').toBe(names.length);
				})
			),
			Effect.provide(BunServices.layer),
		));
});
