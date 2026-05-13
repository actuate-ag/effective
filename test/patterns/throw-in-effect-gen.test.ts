import { describe } from "vitest";
import { testPattern } from "../helpers/test-pattern.ts";

describe("throw-in-effect-gen", () => {
  testPattern({
    name: "throw-in-effect-gen",
    shouldMatch: [
      `import { Effect } from 'effect';
const program = Effect.gen(function* () {
  throw new Error('boom');
});`
    ],
    shouldNotMatch: [
      `import { Effect } from 'effect';
const program = Effect.gen(function* () {
  yield* Effect.fail(new Error('boom'));
});`
    ]
  });
});
