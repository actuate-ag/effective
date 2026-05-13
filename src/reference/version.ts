import { Config, Effect, FileSystem, Path, pipe, Schema } from "effect";
import * as Option from "effect/Option";

export const EFFECT_SMOL_REPO = "https://github.com/Effect-TS/effect-smol.git";
const PLUGIN_ROOT_ENV = "CLAUDE_PLUGIN_ROOT";

class EffectPackageJson extends Schema.Class<EffectPackageJson>("EffectPackageJson")({
  version: Schema.optionalKey(Schema.String)
}) {}

class PluginManifest extends Schema.Class<PluginManifest>("PluginManifest")({
  pinnedEffectVersion: Schema.optionalKey(Schema.String)
}) {}

const fromImportMeta = (path: Path.Path): string =>
  path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), "..", "..");

const readPluginRootEnv: Effect.Effect<Option.Option<string>> = Effect.gen(function* () {
  return yield* Config.option(Config.string(PLUGIN_ROOT_ENV));
}).pipe(
  Effect.match({
    onFailure: () => Option.none<string>(),
    onSuccess: (o) => o
  })
);

/**
 * Resolve the plugin root: prefer `CLAUDE_PLUGIN_ROOT` (set by the harness
 * when hooks fire under the plugin system), fall back to walking up from
 * this source file's on-disk location (`src/reference/version.ts` → `../..`).
 */
export const resolvePluginRoot: Effect.Effect<string, never, Path.Path> = Effect.gen(function* () {
  const path = yield* Path.Path;
  const envOpt = yield* readPluginRootEnv;
  return Option.match(envOpt, {
    onNone: () => fromImportMeta(path),
    onSome: (v) => (v === "" ? fromImportMeta(path) : v)
  });
});

/**
 * Read `pinnedEffectVersion` from `<plugin-root>/.claude-plugin/plugin.json`.
 * Fail-silent: returns `None` when the manifest is missing, unreadable,
 * malformed, or lacks the `pinnedEffectVersion` field.
 */
export const readPluginPin: Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* resolvePluginRoot;
    const manifestPath = path.join(root, ".claude-plugin", "plugin.json");

    const content = yield* fs.readFileString(manifestPath).pipe(
      Effect.match({
        onFailure: () => Option.none<string>(),
        onSuccess: Option.some
      })
    );
    if (Option.isNone(content)) return Option.none<string>();

    const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PluginManifest))(content.value).pipe(
      Effect.match({
        onFailure: () => Option.none<PluginManifest>(),
        onSuccess: Option.some
      })
    );
    return pipe(
      decoded,
      Option.flatMap((m) =>
        m.pinnedEffectVersion === undefined ? Option.none<string>() : Option.some(m.pinnedEffectVersion)
      )
    );
  });

/**
 * Read the project's installed effect version from
 * `<projectDir>/node_modules/effect/package.json`. Fail-silent: returns
 * `None` if the file is missing, unreadable, malformed, or lacks `version`.
 */
export const readProjectEffectVersion = (
  projectDir: string
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const pkgPath = path.join(projectDir, "node_modules", "effect", "package.json");

    const content = yield* fs.readFileString(pkgPath).pipe(
      Effect.match({
        onFailure: () => Option.none<string>(),
        onSuccess: Option.some
      })
    );

    return yield* pipe(
      content,
      Option.match({
        onNone: () => Effect.succeed(Option.none<string>()),
        onSome: (text) =>
          Schema.decodeUnknownEffect(Schema.fromJsonString(EffectPackageJson))(text).pipe(
            Effect.match({
              onFailure: () => Option.none<string>(),
              onSuccess: (pkg) => (pkg.version === undefined ? Option.none<string>() : Option.some(pkg.version))
            })
          )
      })
    );
  });

/**
 * Detect the effect version to use for the reference clone. Prefers the
 * project's installed effect, falls back to the plugin's `pinnedEffectVersion`.
 *
 * Returns `None` only when both signals are absent — the project has no
 * `node_modules/effect` and the plugin manifest is missing/corrupt or
 * lacks the pin. Callers treat `None` as "no version detected; skip the
 * reference clone."
 */
export const detectEffectVersion = (
  projectDir: string
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fromProject = yield* readProjectEffectVersion(projectDir);
    if (Option.isSome(fromProject)) return fromProject;
    return yield* readPluginPin;
  });
