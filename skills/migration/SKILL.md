---
name: migration
description: Migrate existing code into Effect v4. Covers two cases — converting Promise / async modules into Effect services with backward-compatible facades, and updating Effect v3 code to v4 idioms (renames, API changes). Step-by-step template plus the renames cheat sheet.
when_to_use: Invoke when porting an existing Promise-based module to an Effect service, replacing async facades with `yield* Service.Service`, maintaining dual sync/Effect APIs during a rollout, or chasing down v3 Effect names that no longer exist in v4.
---

# Migration

Two migration tasks share this skill:

1. **Promise → Effect** — wrapping an existing async module in an
   Effect service, preserving the original API for non-Effect callers
   while letting Effect callers use the service directly.
2. **Effect v3 → Effect v4** — replacing v3 names and idioms with
   their v4 equivalents.

The shared ethos: migrate incrementally, keep the codebase compiling
at every step, let the type system enforce progress.

## Canonical shape (Promise → Effect)

Start: a Promise-based module that other code imports.

```ts
// users.ts  (before)
import { db } from "./db";

export async function findUser(id: string): Promise<User | null> {
  const rows = await db.query("SELECT * FROM users WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function createUser(data: CreateUserData): Promise<User> {
  const [row] = await db.query("INSERT INTO users ... RETURNING *", [data]);
  return row;
}
```

Step 1: extract an Effect service interface alongside the existing
Promise API. Use `Schema.Class` for any domain types you're typing for
the first time.

```ts
// users.ts  (after)
import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

import { User, UserNotFound, type CreateUserData } from "@/schemas/User";
import { DatabaseClient } from "@/services/DatabaseClient";

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
        const rows = yield* db.query("SELECT * FROM users WHERE id = ?", id);
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

  export const defaultLayer = layer.pipe(Layer.provide(DatabaseClient.defaultLayer));
}

// Backward-compatible facades: existing Promise callers keep working.
const runtime = ManagedRuntime.make(UserRepository.defaultLayer);

export async function findUser(id: string): Promise<User | null> {
  return runtime.runPromise(
    UserRepository.Service.pipe(
      Effect.flatMap((repo) =>
        repo.findById(id).pipe(
          Effect.map(Option.some),
          Effect.catchTag("UserNotFound", () => Effect.succeed(Option.none<User>()))
        )
      ),
      Effect.map(Option.getOrNull)
    )
  );
}

export async function createUser(data: CreateUserData): Promise<User> {
  return runtime.runPromise(
    UserRepository.Service.pipe(Effect.flatMap((repo) => repo.create(data)))
  );
}
```

Effect callers can now `yield* UserRepository.Service` and use the
typed API; Promise callers keep working unchanged through the facades.

## Migration steps in order

1. **Extract the service interface.** Define `Interface` with the
   same method names and shapes, swapping `Promise<T>` for
   `Effect.Effect<T, E>` and `T | null` for `Effect<T, NotFound>` or
   `Option<T>`. This is a pure type-level edit — no behavior changes.
2. **Define the typed errors.** Failures the original code threw or
   returned `null` for become `Schema.TaggedErrorClass`. See
   `/effective:errors` for the channel-shape rules.
3. **Implement the Layer.** Build the real implementation in
   `Layer.effect`, consuming dependencies via `yield*`. Methods use
   `Effect.fn(name)` for tracing.
4. **Add backward-compatible facades.** For each remaining
   Promise-caller, wrap the service method in a `runtime.runPromise(...)`
   that translates the Effect API back to the original Promise shape
   (often `T | null` from `Effect<T, NotFound>`).
5. **Migrate callers, one at a time.** Effect callers switch from
   `await findUser(id)` to `yield* repo.findById(id)`. The
   call site's type changes from `User | null` to `Effect<User, UserNotFound>`,
   which propagates to the caller's signature — the type system makes
   the transitive migration visible.
6. **Delete facades when the last Promise caller is gone.** At that
   point, `users.ts` exports only the namespace.
7. **Compose layers at the entry point.** Wire `UserRepository.defaultLayer`
   into the application layer, replacing the per-call `ManagedRuntime`
   used by the facades.

The migration is incremental: at any step, the codebase compiles and
runs. Effect callers and Promise callers coexist for as long as needed.

For the full template with worked before/after, see
`references/incremental-migration.md`.

## v3 → v4 renames (the cheat sheet)

The other migration: an existing Effect codebase moving from v3 to v4.
Most renames are mechanical find-and-replace; some have shape changes.

**Top renames Claude should never emit:**

