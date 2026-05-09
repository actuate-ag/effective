import { describe } from 'vitest';
import { testPattern } from '../helpers/test-pattern.ts';

describe('avoid-yield-ref', () => {
	testPattern({
		name: 'avoid-yield-ref',
		shouldMatch: [
			`import { Effect, Ref } from 'effect';
const program = Effect.gen(function* () {
  const ref = yield* Ref.make(0);
  const value = yield* ref;
  return value;
});`,
		],
		shouldNotMatch: [
			`import { Effect, Ref } from 'effect';
const program = Effect.gen(function* () {
  const ref = yield* Ref.make(0);
  const value = yield* Ref.get(ref);
  return value;
});`,
		],
	});
});
