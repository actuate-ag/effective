---
name: codebase-guidance
description: Always-on guidance for Effect v4 TypeScript codebases. Use this whenever working in any project that depends on the `effect` package — covers v3→v4 renames, where the local source clone lives, which skills to invoke for which tasks, and what the PostToolUse pattern feedback hook does.
---

# Effect v4 codebase guidance

This project uses [Effect v4](https://effect.website). When writing or
modifying Effect TypeScript:

- **Invoke the relevant skill before writing**: `error-handling`,
  `schema-v4`, `layer-design`, `service-implementation`, and any
  task-specific skill (`sql`, `http-api`, `stream`, `testing`, etc.). The
  full set of laws is in `first-laws`.
- **Never use Effect v3 names.** Common renames: `catchAll → catch`,
  `parseJson → fromJsonString`, `Either → Result`, `compose → decodeTo`,
  the `*FromSelf` suffix is removed, `Data.TaggedError → Schema.TaggedErrorClass`.
  When unsure, consult `schema-v4` and the local source clone.
- **Local v4 source clone** lives at `../../cache/effect-v4/` (relative to
  this skill's directory; the SessionStart hook maintains it at the version
  pinned in `.claude-plugin/plugin.json`). Read it instead of guessing:
  - `../../cache/effect-v4/LLMS.md` — Effect v4 overview for LLMs
  - `../../cache/effect-v4/MIGRATION.md` — v3 → v4 migration guide
  - `../../cache/effect-v4/packages/effect/SCHEMA.md`
  - `../../cache/effect-v4/packages/effect/HTTPAPI.md`
  - `../../cache/effect-v4/packages/effect/src/` — source for any module
- **Pattern feedback** runs after every Edit/Write of `*.{ts,tsx}` and
  surfaces matched anti-patterns (Effect v3 holdovers, throw inside
  `Effect.gen`, direct `JSON.parse`, `node:fs` instead of `FileSystem`,
  etc.) back to you in-band. Treat each match as a real review note.
- **Version pin.** The plugin pins a specific Effect beta in
  `.claude-plugin/plugin.json` (`pinnedEffectVersion`). The reference clone
  always reflects the pin. If a project's installed `effect` version
  differs, the SessionStart hook prints a drift warning telling you (and
  the user) whether to align the project via the slash command or update
  the plugin itself.
