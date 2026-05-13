# effective

A Claude Code plugin that helps Claude write correct, clean, and
idiomatic [Effect v4](https://effect.website) TypeScript.

Adapted from [`pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness)
for the Claude Code surface (skills, hooks, slash commands).

## Table of contents

- [Install](#install)
- [What it ships](#what-it-ships)
- [Skill catalog](#skill-catalog) (35)
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

---

## Skill catalog

35 skills, ported from `pi-effect-harness` with description fields tuned for
Claude Code autoload triggering.

### Schema & domain modeling (8)

| Skill | Description |
|---|---|
| [`schema-v4`](skills/schema-v4/SKILL.md) | Authoritative reference for Effect Schema v4 API changes and v3 → v4 migration. Find-and-replace tables, breaking changes, idiom shifts. |
| [`schema-composition`](skills/schema-composition/SKILL.md) | `Schema.decodeTo`, transformations, filters, multi-stage validation. |
| [`domain-modeling`](skills/domain-modeling/SKILL.md) | Production-ready domain models with `Schema.TaggedStruct` — ADTs, predicates, orders, guards, match functions. |
| [`domain-predicates`](skills/domain-predicates/SKILL.md) | Predicates and orders for domain types using typeclass patterns. |
| [`typeclass-design`](skills/typeclass-design/SKILL.md) | Curried signatures and dual data-first / data-last APIs. |
| [`pattern-matching`](skills/pattern-matching/SKILL.md) | `Data.TaggedEnum`, `$match`, `$is`, `Match.typeTags`, `Effect.match`. Avoid manual `_tag` checks. |
| [`context-witness`](skills/context-witness/SKILL.md) | When to use `Context.Service` witness vs. capability patterns; coupling trade-offs. |
| [`optics`](skills/optics/SKILL.md) | `Iso`, `Lens`, `Prism`, `Optional`, `Traversal` — composable, type-safe access and immutable updates to nested data. |

### Layers, services, runtime (5)

| Skill | Description |
|---|---|
| [`layer-design`](skills/layer-design/SKILL.md) | Designing and composing layers for clean dependency management. |
| [`service-implementation`](skills/service-implementation/SKILL.md) | Fine-grained service capabilities; avoiding monolithic designs. |
| [`managed-runtime`](skills/managed-runtime/SKILL.md) | Bridging Effect into non-Effect frameworks (Hono, Express, Fastify, Lambda, Workers) via `ManagedRuntime`. |
| [`platform-abstraction`](skills/platform-abstraction/SKILL.md) | Cross-platform file I/O, process spawning, HTTP clients, terminal — the abstraction itself. |
| [`platform-layers`](skills/platform-layers/SKILL.md) | Structuring platform-layer provision for cross-platform applications. |

### Errors, config, observability (4)

| Skill | Description |
|---|---|
| [`error-handling`](skills/error-handling/SKILL.md) | `Schema.TaggedErrorClass`, `catchTag`/`catchTags`, `catchReason`/`catchReasons`, `Cause`, `ErrorReporter`, recovery patterns. |
| [`config`](skills/config/SKILL.md) | `Config` and `ConfigProvider` — env vars, structured config, test config, `.env`, JSON, custom sources. |
| [`observability`](skills/observability/SKILL.md) | Structured logging, distributed tracing, metrics; OTLP/Prometheus export. |
| [`wide-events`](skills/wide-events/SKILL.md) | Wide events (canonical log lines) for observability. Conceptual guide for instrumentation strategy. |

### Data, IO, concurrency (7)

| Skill | Description |
|---|---|
| [`stream`](skills/stream/SKILL.md) | Pull-based streaming pipelines — creation, transformation, consumption, encoding (NDJSON/Msgpack), concurrency, resource safety. |
| [`batching`](skills/batching/SKILL.md) | `Request`, `RequestResolver`, `SqlResolver` — N+1 elimination, batched data-fetching layers, request caching. |
| [`pubsub-event-bus`](skills/pubsub-event-bus/SKILL.md) | Typed event buses with `PubSub` and `Stream`. |
| [`filesystem`](skills/filesystem/SKILL.md) | Cross-platform file I/O across Node.js, Bun, browser. |
| [`path`](skills/path/SKILL.md) | Cross-platform path operations — joining, resolving, URL conversion. |
| [`command-executor`](skills/command-executor/SKILL.md) | `ChildProcess` — shell commands, captured output, piping, streaming, scoped lifecycle. |
| [`concurrency-testing`](skills/concurrency-testing/SKILL.md) | Testing `PubSub`, `Deferred`, `Latch`, `Fiber`, `SubscriptionRef`, `Stream`. |

### Persistence & networking (4)

| Skill | Description |
|---|---|
| [`sql`](skills/sql/SKILL.md) | `SqlClient`, `SqlSchema`, `SqlModel` (CRUD repos), `SqlResolver`, `Migrator`. |
| [`http-api`](skills/http-api/SKILL.md) | `HttpApi`, `HttpApiClient`, `HttpApiBuilder` — typed endpoints, security middleware, OpenAPI, derived clients. |
| [`rpc-cluster`](skills/rpc-cluster/SKILL.md) | RPC endpoints, cluster routing, workflow patterns with Effect RPC and Cluster. |
| [`workflow`](skills/workflow/SKILL.md) | Durable workflows with `Workflow`, `Activity`, `DurableClock`, `DurableDeferred` — execution that survives restarts, compensation (saga), distribution via Cluster. |

### CLI (1)

| Skill | Description |
|---|---|
| [`cli`](skills/cli/SKILL.md) | Type-safe CLI applications — argument parsing, options, commands, dependency injection. |

### Testing & migration (2)

| Skill | Description |
|---|---|
| [`testing`](skills/testing/SKILL.md) | `@effect/vitest` and `it.effect(...)` — services, layers, time-dependent effects, error handling, property-based testing. |
| [`incremental-migration`](skills/incremental-migration/SKILL.md) | Migrating async/Promise-based modules to Effect services while preserving backward compatibility. |

### React (3)

| Skill | Description |
|---|---|
| [`atom-state`](skills/atom-state/SKILL.md) | Reactive state management with Effect Atom for React applications. |
| [`react-composition`](skills/react-composition/SKILL.md) | Composable React components using Effect Atom; avoiding boolean props; integrating with Effect's reactive state. |
| [`react-vm`](skills/react-vm/SKILL.md) | The VM (View Model) pattern for reactive, testable frontend state management. |

### Cross-cutting (1)

| Skill | Description |
|---|---|
| [`first-laws`](skills/first-laws/SKILL.md) | The full Effect-first development specification (EF-1 … EF-40+) — tagged errors, Option, Schema, canonical imports, Match, services and layers, Clock, observability, Duration, JSON via Schema, scoped resources, retries, timeouts, structured concurrency, Config, Redacted, defects vs. failures, layer memoization, schema-first domain modeling, branded guards, equivalence, native sort, dual APIs. |

---

## Pattern catalog

46 patterns run after every successful Edit/Write/MultiEdit on files matching
the pattern's frontmatter `glob`. Most target TypeScript/TSX. Detectors are
declared per pattern as either ast-grep rules or comment-skipping regex.

### `avoid-*` (21)

| Pattern | Level | Description |
|---|---|---|
| [`avoid-any`](patterns/avoid-any.md) | warning | `as any` and `as unknown` type assertions. |
| [`avoid-data-tagged-error`](patterns/avoid-data-tagged-error.md) | warning | `Data.TaggedError` — use `Schema.TaggedErrorClass`. |
| [`avoid-direct-json`](patterns/avoid-direct-json.md) | info | `JSON.parse` / `JSON.stringify` — use `Schema.fromJsonString`. |
| [`avoid-direct-tag-checks`](patterns/avoid-direct-tag-checks.md) | warning | Direct `_tag` property checks; use exported refinements. |
| [`avoid-expect-in-if`](patterns/avoid-expect-in-if.md) | warning | `expect()` calls nested inside `if` blocks in tests. |
| [`avoid-fs-promises`](patterns/avoid-fs-promises.md) | warning | `fs/promises` direct usage — wrap with Effect. |
| [`avoid-mutable-state`](patterns/avoid-mutable-state.md) | info | `let` bindings inside Effect services; prefer `Ref`. |
| [`avoid-native-fetch`](patterns/avoid-native-fetch.md) | warning | Native `fetch` — use Effect HTTP modules. |
| [`avoid-node-imports`](patterns/avoid-node-imports.md) | warning | `node:` imports — use `@effect/platform` abstractions. |
| [`avoid-non-null-assertion`](patterns/avoid-non-null-assertion.md) | warning | `!` non-null assertion operator. |
| [`avoid-object-type`](patterns/avoid-object-type.md) | warning | `Object` and `{}` as types. |
| [`avoid-option-getorthrow`](patterns/avoid-option-getorthrow.md) | warning | `Option.getOrThrow` — use `Option.match` or `Option.getOrElse`. |
| [`avoid-platform-coupling`](patterns/avoid-platform-coupling.md) | warning | Binding packages importing platform-specific packages. |
| [`avoid-process-env`](patterns/avoid-process-env.md) | warning | `process.env` — use `Config.*`. |
| [`avoid-react-hooks`](patterns/avoid-react-hooks.md) | high | `useState`/`useEffect`/`useReducer` — use VMs with Effect Atom. |
| [`avoid-schema-suffix`](patterns/avoid-schema-suffix.md) | info | Schema constants suffixed with `Schema`. |
| [`avoid-sync-fs`](patterns/avoid-sync-fs.md) | high | Synchronous filesystem operations. |
| [`avoid-try-catch`](patterns/avoid-try-catch.md) | warning | `try`/`catch` in Effect code — use `Effect.try` or typed errors. |
| [`avoid-ts-ignore`](patterns/avoid-ts-ignore.md) | warning | `@ts-ignore` and `@ts-expect-error`. |
| [`avoid-untagged-errors`](patterns/avoid-untagged-errors.md) | warning | `instanceof Error` and `new Error` for recoverable failures. |
| [`avoid-yield-ref`](patterns/avoid-yield-ref.md) | warning | Direct `yield* Ref/Deferred/Fiber/Latch` (removed in v4). |

### `prefer-*` (7)

| Pattern | Level | Description |
|---|---|---|
| [`prefer-arr-sort`](patterns/prefer-arr-sort.md) | warning | `Arr.sort` with explicit `Order` over native `Array.prototype.sort`. |
| [`prefer-duration-values`](patterns/prefer-duration-values.md) | warning | `Duration` helpers over numeric literals for time. |
| [`prefer-effect-fn`](patterns/prefer-effect-fn.md) | warning | `Effect.fn` for service methods over plain `Effect.gen` wrappers. |
| [`prefer-match-over-switch`](patterns/prefer-match-over-switch.md) | warning | `Match` over native `switch`. |
| [`prefer-option-over-null`](patterns/prefer-option-over-null.md) | info | `Option` over `T \| null` unions. |
| [`prefer-redacted-config`](patterns/prefer-redacted-config.md) | warning | `Config.redacted` / `Schema.Redacted` for secrets. |
| [`prefer-schema-class`](patterns/prefer-schema-class.md) | warning | `Schema.Class` over `Schema.Struct` for object/domain schemas. |

### `use-*` (7)

| Pattern | Level | Description |
|---|---|---|
| [`use-clock-service`](patterns/use-clock-service.md) | warning | `Clock` / `DateTime` over `new Date()` and `Date.now()`. |
| [`use-console-service`](patterns/use-console-service.md) | warning | `Console` / `Effect.log*` over `console.*`. |
| [`use-context-service`](patterns/use-context-service.md) | warning | `Context.Service` over legacy `ServiceMap.Service` APIs. |
| [`use-filesystem-service`](patterns/use-filesystem-service.md) | high | `FileSystem` service over direct `node:fs` imports. |
| [`use-path-service`](patterns/use-path-service.md) | warning | `Path` service over direct `node:path` imports. |
| [`use-random-service`](patterns/use-random-service.md) | warning | `Random` service over `Math.random()`. |
| [`use-temp-file-scoped`](patterns/use-temp-file-scoped.md) | warning | `makeTempFileScoped` / `makeTempDirectoryScoped` over `os.tmpdir()`. |

### Other (11)

| Pattern | Level | Description |
|---|---|---|
| [`casting-awareness`](patterns/casting-awareness.md) | info | Type assertions in general — use type-safe alternatives. |
| [`context-tag-extends`](patterns/context-tag-extends.md) | warning | `class *Tag extends Context.Tag` naming — use `Context.Service`. |
| [`effect-catchall-default`](patterns/effect-catchall-default.md) | warning | Broad `Effect.catch` defaults in domain logic — use `catchTag`. |
| [`effect-promise-vs-trypromise`](patterns/effect-promise-vs-trypromise.md) | warning | `Effect.promise` over `Effect.tryPromise`. |
| [`effect-run-in-body`](patterns/effect-run-in-body.md) | warning | `Effect.runSync` / `runPromise` outside entry points. |
| [`imperative-loops`](patterns/imperative-loops.md) | warning | `for` / `for...of` over functional transformations. |
| [`require-effect-concurrency`](patterns/require-effect-concurrency.md) | warning | `Effect.forEach` / `all` / `validate` without explicit concurrency. |
| [`stream-large-files`](patterns/stream-large-files.md) | info | Whole-file reads when the path looks large or unbounded. |
| [`throw-in-effect-gen`](patterns/throw-in-effect-gen.md) | **critical** | `throw` inside `Effect.gen` — use `yield* Effect.fail()`. |
| [`vm-in-wrong-file`](patterns/vm-in-wrong-file.md) | **critical** | View Model definitions outside `.vm.ts` files. |
| [`yield-in-for-loop`](patterns/yield-in-for-loop.md) | warning | `yield*` in `for` loops — use `Effect.forEach` / `STM.forEach`. |

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
