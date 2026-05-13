import { it } from "@effect/vitest";
import { BunServices } from "@effect/platform-bun";
import { DateTime, Effect, FileSystem, Layer, Path, Random } from "effect";
import * as Option from "effect/Option";
import { describe, expect, vi } from "vitest";

import { cachePathFor, ensureReferenceClone } from "../src/reference/clone.ts";
import { dynamicEnvLayer } from "../src/reference/test-env-provider.ts";

const VERSION_MARKER = ".effective-version";

const TestLayer = Layer.merge(BunServices.layer, dynamicEnvLayer);

const run = <A, E>(effect: Effect.Effect<A, E, BunServices.BunServices>): Effect.Effect<A, E> =>
  effect.pipe(Effect.provide(TestLayer));

const fakePopulatedClone = (dir: string, tag: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.join(dir, ".git"), { recursive: true });
    yield* fs.writeFileString(path.join(dir, VERSION_MARKER), tag);
  });

const mkTmp = (label: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const now = yield* DateTime.now;
    const suffix = yield* Random.nextInt;
    const tmpdir = yield* fs.makeTempDirectoryScoped({ prefix: "cce-rc-" });
    const dir = path.join(tmpdir, `${label}-${DateTime.toEpochMillis(now)}-${suffix}`);
    yield* fs.makeDirectory(dir, { recursive: true });
    return dir;
  });

const fileExists = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(path).pipe(Effect.match({ onFailure: () => false, onSuccess: (b) => b }));
  });

const readFile = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(path);
  });

const setMtimeMs = (path: string, mtimeMs: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const seconds = mtimeMs / 1000;
    yield* fs.utimes(path, seconds, seconds);
  });

describe("ensureReferenceClone (plugin-owned cache)", () => {
  it.live("is a no-op when cache is already at the requested version", () =>
    Effect.gen(function* () {
      const pluginRoot = yield* mkTmp("plugin");
      const path = yield* Path.Path;
      const cacheDir = cachePathFor(pluginRoot, path);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(path.dirname(cacheDir), { recursive: true });
      yield* fakePopulatedClone(cacheDir, "effect@4.0.0-beta.57");

      const ok = yield* ensureReferenceClone(pluginRoot, "4.0.0-beta.57");
      expect(ok).toBe(true);
      const marker = yield* readFile(path.join(cacheDir, VERSION_MARKER));
      expect(marker.trim()).toBe("effect@4.0.0-beta.57");
    }).pipe(Effect.scoped, run)
  );

  it.live("re-clones at the new version on a tag mismatch (no strict-version guard)", () =>
    Effect.gen(function* () {
      const pluginRoot = yield* mkTmp("plugin");
      const path = yield* Path.Path;
      const cacheDir = cachePathFor(pluginRoot, path);
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(path.dirname(cacheDir), { recursive: true });
      // Seed the cache with a stale (fake) tag.
      yield* fakePopulatedClone(cacheDir, "effect@4.0.0-beta.57");

      // Request a different real version. The hook should remove the stale
      // cache and re-clone at the requested tag.
      const ok = yield* ensureReferenceClone(pluginRoot, "4.0.0-beta.58");
      expect(ok).toBe(true);
      const marker = yield* readFile(path.join(cacheDir, VERSION_MARKER));
      expect(marker.trim()).toBe("effect@4.0.0-beta.58");
    }).pipe(Effect.scoped, run)
  );

  it.live("backs off when a fresh .cloning sibling exists", () =>
    Effect.gen(function* () {
      const pluginRoot = yield* mkTmp("plugin");
      const path = yield* Path.Path;
      const cacheDir = cachePathFor(pluginRoot, path);
      const fs = yield* FileSystem.FileSystem;
      const tmpDir = `${cacheDir}.cloning`;
      yield* fs.makeDirectory(tmpDir, { recursive: true });
      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const ok = yield* ensureReferenceClone(pluginRoot, "4.0.0-beta.57");

      expect(ok).toBe(false);
      expect(yield* fileExists(cacheDir)).toBe(false);
      expect(yield* fileExists(tmpDir)).toBe(true);
      expect(stderr.mock.calls.map((c) => String(c[0])).join("")).toMatch(/another session appears to be cloning/);
      stderr.mockRestore();
    }).pipe(Effect.scoped, run)
  );

  it.live("cleans up a stale .cloning sibling (older than the in-flight window)", () =>
    Effect.gen(function* () {
      // Note: verifies the staleness check fires. The subsequent git clone
      // will fail in the test env (no network), but the point is that the
      // stale .cloning dir gets removed before the clone is attempted.
      const pluginRoot = yield* mkTmp("plugin");
      const path = yield* Path.Path;
      const cacheDir = cachePathFor(pluginRoot, path);
      const fs = yield* FileSystem.FileSystem;
      const tmpDir = `${cacheDir}.cloning`;
      yield* fs.makeDirectory(tmpDir, { recursive: true });
      const now = yield* DateTime.now;
      const tenMinutesAgoMs = DateTime.toEpochMillis(now) - 10 * 60 * 1000;
      yield* setMtimeMs(tmpDir, tenMinutesAgoMs);
      const info = yield* fs.stat(tmpDir);
      const mtimeMs = Option.map(info.mtime, (d) => d.getTime()).pipe(Option.getOrElse(() => 0));
      expect(DateTime.toEpochMillis(now) - mtimeMs).toBeGreaterThan(90_000);
      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      yield* ensureReferenceClone(pluginRoot, "4.0.0-beta.57");

      const messages = stderr.mock.calls.map((c) => String(c[0])).join("");
      expect(messages).not.toMatch(/another session appears to be cloning/);
      stderr.mockRestore();
    }).pipe(Effect.scoped, run)
  );
});
