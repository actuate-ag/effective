#!/usr/bin/env bash
# setup-shared.sh — set up a single canonical Effect reference clone shared
# across every project on this machine.
#
# Usage:
#   ./scripts/setup-shared.sh              # default location
#   ./scripts/setup-shared.sh /custom/path # override location
#
# What it does:
#   1. Picks a canonical location (default ~/.local/share/claude-code-effect/effect-v4).
#   2. Appends `export CLAUDE_CODE_EFFECT_REFERENCE_DIR=...` to your shell rc
#      file (~/.zshrc or ~/.bashrc), idempotently.
#   3. Sets the env var in the current shell so the warm clone in step 4 uses it.
#   4. Warms the canonical clone immediately via the SessionStart hook script,
#      pinned to the default Effect version (4.0.0-beta.59) — subsequent
#      sessions in real projects will adjust if their pinned version differs
#      (and warn loudly if shared mode protects them from a re-clone).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_DIR="${HOME}/.local/share/claude-code-effect/effect-v4"
TARGET="${1:-$DEFAULT_DIR}"
EXPORT_LINE="export CLAUDE_CODE_EFFECT_REFERENCE_DIR=\"$TARGET\""

# --- Detect shell rc file ---
detect_rc_file() {
	local shell_name
	shell_name="$(basename "${SHELL:-}")"
	case "$shell_name" in
		zsh)  echo "$HOME/.zshrc" ;;
		bash)
			if [[ "$(uname -s)" == "Darwin" && -f "$HOME/.bash_profile" ]]; then
				echo "$HOME/.bash_profile"
			else
				echo "$HOME/.bashrc"
			fi
			;;
		*)
			echo "" ;;
	esac
}

RC_FILE="$(detect_rc_file)"
if [[ -z "$RC_FILE" ]]; then
	echo "error: unsupported shell '${SHELL:-unknown}'." >&2
	echo "       This script supports zsh and bash. For other shells, set" >&2
	echo "       CLAUDE_CODE_EFFECT_REFERENCE_DIR manually in your shell config:" >&2
	echo "         $EXPORT_LINE" >&2
	exit 1
fi

# --- Plan + execute ---
echo "claude-code-effect: setting up a shared Effect reference clone"
echo
echo "  canonical location:  $TARGET"
echo "  shell rc file:       $RC_FILE"
echo
echo "Steps:"
echo "  1. Append '$EXPORT_LINE' to $RC_FILE (idempotent)"
echo "  2. Run the SessionStart hook now to warm the clone (≈30s)"
echo

# Step 1: append export line idempotently
if [[ -f "$RC_FILE" ]] && grep -qF "$EXPORT_LINE" "$RC_FILE"; then
	echo "[1/2] $RC_FILE already contains the export line; skipping append"
else
	{
		[[ -f "$RC_FILE" ]] && [[ -n "$(tail -c1 "$RC_FILE" 2>/dev/null || true)" ]] && echo
		echo "# claude-code-effect: shared Effect reference clone"
		echo "$EXPORT_LINE"
	} >> "$RC_FILE"
	echo "[1/2] appended export line to $RC_FILE"
fi

# Step 2: warm the canonical clone in this shell
export CLAUDE_CODE_EFFECT_REFERENCE_DIR="$TARGET"
mkdir -p "$(dirname "$TARGET")"

WARM_DIR="$(mktemp -d)"
trap "rm -rf $WARM_DIR" EXIT

echo "[2/2] warming the canonical clone (this may take ~30s)..."
echo "{\"cwd\":\"$WARM_DIR\",\"hook_event_name\":\"SessionStart\"}" \
	| bun run "$REPO_ROOT/hooks/ensure-reference-clone.ts" || true

if [[ -f "$TARGET/.claude-code-effect-version" ]]; then
	cloned_tag="$(cat "$TARGET/.claude-code-effect-version")"
	echo "[2/2] canonical clone ready at $TARGET ($cloned_tag)"
else
	echo "[2/2] warm clone did not complete; the SessionStart hook will retry on next Claude Code session." >&2
fi

echo
echo "Done. Open a new shell (or run 'source $RC_FILE') to pick up the env var,"
echo "then start a Claude Code session in any Effect project. The SessionStart"
echo "hook will create a symlink at <project>/.references/effect-v4 pointing at"
echo "$TARGET."
