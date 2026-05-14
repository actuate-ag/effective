---
name: sql
description: Type-safe SQL access in Effect v4. Covers `SqlClient` tagged-template queries, `SqlSchema` for Schema-validated request/result decoding, `Model` and `SqlModel` for CRUD repositories, `SqlResolver` for batched fetches, and `Migrator` for schema migrations.
when_to_use: Invoke when writing a database query, defining a repository's read or write method, wiring a SQL layer, batching N+1 reads with `SqlResolver`, or setting up migrations.
---

# SQL

Database access in this codebase goes through `SqlClient` (a service
that provides tagged-template query construction) wrapped in
`SqlSchema` (Schema-validated request inputs and result outputs).
Domain code receives typed values — `User`, `Subscription` — never raw
rows.

All SQL modules live under `effect/unstable/sql/*`.

## Canonical shape

```ts
import { Context, Effect, Layer, Schema } from "effect";
import * as Option from "effect/Option";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { User, type CreateUserData, UserNotFound } from "@/schemas/User";

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
      const sql = yield* SqlClient;

      // Typed query: input is validated as string, output decoded as Option<User>
      const lookup = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: User,
        execute: (id) => sql`SELECT * FROM users WHERE id = ${id}`
      });

      const findById = Effect.fn("UserRepository.findById")(function* (id: string) {
        const found = yield* lookup(id);
        return yield* Option.match(found, {
          onNone: () =>
            Effect.fail(new UserNotFound({ userId: id, message: `User ${id} not found` })),
          onSome: Effect.succeed
        });
      });

      // Insert + return the decoded row
      const insertOne = SqlSchema.single({
        Request: Schema.encodedSchema(CreateUserData),
        Result: User,
        execute: (data) =>
          sql`INSERT INTO users ${sql.insert(data).returning("*")}`
      });

      const create = Effect.fn("UserRepository.create")(function* (data: CreateUserData) {
        return yield* insertOne(data);
      });

      return Service.of({ findById, create });
    })
  );
}
```

Two `SqlSchema` query constructors do the heavy lifting:
`findOneOption` (zero-or-one row, returns `Option`) and `single`
(exactly one row, fails if not). Each takes a `Request` schema (input
validation), a `Result` schema (output decoding), and an `execute`
function that builds the tagged-template SQL.

## Raw `SqlClient` for queries without decoding

When the result doesn't need typed decoding (a write that returns
nothing, a count, a void delete), the tagged template alone is
sufficient:

```ts
const sql = yield* SqlClient;
yield* sql`DELETE FROM users WHERE id = ${id}`;
const count = (yield* sql`SELECT count(*) AS n FROM users`)[0]?.n ?? 0;
```

Tagged-template expressions yield `Effect<ReadonlyArray<Row>, SqlError>`.
`sql.insert(data)`, `sql.update(data, omitCols)`, and `.returning("*")`
build common write fragments.

**Never string-interpolate user input** — always use the `${}`
placeholder so values are parameterized. The tagged template handles
escaping.

## `SqlSchema` query constructors

| Constructor | Returns | Fails when |
|---|---|---|
| `SqlSchema.findOne` | `A` | empty result → `NoSuchElementError` |
| `SqlSchema.findOneOption` | `Option<A>` | never (empty becomes `None`) |
| `SqlSchema.findAll` | `ReadonlyArray<A>` | never |
| `SqlSchema.findNonEmpty` | `NonEmptyArray<A>` | empty result → `NoSuchElementError` |
| `SqlSchema.single` | `A` | empty or multi-row result |
| `SqlSchema.void` | `void` | only on driver / decode failure |

Each takes `{ Request, Result, execute }`. `Request: Schema.Void` for
no-input queries. The returned function has signature
`(input: Request["Type"]) => Effect<Result["Type"], SchemaError | SqlError>`.

For nested-object decoding from joined rows, see `references/sql.md`
§ "SqlSchema" (covers `Schema.Class` with nested classes mapped from
flat column sets).

## `Model` and `SqlModel` for full CRUD

When a domain type maps to a single table and you want all five CRUD
methods (insert, findById, findByIds, update, delete) without writing
each query, define a `Model` and let `SqlModel.layer` generate the
repository:

