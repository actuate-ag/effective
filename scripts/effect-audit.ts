#!/usr/bin/env bun
/**
 * effect-audit CLI: runs the effective plugin's pattern catalog against
 * a file or directory tree.
 *
 * Default behavior:
 *  - Recursive, .ts/.tsx only.
 *  - Honors .gitignore via `git ls-files --cached --others --exclude-standard`
 *    when the target is inside a git repo. Falls back to a tree walk that
 *    hard-skips .git/, node_modules/, .references/.
 *  - Skips symlinks by default; pass `--follow-symlinks` to include them.
 *  - Human-readable output to stdout, summary at the top, lines per match.
 *  - Exit non-zero if any match >= --exit-on (default `critical`).
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Effect, FileSystem, Path, pipe } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { formatHuman } from "../src/audit/format/human.ts";
import { formatJson } from "../src/audit/format/json.ts";
import { auditFiles, type AuditMatch } from "../src/audit/runner.ts";
import { defaultWalkOptions, gitTrackedFiles, walkDirectory } from "../src/audit/walk.ts";
import { loadPatterns } from "../src/patterns/load.ts";
import type { Severity } from "../src/patterns/types.ts";
import { SEVERITY_RANK } from "../src/patterns/types.ts";

const SEVERITY_VALUES = ["critical", "high", "medium", "warning", "info"] as const;

const readEnvOption = (name: string): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    const opt = yield* Config.option(Config.string(name));
    return Option.flatMap(opt, (s) => (s === "" ? Option.none<string>() : Option.some(s)));
  }).pipe(Effect.match({ onFailure: () => Option.none<string>(), onSuccess: (o) => o }));

const resolvePatternsDir = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const fromEnv = yield* readEnvOption("CLAUDE_CODE_EFFECT_PATTERNS_DIR");
  if (Option.isSome(fromEnv)) {
    const ok = yield* fs.exists(fromEnv.value).pipe(Effect.match({ onFailure: () => false, onSuccess: (b) => b }));
    if (ok) return fromEnv.value;
  }
  const here = path.dirname(new URL(import.meta.url).pathname);
  return path.resolve(here, "..", "patterns");
});

const collectFiles = (
  roots: ReadonlyArray<string>,
  respectGitignore: boolean,
  followSymlinks: boolean,
  recursive: boolean
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const opts = {
      ...defaultWalkOptions,
      recursive,
      followSymlinks
    };

    const perRoot = yield* Effect.forEach(
      roots,
      (root) =>
        Effect.gen(function* () {
          const absRoot = path.resolve(root);
          if (respectGitignore) {
            const tracked = yield* gitTrackedFiles(absRoot, opts.extensions);
            if (Option.isSome(tracked)) return tracked.value;
          }
          return yield* walkDirectory(absRoot, opts);
        }),
      { concurrency: "unbounded" }
    );
    return pipe(perRoot, Arr.flatten, Arr.dedupe);
  });

const filterBySeverity = (matches: ReadonlyArray<AuditMatch>, floor: Severity): ReadonlyArray<AuditMatch> =>
  matches.filter((m) => SEVERITY_RANK[m.severity] <= SEVERITY_RANK[floor]);

const exitCodeFor = (matches: ReadonlyArray<AuditMatch>, exitOn: Severity): number =>
  matches.some((m) => SEVERITY_RANK[m.severity] <= SEVERITY_RANK[exitOn]) ? 1 : 0;

const handler = Effect.fn("effect-audit")(function* (input: {
  readonly paths: ReadonlyArray<string>;
  readonly format: "human" | "json";
  readonly minSeverity: Severity;
  readonly exitOn: Severity;
  readonly noRecursive: boolean;
  readonly noGitignore: boolean;
  readonly followSymlinks: boolean;
}) {
  const roots = input.paths.length === 0 ? [process.cwd()] : input.paths;
  const recursive = !input.noRecursive;
  const respectGitignore = !input.noGitignore;

  const files = yield* collectFiles(roots, respectGitignore, input.followSymlinks, recursive);
  const patternsDir = yield* resolvePatternsDir;
  const patterns = yield* loadPatterns(patternsDir);
  const allMatches = yield* auditFiles(files, patterns);
  const filtered = filterBySeverity(allMatches, input.minSeverity);

  const output = input.format === "json" ? formatJson(filtered) : formatHuman(filtered);
  process.stdout.write(output);

  const code = exitCodeFor(allMatches, input.exitOn);
  if (code !== 0) {
    yield* Effect.sync(() => {
      process.exit(code);
    });
  }
});

const audit = Command.make(
  "effect-audit",
  {
    paths: Argument.path("paths").pipe(
      Argument.withDescription("files or directories to audit (defaults to .)"),
      Argument.variadic({ min: 0 })
    ),
    format: Flag.choice("format", ["human", "json"]).pipe(
      Flag.withDescription("output format (default: human)"),
      Flag.withDefault("human" as const)
    ),
    minSeverity: Flag.choice("min-severity", SEVERITY_VALUES).pipe(
      Flag.withDescription("lowest severity to display (default: warning)"),
      Flag.withDefault("warning" as const)
    ),
    exitOn: Flag.choice("exit-on", SEVERITY_VALUES).pipe(
      Flag.withDescription("exit non-zero if any match at-or-above this severity (default: critical)"),
      Flag.withDefault("critical" as const)
    ),
    noRecursive: Flag.boolean("no-recursive").pipe(
      Flag.withDescription("only scan the listed paths; do not descend into directories"),
      Flag.withDefault(false)
    ),
    noGitignore: Flag.boolean("no-gitignore").pipe(
      Flag.withDescription("don't honor .gitignore; walk the tree directly"),
      Flag.withDefault(false)
    ),
    followSymlinks: Flag.boolean("follow-symlinks").pipe(
      Flag.withDescription("follow symbolic links during the tree walk"),
      Flag.withDefault(false)
    )
  },
  handler
).pipe(Command.withDescription("Run the effective plugin's pattern catalog against a file or directory tree."));

audit.pipe(Command.run({ version: "0.0.1" }), Effect.provide(BunServices.layer), BunRuntime.runMain);
