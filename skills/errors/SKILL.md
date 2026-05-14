---
name: errors
description: Design and handle errors in Effect v4. Covers typed errors via `Schema.TaggedErrorClass`, recovery (`catchTag` / `catchTags`), the expected-failure vs. defect distinction, and v3→v4 rename gotchas.
when_to_use: Invoke when designing how a feature fails — choosing between typed errors and defects, defining error types, declaring service error contracts, or migrating v3 catch combinators.
---

# Errors

Effect treats errors as data in a typed channel. The signature
`Effect.Effect<A, E, R>` carries success type `A`, typed error `E`,
and required services `R`. Errors aren't exceptions to catch; they're
values to return, recover from, or propagate.

## Two channels, one rule

| Goes in `E` (typed) | Goes to the defect channel |
|---|---|
| Caller can recover meaningfully (`UserNotFound`, `ValidationFailed`, `OutOfStock`) | Caller cannot recover (invariant violation, unreachable branch, adapter-internal bug) |
| Defined as `Schema.TaggedErrorClass` | Surfaced via `Effect.die` / `Effect.orDie` |
| Recovered with `catchTag` / `catchTags` | Logged at runtime boundary, not caught |

Rule of thumb: if you could write a meaningful `catchTag` for it
*somewhere*, it belongs in `E`. If the only honest handler is "log and
crash," it's a defect.

(Interruption is the third reason in a `Cause`; the runtime handles it.)

## Canonical shape

```ts
import { Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

import { User } from "@/schemas/User";
import { DatabaseClient } from "@/services/DatabaseClient";

// 1. Define the typed error
class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  "UserNotFound",
  { userId: Schema.String, message: Schema.String }
) {}

// 2. Fail into the typed channel
const findUser = Effect.fn("findUser")(function* (id: string) {
  const db = yield* DatabaseClient.Service;
  const rows = yield* db.query("SELECT * FROM users WHERE id = ?", id);
  return yield* Option.match(Arr.head(rows), {
    onNone: () =>
      Effect.fail(new UserNotFound({ userId: id, message: `User ${id} not found` })),
    onSome: (row) => Schema.decodeUnknownEffect(User)(row).pipe(Effect.orDie)
  });
});
// findUser : (id: string) => Effect<User, UserNotFound, DatabaseClient.Service>

// 3. Recover or convert at the boundary
const lookupHandler = (id: string) =>
  findUser(id).pipe(
    Effect.catchTag("UserNotFound", () => Effect.succeed(notFoundResponse))
  );
// lookupHandler : (id: string) => Effect<Response, never, DatabaseClient.Service>
```

Three pieces, one flow: the type, the failure, the catch. The remaining
sections zoom in on each piece and discuss variations.

## Anatomy of the error type

```ts
class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  "UserNotFound",
  { userId: Schema.String, message: Schema.String }
) {}
```

Conventions:

