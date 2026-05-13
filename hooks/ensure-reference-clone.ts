#!/usr/bin/env bun
/**
 * SessionStart hook: ensure the plugin-owned Effect v4 reference clone is
 * fresh at the version the plugin pins (`pinnedEffectVersion` in
 * `.claude-plugin/plugin.json`).
 *
 * Also emits a drift warning when the active project's installed effect
 * version differs from the plugin pin — printed to stdout (becomes part of
 * the agent's session context per the SessionStart hook contract) and to
 * stderr (visible to the user).
 *
 * Reads the standard Claude Code hook payload from stdin (JSON with `cwd`).
 * Always exits 0; surfaces a one-line stderr note on failure but never
 * blocks the session.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, pipe, Schema } from "effect";
import * as Option from "effect/Option";

import { ensureReferenceClone } from "../src/reference/clone.ts";
import { readPluginPin, readProjectEffectVersion, resolvePluginRoot } from "../src/reference/version.ts";

class HookInput extends Schema.Class<HookInput>("HookInput")({
  cwd: Schema.optionalKey(Schema.String),
  hook_event_name: Schema.optionalKey(Schema.String)
}) {}

const decodeHookInput = Schema.decodeUnknownEffect(Schema.fromJsonString(HookInput));

const readStdinText: Effect.Effect<string> = Effect.tryPromise({
  try: () => Bun.stdin.text(),
  catch: () => null
}).pipe(Effect.match({ onFailure: () => "", onSuccess: (s) => s }));

const program = Effect.gen(function* () {
  const raw = yield* readStdinText;
  const parsed =
    raw.trim() === ""
      ? Option.none<HookInput>()
      : yield* decodeHookInput(raw).pipe(
          Effect.match({
            onFailure: () => Option.none<HookInput>(),
            onSuccess: Option.some
          })
        );

  const cwd = pipe(
    parsed,
    Option.flatMap((input) => Option.fromNullishOr(input.cwd)),
    Option.getOrElse(() => process.cwd())
  );

  const pluginPinOpt = yield* readPluginPin;
  if (Option.isNone(pluginPinOpt)) {
    yield* Console.error(
      "effective: plugin manifest lacks pinnedEffectVersion; skipping reference clone"
    );
    return;
  }
  const pluginVer = pluginPinOpt.value;

  const pluginRoot = yield* resolvePluginRoot;
  const ok = yield* ensureReferenceClone(pluginRoot, pluginVer);
  if (!ok) {
    yield* Console.error(
      `effective: reference clone unavailable (effect@${pluginVer}); the agent will continue without the Effect v4 source clone`
    );
  }

  const projectVersionOpt = yield* readProjectEffectVersion(cwd);
  if (Option.isSome(projectVersionOpt) && projectVersionOpt.value !== pluginVer) {
    const projectVer = projectVersionOpt.value;
    const direction = Bun.semver.order(projectVer, pluginVer);
    const message =
      direction < 0
        ? `effective: this project uses effect@${projectVer}, but the plugin pins effect@${pluginVer}. The reference clone and skills target the plugin's pin, so some APIs may not match your installed version. To align this project to the plugin's pin, run /effective:project-version --align.`
        : `effective: this project uses effect@${projectVer}, but the plugin pins an older effect@${pluginVer}. The reference clone and skills target the plugin's pin and may lag behind APIs you're using. Consider updating the effective plugin; do not run /effective:project-version --align (it would downgrade your project).`;
    yield* Console.log(message);
    yield* Console.error(message);
  }
}).pipe(Effect.ignore);

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
