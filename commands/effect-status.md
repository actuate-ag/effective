---
description: Report on the local Effect v4 reference clone and the active claude-code-effect catalogs.
---

Run the following Bash commands and summarize the results in a few lines:

```bash
echo "=== effect version ==="
if [ -f node_modules/effect/package.json ]; then
  bun -e "console.log(JSON.parse(require('fs').readFileSync('node_modules/effect/package.json','utf8')).version)"
else
  echo "(not installed)"
fi

echo
echo "=== reference clone ==="
if [ -d .references/effect-v4/.git ]; then
  cat .references/effect-v4/.claude-code-effect-version 2>/dev/null || echo "(no marker)"
else
  echo "(absent)"
fi

echo
echo "=== effect-* skills available ==="
{ ls -1 .claude/skills/ 2>/dev/null; ls -1 ~/.claude/skills/ 2>/dev/null; } \
  | grep '^effect-' | sort -u | wc -l | tr -d ' '
echo "skill(s) total (project + user)"

echo
echo "=== pattern catalog ==="
if [ -d .claude/hooks/lib ] || command -v claude &>/dev/null; then
  echo "PostToolUse pattern feedback: enabled"
else
  echo "PostToolUse pattern feedback: not detected"
fi
```

Report back:
- The installed Effect version and whether the reference clone is current.
- How many `effect-*` skills are loadable and from where.
- Whether the PostToolUse pattern feedback hook is wired up.
- Any immediate action the user should take (e.g. install dependencies, re-run the SessionStart hook, append the CLAUDE.md fragment).
