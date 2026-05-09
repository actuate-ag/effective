---
description: Run the claude-code-effect pattern catalog against the current project (or a specified path) and report findings.
---

Run the audit CLI against the user's path (or default to `.`) and feed the
output back to me so I can act on the matches.

Use this:

```bash
effect-audit ${ARGUMENTS:-.} --format human --min-severity warning
```

If `effect-audit` is not on PATH, fall back to the in-repo script:

```bash
bun run "$(realpath ~/code/actuate/claude-code-effect)/scripts/audit.ts" ${ARGUMENTS:-.}
```

Then:

1. Read the output. Group matches by file.
2. For each match, decide whether to fix it now or flag it for the user.
3. If you fix a match, prefer the smallest correct change. Cite the matched
   pattern's name in your edit's commit message or PR description.
4. For ambiguous cases (e.g. `effect-promise-vs-trypromise` where the right
   behavior depends on whether the wrapped Promise can throw), ask the user.
5. If `--min-severity warning` produces too many matches to address in one
   pass, narrow with `--min-severity high` or scope to a specific path.

Always invoke the relevant `effect-*` skill before writing fixes (the
match output includes the suggested skill for each pattern).
