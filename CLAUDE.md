# CLAUDE.md — effective

This repo packages a Claude Code plugin (`effective`) that ships skills,
hooks, slash commands, and pattern detectors to help Claude Code write
correct Effect v4 TypeScript.

## Layout

```
.claude-plugin/   plugin.json + marketplace.json
skills/           36 skills (SKILL.md per skill, including codebase-guidance)
commands/         slash commands (audit, plugin-version, project-version, status)
hooks/            SessionStart + PostToolUse hooks (bun TypeScript)
patterns/         46 markdown+YAML pattern detectors
bin/              effect-audit, effect-version (bash wrappers; plugin auto-PATHs them)
scripts/          effect-audit.ts, effect-version.ts (implementations)
src/              audit core, reference clone, version pin helpers
test/             vitest fixtures + tests
cache/            (created at runtime) plugin-owned Effect v4 source clone
```

## When working on this repo

- Use `bun`, not `node`/`npx`/`npm`.
- TypeScript is strict; no casts, no `any`. Resolve type errors at the source.
- For Effect APIs, read from `cache/effect-v4/` (created by the SessionStart
  hook on first session in this repo) before guessing.
- Tests live alongside the code under `test/`.

## Verification

```sh
bun run check   # tsc --noEmit
bun run test    # vitest run
bun run fmt     # dprint format
```