```ts
import { Model } from "effect/unstable/schema";
import * as SqlModel from "effect/unstable/sql/SqlModel";

class UserModel extends Model.Class<UserModel>("User")({
  id: Model.Generated(Schema.String),
  email: Schema.String,
  name: Schema.String
}) {}

const repoLayer = SqlModel.layer({ Self: UserRepository.Service, Model: UserModel, table: "users" });
```

`Model.Class` is a schema variant: it generates `insert`, `update`,
and `json` variants from one declaration so the differences between
"row as inserted" (no id), "row as updated" (partial), and "row as
read" are typed. See `references/sql.md` § "Model" and § "SqlModel".

## Batching with `SqlResolver`

For N+1 elimination (e.g., loading a parent + many children in
correlated calls), wrap the query in a `SqlResolver`:

```ts
const userById = SqlResolver.findById({
  Id: Schema.String,
  Result: User,
  ResultId: (u) => u.id,
  execute: (ids) => sql`SELECT * FROM users WHERE id IN ${sql.in(ids)}`
});
// Calling userById(id) within a single Effect transparently batches.
```

For the full `SqlResolver` surface (`findById`, `grouped`, request
caching) see `references/sql.md` § "SqlResolver" and the cross-cutting
`references/batching.md`.

## Migrations with `Migrator`

```ts
import { Migrator } from "effect/unstable/sql/Migrator";

const MigratorLive = Migrator.layer({
  schemaDirectory: "migrations",
  loader: Migrator.fromFileSystem
});
```

Migration files named `<sequence>_<name>.sql` (e.g.
`001_create_users.sql`) live in `schemaDirectory/`. The `Migrator`
runs unapplied migrations on layer build. See
`references/sql.md` § "Migrator" for transaction semantics, rollback
hooks, and custom loaders.

## Driver and layer setup

Driver packages provide concrete `SqlClient` layers — `@effect/sql-pg`,
`@effect/sql-mysql2`, `@effect/sql-sqlite-node`, etc. Compose:

```ts
import { PgClient } from "@effect/sql-pg";

const SqlLive = PgClient.layer({
  url: Config.redacted("DATABASE_URL")
});

// Provide to the repository
const App = UserRepository.layer.pipe(
  Layer.provide(SqlLive),
  Layer.provide(MigratorLive)
);
```

See `references/sql.md` § "Driver Packages and Layer Setup".

## Common mistakes

- String-interpolating user input into a query → use `${}` placeholders; the tagged template parameterizes.
- Returning `unknown` from a service method because the raw query gave raw rows → wrap in `SqlSchema.*` so the result is Schema-decoded.
- `JSON.parse(row.metadata)` on a JSON column → declare the column as `Schema.fromJsonString(MetadataSchema)` in the `Result` schema; decoding is automatic.
- A separate service method per related lookup that becomes N+1 → use `SqlResolver`.
- `SqlSchema.findOne` when zero rows is a recoverable case → use `findOneOption` so the absence is in `E` as `None`, not as `NoSuchElementError`.
- `Effect.tryPromise` around a raw driver call → use the driver's `SqlClient` layer.

## Deeper references

| For | Read |
|---|---|
| Full `SqlClient` surface (insert/update helpers, transactions, raw queries, streaming large result sets, error handling), every `SqlSchema` constructor, full `Model` / `SqlModel` repository generation, `SqlResolver` patterns, `Migrator` lifecycle, all driver packages | `references/sql.md` |
| Batching theory (`Request`, `RequestResolver`, deduplication, caching) | `references/batching.md` |
| Schema definitions used for `Request` / `Result` (`Schema.Class`, JSON columns, branded ids) | invoke `/effective:schema` |
| Service shape that holds the repository (Layer, `Effect.fn`, namespace pattern) | invoke `/effective:services` |
| Service-error channel shaping (declare `UserNotFound`, decode-orDie, narrow `E`) | invoke `/effective:errors` |
| Cross-cutting laws on schema-first decoding (EF-3) and resource scoping (EF-23) | `references/first-laws.md` |
