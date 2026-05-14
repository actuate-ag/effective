---
name: services
description: Design and wire Effect services and Layers. Covers the `Context.Service` namespace pattern, `Layer` composition (`merge` vs. `provide`), `Effect.fn` for method tracing, `defaultLayer` dependency wiring, and capability-vs-monolith granularity.
when_to_use: Invoke when writing or modifying a service, splitting an oversized service, adding a dependency, composing Layers for an entry point, or deciding what belongs on a service interface versus as a free function.
---

# Services

A service in this codebase is a named capability — an `Interface` of
methods returning `Effect`, identified by a `Context.Service` tag, and
constructed by a `Layer`. Business logic depends on the tag; the
runtime wires the implementation. The service graph is visible in the
type signatures.

## Canonical shape

```ts
import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

import { User, type CreateUserData } from "@/schemas/User";
import { DatabaseClient } from "@/services/DatabaseClient";

class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  "UserNotFound",
  { userId: Schema.String, message: Schema.String }
) {}

export namespace UserRepository {
  export interface Interface {
    readonly findById: (id: string) => Effect.Effect<User, UserNotFound>;
    readonly create: (data: CreateUserData) => Effect.Effect<User>;
  }

  export class Service extends Context.Service<Service, Interface>()(
    "@app/UserRepository"
  ) {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const db = yield* DatabaseClient.Service;

      const findById = Effect.fn("UserRepository.findById")(function* (id: string) {
        const rows = yield* db.query("SELECT * FROM users WHERE id = ?", id); // ReadonlyArray<unknown>
        return yield* Option.match(Arr.head(rows), {
          onNone: () =>
            Effect.fail(new UserNotFound({ userId: id, message: `User ${id} not found` })),
          onSome: (row) => Schema.decodeUnknownEffect(User)(row).pipe(Effect.orDie)
        });
      });

      const create = Effect.fn("UserRepository.create")(function* (data: CreateUserData) {
        const inserted = yield* db.insertOne("users", data);
        return yield* Schema.decodeUnknownEffect(User)(inserted).pipe(Effect.orDie);
      });

      return Service.of({ findById, create });
    })
  );

  export const defaultLayer = layer.pipe(
    Layer.provide(DatabaseClient.defaultLayer)
  );
}
```

`db.query` returns raw `ReadonlyArray<unknown>`; `Schema.decodeUnknownEffect(User)` is the bridge from runtime data to the typed `User`. Decode failures `.pipe(Effect.orDie)` since malformed DB data is an invariant violation, not something a caller can recover from — keeps the interface signature narrow.

Key invariants:

- **Namespace contains `Interface` + `Service` class + `layer` + `defaultLayer`.** The class body is always empty; construction lives in `Layer.effect`.
- **`Service` class is the tag.** Use `Context.Service` (not v3's `Context.Tag`, `Effect.Service`, or `class FooTag extends Context.Tag` — the pattern catalog flags those via `context-tag-extends` / `use-context-service`).
- **Tag string is namespaced** (`"@app/UserRepository"`) to avoid collisions across packages.
- **Method names use `Effect.fn(name)`** so spans carry the service.method name in traces. The pattern catalog flags raw `Effect.gen` for service methods via `prefer-effect-fn`.
- **`layer` exports just the construction.** `defaultLayer` wires in the canonical dependency choices for production. Tests substitute different layers without touching `layer`.

## Consuming a service

```ts
const program = Effect.gen(function* () {
  const repo = yield* UserRepository.Service;
  const user = yield* repo.findById("u123");
  return user.name;
});
// Effect.Effect<string, UserNotFound, UserRepository.Service>
```

The service appears in the `R` channel of every effect that uses it.
At the runtime boundary, you provide `defaultLayer` (or a substitute)
to discharge the requirement.

## Composing Layers

Two combinators do almost all the work:

- **`Layer.merge(A, B)`** — parallel. Produces both `A` and `B`. Used when two independent services are needed together. Requirements are the union.
- **`Layer.provide(outer, inner)`** — sequential. The `inner` layer satisfies `outer`'s requirement, hiding it. The result exposes only `outer`'s output, with `inner`'s requirements bubbling up if any remain.

```ts
// FullApp produces UserRepository, requires nothing else.
const FullApp = UserRepository.layer.pipe(
  Layer.provide(Layer.merge(DatabaseClient.defaultLayer, Logger.defaultLayer))
);
```

For the full Layer surface (`Layer.scoped`, `Layer.succeed`,
`Layer.fresh`, `Layer.provideMerge`, multiple-implementation patterns),
see `references/layer-design.md`.

## Granularity: capability over monolith

Prefer many small services over one large one. A `UserService` with 20
methods covering CRUD + auth + notifications + audit log is hard to
test, hard to swap, and creates a wide reason to invalidate
memoization. Split by capability: `UserRepository`, `Authenticator`,
`Notifier`, `AuditLog`. Each is independently substitutable in tests.

Heuristics for splitting:

- A method that calls into a different external system → probably a different service.
- A method that's only used by tests / debug tooling → probably not on the service interface at all; make it a free function or a debug-only service.
- A method that takes a different `Context` shape than the rest of the methods → different service.

For deeper guidance on capability boundaries and the "no requirement
leakage" rule, see `references/service-implementation.md` and
`references/context-witness.md`.

## Errors and service contracts

A service method's error type is part of its public contract; keep the
union narrow and explicit. Don't list every dependency's failure —
wrap dependency errors in a service-level error or convert them to
defects (`Effect.orDie`). Don't expose `Cause<E>` in signatures.

For the full discussion (`TaggedErrorClass` definition, recovery
combinators, expected-vs-defect distinction), invoke `/effective:errors`
or see `references/error-handling.md`.

## Observability is free with `Effect.fn`

`Effect.fn("UserRepository.findById")(function*(...))` names the span
automatically. No extra `Effect.withSpan` calls needed for the method
itself; the runtime gives you the span. Add inner spans with
`Effect.withSpan` for sub-steps inside a method.

For full tracing setup (logger, OTLP, span annotations,
`Effect.annotateLogs`), see `references/observability.md`. For
"canonical log line" / wide-event instrumentation strategy see
`references/wide-events.md`.

## Bridging into non-Effect frameworks

When the host process isn't Effect (HTTP frameworks like Hono/Express,
serverless handlers, workers), use `ManagedRuntime`:

