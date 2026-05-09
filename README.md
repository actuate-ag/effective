# claude-code-effect

A Claude Code plugin that helps Claude write correct, clean, and idiomatic
[Effect v4](https://effect.website) TypeScript.

Adapted from [`pi-effect-harness`](https://github.com/mpsuesser/pi-effect-harness)
for the Claude Code surface (skills, hooks, slash commands).

## What it ships

- **41 `effect-*` skills** covering AI, schema, layers, services, errors, config,
  observability, streaming, persistence, networking, CLI, MCP, testing, React,
  and migration. Loaded by Claude Code's progressive-disclosure skill mechanism.
- **A `SessionStart` hook** that maintains a shallow clone of
  [`Effect-TS/effect-smol`](https://github.com/Effect-TS/effect-smol) at the tag
  matching your project's installed `effect` version, under
  `.references/effect-v4/`.
- **A `PostToolUse` hook** that runs 46 ast-grep / regex pattern detectors against
  every successful Effect-shaped write and feeds matches back to Claude in-band.
- **A short CLAUDE.md fragment** to drop into a project so Claude knows to invoke
  `effect-*` skills before writing Effect code.

## Install

### As a Claude Code plugin

```bash
claude plugin install <path-or-url>/claude-code-effect
```

### As skills + hooks for a single project

```bash
./scripts/install-project.sh /path/to/your/project
```

### As user-level skills (available everywhere)

```bash
./scripts/install-user.sh
```

## Status

Pre-0.1. See [docs/plan.md](./docs/plan.md) (TBD) for the rollout sequence.

## License

MIT.
