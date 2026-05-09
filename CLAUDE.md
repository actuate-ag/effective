# CLAUDE.md — claude-code-effect

This repo packages skills, hooks, and guidance that help Claude Code write
correct Effect v4 TypeScript.

## Layout

```
.claude-plugin/   plugin manifest
skills/           41 effect-* skills (SKILL.md per skill)
hooks/            SessionStart + PostToolUse hooks (bun TypeScript)
patterns/         46 markdown+YAML pattern detectors
claude-md/        CLAUDE.md fragment for installing into target projects
scripts/          install-user.sh, install-project.sh
test/             vitest fixtures + pattern detector tests
```

## When working on this repo

- Use `bun`, not `node`/`npx`/`npm`.
- TypeScript is strict; no casts, no `any`. Resolve type errors at the source.
- For Effect APIs, read from `.references/effect-v4/` (created by the
  SessionStart hook on first session in this repo) before guessing.
- Tests live alongside the code under `test/`.

## Verification

```sh
bun run check   # tsc --noEmit
bun run test    # vitest run
bun run fmt     # dprint format
```
