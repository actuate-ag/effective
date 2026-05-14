#!/usr/bin/env bun
/**
 * effect-audit: run the effective plugin's pattern catalog against a file
 * or directory tree. Invoked by the /effective:audit slash command.
 *
 * Behavior:
 *  - Recursive, .ts/.tsx only.
 *  - Honors .gitignore via `git ls-files --cached --others --exclude-standard`
 *    when the target is inside a git repo. Falls back to a tree walk that
 *    hard-skips .git/, node_modules/, .references/.
 *  - Skips symlinks.
 *  - Human-readable output to stdout, summary at the top, lines per match.
 *  - Default `--min-severity warning`; user can pass `--min-severity high`
 *    (etc.) to narrow.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Path, pipe } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { formatHuman } from "../src/audit/format/human.ts";
import { auditFiles, type AuditMatch } from "../src/audit/runner.ts";
import { defaultWalkOptions, gitTrackedFiles, walkDirectory } from "../src/audit/walk.ts";
import { patterns } from "../src/patterns/index.ts";
import type { Severity } from "../src/patterns/types.ts";
import { SEVERITY_RANK } from "../src/patterns/types.ts";

const SEVERITY_VALUES = ["critical", "high", "medium", "warning", "info"] as const;

const collectFiles = (roots: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const perRoot = yield* Effect.forEach(
      roots,
      (root) =>
        Effect.gen(function* () {
          const absRoot = path.resolve(root);
          const tracked = yield* gitTrackedFiles(absRoot, defaultWalkOptions.extensions);
          if (Option.isSome(tracked)) return tracked.value;
          return yield* walkDirectory(absRoot, defaultWalkOptions);
        }),
      { concurrency: "unbounded" }
    );
    return pipe(perRoot, Arr.flatten, Arr.dedupe);
  });

const filterBySeverity = (matches: ReadonlyArray<AuditMatch>, floor: Severity): ReadonlyArray<AuditMatch> =>
  matches.filter((m) => SEVERITY_RANK[m.severity] <= SEVERITY_RANK[floor]);

const handler = Effect.fn("effect-audit")(function* (input: {
  readonly paths: ReadonlyArray<string>;
  readonly minSeverity: Severity;
}) {
  const roots = input.paths.length === 0 ? [process.cwd()] : input.paths;
  const files = yield* collectFiles(roots);
  const allMatches = yield* auditFiles(files, patterns);
  const filtered = filterBySeverity(allMatches, input.minSeverity);
  process.stdout.write(formatHuman(filtered));
});

const audit = Command.make(
  "effect-audit",
  {
    paths: Argument.path("paths").pipe(
      Argument.withDescription("files or directories to audit (defaults to .)"),
      Argument.variadic({ min: 0 })
    ),
    minSeverity: Flag.choice("min-severity", SEVERITY_VALUES).pipe(
      Flag.withDescription("lowest severity to display (default: warning)"),
      Flag.withDefault("warning" as const)
    )
  },
  handler
).pipe(Command.withDescription("Run the effective plugin's pattern catalog against a file or directory tree."));

audit.pipe(Command.run({ version: "0.0.1" }), Effect.provide(BunServices.layer), BunRuntime.runMain);
