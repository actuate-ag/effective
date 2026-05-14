---
name: schema
description: Design and use Effect Schema v4 for typed domain data. Covers `Schema.Class` declarations, branded primitives, field checks, decode / encode at boundaries, transformations via `decodeTo`, tagged unions, and the substantial v3→v4 API surface.
when_to_use: Invoke when defining a domain type or input/output shape, decoding unknown input at a boundary, encoding for transport, composing schemas with transformations, or migrating v3 Schema code.
---

# Schema

`Schema` is how this codebase represents data whose shape is known at
the type level but whose values arrive at runtime — HTTP bodies, DB
rows, env vars, message payloads. A schema is both a type (for the
compiler) and a parser (for runtime decoding). Prefer `Schema.Class`
for any named shape; reach for `Schema.Struct` only for anonymous
intermediate shapes.

## Canonical shape

```ts
import { Schema } from "effect";
import * as Brand from "effect/Brand";

// 1. Named domain class with branded id, validated email, non-empty name
export class User extends Schema.Class<User>("User")({
  id: Schema.String.pipe(Schema.brand("UserId")),
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.check(Schema.isMinLength(1)),
  createdAt: Schema.Date
}) {}
// User has both a type (the decoded class) and a Codec (the parser/encoder)

// 2. Decode raw runtime input — fails with Schema.SchemaError
const decodeUser = Schema.decodeUnknownEffect(User);
// decodeUser : (raw: unknown) => Effect<User, Schema.SchemaError>

// 3. Encode to a JSON-safe shape at egress boundaries
const encodeUser = Schema.encodeEffect(User);
// encodeUser : (u: User) => Effect<{ id: string; email: string; name: string; createdAt: string }, Schema.SchemaError>

// 4. Input type — typically a subset
export class CreateUserData extends Schema.Class<CreateUserData>("CreateUserData")({
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.check(Schema.isMinLength(1))
}) {}
```

Four pieces: the class declaration, decode, encode, and a companion
input shape. Everything else in this skill explores variations of
these.

## Field types and checks

The canonical example uses three field-level conventions:

- **Primitives**: `Schema.String`, `Schema.Number`, `Schema.Boolean`, `Schema.Date`, `Schema.BigInt`. Drop the `*FromSelf` suffix — that was a v3 thing; the bare names are the in-memory representation in v4.
- **Brands**: `Schema.String.pipe(Schema.brand("UserId"))` produces a nominal subtype so a raw string can't be passed where a `UserId` is expected. Pair with `Brand` module for guards.
- **Checks**: `Schema.X.check(Schema.isMinLength(n))`, `Schema.isPattern(re)`, `Schema.isInt()`, etc. Checks replace v3 filters; they're prefixed with `is*` and chained via `.check()` instead of `.pipe(Schema.filter(...))`.

`Schema.makeFilter(predicate, { title })` is the v4 way to build a
custom predicate-based check. Composable: `Schema.isInt().pipe(Schema.isGreaterThan(0))`.

## Decoding at a boundary

Decode whenever runtime data crosses into the typed domain. The
canonical example shows `Schema.decodeUnknownEffect` returning an
`Effect<User, Schema.SchemaError>` — the typed channel carries the
parse failure, the caller decides what to do.

Decode variants:

- `Schema.decodeUnknownEffect(S)(raw)` — `unknown` in, `Effect<A, SchemaError>`. The default at any external boundary.
- `Schema.decodeEffect(S)(input)` — typed `I` in (no `unknown`), `Effect<A, SchemaError>`. Use when you already know the input shape matches the encoded form.
- `Schema.decodeUnknownSync(S)(raw)` — throws on failure. Acceptable only at process-init seams where there is no Effect runtime yet.
- `Schema.decodeUnknownExit(S)(raw)` — returns `Exit`; rarely used.

For service code that's already wrapped in `Effect.gen`, the
canonical decode is `yield* Schema.decodeUnknownEffect(User)(row)`
(as in the `services` canonical example). If decode failures aren't
caller-actionable, `.pipe(Effect.orDie)` promotes them to defects;
see `/effective:errors` for the channel-shaping rationale.

**Never `JSON.parse`** — use `Schema.UnknownFromJsonString` (no-arg)
or `Schema.fromJsonString(S)` (with-schema) for parsing JSON in one
typed step. The pattern catalog flags raw `JSON.parse` via
`avoid-direct-json`.

## Encoding at a boundary

`Schema.encodeEffect(User)(user)` converts the runtime class back to
its JSON-shaped representation — useful for HTTP responses, message
payloads, persistence layers. The output type follows the schema's
declared encodings (e.g. `Schema.Date` → ISO string, `Schema.BigInt` →
string).

`Schema.encodeUnknown*` is rarely needed in domain code — you usually
have the typed `A` in hand.

## Transformations: `decodeTo`

Multi-stage decoding via `Schema.decodeTo`. Example: parse a string
header into an `Instant`, then validate it's in the past:

```ts
const PastInstant = Schema.String.pipe(
  Schema.decodeTo(Schema.Date, SchemaTransformation.dateFromString()),
  Schema.check(Schema.makeFilter((d) => d.getTime() < Date.now(), { title: "past" }))
);
```

