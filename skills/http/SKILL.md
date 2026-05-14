---
name: http
description: Build typed HTTP APIs and clients with Effect's `HttpApi` module. Covers endpoint definitions with `Schema`-validated params / payload / success / error, group composition, `HttpApiBuilder` for handlers, security middleware, and derived clients.
when_to_use: Invoke when defining an HTTP endpoint, wiring handlers to services, mapping typed errors to HTTP status codes, exposing OpenAPI / Swagger, or deriving a type-safe client from an API definition.
---

# HTTP

The `HttpApi` module defines an API once — endpoints, schemas,
errors — and powers the server, the OpenAPI docs, and the derived
client from that single source. Definitions live in a module that
ships with both the server and any client packages; nothing
server-specific leaks into the definition.

## Canonical shape

```ts
import { Effect, HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup, Layer, Schema } from "effect";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";

import { User, UserNotFound } from "@/schemas/User";
import { UserRepository } from "@/services/UserRepository";

// 1. Endpoint — params, success, errors all Schema-typed
const getUserById = HttpApiEndpoint.get("getUserById", "/users/:id", {
  params: { id: Schema.String },
  success: User,
  error: UserNotFound // tagged class; status code annotated below
});

// 2. Group endpoints; status-code annotations live with the schemas
const UsersGroup = HttpApiGroup.make("users")
  .add(getUserById)
  .annotateError(UserNotFound, { status: 404 });

// 3. Compose into the API definition (sharable between server + client)
export class Api extends HttpApi.make("app-api").add(UsersGroup) {}

// 4. Build server-side handlers; consume services, fail with the declared error
const UsersHandlers = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fn(function* (handlers) {
    const repo = yield* UserRepository.Service;
    return handlers.handle("getUserById", ({ params }) => repo.findById(params.id));
  })
).pipe(Layer.provide(UserRepository.defaultLayer));

// 5. Mount on a platform server
const ServerLive = HttpApiBuilder.serve(Api).pipe(
  Layer.provide(UsersHandlers),
  Layer.provide(NodeHttpServer.layer({ port: 8080 }))
);

NodeRuntime.runMain(Layer.launch(ServerLive));
```

Five pieces: endpoint → group → API → handlers → server. The same
`Api` value (step 3) can be exported and consumed by `HttpApiClient` to
derive a fully typed client. The sections below explore each step.

## Endpoints and schemas

`HttpApiEndpoint.get/post/put/patch/delete(name, path, options)` defines
one endpoint. `name` is the method name in the derived client; `path`
is the route pattern; `options` carries the Schemas:

- `params` — path parameters (`:id` style), one Schema per segment.
- `query` — query string parameters; values arrive as decoded strings.
- `headers` — typed request headers.
- `payload` — request body schema. Default JSON; use `HttpApiSchema.withEncoding(...)` for form data / urlencoded.
- `success` — response body schema.
- `error` — error class(es); union for multiple.

Schemas validate end-to-end: params/query/headers/payload are decoded
on the way in (failing requests get 400s automatically); success and
error are encoded on the way out using each schema's declared
representation.

The pattern catalog flags using bare `fetch` instead of the Effect
HTTP modules via `avoid-native-fetch`.

## Mapping errors to status codes

The canonical example shows `UserNotFound` declared as `error:` on the
endpoint, then mapped to status 404 via
`HttpApiGroup.annotateError(UserNotFound, { status: 404 })`. Multiple
errors:

```ts
const UsersGroup = HttpApiGroup.make("users")
  .add(getUserById)
  .add(createUser)
  .annotateError(UserNotFound, { status: 404 })
  .annotateError(ValidationFailed, { status: 422 });
```

For a per-error response shape (not just the tagged class itself), use
`HttpApiSchema.withDefaults` or wrap the error in a Schema that adds
the wire-format fields. See `references/http-api.md` § "Error Handling".

Unhandled defects flow to the platform server and produce 500s; the
canonical pattern is to make sure every failure the handler *could*
return is in the declared `error` union, and `Effect.orDie` anything
the API client shouldn't see (per the channel-shaping discussion in
`/effective:errors`).

## Building handlers

`HttpApiBuilder.group(Api, groupName, builderFn)` produces a `Layer`
that implements every endpoint in the group. The builder function
yields the `handlers` object and chains `.handle(endpointName, fn)`
calls; each `fn` receives `{ params, query, headers, payload }` typed
from the endpoint's schemas and returns an
`Effect<Success, DeclaredError, ServiceDeps>`.

