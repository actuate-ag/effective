import { ConfigProvider, Effect, Layer } from "effect";

/**
 * A `ConfigProvider` that reads `process.env` on every access instead of
 * snapshotting it at construction time. The default `ConfigProvider.fromEnv()`
 * captures `{...process.env}` once, so test code that mutates `process.env`
 * inside `beforeEach` is invisible to subsequent `Config.option(...)` reads.
 *
 * Test-only: production code is fine with the default snapshot-based provider
 * because env vars are stable from process spawn through module load.
 */
export const dynamicEnvLayer: Layer.Layer<never> = ConfigProvider.layer(
  ConfigProvider.make((path) =>
    Effect.sync(() => {
      const key = path.map(String).join("_");
      const value = process.env[key];
      return value === undefined ? undefined : ConfigProvider.makeValue(value);
    })
  )
);

/**
 * Boundary helper for tests: set or unset a `process.env` variable as an
 * `Effect`. Lives in this module so the `avoid-process-env` exception is
 * scoped to the env-bridge file rather than leaking into every test that
 * exercises an env-driven branch.
 */
export const setEnv = (name: string, value: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.env[name] = value;
  });

export const unsetEnv = (name: string): Effect.Effect<void> =>
  Effect.sync(() => {
    delete process.env[name];
  });
