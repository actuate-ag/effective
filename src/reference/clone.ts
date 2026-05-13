import { Clock, Effect, FileSystem, Path, pipe } from "effect";
import * as Option from "effect/Option";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { EFFECT_SMOL_REPO } from "./version.ts";

const VERSION_MARKER = ".effective-version";
const CACHE_SUBDIR = "cache/effect-v4";
/** Treat an existing .cloning dir as live if it was modified within this window. */
const IN_FLIGHT_CLONE_MS = 90_000;

/**
 * Boundary write to `process.stderr`: the harness owns its diagnostic output
 * channel. A `Console` layer override would be more idiomatic in domain code,
 * but this module is the runtime adapter — direct stderr is appropriate.
 */
const warn = (message: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stderr.write(`effective: ${message}\n`);
  });

const readClonedTag = (
  cacheDir: string
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(cacheDir, VERSION_MARKER)).pipe(
      Effect.match({
        onFailure: () => Option.none<string>(),
        onSuccess: (text) => {
          const trimmed = text.trim();
          return trimmed === "" ? Option.none<string>() : Option.some(trimmed);
        }
      })
    );
  });

/**
 * If a sibling `.cloning` directory exists and was modified recently, another
 * session is mid-clone. Back off rather than racing the rename.
 */
const isCloneInFlight = (tmpDir: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(tmpDir).pipe(Effect.match({ onFailure: () => false, onSuccess: (b) => b }));
    if (!exists) return false;

    const info = yield* fs.stat(tmpDir).pipe(Effect.option);
    const now = yield* Clock.currentTimeMillis;
    const ageMs = pipe(
      info,
      Option.flatMap((s) => s.mtime),
      Option.map((m) => now - m.getTime()),
      Option.getOrElse(() => Number.POSITIVE_INFINITY)
    );
    if (ageMs < IN_FLIGHT_CLONE_MS) return true;

    yield* fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore);
    return false;
  });

const runGitClone = (
  tmpDir: string,
  tag: string
): Effect.Effect<boolean, never, ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const command = ChildProcess.make("git", ["clone", "--depth", "1", "--branch", tag, EFFECT_SMOL_REPO, tmpDir], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore"
    });

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* command;
        const exit = yield* handle.exitCode;
        return exit === 0;
      })
    ).pipe(Effect.match({ onFailure: () => false, onSuccess: (b) => b }));
  });

const cloneInto = (
  cacheDir: string,
  version: string
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = `${cacheDir}.cloning`;
    const tag = `effect@${version}`;
    const gitDir = path.join(cacheDir, ".git");

    const hasGit = yield* fs.exists(gitDir).pipe(Effect.match({ onFailure: () => false, onSuccess: (b) => b }));
    if (hasGit) {
      const existingTagOpt = yield* readClonedTag(cacheDir);
      if (Option.isSome(existingTagOpt) && existingTagOpt.value === tag) return true;

      const removed = yield* fs
        .remove(cacheDir, { recursive: true })
        .pipe(Effect.match({ onFailure: () => false, onSuccess: () => true }));
      if (!removed) return false;
    }

    if (yield* isCloneInFlight(tmpDir)) {
      yield* warn(`another session appears to be cloning into ${tmpDir}; skipping`);
      return false;
    }

    const parentDir = path.dirname(cacheDir);
    const parentMade = yield* fs
      .makeDirectory(parentDir, { recursive: true })
      .pipe(Effect.match({ onFailure: () => false, onSuccess: () => true }));
    if (!parentMade) return false;

    const cloneOk = yield* runGitClone(tmpDir, tag);
    if (!cloneOk) {
      yield* fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore);
      return false;
    }

    const markerWritten = yield* fs
      .writeFileString(path.join(tmpDir, VERSION_MARKER), tag)
      .pipe(Effect.match({ onFailure: () => false, onSuccess: () => true }));
    if (!markerWritten) {
      yield* fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore);
      return false;
    }

    const renamed = yield* fs
      .rename(tmpDir, cacheDir)
      .pipe(Effect.match({ onFailure: () => false, onSuccess: () => true }));
    if (!renamed) {
      yield* fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore);
      return false;
    }

    return true;
  });

/**
 * Ensure a shallow clone of `Effect-TS/effect-smol` is available at
 * `<pluginRoot>/cache/effect-v4/`, pinned to `effect@<version>`.
 *
 * Atomic via `.cloning/` tmpdir + rename. Fail-silent: returns `false` on
 * any failure rather than throwing — never blocks a Claude Code session.
 * Re-clones on version mismatch (the cache is plugin-owned, so there's no
 * cross-project contention to protect against).
 */
export const ensureReferenceClone = (
  pluginRoot: string,
  version: string
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const cacheDir = path.join(pluginRoot, CACHE_SUBDIR);
    return yield* cloneInto(cacheDir, version);
  });

/** Resolve the cache path for a given plugin root. */
export const cachePathFor = (pluginRoot: string, path: Path.Path): string => path.join(pluginRoot, CACHE_SUBDIR);
