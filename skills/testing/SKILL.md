---
name: testing
description: Test Effect code with `@effect/vitest`. Covers `it.effect` / `it.live` variants, providing test layers via `Effect.provide` and `Layer.mock`, asserting on success and failure paths, sharing layers across tests with the `layer` helper, and time-dependent testing with `TestClock`.
when_to_use: Invoke when writing a test for a service / Effect / Layer composition, substituting a dependency with a fake or stub, asserting on a typed error, or testing time-sensitive code without sleeping.
---

# Testing

Tests for Effect code use `@effect/vitest`, which extends vitest with
Effect-aware test runners (`it.effect`, `it.live`, `it.scoped`),
`Layer`-based service substitution, and a `TestContext` carrying
deterministic alternatives to `Clock`, `Random`, and other ambient
services. Pure functions still use plain `vitest`.

## Canonical shape

```ts
import { it, expect, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { DatabaseClient } from "@/services/DatabaseClient";
import { UserRepository } from "@/services/UserRepository";
import { UserNotFound } from "@/schemas/User";

// 1. Substitute DatabaseClient with a controllable fake
const DatabaseClientTest = Layer.mock(DatabaseClient.Service)({
  query: (sql, ...params) => {
    if (sql.includes("WHERE id = ?") && params[0] === "u-known") {
      return Effect.succeed([{ id: "u-known", name: "Alice", email: "alice@example.com" }]);
    }
    return Effect.succeed([]);
  },
  insertOne: () => Effect.succeed({ id: "u-known", name: "Alice", email: "alice@example.com" })
});

// 2. Share the layer across the file's tests
layer(UserRepository.layer.pipe(Layer.provide(DatabaseClientTest)))("UserRepository", (it) => {
  it.effect("returns the user when present", () =>
    Effect.gen(function* () {
      const repo = yield* UserRepository.Service;
      const user = yield* repo.findById("u-known");
      expect(user.name).toBe("Alice");
    })
  );

  it.effect("fails with UserNotFound when absent", () =>
    Effect.gen(function* () {
      const repo = yield* UserRepository.Service;
      const result = yield* Effect.flip(repo.findById("u-missing"));
      expect(result).toBeInstanceOf(UserNotFound);
      expect(result.userId).toBe("u-missing");
    })
  );
});
```

Three pieces: substitute the dependency, run real code under the test
layer, assert on both the success and failure paths. The sections
below extend this.

## Picking a runner

| Runner | Provides | Use for |
|---|---|---|
| `it.live` | Real `Clock`, real `Random`, real I/O | **Default for most tests.** Anything touching real services, DBs, HTTP, filesystem. |
| `it.effect` | `TestContext` — `TestClock`, deterministic `Random`, no real time | Time-dependent logic where you advance time manually. |
| `it.scoped` | Scoped resource lifecycle | Tests that acquire resources requiring cleanup (open files, sockets, etc.). |
| Plain `it` (vitest) | Nothing Effect-related | Pure functions, brand constructors, simple data transforms. |

`TestClock` intercepts time-dependent operations and causes hangs in
real-I/O code, so `it.live` should be the default unless you're
actually simulating time.

## Substituting services

The canonical example uses `Layer.mock` (v4 shorthand). Two forms,
pick whichever reads more clearly:

```ts
// Explicit
const TestDb = Layer.succeed(DatabaseClient.Service, DatabaseClient.Service.of({
  query: () => Effect.succeed([]),
  insertOne: () => Effect.succeed({ /* ... */ })
}));

// Shorthand
const TestDb = Layer.mock(DatabaseClient.Service)({
  query: () => Effect.succeed([]),
  insertOne: () => Effect.succeed({ /* ... */ })
});
```

For sharing a substituted layer across many tests, the `layer(L)("name", (it) => ...)`
helper from `@effect/vitest` provides `it` inside the block — every
test in the block automatically gets the layer.

For one-off substitution, `.pipe(Effect.provide(TestLayer))` inside a
single `it.effect` works fine.

## Asserting on failure

