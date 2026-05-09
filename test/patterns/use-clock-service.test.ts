import { describe } from 'vitest';
import { testPattern } from '../helpers/test-pattern.ts';

describe('use-clock-service', () => {
	testPattern({
		name: 'use-clock-service',
		shouldMatch: [
			`const now = new Date();`,
			`const ts = Date.now();`,
		],
		shouldNotMatch: [
			`import { Clock } from 'effect';
const now = yield* Clock.currentTimeMillis;`,
			`// new Date() is forbidden here
const ok = true;`,
		],
	});
});
