# claude-code-effect

A Claude Code plugin that helps Claude write correct, clean, and idiomatic
[Effect v4](https://effect.website) TypeScript.

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

- **35 `effect-*` skills** covering schema, layers, services, errors, config,
  observability, streaming, persistence, networking, CLI, testing, React,
  and migration. Discoverable via Claude Code's progressive-disclosure skill
  mechanism — Claude invokes the relevant skill on demand based on the task.
- **A `SessionStart` hook** that maintains a shallow clone of
  [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol) at the tag
  matching your project's installed `effect` version, under
  `.references/effect-v4/`. Claude reads it instead of guessing v4 APIs.
- **A `PostToolUse` hook** that runs 46 ast-grep / regex pattern detectors
  against every successful Edit/Write/MultiEdit and surfaces matches back to
  Claude in-band — severity-sorted, deduped, with a hint to invoke the
  suggested skill.
- **A short CLAUDE.md fragment** to drop into a project so Claude knows to
  invoke `effect-*` skills before writing Effect code.
- **An `/effect-status` slash command** that reports the local reference-clone
  state and which catalogs are wired up.

## How it works

```
SessionStart
  └─► hooks/ensure-reference-clone.ts
        ├─ detect node_modules/effect/package.json version
        ├─ shallow-clone Effect-TS/effect-smol at effect@<version>
        └─ atomic rename into .references/effect-v4/, idempotent via marker

PostToolUse (Edit | Write | MultiEdit | NotebookEdit)
  └─► hooks/pattern-feedback.ts
        ├─ load 46 patterns from patterns/*.md
        ├─ filter by tool regex + glob + ignoreGlob
        ├─ run ast-grep (in-process, @ast-grep/napi) or comment-stripped regex
        ├─ severity-sort + dedupe
        └─ emit hookSpecificOutput.additionalContext to Claude

Skill autoload (built into Claude Code)
  └─► description-matched skills under skills/effect-*
```

The hooks always exit 0 — failures go to stderr only and never block a
session. The reference clone is fail-silent; the pattern hook degrades to
"no matches" if the catalog can't load.

## Install

One script, two modes:

```bash
./scripts/install-user.sh                     # user-level (default)
./scripts/install-user.sh --project           # project-level (current dir)
./scripts/install-user.sh --project /some/dir # project-level (explicit dir)
./scripts/install-user.sh [--project [DIR]] --uninstall
```

### User mode (default)

For developers who write Effect across multiple repos.

| Target | Action |
|---|---|
| `~/.claude/skills/effect-*` | symlink the 35 skills |
| `~/.claude/CLAUDE.md` | append the Effect fragment (idempotent, marker-guarded) |
| `~/.claude/settings.json` | merge `SessionStart` + `PostToolUse` hook entries (preserves existing settings) |
| `~/.references/effect-v4/` | shallow-clone Effect-TS/effect-smol once at the default version |
| `~/.zshrc` or `~/.bashrc` | append `export CLAUDE_CODE_EFFECT_REFERENCE_DIR=~/.references/effect-v4` |

Open a new shell after install. The SessionStart hook in any project will
symlink `<project>/.references/effect-v4` → `~/.references/effect-v4`.

**Cost note**: the `PostToolUse` hook fires on every Edit/Write in every
project — including non-Effect ones. In a non-Effect repo it adds ~50–100ms
per edit (bun startup + a no-match pattern run). For Effect-heavy workflows
this is the right tradeoff; if you only write Effect in one or two repos,
use `--project` instead.

### Project mode (`--project [DIR]`)

For scoping everything to a single repo.

| Target | Action |
|---|---|
| `<DIR>/.claude/skills/effect-*` | symlink the 35 skills |
| `<DIR>/CLAUDE.md` | append the Effect fragment (idempotent, marker-guarded) |
| `<DIR>/.claude/settings.json` | merge `SessionStart` + `PostToolUse` hook entries |
| `<DIR>/.gitignore` | append `.references/` if missing |
| `<DIR>/.references/effect-v4/` | clone lazily on first SessionStart (per-project, not shared) |

### Uninstall

```bash
./scripts/install-user.sh --uninstall                  # reverse user-mode install
./scripts/install-user.sh --project /some/dir --uninstall  # reverse project-mode install
```

Removes our skill symlinks, strips the CLAUDE.md fragment between markers,
strips our hook entries from `settings.json`, and (user mode) removes the
shell rc export. The reference clone is preserved as data — `rm -rf` it
manually if no longer wanted.

### As a Claude Code plugin (alternative)

```bash
claude plugin install <path-or-url>/claude-code-effect
```

The plugin's `hooks/hooks.json` wires both hooks; `skills/` is auto-discovered.
You can still run `./scripts/install-user.sh` afterwards just to set up the
shared reference clone + shell rc env var.

---

## Skill catalog

35 skills, ported from `pi-effect-harness` with description fields tuned for
Claude Code autoload triggering.

### Schema & domain modeling (8)

| Skill | Description |
|---|---|
| `effect-schema-v4` | Authoritative reference for Effect Schema v4 API changes and v3 → v4 migration. Find-and-replace tables, breaking changes, idiom shifts. |
| `effect-schema-composition` | `Schema.decodeTo`, transformations, filters, multi-stage validation. |
| `effect-domain-modeling` | Production-ready domain models with `Schema.TaggedStruct` — ADTs, predicates, orders, guards, match functions. |
| `effect-domain-predicates` | Predicates and orders for domain types using typeclass patterns. |
| `effect-typeclass-design` | Curried signatures and dual data-first / data-last APIs. |
| `effect-pattern-matching` | `Data.TaggedEnum`, `$match`, `$is`, `Match.typeTags`, `Effect.match`. Avoid manual `_tag` checks. |
| `effect-context-witness` | When to use `Context.Service` witness vs. capability patterns; coupling trade-offs. |
| `effect-optics` | `Iso`, `Lens`, `Prism`, `Optional`, `Traversal` — composable, type-safe access and immutable updates to nested data. |

### Layers, services, runtime (5)

| Skill | Description |
|---|---|
| `effect-layer-design` | Designing and composing layers for clean dependency management. |
| `effect-service-implementation` | Fine-grained service capabilities; avoiding monolithic designs. |
| `effect-managed-runtime` | Bridging Effect into non-Effect frameworks (Hono, Express, Fastify, Lambda, Workers) via `ManagedRuntime`. |
| `effect-platform-abstraction` | Cross-platform file I/O, process spawning, HTTP clients, terminal — the abstraction itself. |
| `effect-platform-layers` | Structuring platform-layer provision for cross-platform applications. |

### Errors, config, observability (4)

| Skill | Description |
|---|---|
| `effect-error-handling` | `Schema.TaggedErrorClass`, `catchTag`/`catchTags`, `catchReason`/`catchReasons`, `Cause`, `ErrorReporter`, recovery patterns. |
| `effect-config` | `Config` and `ConfigProvider` — env vars, structured config, test config, `.env`, JSON, custom sources. |
| `effect-observability` | Structured logging, distributed tracing, metrics; OTLP/Prometheus export. |
| `effect-wide-events` | Wide events (canonical log lines) for observability. Conceptual guide for instrumentation strategy. |

### Data, IO, concurrency (7)

| Skill | Description |
|---|---|
| `effect-stream` | Pull-based streaming pipelines — creation, transformation, consumption, encoding (NDJSON/Msgpack), concurrency, resource safety. |
| `effect-batching` | `Request`, `RequestResolver`, `SqlResolver` — N+1 elimination, batched data-fetching layers, request caching. |
| `effect-pubsub-event-bus` | Typed event buses with `PubSub` and `Stream`. |
| `effect-filesystem` | Cross-platform file I/O across Node.js, Bun, browser. |
| `effect-path` | Cross-platform path operations — joining, resolving, URL conversion. |
| `effect-command-executor` | `ChildProcess` — shell commands, captured output, piping, streaming, scoped lifecycle. |
| `effect-concurrency-testing` | Testing `PubSub`, `Deferred`, `Latch`, `Fiber`, `SubscriptionRef`, `Stream`. |

### Persistence & networking (4)

| Skill | Description |
|---|---|
| `effect-sql` | `SqlClient`, `SqlSchema`, `SqlModel` (CRUD repos), `SqlResolver`, `Migrator`. |
| `effect-http-api` | `HttpApi`, `HttpApiClient`, `HttpApiBuilder` — typed endpoints, security middleware, OpenAPI, derived clients. |
| `effect-rpc-cluster` | RPC endpoints, cluster routing, workflow patterns with Effect RPC and Cluster. |
| `effect-workflow` | Durable workflows with `Workflow`, `Activity`, `DurableClock`, `DurableDeferred` — execution that survives restarts, compensation (saga), distribution via Cluster. |

### CLI (1)

| Skill | Description |
|---|---|
| `effect-cli` | Type-safe CLI applications — argument parsing, options, commands, dependency injection. |

### Testing & migration (2)

| Skill | Description |
|---|---|
| `effect-testing` | `@effect/vitest` and `it.effect(...)` — services, layers, time-dependent effects, error handling, property-based testing. |
| `effect-incremental-migration` | Migrating async/Promise-based modules to Effect services while preserving backward compatibility. |

### React (3)

| Skill | Description |
|---|---|
| `effect-atom-state` | Reactive state management with Effect Atom for React applications. |
| `effect-react-composition` | Composable React components using Effect Atom; avoiding boolean props; integrating with Effect's reactive state. |
| `effect-react-vm` | The VM (View Model) pattern for reactive, testable frontend state management. |

### Cross-cutting (1)

| Skill | Description |
|---|---|
| `effect-first-laws` | The full Effect-first development specification (EF-1 … EF-40+) — tagged errors, Option, Schema, canonical imports, Match, services and layers, Clock, observability, Duration, JSON via Schema, scoped resources, retries, timeouts, structured concurrency, Config, Redacted, defects vs. failures, layer memoization, schema-first domain modeling, branded guards, equivalence, native sort, dual APIs. |

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

### Effect version detection

`hooks/lib/effect-version.ts` reads `node_modules/effect/package.json` and
falls back to `4.0.0-beta.59`. The detected version is used as the
`effect@<version>` git tag for the reference clone.

### Reference clone location

Two modes, selected by the `CLAUDE_CODE_EFFECT_REFERENCE_DIR` env var:

| Mode | Env var | Clone path | Per-project path |
|---|---|---|---|
| **Shared** (default after `install-user.sh` user mode) | set | `$CLAUDE_CODE_EFFECT_REFERENCE_DIR` (default `~/.references/effect-v4`) | symlink → shared |
| **Per-project** | unset | n/a | `<cwd>/.references/effect-v4/` |

The marker file is `<clone>/.claude-code-effect-version` and contains the
`effect@<version>` git tag.

**Why shared mode is the default for user-mode installs.** A typical Effect
v4 reference clone is ~50–80 MB. Carrying one per project across 5–10 repos
adds up. Shared mode clones once and symlinks every project's
`.references/effect-v4` at it, so skill bodies and the CLAUDE.md fragment
keep referencing `.references/effect-v4/...` transparently.

**Version-mismatch policy in shared mode.** If a project pins a *different*
`effect` version than the canonical clone, the hook **does not** re-clone
(that would hose every other project pointing at it). It writes a one-line
warning to stderr and continues using the existing clone. Either align
versions across your projects, or unset `CLAUDE_CODE_EFFECT_REFERENCE_DIR`
in that one shell to fall back to per-project mode.

**Existing per-project directory blocks the symlink.** If a project already
has a real `<project>/.references/effect-v4` directory (e.g. from prior
per-project use), the hook refuses to clobber it. Remove it first:
`rm -rf <project>/.references/effect-v4` and re-run the SessionStart hook.

### Patterns directory override

The pattern hook resolves its catalog in this order:

1. `$CLAUDE_CODE_EFFECT_PATTERNS_DIR` (if set and exists)
2. `${CLAUDE_PLUGIN_ROOT}/patterns` (when running as a plugin)
3. `<hook-dir>/../patterns` (sibling of `hooks/`)

### What this plugin never does

- Modifies application source files directly. It may create/update
  `.references/` for the reference clone.
- Blocks tool calls. The PostToolUse hook only feeds context back to Claude.
- Calls the network outside the `git clone` of the reference repo.

---

## Development

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
