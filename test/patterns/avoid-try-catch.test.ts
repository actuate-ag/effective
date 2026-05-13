import { describe } from "vitest";
import { testPattern } from "../helpers/test-pattern.ts";

describe("avoid-try-catch", () => {
  testPattern({
    name: "avoid-try-catch",
    shouldMatch: [
      `function risky() {
  try {
    doIt();
  } catch (e) {
    console.error(e);
  }
}`
    ],
    shouldNotMatch: [
      `import { Effect } from 'effect';
const program = Effect.try({
  try: () => doIt(),
  catch: (cause) => new Boom({ message: String(cause) }),
});`
    ]
  });
});
