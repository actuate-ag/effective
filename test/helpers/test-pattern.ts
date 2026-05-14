import { it } from "@effect/vitest";
import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Path, Schema, Scope, type PlatformError } from "effect";
import { expect } from "vitest";

import { patterns } from "../../src/patterns/index.ts";
import { patternMatches } from "../../src/patterns/match.ts";
import type { Pattern } from "../../src/patterns/types.ts";

class PatternNotFound extends Schema.TaggedErrorClass<PatternNotFound>()("PatternNotFound", {
  name: Schema.String,
  message: Schema.String
}) {}

const findPatternEffect = (name: string): Effect.Effect<Pattern, PatternNotFound> =>
  Effect.gen(function* () {
    const found = patterns.find((p) => p.name === name);
    return found === undefined ? yield* new PatternNotFound({ name, message: `pattern not found: ${name}` }) : found;
  });

const writeFixture = (
  filename: string,
  source: string
): Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "cce-test-" });
    const target = path.join(dir, filename);
    yield* fs.writeFileString(target, source);
    return target;
  });

interface PatternTestCase {
  readonly name: string;
  readonly tool?: string;
  readonly filename?: string;
  readonly shouldMatch: ReadonlyArray<string>;
  readonly shouldNotMatch: ReadonlyArray<string>;
}

const expectMatchOutcome = (
  tc: PatternTestCase,
  source: string,
  expected: boolean
): Effect.Effect<void, PatternNotFound | PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(
    Effect.gen(function* () {
      const tool = tc.tool ?? "Edit";
      const filename = tc.filename ?? "sample.ts";
      const pattern = yield* findPatternEffect(tc.name);
      const filePath = yield* writeFixture(filename, source);
      const matched = yield* patternMatches(pattern, tool, filePath, source);
      expect(matched).toBe(expected);
    })
  );

export const testPattern = (tc: PatternTestCase): void => {
  tc.shouldMatch.forEach((source, i) => {
    it.effect(`${tc.name}: matches case ${i + 1}`, () =>
      expectMatchOutcome(tc, source, true).pipe(Effect.provide(BunServices.layer))
    );
  });
  tc.shouldNotMatch.forEach((source, i) => {
    it.effect(`${tc.name}: skips case ${i + 1}`, () =>
      expectMatchOutcome(tc, source, false).pipe(Effect.provide(BunServices.layer))
    );
  });
};
