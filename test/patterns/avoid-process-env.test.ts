import { describe } from "vitest";
import { testPattern } from "../helpers/test-pattern.ts";

describe("avoid-process-env", () => {
  testPattern({
    name: "avoid-process-env",
    shouldMatch: [`const port = process.env.PORT;`],
    shouldNotMatch: [
      `import { Config } from 'effect';
const port = yield* Config.integer('PORT');`,
      `// process.env.X is wrong; use Config.string('X')
const ok = true;`
    ]
  });
});
