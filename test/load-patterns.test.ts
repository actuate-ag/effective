import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadPatterns } from '../src/patterns/load.ts';

const PATTERNS_DIR = join(__dirname, '..', 'patterns');

describe('loadPatterns', () => {
	const patterns = loadPatterns(PATTERNS_DIR);

	it('loads every pattern file in the catalog', () => {
		expect(patterns.length).toBe(46);
	});

	it('every loaded pattern has a name and a detector', () => {
		for (const p of patterns) {
			expect(p.name, `pattern at ${p.sourcePath} missing name`).not.toBe('');
			expect(p.detector, `pattern ${p.name} missing detector`).toBeDefined();
		}
	});

	it('every pattern has a non-empty guidance body', () => {
		for (const p of patterns) {
			expect(p.guidance.length, `${p.name} has empty guidance`).toBeGreaterThan(0);
		}
	});

	it('every pattern has a recognized severity', () => {
		const valid = new Set(['critical', 'high', 'medium', 'warning', 'info']);
		for (const p of patterns) {
			expect(valid.has(p.level), `${p.name} has bogus level ${p.level}`).toBe(true);
		}
	});

	it('pattern names are unique', () => {
		const names = patterns.map((p) => p.name);
		expect(new Set(names).size, 'duplicate pattern names').toBe(names.length);
	});
});
