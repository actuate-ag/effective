---
description: Show this project's installed Effect version against the effective plugin's pin, or with --align bump the project's effect + @effect/* deps to match the plugin and verify with check + test.
---

Run the project-side version subcommand. The agent is invoking this in a
downstream project to inspect or align its Effect dependencies against the
version this plugin's skills and reference clone target.

```bash
effect-version project ${ARGUMENTS:-}
```

**Behavior:**

- No argument → prints three lines:
  - `project: effect@<installed-version>` (from `node_modules/effect`, or
    `(none)` if not installed).
  - `plugin:  effect@<pin>` (the plugin's `pinnedEffectVersion`).
  - `status:  equal | project behind plugin | project ahead of plugin | unknown`.
- `--align` flag → bumps the project's `effect` and every `@effect/*` dep
  in `package.json` to the plugin's pin (preserving prefixes), runs `bun
  install`, then runs `bun run check` and `bun run test` if those scripts
  are defined. Exits 0 on full success, non-zero on any failure. **No
  revert on failure** — the agent should read the failure output and fix
  the resulting drift using this plugin's skills (especially around APIs
  that changed between the old and new beta). Consult the plugin's local
  reference clone (`MIGRATION.md` and module sources) and the relevant
  skills.

If the status reports **project ahead of plugin**, do NOT pass `--align` —
it would downgrade the project. Instead, surface the mismatch to the user
and suggest updating the plugin itself.