```ts
import { ManagedRuntime } from "effect";

const runtime = ManagedRuntime.make(FullApp);

// e.g. in a Hono handler:
app.get("/users/:id", async (c) => {
  const result = await runtime.runPromise(
    UserRepository.Service.pipe(
      Effect.flatMap((repo) => repo.findById(c.req.param("id")))
    )
  );
  return c.json(result);
});
```

For `ManagedRuntime` lifecycle, error mapping at the boundary, and
adapter patterns for Hono / Express / Fastify / Lambda / Workers, see
`references/managed-runtime.md`.

## v3 → v4 holdovers to watch for

| v3 | v4 |
|---|---|
| `class FooTag extends Context.Tag<...>` | `class Service extends Context.Service<...>` |
| `Context.GenericTag(...)` | `class Service extends Context.Service<...>` |
| `Effect.Service<...>` | `Context.Service<...>` |
| `ServiceMap.Service` | `Context.Service` |
| Plain `Effect.gen` for service methods | `Effect.fn("ServiceName.method")(function*())` |

## Common mistakes

- Naming the class `FooTag` and extending `Context.Tag` → use `Context.Service` (`context-tag-extends`).
- Using `Effect.gen` directly for service methods → use `Effect.fn(name)` so spans carry the method name (`prefer-effect-fn`).
- Listing dependency errors in the public service signature → wrap or `orDie`. (See `/effective:errors` for the wrapping pattern.)
- One service with too many methods → split by capability (`service-implementation` reference, "Anti-Pattern: Monolithic Services").
- Importing platform-specific modules (`node:fs`, `node:path`) in service code → use `FileSystem` / `Path` services so the binding stays cross-platform (`avoid-node-imports`, `avoid-platform-coupling`).
- Bare `Effect.runSync` / `Effect.runPromise` inside a service method → execution belongs at the runtime boundary, not in business logic (`effect-run-in-body`).

## Deeper references

| For | Read |
|---|---|
| Capability vs. monolith heuristics, "Promote Effectful Helpers", coordinator services, optional capabilities, interface-only services, testing benefits | `references/service-implementation.md` |
| Full `Layer` surface (`Layer.scoped`, `Layer.succeed`, `Layer.fresh`, multiple-implementation patterns, layer error handling, `provideMerge` for test stacks) | `references/layer-design.md` |
| When to use `Context.Service` witness vs. capability-style injection, coupling trade-offs | `references/context-witness.md` |
| `ManagedRuntime` lifecycle and framework adapters | `references/managed-runtime.md` |
| Platform layer wiring (`@effect/platform-node` vs `@effect/platform-bun` boundaries) | `references/platform-layers.md` |
| Tracing, structured logging, OTLP / Prometheus export | `references/observability.md` |
| Service error contract conventions (rich treatment) | invoke `/effective:errors` or `references/error-handling.md` |
| Cross-cutting laws (EF-8 services + Layer, EF-32 layer memoization, EF-14 `Effect.fn`, EF-21 runtime at boundary) | `references/first-laws.md` |
