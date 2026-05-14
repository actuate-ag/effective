import { Effect, FileSystem, pipe } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

import { findPatternMatches, patternMatches } from "../patterns/match.ts";
import type { MatchLocation, Pattern, Severity } from "../patterns/types.ts";

export interface AuditMatch {
  readonly filePath: string;
  readonly patternName: string;
  readonly severity: Severity;
  readonly description: string;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
  readonly suggestedReferences: ReadonlyArray<string>;
}

const toAuditMatch = (pattern: Pattern, filePath: string, location: MatchLocation): AuditMatch => ({
  filePath,
  patternName: pattern.name,
  severity: pattern.level,
  description: pattern.description,
  line: location.line,
  column: location.column,
  snippet: location.snippet,
  suggestedReferences: pattern.suggestedReferences ?? []
});

/**
 * Audit a single file against the given pattern catalog. Reads the file,
 * runs every pattern's detector, and returns one `AuditMatch` per detector
 * hit (a single pattern can hit multiple locations in one file).
 *
 * Tool name is fixed to `'Edit'` so the patterns' tool-regex filter
 * (`(edit|write)` lowercase, matched case-insensitively) passes for the
 * full TS/TSX catalog.
 */
export const auditFile = Effect.fn("auditFile")(function* (filePath: string, patterns: ReadonlyArray<Pattern>) {
  const fs = yield* FileSystem.FileSystem;
  const sourceOpt = yield* fs.readFileString(filePath).pipe(
    Effect.match({
      onFailure: () => Option.none<string>(),
      onSuccess: Option.some
    })
  );
  if (Option.isNone(sourceOpt)) {
    const empty: ReadonlyArray<AuditMatch> = [];
    return empty;
  }
  const source = sourceOpt.value;

  const perPattern = yield* Effect.forEach(
    patterns,
    (pattern) =>
      findPatternMatches(pattern, "Edit", filePath, source).pipe(
        Effect.map((locations) => locations.map((loc) => toAuditMatch(pattern, filePath, loc)))
      ),
    { concurrency: "unbounded" }
  );
  return perPattern.flatMap((xs) => xs);
});

/**
 * Audit a list of files against the catalog. Caps file-level parallelism at
 * 8 because each `auditFile` call holds a `FileSystem.readFileString` and
 * an ast-grep parse in flight; unbounded fan-out can exhaust file
 * descriptors and pegs all CPU cores at once on large repos.
 */
export const auditFiles = Effect.fn("auditFiles")(function* (
  files: ReadonlyArray<string>,
  patterns: ReadonlyArray<Pattern>
) {
  const all = yield* Effect.forEach(files, (file) => auditFile(file, patterns), { concurrency: 8 });
  return pipe(all, Arr.flatten);
});

/**
 * Return the patterns whose detectors hit `source` for a write of `filePath`
 * by `toolName`. Used by the PostToolUse hook to surface matched patterns
 * (with their guidance bodies) to Claude in-band — the hook needs whole
 * patterns, not per-location entries, so dedupe by hit-or-miss happens
 * here once instead of in the formatter.
 */
export const matchedPatternsForFile = Effect.fn("matchedPatternsForFile")(function* (
  patterns: ReadonlyArray<Pattern>,
  toolName: string,
  filePath: string,
  source: string
) {
  const flags = yield* Effect.forEach(
    patterns,
    (pattern) =>
      patternMatches(pattern, toolName, filePath, source).pipe(Effect.map((isMatch) => ({ pattern, isMatch }))),
    { concurrency: "unbounded" }
  );
  return flags.flatMap((entry) => (entry.isMatch ? [entry.pattern] : []));
});

export type { Severity };