Handlers are where the API meets your services — invoke the service
method and return its Effect. The canonical example uses
`repo.findById(params.id)` directly because the service's error type
(`UserNotFound`) matches the endpoint's declared error. When they
don't match exactly, narrow via `Effect.catchTag` to map service
errors to API errors, or `Effect.orDie` to push to defects.

`Layer.provide([Service.defaultLayer, ...])` wires the services the
handlers consume.

## Schema annotations on endpoints

Endpoints support fluent annotations for OpenAPI:

```ts
const getUserById = HttpApiEndpoint.get("getUserById", "/users/:id", {
  params: { id: Schema.String },
  success: User,
  error: UserNotFound
})
  .annotate(OpenApi.Description, "Fetch a user by id.")
  .annotate(OpenApi.Summary, "Get user");
```

API-level annotations (title, description) attach via
`HttpApi.annotateMerge(OpenApi.annotations({ ... }))`. Swagger UI is
mounted by adding `HttpApiSwagger.layer({ path: "/docs" })` to the
server composition. See `references/http-api.md` § "OpenAPI
Documentation".

## Security middleware

`HttpApiMiddleware.Tag` defines a typed middleware that produces a
required context (`CurrentUser`, etc.) and consumes a security scheme:

```ts
class Authorization extends HttpApiMiddleware.Tag<Authorization>()("Authorization", {
  failure: Unauthorized,
  provides: CurrentUser,
  security: HttpApiSecurity.bearer
}) {}
```

Apply it via `.middleware(Authorization)` on a group or endpoint. The
implementation layer extracts the credential (e.g., the bearer token),
verifies it, and yields the `CurrentUser` into context for handlers.
See `references/http-api.md` § "Security".

## Deriving a client

The same `Api` definition produces a fully typed client:

```ts
import { HttpApiClient } from "effect";

const client = yield* HttpApiClient.make(Api, { baseUrl: "https://api.example.com" });
const user = yield* client.users.getUserById({ path: { id: "u123" } });
// user : User
```

Every endpoint becomes a method on the matching group; request inputs
and response outputs are typed; error tags from the endpoint's `error`
schema land in the client's `E`. No hand-written client; no drift.

## v3 → v4 holdovers

The HTTP modules saw substantial reorganization between v3 and v4. Top
gotchas:

| v3 / older v4 | v4 (current) |
|---|---|
| `@effect/platform/HttpApi` | `effect/unstable/httpapi` |
| `@effect/platform/HttpServer` | `effect/unstable/http` |
| `HttpApiBuilder.api(...)` | `HttpApiBuilder.serve(Api)` |
| `Schema.parseJson(...)` decoding bodies manually | Use endpoint `payload:` schema; decoding is automatic |
| Native `fetch` for outbound calls | `HttpClient` / `HttpClientRequest` modules |

For the full set (every endpoint helper, every middleware composition
pattern, every client method), see `references/http-api.md`.

## Common mistakes

- Bare `fetch(...)` in handler code → use `HttpClient` / `HttpClientRequest`. (`avoid-native-fetch`.)
- Mixing server impl into the definition module → keep `Api` and its `HttpApiGroup`s in a shared module; build handlers separately.
- Handler returning a different error type than the endpoint declares → narrow with `Effect.catchTag` or `Effect.orDie`. The handler's `Effect<A, E, R>` must match the declared `success` / `error`.
- Manual `JSON.parse(body)` in a handler → use the endpoint's `payload:` schema. (`avoid-direct-json`.)
- Hand-writing a typed client → derive from `Api` via `HttpApiClient.make`.
- Forgetting `.annotateError(E, { status })` → all errors fall through to 500.

## Deeper references

| For | Read |
|---|---|
| Full `HttpApi` / `HttpApiGroup` / `HttpApiEndpoint` surface, every option, every middleware composition pattern, every response-customization helper | `references/http-api.md` |
| Security middleware patterns (bearer, basic, API key, custom), `CurrentUser` propagation, authorization layers | `references/http-api.md` § "Security" |
| OpenAPI / Swagger setup, schema annotations, fluent docs | `references/http-api.md` § "OpenAPI Documentation" |
| Service shape for handler dependencies (Layer, `Effect.fn`) | invoke `/effective:services` |
| Schema definitions for endpoint inputs/outputs and error classes | invoke `/effective:schema` |
| Channel-shaping for declared error unions (`Effect.orDie` decode, narrow `E`) | invoke `/effective:errors` |
| Cross-cutting laws on platform-bound HTTP (EF-9b runtime HTTP) | `references/first-laws.md` |