`decodeTo` is the v4 replacement for `compose` and takes a
`SchemaTransformation` describing the bidirectional conversion. For
the full transformation catalog (`trim`, `toLowerCase`, `parseNumber`,
custom transformations via `SchemaTransformation.make`), see
`references/schema-composition.md`.

## Tagged unions / ADTs

Discriminated unions for finite state:

```ts
class Pending extends Schema.TaggedStruct("Pending", {}) {}
class Active extends Schema.TaggedStruct("Active", { activatedAt: Schema.Date }) {}
class Closed extends Schema.TaggedStruct("Closed", { reason: Schema.String }) {}

export const Subscription = Schema.Union([Pending, Active, Closed]);
export type Subscription = Schema.Schema.Type<typeof Subscription>;
```

Discriminate with `Match.tag(...)` (see `references/pattern-matching.md`).
For the full pattern (predicates, orders, guards, named module
exports), see `references/domain-modeling.md`.

## v3 → v4 renames (the big surface)

Schema is the area with the most v3→v4 churn. Top renames Claude
should never emit:

| v3 (DO NOT USE) | v4 |
|---|---|
| `Schema.annotations(...)` | `Schema.annotate(...)` |
| `Schema.compose(b)` | `Schema.decodeTo(b, transformation)` |
| `Schema.parseJson()` | `Schema.UnknownFromJsonString` |
| `Schema.parseJson(S)` | `Schema.fromJsonString(S)` |
| `Schema.typeSchema(S)` | `Schema.toType(S)` |
| `Schema.encodedSchema(S)` | `Schema.toEncoded(S)` |
| `Data.TaggedError` | `Schema.TaggedErrorClass` |
| `Schema.TaggedError` (class form) | `Schema.TaggedErrorClass` |
| `Schema.Either` | `Schema.Result` |
| `Schema.DateFromSelf` / `BigIntFromSelf` / `OptionFromSelf` / `ChunkFromSelf` / etc. | Drop the `FromSelf` suffix (`Schema.Date`, `Schema.BigInt`, `Schema.Option`, `Schema.Chunk`, …) |
| `Schema.Redacted` | `Schema.RedactedFromValue` (encoding form moved) |
| `Schema.RedactedFromSelf` | `Schema.Redacted` |
| `Schema.Literal(null)` | `Schema.Null` |
| `Schema.minLength(n)` (filter) | `Schema.isMinLength(n)` (check) |
| `Schema.pattern(re)` | `Schema.isPattern(re)` |
| `Schema.greaterThan(n)` | `Schema.isGreaterThan(n)` |
| `Schema.int()` | `Schema.isInt()` |
| `decodeUnknown` | `decodeUnknownEffect` |
| `decode` | `decodeEffect` |
| `decodeUnknownEither` | `decodeUnknownExit` |
| `Schema.Literal('a', 'b')` (variadic) | `Schema.Literals(['a', 'b'])` (array) |
| `Schema.Union(A, B)` (variadic) | `Schema.Union([A, B])` (array) |
| `Schema.Record({ key, value })` | `Schema.Record(key, value)` (positional) |

For the **full** rename table (every `*FromSelf` removal, every filter
→ check rename, every parser/codec, structural operations via
`mapFields`, optional-key changes, Schema.Data removal), see
`references/schema-v4.md`.

## Common mistakes

- `JSON.parse(raw)` / `JSON.stringify(value)` → `Schema.fromJsonString` / `Schema.encodeEffect`. (`avoid-direct-json`.)
- Schema constants named `UserSchema` → name them after the domain (`User`). (`avoid-schema-suffix`.)
- `Schema.compose(other)` → `Schema.decodeTo(other, transformation)`.
- `Schema.minLength(n)` / `Schema.greaterThan(n)` filters via `.pipe()` → `is*` checks via `.check()`.
- v3 `*FromSelf` schemas (`DateFromSelf`, `BigIntFromSelf`, etc.) → drop the suffix.
- `Schema.Struct` for a named domain type → use `Schema.Class` for `instanceof` support and consistent shape. (`prefer-schema-class`.)
- Secrets as plain `Schema.String` → `Schema.Redacted` / `Config.redacted`. (`prefer-redacted-config`.)

## Deeper references

| For | Read |
|---|---|
| Full v3→v4 rename surface (every `*FromSelf` removal, every filter, every parser/codec, optional-key changes, `mapFields`, Schema.Data removal, the quick decision guide) | `references/schema-v4.md` |
| Transformations (`decodeTo`, custom `SchemaTransformation`, `trim` / `toLowerCase` / `parseNumber` catalog), multi-stage validation | `references/schema-composition.md` |
| Full domain-modeling pattern with `Schema.TaggedStruct`, mandatory module exports, predicates, orders, guards, complete worked examples | `references/domain-modeling.md` |
| Predicates and `Order` instances for Schema-defined types | `references/domain-predicates.md` |
| Discriminating on tagged unions with `Match.tag` / `Match.tags` | `references/pattern-matching.md` |
| Decoding into Effect services (canonical orDie-on-decode pattern) | invoke `/effective:services` |
| Decoding HTTP request bodies, encoding responses, error annotations on Schema for HTTP status codes | invoke `/effective:http` or `references/http-api.md` |
| Cross-cutting laws on Schema-first design (EF-3, EF-12, EF-12b, EF-33, EF-34) | `references/first-laws.md` |