| v3 (DO NOT USE) | v4 |
|---|---|
| `Effect.catchAll` | `Effect.catch` |
| `Effect.catchAllCause` | `Effect.catchCause` |
| `Effect.catchSome` | `Effect.catchFilter` |
| `Schema.parseJson(S)` | `Schema.fromJsonString(S)` |
| `Schema.compose(b)` | `Schema.decodeTo(b, transformation)` |
| `Schema.annotations(...)` | `Schema.annotate(...)` |
| `Data.TaggedError` / `Schema.TaggedError` (class form) | `Schema.TaggedErrorClass` |
| `Either` (module) | `Result` |
| `Schema.DateFromSelf` / `BigIntFromSelf` / `OptionFromSelf` / etc. | drop the `FromSelf` suffix |
| `Schema.minLength(n)` / `Schema.greaterThan(n)` filters | `Schema.isMinLength(n)` / `Schema.isGreaterThan(n)` checks |
| `decodeUnknown` | `decodeUnknownEffect` |
| `Schema.Literal('a', 'b')` (variadic) | `Schema.Literals(['a', 'b'])` |
| `Schema.Union(A, B)` (variadic) | `Schema.Union([A, B])` |
| `Cause.NoSuchElementException` | `Cause.NoSuchElementError` |
| `Cause.failureOption` | `Cause.findErrorOption` |
| `class FooTag extends Context.Tag` | `class Service extends Context.Service` |
| `Effect.Service<...>` | `Context.Service<...>` |

**Shape changes (not just renames):**

- **Filters → checks.** v3: `Schema.String.pipe(Schema.minLength(5))`. v4: `Schema.String.check(Schema.isMinLength(5))`. The `.pipe()` chain becomes `.check()`.
- **Variadic → array.** `Schema.Union(A, B)` → `Schema.Union([A, B])`. `Schema.Literal('a', 'b')` → `Schema.Literals(['a', 'b'])`.
- **`compose` → `decodeTo`.** `Schema.X.pipe(Schema.compose(Y))` → `Schema.X.pipe(Schema.decodeTo(Y, transformation))`. Now requires an explicit `SchemaTransformation` argument.
- **Cause flattened.** v3: recursive tree. v4: `cause.reasons` is a flat array of `Reason<E>`.
- **`Context.Tag` / `Effect.Service` → `Context.Service`.** Class declaration syntax changes too — see `/effective:services`.

For the **full** v3→v4 surface (every `*FromSelf` removal, every filter
rename, every parser/codec, structural operations via `mapFields`,
Schema.Data removal, optional-key changes), see
`references/schema-v4.md` and `references/error-handling.md` § "v3 to
v4 Error API Changes".

## Common mistakes

- Migrating a caller before the service exists → results in a partial Effect, half-decoded errors. Always finish steps 1–3 before changing any caller.
- Deleting the Promise facades early → breaks remaining Promise callers. Wait until the last one is gone.
- One giant migration commit → migrate per-module, one caller at a time. Each step is independently mergeable.
- Wrapping a sync function in `Effect.tryPromise` → use `Effect.try` for sync, `Effect.tryPromise` for Promise-returning. (`effect-promise-vs-trypromise`.)
- Keeping `null` in domain code post-migration → convert to `Option` at the seam. (`prefer-option-over-null`.)
- Keeping `JSON.parse` / `JSON.stringify` post-migration → use Schema codecs. (`avoid-direct-json`.)
- Hand-rolling a `_tag` check on the migrated tagged error → use `Match.tag` / `Effect.catchTag`. (`avoid-direct-tag-checks`.)

## Deeper references

| For | Read |
|---|---|
| Full Promise → Effect migration template (7 steps with worked before/after, checklist) | `references/incremental-migration.md` |
| Full v3 → v4 Schema rename surface (`*FromSelf` removal, every filter, every parser/codec, `mapFields`, optional-key changes, Schema.Data removal, quick decision guide) | `references/schema-v4.md` |
| Full v3 → v4 error API surface (Cause rename map, every catch-combinator rename, ErrorReporter, decision tree) | `references/error-handling.md` § "v3 to v4 Error API Changes" |
| The service shape that migrations target | invoke `/effective:services` |
| Schema definitions for domain types you're newly typing | invoke `/effective:schema` |
| Error model for typed migration of `null`-returning or throwing code | invoke `/effective:errors` |
| `ManagedRuntime` for the Promise-facade lifecycle | `references/managed-runtime.md` |
| Cross-cutting laws on boundary discipline (EF-1, EF-2, EF-3, EF-21, EF-22) | `references/first-laws.md` |
