# effective

A Claude Code plugin that helps Claude write correct, clean, and
idiomatic [Effect v4](https://effect.website) TypeScript.

Adapted from [`pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness)
for the Claude Code surface (skills, hooks, slash commands).

## Table of contents

- [What it ships](#what-it-ships)
- [How it works](#how-it-works)
- [Install](#install)
- [Skill catalog](#skill-catalog) (35)
- [Pattern catalog](#pattern-catalog) (46)
- [Configuration](#configuration)
- [Development](#development)
- [License](#license)

---

## What it ships

- **35 skills** under the `effective` namespace covering schema, layers,
  services, errors, config, observability, streaming, persistence,
  networking, CLI, testing, React, and migration. Claude invokes the
  relevant skill on demand based on the task — surface them as
  `/effective:<skill-name>` (e.g. `/effective:error-handling`).
- **A `SessionStart` hook** that maintains a shallow clone of
  [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol) at the
  version pinned by the plugin (`pinnedEffectVersion` in
  `.claude-plugin/plugin.json`), under the plugin's own `cache/effect-v4/`
  directory. Claude reads it instead of guessing v4 APIs. The hook also
  warns when the active project's installed `effect` version drifts from
  the plugin pin.
- **A `PostToolUse` hook** that runs 46 ast-grep / regex pattern detectors
  against every successful Edit/Write/MultiEdit and surfaces matches back
  to Claude in-band — severity-sorted, deduped, with a hint to invoke the
  suggested skill.
- **A `codebase-guidance` skill** that's auto-invoked on any Effect v4
  codebase to brief Claude on v3→v4 renames, where the reference clone
  lives, which skills exist, and what the pattern-feedback hook does.
- **Slash commands** (under the `effective` namespace):
  - `/effective:audit` — run the pattern catalog across the project and
    surface matches back to Claude. Same detector core as the PostToolUse
    hook, applied to existing code rather than fresh edits.
  - `/effective:plugin-version` — read or update the Effect version the
    plugin pins (maintainer-side).
  - `/effective:project-version` — show the active project's installed
    Effect version vs. the plugin pin, optionally align with `--align`.
  - `/effective:status` — print a snapshot of pin, cache, and hook state.

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
        ├─ load 46 patterns from patterns/*.md
        ├─ filter by tool regex + glob + ignoreGlob
        ├─ run ast-grep (in-process, @ast-grep/napi) or comment-stripped regex
        ├─ severity-sort + dedupe
        └─ emit hookSpecificOutput.additionalContext to Claude

Skill autoload (built into Claude Code)
  └─► description-matched skills under skills/<name>/SKILL.md
        (namespaced as /effective:<name>)
```

The hooks always exit 0 — failures go to stderr only and never block a
session. The reference clone is fail-silent; the pattern hook degrades to
"no matches" if the catalog can't load.

## Install

This repository hosts both the plugin and its marketplace (the
`marketplace.json` at `.claude-plugin/marketplace.json` lists `effective` as a
plugin sourced from this same repo at `./`).

Inside Claude Code:

```
/plugin marketplace add actuate-ag/effective
/plugin install effective@effective
```

After install, the plugin auto-registers:

- 35 skills under `/effective:<name>`.
- `SessionStart` + `PostToolUse` hooks from `hooks/hooks.json`.
- Slash commands `/effective:audit`, `/effective:plugin-version`,
  `/effective:project-version`, `/effective:status`.
- `bin/effect-version` added to the Bash tool's `PATH` for the session
  (no `~/.local/bin/` pollution).
- Reference clone created lazily under the plugin's own `cache/effect-v4/`
  on first SessionStart.

Updates:

```
/plugin marketplace update effective
```

Uninstall:

```
/plugin uninstall effective@effective
```

---

## Skill catalog

35 skills, ported from `pi-effect-harness` with description fields tuned for
Claude Code autoload triggering.

### Schema & domain modeling (8)

| Skill | Description |
|---|---|
| `schema-v4` | Authoritative reference for Effect Schema v4 API changes and v3 → v4 migration. Find-and-replace tables, breaking changes, idiom shifts. |
| `schema-composition` | `Schema.decodeTo`, transformations, filters, multi-stage validation. |
| `domain-modeling` | Production-ready domain models with `Schema.TaggedStruct` — ADTs, predicates, orders, guards, match functions. |
| `domain-predicates` | Predicates and orders for domain types using typeclass patterns. |
| `typeclass-design` | Curried signatures and dual data-first / data-last APIs. |
| `pattern-matching` | `Data.TaggedEnum`, `$match`, `$is`, `Match.typeTags`, `Effect.match`. Avoid manual `_tag` checks. |
| `context-witness` | When to use `Context.Service` witness vs. capability patterns; coupling trade-offs. |
| `optics` | `Iso`, `Lens`, `Prism`, `Optional`, `Traversal` — composable, type-safe access and immutable updates to nested data. |

### Layers, services, runtime (5)

| Skill | Description |
|---|---|
| `layer-design` | Designing and composing layers for clean dependency management. |
| `service-implementation` | Fine-grained service capabilities; avoiding monolithic designs. |
| `managed-runtime` | Bridging Effect into non-Effect frameworks (Hono, Express, Fastify, Lambda, Workers) via `ManagedRuntime`. |
| `platform-abstraction` | Cross-platform file I/O, process spawning, HTTP clients, terminal — the abstraction itself. |
| `platform-layers` | Structuring platform-layer provision for cross-platform applications. |

### Errors, config, observability (4)

| Skill | Description |
|---|---|
| `error-handling` | `Schema.TaggedErrorClass`, `catchTag`/`catchTags`, `catchReason`/`catchReasons`, `Cause`, `ErrorReporter`, recovery patterns. |
| `config` | `Config` and `ConfigProvider` — env vars, structured config, test config, `.env`, JSON, custom sources. |
| `observability` | Structured logging, distributed tracing, metrics; OTLP/Prometheus export. |
| `wide-events` | Wide events (canonical log lines) for observability. Conceptual guide for instrumentation strategy. |

### Data, IO, concurrency (7)

| Skill | Description |
|---|---|
| `stream` | Pull-based streaming pipelines — creation, transformation, consumption, encoding (NDJSON/Msgpack), concurrency, resource safety. |
| `batching` | `Request`, `RequestResolver`, `SqlResolver` — N+1 elimination, batched data-fetching layers, request caching. |
| `pubsub-event-bus` | Typed event buses with `PubSub` and `Stream`. |
| `filesystem` | Cross-platform file I/O across Node.js, Bun, browser. |
| `path` | Cross-platform path operations — joining, resolving, URL conversion. |
| `command-executor` | `ChildProcess` — shell commands, captured output, piping, streaming, scoped lifecycle. |
| `concurrency-testing` | Testing `PubSub`, `Deferred`, `Latch`, `Fiber`, `SubscriptionRef`, `Stream`. |

### Persistence & networking (4)

| Skill | Description |
|---|---|
| `sql` | `SqlClient`, `SqlSchema`, `SqlModel` (CRUD repos), `SqlResolver`, `Migrator`. |
| `http-api` | `HttpApi`, `HttpApiClient`, `HttpApiBuilder` — typed endpoints, security middleware, OpenAPI, derived clients. |
| `rpc-cluster` | RPC endpoints, cluster routing, workflow patterns with Effect RPC and Cluster. |
| `workflow` | Durable workflows with `Workflow`, `Activity`, `DurableClock`, `DurableDeferred` — execution that survives restarts, compensation (saga), distribution via Cluster. |

### CLI (1)

| Skill | Description |
|---|---|
| `cli` | Type-safe CLI applications — argument parsing, options, commands, dependency injection. |

### Testing & migration (2)

| Skill | Description |
|---|---|
| `testing` | `@effect/vitest` and `it.effect(...)` — services, layers, time-dependent effects, error handling, property-based testing. |
| `incremental-migration` | Migrating async/Promise-based modules to Effect services while preserving backward compatibility. |

### React (3)

| Skill | Description |
|---|---|
| `atom-state` | Reactive state management with Effect Atom for React applications. |
| `react-composition` | Composable React components using Effect Atom; avoiding boolean props; integrating with Effect's reactive state. |
| `react-vm` | The VM (View Model) pattern for reactive, testable frontend state management. |

### Cross-cutting (1)

| Skill | Description |
|---|---|
| `first-laws` | The full Effect-first development specification (EF-1 … EF-40+) — tagged errors, Option, Schema, canonical imports, Match, services and layers, Clock, observability, Duration, JSON via Schema, scoped resources, retries, timeouts, structured concurrency, Config, Redacted, defects vs. failures, layer memoization, schema-first domain modeling, branded guards, equivalence, native sort, dual APIs. |

---

## Pattern catalog

46 patterns run after every successful Edit/Write/MultiEdit on files matching
the pattern's frontmatter `glob`. Most target TypeScript/TSX. Detectors are
declared per pattern as either ast-grep rules or comment-skipping regex.

### `avoid-*` (21)

| Pattern | Level | Description |
|---|---|---|
| `avoid-any` | warning | `as any` and `as unknown` type assertions. |
| `avoid-data-tagged-error` | warning | `Data.TaggedError` — use `Schema.TaggedErrorClass`. |
| `avoid-direct-json` | info | `JSON.parse` / `JSON.stringify` — use `Schema.fromJsonString`. |
| `avoid-direct-tag-checks` | warning | Direct `_tag` property checks; use exported refinements. |
| `avoid-expect-in-if` | warning | `expect()` calls nested inside `if` blocks in tests. |
| `avoid-fs-promises` | warning | `fs/promises` direct usage — wrap with Effect. |
| `avoid-mutable-state` | info | `let` bindings inside Effect services; prefer `Ref`. |
| `avoid-native-fetch` | warning | Native `fetch` — use Effect HTTP modules. |
| `avoid-node-imports` | warning | `node:` imports — use `@effect/platform` abstractions. |
| `avoid-non-null-assertion` | warning | `!` non-null assertion operator. |
| `avoid-object-type` | warning | `Object` and `{}` as types. |
| `avoid-option-getorthrow` | warning | `Option.getOrThrow` — use `Option.match` or `Option.getOrElse`. |
| `avoid-platform-coupling` | warning | Binding packages importing platform-specific packages. |
| `avoid-process-env` | warning | `process.env` — use `Config.*`. |
| `avoid-react-hooks` | high | `useState`/`useEffect`/`useReducer` — use VMs with Effect Atom. |
| `avoid-schema-suffix` | info | Schema constants suffixed with `Schema`. |
| `avoid-sync-fs` | high | Synchronous filesystem operations. |
| `avoid-try-catch` | warning | `try`/`catch` in Effect code — use `Effect.try` or typed errors. |
| `avoid-ts-ignore` | warning | `@ts-ignore` and `@ts-expect-error`. |
| `avoid-untagged-errors` | warning | `instanceof Error` and `new Error` for recoverable failures. |
| `avoid-yield-ref` | warning | Direct `yield* Ref/Deferred/Fiber/Latch` (removed in v4). |

### `prefer-*` (7)

| Pattern | Level | Description |
|---|---|---|
| `prefer-arr-sort` | warning | `Arr.sort` with explicit `Order` over native `Array.prototype.sort`. |
| `prefer-duration-values` | warning | `Duration` helpers over numeric literals for time. |
| `prefer-effect-fn` | warning | `Effect.fn` for service methods over plain `Effect.gen` wrappers. |
| `prefer-match-over-switch` | warning | `Match` over native `switch`. |
| `prefer-option-over-null` | info | `Option` over `T \| null` unions. |
| `prefer-redacted-config` | warning | `Config.redacted` / `Schema.Redacted` for secrets. |
| `prefer-schema-class` | warning | `Schema.Class` over `Schema.Struct` for object/domain schemas. |

### `use-*` (7)

| Pattern | Level | Description |
|---|---|---|
| `use-clock-service` | warning | `Clock` / `DateTime` over `new Date()` and `Date.now()`. |
| `use-console-service` | warning | `Console` / `Effect.log*` over `console.*`. |
| `use-context-service` | warning | `Context.Service` over legacy `ServiceMap.Service` APIs. |
| `use-filesystem-service` | high | `FileSystem` service over direct `node:fs` imports. |
| `use-path-service` | warning | `Path` service over direct `node:path` imports. |
| `use-random-service` | warning | `Random` service over `Math.random()`. |
| `use-temp-file-scoped` | warning | `makeTempFileScoped` / `makeTempDirectoryScoped` over `os.tmpdir()`. |

### Other (11)

| Pattern | Level | Description |
|---|---|---|
| `casting-awareness` | info | Type assertions in general — use type-safe alternatives. |
| `context-tag-extends` | warning | `class *Tag extends Context.Tag` naming — use `Context.Service`. |
| `effect-catchall-default` | warning | Broad `Effect.catch` defaults in domain logic — use `catchTag`. |
| `effect-promise-vs-trypromise` | warning | `Effect.promise` over `Effect.tryPromise`. |
| `effect-run-in-body` | warning | `Effect.runSync` / `runPromise` outside entry points. |
| `imperative-loops` | warning | `for` / `for...of` over functional transformations. |
| `require-effect-concurrency` | warning | `Effect.forEach` / `all` / `validate` without explicit concurrency. |
| `stream-large-files` | info | Whole-file reads when the path looks large or unbounded. |
| `throw-in-effect-gen` | **critical** | `throw` inside `Effect.gen` — use `yield* Effect.fail()`. |
| `vm-in-wrong-file` | **critical** | View Model definitions outside `.vm.ts` files. |
| `yield-in-for-loop` | warning | `yield*` in `for` loops — use `Effect.forEach` / `STM.forEach`. |

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

### Effect version detection

`src/reference/version.ts` reads `node_modules/effect/package.json` first
and falls back to `pinnedEffectVersion` from `.claude-plugin/plugin.json`.
The detected version is used by the drift comparison; the reference clone
itself always reflects the plugin pin.

### Reference clone location

Single location, plugin-owned: `<plugin-root>/cache/effect-v4/`. Created
on first `SessionStart` by the hook, refreshed when the plugin pin changes,
removed cleanly when the plugin is uninstalled. The marker file
`<plugin-root>/cache/effect-v4/.effective-version` records the
`effect@<version>` git tag.

Skill bodies reference the cache via fixed relative paths from skill
location (e.g. `../../cache/effect-v4/LLMS.md`); the path is stable across
plugin installs because skills always sit at `<plugin>/skills/<name>/SKILL.md`.

### What this plugin never does

- Modifies application source files directly. It may create/update
  `<plugin-root>/cache/effect-v4/` for the reference clone.
- Blocks tool calls. The PostToolUse hook only feeds context back to Claude.
- Calls the network outside the `git clone` of the reference repo.
- Mutates your shell RC, `~/.local/bin/`, or any path outside Claude
  Code's plugin install directory.

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
