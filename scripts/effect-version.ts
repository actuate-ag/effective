#!/usr/bin/env bun
/**
 * effect-version CLI: manage the Effect version that the plugin pins and that
 * consumer projects align to.
 *
 * Subcommands:
 *  - effect-version plugin                    print the plugin's pinned version
 *  - effect-version plugin <ver> [--force]    set the pin (strict by default:
 *                                             bump this repo's deps, install,
 *                                             check, test; only write the pin
 *                                             on success — or unconditionally
 *                                             with --force)
 *  - effect-version project                   print project version + plugin
 *                                             pin + diff
 *  - effect-version project --align           bump consumer's effect +
 *                                             @effect/* deps to the plugin
 *                                             pin, install, check, test
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Path, Schema } from "effect";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { bumpEffectDeps, detectIndent, detectTrailingNewline } from "../src/effect-version/deps.ts";
import { readPluginPin, readProjectEffectVersion, resolvePluginRoot } from "../src/reference/version.ts";

// ---------- schemas ----------

const DepsRecord = Schema.Record(Schema.String, Schema.String);

class PackageJson extends Schema.Class<PackageJson>("PackageJson")({
  dependencies: Schema.optionalKey(DepsRecord),
  devDependencies: Schema.optionalKey(DepsRecord),
  scripts: Schema.optionalKey(DepsRecord)
}) {}

const writePluginPin = (pluginRoot: string, newVersion: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(pluginRoot, ".claude-plugin", "plugin.json");
    const text = yield* fs.readFileString(manifestPath);
    const indent = detectIndent(text);
    const trailing = detectTrailingNewline(text);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    parsed.pinnedEffectVersion = newVersion;
    const out = JSON.stringify(parsed, null, indent);
    yield* fs.writeFileString(manifestPath, trailing ? `${out}\n` : out);
  });

interface RunResult {
  readonly ok: boolean;
  readonly code: number;
}

const runBun = (
  args: ReadonlyArray<string>,
  cwd: string
): Effect.Effect<RunResult, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const command = ChildProcess.make("bun", args, {
      cwd,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit"
    });
    const result = yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* command;
        return yield* handle.exitCode;
      })
    ).pipe(Effect.match({ onFailure: () => -1, onSuccess: (n) => n }));
    return { ok: result === 0, code: result };
  });

const hasScript = (pkg: PackageJson, name: string): boolean =>
  pkg.scripts !== undefined && Object.hasOwn(pkg.scripts, name);

const readPackage = (
  dir: string
): Effect.Effect<Option.Option<{ text: string; parsed: PackageJson }>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const pkgPath = path.join(dir, "package.json");
    const textOpt = yield* fs.readFileString(pkgPath).pipe(
      Effect.match({
        onFailure: () => Option.none<string>(),
        onSuccess: Option.some
      })
    );
    if (Option.isNone(textOpt)) return Option.none<{ text: string; parsed: PackageJson }>();
    const parsedOpt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PackageJson))(textOpt.value).pipe(
      Effect.match({
        onFailure: () => Option.none<PackageJson>(),
        onSuccess: Option.some
      })
    );
    if (Option.isNone(parsedOpt)) return Option.none<{ text: string; parsed: PackageJson }>();
    return Option.some({ text: textOpt.value, parsed: parsedOpt.value });
  });

// ---------- plugin subcommand ----------

const printPin = Effect.gen(function* () {
  const pinOpt = yield* readPluginPin;
  if (Option.isNone(pinOpt)) {
    yield* Console.error("no pinnedEffectVersion in plugin manifest");
    yield* Effect.sync(() => process.exit(1));
    return;
  }
  yield* Console.log(pinOpt.value);
});

const setPin = (newVersion: string, force: boolean) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const pluginRoot = yield* resolvePluginRoot;
    const pkgPath = path.join(pluginRoot, "package.json");
    const lockPath = path.join(pluginRoot, "bun.lock");

    const beforeOpt = yield* readPackage(pluginRoot);
    if (Option.isNone(beforeOpt)) {
      yield* Console.error(`effect-version: cannot read or parse ${pkgPath}`);
      yield* Effect.sync(() => process.exit(1));
      return;
    }
    const before = beforeOpt.value;

    const lockBefore = yield* fs.readFileString(lockPath).pipe(
      Effect.match({
        onFailure: () => Option.none<string>(),
        onSuccess: Option.some
      })
    );

    const { text: bumpedPkg, changed } = bumpEffectDeps(before.text, newVersion);
    yield* Console.log(`bumping ${changed} effect dep(s) in ${pkgPath} → ${newVersion}`);

    yield* fs.writeFileString(pkgPath, bumpedPkg);

    const restore = Effect.gen(function* () {
      yield* fs.writeFileString(pkgPath, before.text);
      if (Option.isSome(lockBefore)) {
        yield* fs.writeFileString(lockPath, lockBefore.value);
      }
    });

    yield* Console.log("running: bun install");
    const install = yield* runBun(["install"], pluginRoot);
    if (!install.ok) {
      if (!force) {
        yield* restore;
        yield* Console.error(`effect-version: bun install failed (exit ${install.code}); reverted`);
        yield* Effect.sync(() => process.exit(1));
        return;
      }
      yield* Console.error(`effect-version: bun install failed (exit ${install.code}); --force, continuing`);
    }

    yield* Console.log("running: bun run check");
    const check = yield* runBun(["run", "check"], pluginRoot);
    let anyFailed = !install.ok || !check.ok;

    yield* Console.log("running: bun run test");
    const test = yield* runBun(["run", "test"], pluginRoot);
    anyFailed = anyFailed || !test.ok;

    if (anyFailed && !force) {
      yield* restore;
      yield* Console.error(
        `effect-version: verification failed (check=${check.code}, test=${test.code}); pin not written; reverted`
      );
      yield* Effect.sync(() => process.exit(1));
      return;
    }

    yield* writePluginPin(pluginRoot, newVersion);
    if (anyFailed) {
      yield* Console.error(
        `effect-version: pin written to ${newVersion} despite verification failures (check=${check.code}, test=${test.code})`
      );
      yield* Effect.sync(() => process.exit(1));
      return;
    }
    yield* Console.log(`effect-version: pin updated to ${newVersion}`);
  });

const pluginHandler = (config: { version: Option.Option<string>; force: boolean }) =>
  Option.match(config.version, {
    onNone: () => printPin,
    onSome: (v) => setPin(v, config.force)
  });

// ---------- project subcommand ----------

const printProjectStatus = Effect.gen(function* () {
  const cwd = process.cwd();
  const projectOpt = yield* readProjectEffectVersion(cwd);
  const pinOpt = yield* readPluginPin;
  const projectStr = Option.getOrElse(projectOpt, () => "(none)");
  const pinStr = Option.getOrElse(pinOpt, () => "(none)");
  let diff = "unknown";
  if (Option.isSome(projectOpt) && Option.isSome(pinOpt)) {
    const order = Bun.semver.order(projectOpt.value, pinOpt.value);
    diff = order === 0 ? "equal" : order < 0 ? "project behind plugin" : "project ahead of plugin";
  }
  yield* Console.log(`project: effect@${projectStr}`);
  yield* Console.log(`plugin:  effect@${pinStr}`);
  yield* Console.log(`status:  ${diff}`);
});

const alignProject = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cwd = process.cwd();
  const pkgPath = path.join(cwd, "package.json");

  const pinOpt = yield* readPluginPin;
  if (Option.isNone(pinOpt)) {
    yield* Console.error("effect-version: plugin has no pinnedEffectVersion; cannot align");
    yield* Effect.sync(() => process.exit(1));
    return;
  }
  const pin = pinOpt.value;

  const beforeText = yield* fs.readFileString(pkgPath).pipe(
    Effect.match({
      onFailure: () => Option.none<string>(),
      onSuccess: Option.some
    })
  );
  if (Option.isNone(beforeText)) {
    yield* Console.error(`effect-version: no package.json at ${pkgPath}`);
    yield* Effect.sync(() => process.exit(1));
    return;
  }

  const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PackageJson))(beforeText.value).pipe(
    Effect.match({
      onFailure: () => Option.none<PackageJson>(),
      onSuccess: Option.some
    })
  );
  if (Option.isNone(parsed)) {
    yield* Console.error(`effect-version: ${pkgPath} is not a valid package.json`);
    yield* Effect.sync(() => process.exit(1));
    return;
  }

  const { text: bumpedPkg, changed } = bumpEffectDeps(beforeText.value, pin);
  if (changed === 0) {
    yield* Console.log(`effect-version: no effect deps to bump (already at ${pin} or none present)`);
    return;
  }

  yield* Console.log(`bumping ${changed} effect dep(s) in ${pkgPath} → ${pin}`);
  yield* fs.writeFileString(pkgPath, bumpedPkg);

  yield* Console.log("running: bun install");
  const install = yield* runBun(["install"], cwd);
  if (!install.ok) {
    yield* Console.error(`effect-version: bun install failed (exit ${install.code})`);
    yield* Effect.sync(() => process.exit(1));
    return;
  }

  if (hasScript(parsed.value, "check")) {
    yield* Console.log("running: bun run check");
    const check = yield* runBun(["run", "check"], cwd);
    if (!check.ok) {
      yield* Console.error(`effect-version: bun run check failed (exit ${check.code})`);
      yield* Effect.sync(() => process.exit(1));
      return;
    }
  } else {
    yield* Console.log("(no 'check' script; skipping typecheck)");
  }

  if (hasScript(parsed.value, "test")) {
    yield* Console.log("running: bun run test");
    const test = yield* runBun(["run", "test"], cwd);
    if (!test.ok) {
      yield* Console.error(`effect-version: bun run test failed (exit ${test.code})`);
      yield* Effect.sync(() => process.exit(1));
      return;
    }
  } else {
    yield* Console.log("(no 'test' script; skipping tests)");
  }

  yield* Console.log(`effect-version: project aligned to ${pin}`);
});

const projectHandler = (config: { align: boolean }) => (config.align ? alignProject : printProjectStatus);

// ---------- command definitions ----------

const pluginCommand = Command.make("plugin", {
  version: Argument.string("version").pipe(
    Argument.withDescription("New version to pin (omit to print the current pin)"),
    Argument.optional
  ),
  force: Flag.boolean("force").pipe(
    Flag.withDescription("Write the pin even if check/test fails"),
    Flag.withDefault(false)
  )
}, pluginHandler).pipe(Command.withDescription("Read or set the plugin's pinned Effect version."));

const projectCommand = Command.make("project", {
  align: Flag.boolean("align").pipe(
    Flag.withDescription("Bump this project's effect + @effect/* deps to the plugin's pin and verify"),
    Flag.withDefault(false)
  )
}, projectHandler).pipe(Command.withDescription("Show or align this project's Effect version against the plugin's pin."));

const effectVersion = Command.make("effect-version").pipe(
  Command.withDescription("Manage the Effect version pinned by the plugin and aligned by consumer projects."),
  Command.withSubcommands([pluginCommand, projectCommand])
);

effectVersion.pipe(Command.run({ version: "0.0.1" }), Effect.provide(BunServices.layer), BunRuntime.runMain);
