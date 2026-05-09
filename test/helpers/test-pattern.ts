import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { loadPatterns } from '../../src/patterns/load.ts';
import { patternMatches } from '../../src/patterns/match.ts';
import type { Pattern } from '../../src/patterns/types.ts';

const PATTERNS_DIR = join(__dirname, '..', '..', 'patterns');

let cachedPatterns: ReadonlyArray<Pattern> | undefined;
const allPatterns = (): ReadonlyArray<Pattern> => {
	cachedPatterns ??= loadPatterns(PATTERNS_DIR);
	return cachedPatterns;
};

export const findPattern = (name: string): Pattern => {
	const found = allPatterns().find((p) => p.name === name);
	if (found === undefined) {
		throw new Error(`pattern not found: ${name}`);
	}
	return found;
};

const writeFixture = (filename: string, source: string): string => {
	const dir = join(tmpdir(), `cce-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	const path = join(dir, filename);
	writeFileSync(path, source, 'utf8');
	return path;
};

interface PatternTestCase {
	readonly name: string;
	readonly tool?: string;
	readonly filename?: string;
	readonly shouldMatch: ReadonlyArray<string>;
	readonly shouldNotMatch: ReadonlyArray<string>;
}

export const testPattern = (tc: PatternTestCase): void => {
	const tool = tc.tool ?? 'Edit';
	const filename = tc.filename ?? 'sample.ts';
	for (const [i, source] of tc.shouldMatch.entries()) {
		it(`${tc.name}: matches case ${i + 1}`, () => {
			const pattern = findPattern(tc.name);
			const path = writeFixture(filename, source);
			expect(patternMatches(pattern, tool, path, source)).toBe(true);
		});
	}
	for (const [i, source] of tc.shouldNotMatch.entries()) {
		it(`${tc.name}: skips case ${i + 1}`, () => {
			const pattern = findPattern(tc.name);
			const path = writeFixture(filename, source);
			expect(patternMatches(pattern, tool, path, source)).toBe(false);
		});
	}
};
