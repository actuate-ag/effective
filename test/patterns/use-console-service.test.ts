import { describe } from 'vitest';
import { testPattern } from '../helpers/test-pattern.ts';

describe('use-console-service', () => {
	testPattern({
		name: 'use-console-service',
		shouldMatch: [
			`console.log('hi');`,
			`console.error('boom');`,
		],
		shouldNotMatch: [
			`import { Effect } from 'effect';
const program = Effect.log('hi');`,
			`// console.log is forbidden in services
const ok = true;`,
		],
	});
});
