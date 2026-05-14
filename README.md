# effective

A Claude Code plugin that helps Claude write correct, clean, and
idiomatic [Effect v4](https://effect.website) TypeScript.

Adapted from [`pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness)
for the Claude Code surface (skills, hooks, slash commands).

## Table of contents

- [Install](#install)
- [What it ships](#what-it-ships)
- [Skill catalog](#skill-catalog) (9)
- [Pattern catalog](#pattern-catalog) (46)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Development](#development)
- [License](#license)

---

## Install

This repository hosts both the plugin and its marketplace (the
`marketplace.json` at `.claude-plugin/marketplace.json` lists `effective` as a
plugin sourced from this same repo at `./`).

Inside Claude Code:

```
/plugin marketplace add actuate-ag/effective
/plugin install effective@effective
```

Updates:

```
/plugin marketplace update effective
```

Uninstall:

```
/plugin uninstall effective@effective
```

## What it ships

- **9 skills** under the `effective` namespace: an always-on
  `guidance` skill that orients Claude to the codebase, plus 8
  task-shaped topic skills (`services`, `schema`, `errors`, `http`,
  `sql`, `react`, `testing`, `migration`) invoked as
  `/effective:<topic>` when Claude is working in that area. Each topic
  skill is a curated ~200-line synthesis that cites deeper material
  in the references library.
- **A `references/` library** — 35 markdown docs the topic skills and
  pattern hook cite for depth (full v3→v4 rename tables, advanced API
  surfaces, cross-cutting primitives like `optics`, `pattern-matching`,
  `typeclass-design`, `wide-events`, `stream`, `batching`).
- **A `SessionStart` hook** that maintains a shallow clone of
  [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol) at the
  version pinned by the plugin (`pinnedEffectVersion` in
  `.claude-plugin/plugin.json`), under the plugin's own `cache/effect-v4/`
  directory. Claude reads it instead of guessing v4 APIs. The hook also
  warns when the active project's installed `effect` version drifts from
  the plugin pin.
- **A `PostToolUse` hook** that runs 46 ast-grep / regex pattern
  detectors against every successful Edit/Write/MultiEdit and surfaces
  matches back to Claude in-band — severity-sorted, deduped, each
  citing the specific `references/*.md` that addresses the rule.
- **Slash commands** (under the `effective` namespace):
  - `/effective:audit` — run the pattern catalog across the project and
    surface matches back to Claude. Same detector core as the PostToolUse
    hook, applied to existing code rather than fresh edits.
  - `/effective:plugin-version` — read or update the Effect version the
    plugin pins (maintainer-side).
  - `/effective:project-version` — show the active project's installed
    Effect version vs. the plugin pin, optionally align with `--align`.
  - `/effective:status` — print a snapshot of pin, cache, and hook state.

---

## Skill catalog

Nine skills total: one always-on navigator and eight task-shaped topic
skills. Each topic skill is a curated ~200-line synthesis that cites
deeper references in the library.

| Skill | Surface | When |
|---|---|---|
| [`guidance`](skills/guidance/SKILL.md) | Always-on navigator — pre-write protocol, task → topic-skill table, operating model, top renames | Autoloaded every session |
| [`services`](skills/services/SKILL.md) | `Context.Service` namespace pattern, Layer composition, `Effect.fn`, capability vs. monolith | Writing or modifying a service |
| [`schema`](skills/schema/SKILL.md) | `Schema.Class`, branded fields, checks, decode/encode, transformations, ADTs | Designing or modifying a schema |
| [`errors`](skills/errors/SKILL.md) | `Schema.TaggedErrorClass`, `catchTag` / `catchTags`, expected vs. defect channels | Designing how a feature fails |
| [`http`](skills/http/SKILL.md) | `HttpApi` endpoint + group + handler + derived client, status-code annotations, security middleware | Building an HTTP endpoint or client |
| [`sql`](skills/sql/SKILL.md) | `SqlClient` tagged-template queries, `SqlSchema` decoding, `Model` / `SqlModel`, `SqlResolver`, `Migrator` | Writing a query, repository, or migration |
| [`react`](skills/react/SKILL.md) | VM pattern, Effect Atom, `Atom.runtime`, `AsyncResult`, zero-UI-logic rule | Building a React component / VM |
| [`testing`](skills/testing/SKILL.md) | `@effect/vitest` runners, `Layer.mock`, `Effect.flip`, `TestClock`, property-based | Writing tests for Effect code |
| [`migration`](skills/migration/SKILL.md) | Promise → Effect step-by-step template, v3 → v4 rename cheat sheet | Porting existing code into v4 |

The topic skills sit on top of a `references/` library — 35 markdown
docs that hold the deep API surface (full rename tables, advanced
combinators, cross-cutting primitives like `optics`,
`pattern-matching`, `typeclass-design`, `wide-events`, `stream`,
`batching`, `concurrency-testing`, `domain-modeling`, etc.). References
aren't slash-commands; they're cited from topic skills and from
pattern-hook output.

---

## Pattern catalog

46 patterns run after every successful Edit/Write/MultiEdit on files matching
the pattern's `glob` field. Most target TypeScript/TSX. Each pattern is a
TypeScript module exporting a typed `Pattern` object with either an
ast-grep rule or a comment-skipping regex detector.

### `avoid-*` (21)

| Pattern | Level | Description |
|---|---|---|
| [`avoid-any`](patterns/avoid-any.ts) | warning | `as any` and `as unknown` type assertions. |
| [`avoid-data-tagged-error`](patterns/avoid-data-tagged-error.ts) | warning | `Data.TaggedError` — use `Schema.TaggedErrorClass`. |
| [`avoid-direct-json`](patterns/avoid-direct-json.ts) | info | `JSON.parse` / `JSON.stringify` — use `Schema.fromJsonString`. |
| [`avoid-direct-tag-checks`](patterns/avoid-direct-tag-checks.ts) | warning | Direct `_tag` property checks; use exported refinements. |
| [`avoid-expect-in-if`](patterns/avoid-expect-in-if.ts) | warning | `expect()` calls nested inside `if` blocks in tests. |
| [`avoid-fs-promises`](patterns/avoid-fs-promises.ts) | warning | `fs/promises` direct usage — wrap with Effect. |
| [`avoid-mutable-state`](patterns/avoid-mutable-state.ts) | info | `let` bindings inside Effect services; prefer `Ref`. |
| [`avoid-native-fetch`](patterns/avoid-native-fetch.ts) | warning | Native `fetch` — use Effect HTTP modules. |
| [`avoid-node-imports`](patterns/avoid-node-imports.ts) | warning | `node:` imports — use `@effect/platform` abstractions. |
| [`avoid-non-null-assertion`](patterns/avoid-non-null-assertion.ts) | warning | `!` non-null assertion operator. |
| [`avoid-object-type`](patterns/avoid-object-type.ts) | warning | `Object` and `{}` as types. |
| [`avoid-option-getorthrow`](patterns/avoid-option-getorthrow.ts) | warning | `Option.getOrThrow` — use `Option.match` or `Option.getOrElse`. |
| [`avoid-platform-coupling`](patterns/avoid-platform-coupling.ts) | warning | Binding packages importing platform-specific packages. |
| [`avoid-process-env`](patterns/avoid-process-env.ts) | warning | `process.env` — use `Config.*`. |
| [`avoid-react-hooks`](patterns/avoid-react-hooks.ts) | high | `useState`/`useEffect`/`useReducer` — use VMs with Effect Atom. |
| [`avoid-schema-suffix`](patterns/avoid-schema-suffix.ts) | info | Schema constants suffixed with `Schema`. |
| [`avoid-sync-fs`](patterns/avoid-sync-fs.ts) | high | Synchronous filesystem operations. |
| [`avoid-try-catch`](patterns/avoid-try-catch.ts) | warning | `try`/`catch` in Effect code — use `Effect.try` or typed errors. |
| [`avoid-ts-ignore`](patterns/avoid-ts-ignore.ts) | warning | `@ts-ignore` and `@ts-expect-error`. |
| [`avoid-untagged-errors`](patterns/avoid-untagged-errors.ts) | warning | `instanceof Error` and `new Error` for recoverable failures. |
| [`avoid-yield-ref`](patterns/avoid-yield-ref.ts) | warning | Direct `yield* Ref/Deferred/Fiber/Latch` (removed in v4). |

### `prefer-*` (7)

| Pattern | Level | Description |
|---|---|---|
| [`prefer-arr-sort`](patterns/prefer-arr-sort.ts) | warning | `Arr.sort` with explicit `Order` over native `Array.prototype.sort`. |
| [`prefer-duration-values`](patterns/prefer-duration-values.ts) | warning | `Duration` helpers over numeric literals for time. |
| [`prefer-effect-fn`](patterns/prefer-effect-fn.ts) | warning | `Effect.fn` for service methods over plain `Effect.gen` wrappers. |
| [`prefer-match-over-switch`](patterns/prefer-match-over-switch.ts) | warning | `Match` over native `switch`. |
| [`prefer-option-over-null`](patterns/prefer-option-over-null.ts) | info | `Option` over `T \| null` unions. |
| [`prefer-redacted-config`](patterns/prefer-redacted-config.ts) | warning | `Config.redacted` / `Schema.Redacted` for secrets. |
| [`prefer-schema-class`](patterns/prefer-schema-class.ts) | warning | `Schema.Class` over `Schema.Struct` for object/domain schemas. |

### `use-*` (7)

| Pattern | Level | Description |
|---|---|---|
| [`use-clock-service`](patterns/use-clock-service.ts) | warning | `Clock` / `DateTime` over `new Date()` and `Date.now()`. |
| [`use-console-service`](patterns/use-console-service.ts) | warning | `Console` / `Effect.log*` over `console.*`. |
| [`use-context-service`](patterns/use-context-service.ts) | warning | `Context.Service` over legacy `ServiceMap.Service` APIs. |
| [`use-filesystem-service`](patterns/use-filesystem-service.ts) | high | `FileSystem` service over direct `node:fs` imports. |
| [`use-path-service`](patterns/use-path-service.ts) | warning | `Path` service over direct `node:path` imports. |
| [`use-random-service`](patterns/use-random-service.ts) | warning | `Random` service over `Math.random()`. |
| [`use-temp-file-scoped`](patterns/use-temp-file-scoped.ts) | warning | `makeTempFileScoped` / `makeTempDirectoryScoped` over `os.tmpdir()`. |

### Other (11)

| Pattern | Level | Description |
|---|---|---|
| [`casting-awareness`](patterns/casting-awareness.ts) | info | Type assertions in general — use type-safe alternatives. |
| [`context-tag-extends`](patterns/context-tag-extends.ts) | warning | `class *Tag extends Context.Tag` naming — use `Context.Service`. |
| [`effect-catchall-default`](patterns/effect-catchall-default.ts) | warning | Broad `Effect.catch` defaults in domain logic — use `catchTag`. |
| [`effect-promise-vs-trypromise`](patterns/effect-promise-vs-trypromise.ts) | warning | `Effect.promise` over `Effect.tryPromise`. |
| [`effect-run-in-body`](patterns/effect-run-in-body.ts) | warning | `Effect.runSync` / `runPromise` outside entry points. |
| [`imperative-loops`](patterns/imperative-loops.ts) | warning | `for` / `for...of` over functional transformations. |
| [`require-effect-concurrency`](patterns/require-effect-concurrency.ts) | warning | `Effect.forEach` / `all` / `validate` without explicit concurrency. |
| [`stream-large-files`](patterns/stream-large-files.ts) | info | Whole-file reads when the path looks large or unbounded. |
| [`throw-in-effect-gen`](patterns/throw-in-effect-gen.ts) | **critical** | `throw` inside `Effect.gen` — use `yield* Effect.fail()`. |
| [`vm-in-wrong-file`](patterns/vm-in-wrong-file.ts) | **critical** | View Model definitions outside `.vm.ts` files. |
| [`yield-in-for-loop`](patterns/yield-in-for-loop.ts) | warning | `yield*` in `for` loops — use `Effect.forEach` / `STM.forEach`. |

---

## Configuration

### Effect version pin

The plugin pins a specific Effect version in
`.claude-plugin/plugin.json` under the `pinnedEffectVersion` field. This
is the version the plugin's skills, patterns, and reference clone are
validated against. Two slash commands manage it:

| Command | Purpose |
|---|---|
| `/effective:plugin-version` | Print the current pin. |
| `/effective:plugin-version <version>` | Strict-by-default verify flow inside the plugin repo: bump this repo's `effect` and `@effect/*` deps, `bun install`, `bun run check`, `bun run test`. Writes the new pin only if everything passes. Reverts `package.json` + `bun.lock` on any failure. `--force` writes the pin regardless. |
| `/effective:project-version` | In a consumer project: print the project's installed Effect version, the plugin's pin, and whether they match (equal / project behind / project ahead). |
| `/effective:project-version --align` | Bump the project's `effect` + `@effect/*` deps to the plugin's pin (preserving prefixes), run `bun install`, then `bun run check` and `bun run test` if those scripts exist. |

The SessionStart hook compares the project's installed version against
the plugin's pin and emits a warning (to both the user and the agent's
session context) when they drift. Direction-aware: behind suggests
`--align`, ahead suggests updating the plugin.

---

## How it works

```
SessionStart
  └─► hooks/ensure-reference-clone.ts
        ├─ read pinnedEffectVersion from .claude-plugin/plugin.json
        ├─ shallow-clone Effect-TS/effect-smol at effect@<pin>
        ├─ atomic rename into <plugin-root>/cache/effect-v4/
        └─ compare project's installed effect to the pin; warn on drift

PostToolUse (Edit | Write | MultiEdit | NotebookEdit)
  └─► hooks/pattern-feedback.ts
        ├─ statically import 46 patterns via src/patterns/index.ts
        ├─ filter by tool regex + glob + ignoreGlob
        ├─ run ast-grep (in-process, @ast-grep/napi) or comment-stripped regex
        ├─ severity-sort + dedupe
        └─ emit hookSpecificOutput.additionalContext to Claude
            (each match cites the relevant references/*.md)

Skill autoload (built into Claude Code)
  └─► `guidance` skill always autoloads and orients Claude
       (8 topic skills are invoked on demand as /effective:<topic>)
```

The hooks always exit 0 — failures go to stderr only and never block a
session. The reference clone is fail-silent; the pattern hook degrades to
"no matches" if the catalog can't load.

---

## Development

For working on the plugin itself, point Claude Code at a local checkout:

```bash
git clone https://github.com/actuate-ag/effective
claude --plugin-dir ./effective
```

Use `/reload-plugins` inside Claude Code to pick up changes as you iterate.

Local verification:

```sh
bun install
bun run check    # tsc --noEmit
bun run test     # vitest run
bun run fmt      # dprint fmt
```

See [`AGENTS.md`](https://github.com/mpsuesser/pi-effect-harness/blob/main/AGENTS.md)
in the upstream pi-effect-harness for the original architectural context.

The hook scripts are plain bun TypeScript with no Effect runtime kernel —
the abstractions in `pi-effect-harness/packages/harness-kit` are not ported,
since CC hooks are short-lived child processes and don't benefit from them.

## License

MIT.

---

- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the agent this plugin extends.
- [Effect](https://effect.website) — what this plugin is opinionated about.
- [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol) — the source the reference clone tracks.
- [`pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness) — the Pi extension this is adapted from.
