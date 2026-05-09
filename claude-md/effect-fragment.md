<!-- claude-code-effect:begin -->
## Effect v4

This project uses [Effect v4](https://effect.website). When writing or
modifying Effect TypeScript:

- **Invoke the relevant `effect-*` skill before writing**: `effect-error-handling`,
  `effect-schema-v4`, `effect-layer-design`, `effect-service-implementation`,
  and any task-specific skill (`effect-sql`, `effect-http-api`, `effect-stream`,
  `effect-testing`, etc.). The full set of laws is in `effect-first-laws`.
- **Never use Effect v3 names.** Common renames: `catchAll → catch`,
  `parseJson → fromJsonString`, `Either → Result`, `compose → decodeTo`,
  the `*FromSelf` suffix is removed, `Data.TaggedError → Schema.TaggedErrorClass`.
  When unsure, consult `effect-schema-v4` and the local source clone.
- **Local v4 source clone** lives at `.references/effect-v4/` (maintained by
  the `claude-code-effect` SessionStart hook at the version pinned in
  `node_modules/effect/package.json`). Read it instead of guessing:
  - `.references/effect-v4/LLMS.md` — Effect v4 overview for LLMs
  - `.references/effect-v4/MIGRATION.md` — v3 → v4 migration guide
  - `.references/effect-v4/packages/effect/SCHEMA.md`
  - `.references/effect-v4/packages/effect/HTTPAPI.md`
  - `.references/effect-v4/packages/effect/src/` — actual source for any module
- **Pattern feedback** runs after every Edit/Write of `*.{ts,tsx}` and surfaces
  matched anti-patterns (Effect v3 holdovers, throw inside `Effect.gen`,
  direct `JSON.parse`, `node:fs` instead of `FileSystem`, etc.) back to you
  in-band. Treat each match as a real review note.
<!-- claude-code-effect:end -->
