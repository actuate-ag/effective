---
description: Report on the local Effect v4 reference clone, the version pin, and the active effective plugin catalogs.
---

Run the following Bash commands and summarize the results in a few lines:

```bash
echo "=== version state ==="
effect-version project 2>&1 || echo "(effect-version not on PATH; plugin may not be active)"

echo
echo "=== reference clone (plugin-owned) ==="
PLUGIN_BIN="$(command -v effect-version 2>/dev/null || true)"
if [ -n "$PLUGIN_BIN" ]; then
  CACHE="$(cd "$(dirname "$PLUGIN_BIN")/../cache/effect-v4" 2>/dev/null && pwd -P || true)"
  if [ -n "$CACHE" ] && [ -f "$CACHE/.effective-version" ]; then
    cat "$CACHE/.effective-version"
  else
    echo "(absent)"
  fi
else
  echo "(plugin not detected)"
fi

echo
echo "=== pattern catalog ==="
echo "Pattern feedback hook is registered via the plugin's hooks/hooks.json"
echo "and fires on PostToolUse (Edit | Write | MultiEdit | NotebookEdit)."
```

Report back:

- The installed Effect version and whether it matches the plugin pin.
- Whether the reference clone is current.
- Any immediate action the user should take (e.g. `/effective:project-version --align`, install dependencies, restart the session).
