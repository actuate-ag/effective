import { describe } from 'vitest';
import { testPattern } from '../helpers/test-pattern.ts';

describe('avoid-data-tagged-error', () => {
	testPattern({
		name: 'avoid-data-tagged-error',
		shouldMatch: [
			`import { Data } from 'effect';
class MyError extends Data.TaggedError('MyError')<{ message: string }> {}`,
		],
		shouldNotMatch: [
			`import { Schema } from 'effect';
class MyError extends Schema.TaggedErrorClass<MyError>()('MyError', {
  message: Schema.String,
}) {}`,
			`// using Data.TaggedError here would be wrong
import { Schema } from 'effect';`,
		],
	});
});
