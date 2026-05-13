---
description: Read or update the Effect version pinned by the effective plugin in .claude-plugin/plugin.json. With no argument, prints the current pin. With a version argument, bumps this repo's effect + @effect/* deps, runs check + test, and writes the new pin only if verification passes (--force to override).
---

Run the plugin-side version subcommand. The agent is invoking this inside
the effective plugin repo to inspect or update the version its skills and
reference clone target.

```bash
effect-version plugin ${ARGUMENTS:-}
```

**Behavior:**

- No argument → prints the current `pinnedEffectVersion` from
  `.claude-plugin/plugin.json` and exits.
- `<version>` argument → strict-by-default verify flow:
  1. Bumps `effect` and every `@effect/*` dep in this repo's `package.json`
     to `<version>` (preserving any prefix like `^` or `~`).
  2. Runs `bun install`.
  3. Runs `bun run check` and `bun run test`.
  4. **On full success:** writes the new pin to the manifest and exits 0.
  5. **On any failure:** reverts `package.json` and `bun.lock`, leaves the
     pin untouched, exits non-zero. The agent should read the failure
     output, fix the drift using this plugin's own skills (consult the
     reference clone's `MIGRATION.md` and the relevant skills for API
     changes between the old and new beta), and re-run.
- `<version> --force` → writes the pin regardless of check/test result;
  still surfaces failures as warnings. Use sparingly — it deliberately
  publishes an unverified pin.

After a successful pin update, downstream projects can align with the new
pin via `/effective:project-version --align`.
