import { describe } from 'vitest';
import { testPattern } from '../helpers/test-pattern.ts';

describe('avoid-direct-json', () => {
	testPattern({
		name: 'avoid-direct-json',
		shouldMatch: [
			`const obj = JSON.parse(raw);`,
			`const s = JSON.stringify(obj);`,
		],
		shouldNotMatch: [
			`import { Schema } from 'effect';
const obj = yield* Schema.fromJsonString(raw, Schema.Unknown);`,
		],
	});
});