- Always include `message: Schema.String` for human-readable context.
- Name with `*Error`, never `*Exception` (v3 holdover that's been swept across Effect itself).
- The string passed to `TaggedErrorClass(...)` is the runtime `_tag`; keep it identical to the class name.
- Define service-scoped errors next to the service. Cross-module errors live in a shared module.
- Don't suffix class names with `Schema`.

## Failing in an Effect

Inside `Effect.gen`, `yield* new MyError({ ... })` is the canonical fail
(shorthand for `yield* Effect.fail(new MyError({ ... }))`).

In the canonical example above, two distinct failures happen via
different mechanisms:

- The `UserNotFound` failure goes into the typed channel — caller can recover.
- The `Schema.decodeUnknownEffect(...)` returns an Effect that *can* fail (with `Schema.SchemaError`), but we `.pipe(Effect.orDie)` to push it to the defect channel — malformed DB data is an invariant violation, not something the caller can act on.

**Never `throw` inside `Effect.gen`** — the runtime won't see it; it
becomes an uncaught defect anyway, but with no tag and worse
diagnostics. The PostToolUse hook flags this as `throw-in-effect-gen`
(critical). The fix is always `yield* Effect.fail(...)`.

For wrapping a throwable JS or Promise-returning function at a
boundary, use `Effect.try` (sync) or `Effect.tryPromise` (async):

```ts
const parseConfig = Effect.try({
  try: () => JSON.parse(raw),
  catch: (e) => new ConfigParseError({ message: String(e) })
});
```

The hook also flags `try { } catch` inside Effect code
(`avoid-try-catch`) and `instanceof Error` checks on recoverable
failures (`avoid-untagged-errors`).

## Catching errors

`Effect.catchTag(tagString, handler)` is the primary recovery
combinator. It removes the handled tag from `E` and produces a new
Effect — as in the canonical example, the boundary catches
`"UserNotFound"` and the resulting handler's `E` is `never`.

Extensions on the example:

- **Multiple tags, separate handlers**: `Effect.catchTags({ UserNotFound: ..., DatabaseError: ... })`.
- **Multiple tags, one handler**: `Effect.catchTag(["NetworkError", "TimeoutError"], () => ...)` (v4 array form).
- **Optional `orElse`** on both `catchTag` and `catchTags` for tags not in the handled set.

**Avoid `Effect.catch` in domain code.** It collapses every failure
into one handler, throwing away the distinctions the type system was
tracking. The pattern catalog flags it as `effect-catchall-default`.
Legitimate use is at the runtime boundary as a final catch.

For nested reason discrimination (`catchReason` / `catchReasons`) and
the recovery API surface in full, see `references/error-handling.md`.

## Promoting to a defect

The canonical example shows one promotion already: the decode failure
is converted via `.pipe(Effect.orDie)`. The same lifting works for any
expected error you'd rather treat as an invariant:

- **`Effect.orDie`** — promote any expected error in `E` to a defect.
- **`Effect.die("...")`** or **`Effect.die(new Error("..."))`** — surface an invariant violation directly.

`new Error(...)` is acceptable *inside* `Effect.die`, never as the
public error model for recoverable behavior.

## Service contracts (narrow E)

`findUser` in the canonical example exposes only `UserNotFound` in `E`,
not the `Schema.SchemaError` from decoding or any error the underlying
`DatabaseClient` might raise. That's intentional: the public service
contract should list only failures the caller can meaningfully act on.

When a dependency's failure isn't actionable at this layer, either:

- Wrap it in a service-level error (`new RepositoryError({ cause: depErr.message })`), or
- Promote it to a defect with `Effect.orDie` (as the example does for decode).

For the service shape itself (Layer, namespace, `Effect.fn`), see
`/effective:services`.

## v3 → v4 renames (most common gotchas)

| v3 (DO NOT USE) | v4 |
|---|---|
| `Effect.catchAll` | `Effect.catch` |
| `Effect.catchAllCause` | `Effect.catchCause` |
| `Effect.catchAllDefect` | `Effect.catchDefect` |
| `Effect.catchSome` | `Effect.catchFilter` |
| `Cause.failureOption` | `Cause.findErrorOption` |
| `Cause.dieOption` | `Cause.findDefect` |
| `Cause.NoSuchElementException` | `Cause.NoSuchElementError` |
| `Cause.TimeoutException` | `Cause.TimeoutError` |
| `Cause.IllegalArgumentException` | `Cause.IllegalArgumentError` |
| `Data.TaggedError` | `Schema.TaggedErrorClass` |
| `ParseError` | `Schema.SchemaError` |
| `Either` (module) | `Result` |

Full rename tables (every Cause method that changed signature, parser/codec renames) in `references/error-handling.md` and `references/schema-v4.md`.

## Common mistakes

- `throw new Error(...)` inside `Effect.gen` → `yield* Effect.fail(...)`. (`throw-in-effect-gen`, critical.)
- `try { } catch { }` in Effect code → `Effect.try` / `Effect.tryPromise`. (`avoid-try-catch`.)
- `instanceof Error` for recoverable failures → `Schema.TaggedErrorClass`. (`avoid-untagged-errors`.)
- `Effect.catchAll` / `Effect.catch` as default → `Effect.catchTag` for specific recovery. (`effect-catchall-default`.)
- `Data.TaggedError` → `Schema.TaggedErrorClass`. (`avoid-data-tagged-error`.)
- Manual `if (e._tag === "X")` → `Match.tag(...)`. (`avoid-direct-tag-checks`.)
- `Option.getOrThrow` on a recoverable absence → `Option.match` / `Option.getOrElse`. (`avoid-option-getorthrow`.)

## Deeper references

| For | Read |
|---|---|
| Full v3→v4 error API rename tables, decision tree across `Schema.TaggedErrorClass` / `Schema.ErrorClass` / `Data.TaggedError`, `catchReason` / `catchReasons`, `ErrorReporter` setup | `references/error-handling.md` |
| `Cause` structure, `cause.reasons`, reason discrimination (`isFailReason` / `isDieReason` / `isInterruptReason`) | `references/error-handling.md` § "Cause Structure" |
| Retry combinators, `Schedule`, `Effect.timeout` variants | `references/error-handling.md` § "Retry" and § "Timeout" |
| Pattern-matching on tagged errors (`Match.tag`, exhaustive) | `references/pattern-matching.md` |
| Service shape (`Effect.fn`, Layer, namespace pattern) | invoke `/effective:services` or `references/service-implementation.md` |
| HTTP boundary error → status code mapping | invoke `/effective:http` or `references/http-api.md` |
| Workflow / saga compensation on failure | `references/workflow.md` |
| Cross-cutting laws on errors-as-data (EF-1), recovery precision (EF-30), expected vs. defects (EF-31) | `references/first-laws.md` |
