#!/usr/bin/env bash
# install-user.sh — symlink claude-code-effect skills + hooks into ~/.claude/
#
# Usage:
#   ./scripts/install-user.sh             # install
#   ./scripts/install-user.sh --uninstall # remove symlinks
#
# Skills installed user-wide are available in every Claude Code session.
# Hooks are NOT installed user-wide by default — they're project-scoped.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_DIR="${CLAUDE_HOME:-$HOME/.claude}"
SKILLS_SRC="$REPO_ROOT/skills"
SKILLS_DST="$CLAUDE_DIR/skills"

if [[ "${1:-}" == "--uninstall" ]]; then
	for skill_dir in "$SKILLS_SRC"/*/; do
		skill_name="$(basename "$skill_dir")"
		link="$SKILLS_DST/$skill_name"
		if [[ -L "$link" ]] && [[ "$(readlink "$link")" == "$skill_dir"* ]]; then
			rm "$link"
			echo "removed: $link"
		fi
	done
	exit 0
fi

mkdir -p "$SKILLS_DST"

linked=0
skipped=0
for skill_dir in "$SKILLS_SRC"/*/; do
	skill_name="$(basename "$skill_dir")"
	link="$SKILLS_DST/$skill_name"
	if [[ -e "$link" || -L "$link" ]]; then
		if [[ -L "$link" ]] && [[ "$(readlink "$link")" == "${skill_dir%/}" ]]; then
			skipped=$((skipped + 1))
			continue
		fi
		echo "skip: $link already exists (not a claude-code-effect symlink)" >&2
		skipped=$((skipped + 1))
		continue
	fi
	ln -s "${skill_dir%/}" "$link"
	linked=$((linked + 1))
done

echo "linked $linked skill(s), skipped $skipped"
echo "skills installed at: $SKILLS_DST"