The canonical example uses `Effect.flip` to invert the error and
success channels — `Effect<A, E>` becomes `Effect<E, A>` — so the test
can assert on `E` like a normal value:

```ts
const result = yield* Effect.flip(repo.findById("missing"));
expect(result).toBeInstanceOf(UserNotFound);
```

Alternatives:

- `Effect.exit(eff)` returns `Effect<Exit<A, E>>` — useful when both success and failure paths are expected and the test discriminates on `Exit.isFailure`.
- `it.effect("...", () => Effect.flip(eff).pipe(...))` — when the entire test is asserting on the failure.

Pattern-catalog rule: `avoid-untagged-errors` (don't `instanceof Error`
on recoverable failures). For test assertions on Effect's *own* tagged
errors (TaggedErrorClass, `Cause.NoSuchElementError`),
`instanceof TaggedClass` is the typed and supported form.

## Time-dependent testing

Switch to `it.effect` (which provides `TestContext`) and drive time
explicitly:

```ts
import { TestClock, Effect, Duration } from "effect";

it.effect("retries with backoff", () =>
  Effect.gen(function* () {
    const fiber = yield* operation.pipe(Effect.retry({ schedule: ... }), Effect.fork);
    yield* TestClock.adjust(Duration.seconds(5));
    const exit = yield* Fiber.await(fiber);
    expect(Exit.isSuccess(exit)).toBe(true);
  })
);
```

`TestClock.adjust` advances virtual time without sleeping; `Effect.fork`
runs the operation in a fiber so the test can both advance time and
inspect outcomes. See `references/testing.md` § "Time-Dependent Testing
with TestClock".

## Concurrency tests

Tests involving `PubSub`, `Deferred`, `Latch`, `Fiber`, `SubscriptionRef`,
or `Stream` need careful coordination. The shape is: fork producers
and consumers, use `Latch` or `Deferred` to coordinate, advance with
`TestClock` if time matters, then assert on the resulting state.

See `references/concurrency-testing.md` for full patterns covering
each primitive.

## Property-based testing

`@effect/vitest` integrates with `fast-check` via `it.prop`:

```ts
import { it } from "@effect/vitest";
import * as fc from "fast-check";

it.prop("encode then decode is identity", [User.arbitrary], (user) =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeEffect(User)(user);
    const round = yield* Schema.decodeUnknownEffect(User)(encoded);
    expect(round).toEqual(user);
  })
);
```

See `references/testing.md` § "Property-Based Testing".

## Common mistakes

- `it.effect` for tests that touch real I/O → use `it.live`. `TestClock` will hang real timers.
- `await` inside the test body alongside Effect code → stay inside `Effect.gen`; let `it.effect` / `it.live` run it.
- `try { ... } catch (e) { expect(...) }` to assert failures → use `Effect.flip` or `Effect.exit`. (`avoid-try-catch`.)
- `setTimeout` / `sleep` to wait for async work → use `TestClock.adjust` (in `it.effect`) or coordinate via `Latch`/`Deferred` (in `it.live`).
- `expect(...).toThrow()` for an Effect failure → Effect doesn't throw; flip / exit and assert on the value.
- `expect(...)` calls nested inside `if` blocks (failures hide) → assert outside the conditional, or use exhaustive matchers. (`avoid-expect-in-if`.)

## Deeper references

| For | Read |
|---|---|
| Full `@effect/vitest` surface (test variants, `it.scoped`, `it.prop`, the `layer` helper, assertion helpers, HTTP mock server, lifecycle harness tests) | `references/testing.md` |
| Concurrency primitive tests (`PubSub`, `Deferred`, `Latch`, `Fiber`, `SubscriptionRef`, `Stream`) | `references/concurrency-testing.md` |
| Service shape under test (Layer, namespace pattern) | invoke `/effective:services` |
| Schema definitions for test fixtures and arbitraries | invoke `/effective:schema` |
| Asserting on typed error tags | invoke `/effective:errors` |
| Cross-cutting laws on effect-native testing (EF-10) | `references/first-laws.md` |
