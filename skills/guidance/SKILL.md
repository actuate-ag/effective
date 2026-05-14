---
name: guidance
description: Always-on navigator for Effect v4 TypeScript codebases. Lays out the pre-write protocol, the topic-skill index, the canonical operating model, and the highest-payoff v3→v4 rename gotchas. The first thing to read when you start working in this codebase.
when_to_use: Always loaded whenever working in a project that depends on the `effect` package. Don't invoke directly; the SessionStart autoload primes it.
---

# Guidance for Effect v4 codebases

Every task in this codebase is implicitly an Effect v4 task. The user
won't say "using Effect" — that's assumed by codebase convention. Your
job before writing code is to translate the user's intent into the
relevant Effect topic, consult that topic's skill, *then* write.

## Pre-write protocol

1. **Identify the task area** from the user's request.
2. **Look it up** in the table below.
3. **Invoke `/effective:<topic>`** for the matching topic skill. The
   topic skill is the curated synthesis for that task; it cites
   deeper `references/*.md` for edge cases.
4. **Write the code**, applying the rules and example shapes from the
   topic skill.

This is not optional. Effect v4 differs from v3 substantially.
Writing from training-data memory produces v3 idioms that the
PostToolUse hook will flag in-band — read first, save the rework
cycle.

## Task → topic skill

| Task | Invoke |
|---|---|
| Writing or modifying a service (Layer, Context.Service, dependency wiring) | `/effective:services` |
| Designing a schema, decoding runtime input, encoding output | `/effective:schema` |
| Designing error types, recovering from failures, channel shape (E vs. defect) | `/effective:errors` |
| Building an HTTP endpoint, server, or typed client | `/effective:http` |
| Writing a database query, repository, or migration | `/effective:sql` |
| Building a React component / VM / atom wiring | `/effective:react` |
| Writing tests for Effect code | `/effective:testing` |
| Porting Promise / v3 code into v4 Effect | `/effective:migration` |

If the task spans multiple topics ("build a feature that exposes an
HTTP endpoint backed by a service that reads from SQL"), invoke the
topic skills in order of structural dependency: schema → errors →
sql → services → http. Each topic's skill cites the others it
intersects with.

## Operating model (always true)

Effect-first code lives in three layers:

1. **Boundary** — where unknown data enters or typed data exits. Decode
   with `Schema.decodeUnknownEffect`; convert nullish to `Option` with
   `Option.fromNullishOr`; lift throwable APIs into the typed error
   channel with `Effect.try` / `Effect.tryPromise`.
2. **Domain** — typed Effect code. Pure logic using `Arr`, `Option`,
   `Schema`, `Match`, services. No `throw`, no `null`, no `JSON.parse`,
   no `try/catch`.
3. **Runtime** — composition and execution. Layers wire dependencies;
   `Effect.runPromise` / `runMain` only at the process entry point, never
   inside business logic.

## Foundations to internalize

These apply to every Effect file regardless of topic. The PostToolUse
hook enforces them; consulting topic skills explains them.

- **Errors are data.** If logic can fail in a recoverable way, return
  `Effect.Effect<A, E, R>` with a tagged error `E`. Define error types
  with `Schema.TaggedErrorClass`. Never `throw` inside `Effect.gen`.
  Never `try/catch` in Effect code (use `Effect.try` at the boundary).
- **Absence is `Option`.** No `| null` or `| undefined` in domain code.
  Convert at the boundary via `Option.fromNullishOr`. Consume with
  `Option.match` / `Option.getOrElse`. Never `Option.getOrThrow`.
- **Unknown input is decoded.** Never `JSON.parse` / `JSON.stringify`.
  Use `Schema.fromJsonString(S)` or `Schema.decodeUnknownEffect(S)` /
  `Schema.encodeEffect(S)`.
- **Services use `Context.Service` + `Layer`.** Declare services with
  the namespace pattern (Interface + Service class + layer +
  defaultLayer). Service methods use `Effect.fn(name)` for tracing.
- **Runtime at the boundary only.** `Effect.runSync` / `Effect.runPromise`
  / `Effect.runMain` live at process entry points (HTTP handler,
  Lambda handler, CLI main), never inside business logic.

## Top v3 → v4 renames

These come up constantly. The full per-topic surface lives in the
topic skills and references.

| v3 (DO NOT EMIT) | v4 |
|---|---|
| `Effect.catchAll` | `Effect.catch` |
| `Effect.catchAllCause` | `Effect.catchCause` |
| `Schema.parseJson(S)` | `Schema.fromJsonString(S)` |
| `Schema.compose(b)` | `Schema.decodeTo(b, transformation)` |
| `Schema.annotations(...)` | `Schema.annotate(...)` |
| `Data.TaggedError` | `Schema.TaggedErrorClass` |
| `Either` (module) | `Result` |
| `Schema.DateFromSelf` / `BigIntFromSelf` / `OptionFromSelf` / etc. | drop the `FromSelf` suffix |
| `Schema.minLength(n)` (filter) | `Schema.isMinLength(n)` (check, chained with `.check()`) |
| `decodeUnknown` (returns Either) | `decodeUnknownEffect` |
| `Schema.Union(A, B)` (variadic) | `Schema.Union([A, B])` (array) |
| `class FooTag extends Context.Tag` | `class Service extends Context.Service` |
| `Effect.Service<...>` | `Context.Service<...>` |
| `Cause.NoSuchElementException` | `Cause.NoSuchElementError` |

When in doubt, consult `/effective:schema` (for Schema renames),
`/effective:errors` (for error and Cause renames), `/effective:services`
(for service tag renames), or `/effective:migration` (for a
consolidated cheat sheet).

## PostToolUse pattern feedback

After every successful Edit / Write / MultiEdit on a `.ts` / `.tsx`
file, the plugin runs ~46 detector patterns and emits matches in-band
as additional context. Each match cites the specific
`references/*.md` that addresses the rule. Treat each as a review
note: revise the code, or — if you believe it's a false positive —
briefly say so and continue.

The hook only emits context; it never blocks. But repeated
post-write corrections are a signal you should have invoked the
relevant topic skill first.

## Local Effect v4 source

The plugin maintains a shallow clone of `Effect-TS/effect-smol` at the
pinned version in `../../cache/effect-v4/` (relative to this skill's
directory). Read it directly when a topic skill or reference points
you to a specific source file. Key entry points:

- `../../cache/effect-v4/LLMS.md` — Effect v4 overview for LLMs
- `../../cache/effect-v4/MIGRATION.md` — official v3 → v4 migration guide
- `../../cache/effect-v4/packages/effect/SCHEMA.md` — Schema reference
- `../../cache/effect-v4/packages/effect/HTTPAPI.md` — HttpApi reference
- `../../cache/effect-v4/packages/effect/src/` — module source for any API

## Version pin and drift

The plugin pins a specific Effect beta (`pinnedEffectVersion` in
`.claude-plugin/plugin.json`). The reference clone always reflects the
pin. If the project's installed `effect` version differs, the
SessionStart hook prints a drift warning. The slash command
`/effective:project-version --align` brings the project to the pin;
`/effective:plugin-version` manages the pin itself.
