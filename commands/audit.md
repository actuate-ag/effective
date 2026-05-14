---
description: Run the effective plugin's pattern catalog against the current project (or a specified path) and report findings. Pass `--min-severity <critical|high|medium|warning|info>` to narrow (default: warning).
---

```bash
effect-audit ${ARGUMENTS:-.}
```

Then:

1. Read the output. Group matches by file.
2. For each match, decide whether to fix it now or flag it for the user.
3. If you fix a match, prefer the smallest correct change. Cite the matched
   pattern's name in your edit's commit message or PR description.
4. For ambiguous cases (e.g. `promise-vs-trypromise` where the right
   behavior depends on whether the wrapped Promise can throw), ask the user.
5. If the default `--min-severity warning` produces too many matches to
   address in one pass, narrow with `--min-severity high` or scope to a
   specific path.

Always invoke the relevant skill before writing fixes (the match output
includes the suggested skill for each pattern).
