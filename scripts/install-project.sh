#!/usr/bin/env bash
# install-project.sh — install claude-code-effect into a target project's .claude/
#
# Usage:
#   ./scripts/install-project.sh /path/to/project
#   ./scripts/install-project.sh /path/to/project --uninstall
#
# Installs:
#   <project>/.claude/skills/effect-*           (symlinks)
#   <project>/.claude/hooks/                    (symlinks: hooks.json + scripts)
#   <project>/CLAUDE.md                         (appends fragment, idempotent)
#
# The CLAUDE.md fragment is wrapped in <!-- claude-code-effect:begin -->/end
# markers so re-running the installer is a no-op.

set -euo pipefail

if [[ $# -lt 1 ]]; then
	echo "usage: $0 <project-dir> [--uninstall]" >&2
	exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$(cd "$1" && pwd)"
MODE="${2:-install}"

CLAUDE_DIR="$TARGET/.claude"
SKILLS_DST="$CLAUDE_DIR/skills"
HOOKS_DST="$CLAUDE_DIR/hooks"
FRAGMENT="$REPO_ROOT/claude-md/effect-fragment.md"
CLAUDE_MD="$TARGET/CLAUDE.md"
BEGIN_MARK='<!-- claude-code-effect:begin -->'
END_MARK='<!-- claude-code-effect:end -->'

remove_symlinks_in() {
	local src_dir="$1" dst_dir="$2"
	[[ -d "$dst_dir" ]] || return 0
	for entry in "$src_dir"/*; do
		local name link
		name="$(basename "$entry")"
		link="$dst_dir/$name"
		if [[ -L "$link" ]] && [[ "$(readlink "$link")" == "$entry"* ]]; then
			rm "$link"
		fi
	done
}

remove_fragment() {
	[[ -f "$CLAUDE_MD" ]] || return 0
	# Strip from begin marker through end marker (and the trailing newline).
	awk -v begin="$BEGIN_MARK" -v end="$END_MARK" '
		BEGIN { skip = 0 }
		index($0, begin) { skip = 1; next }
		skip && index($0, end) { skip = 0; next }
		!skip { print }
	' "$CLAUDE_MD" > "$CLAUDE_MD.tmp" && mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
}

if [[ "$MODE" == "--uninstall" ]]; then
	remove_symlinks_in "$REPO_ROOT/skills" "$SKILLS_DST"
	remove_symlinks_in "$REPO_ROOT/hooks" "$HOOKS_DST"
	remove_fragment
	echo "uninstalled claude-code-effect from $TARGET"
	exit 0
fi

mkdir -p "$SKILLS_DST" "$HOOKS_DST"

# Skills
linked=0
for skill_dir in "$REPO_ROOT/skills"/*/; do
	skill_name="$(basename "$skill_dir")"
	link="$SKILLS_DST/$skill_name"
	if [[ -e "$link" || -L "$link" ]]; then
		if [[ -L "$link" ]] && [[ "$(readlink "$link")" == "${skill_dir%/}" ]]; then
			continue
		fi
		echo "skip skill: $link already exists" >&2
		continue
	fi
	ln -s "${skill_dir%/}" "$link"
	linked=$((linked + 1))
done

# Hooks (the whole hooks/ directory contents)
hooks_linked=0
if [[ -d "$REPO_ROOT/hooks" ]]; then
	for hook_entry in "$REPO_ROOT/hooks"/*; do
		[[ -e "$hook_entry" ]] || continue
		name="$(basename "$hook_entry")"
		link="$HOOKS_DST/$name"
		if [[ -e "$link" || -L "$link" ]]; then
			if [[ -L "$link" ]] && [[ "$(readlink "$link")" == "$hook_entry" ]]; then
				continue
			fi
			echo "skip hook: $link already exists" >&2
			continue
		fi
		ln -s "$hook_entry" "$link"
		hooks_linked=$((hooks_linked + 1))
	done
fi

# CLAUDE.md fragment (append once, marker-guarded)
if [[ -f "$CLAUDE_MD" ]] && grep -qF "$BEGIN_MARK" "$CLAUDE_MD"; then
	fragment_status="already present"
else
	{
		[[ -f "$CLAUDE_MD" ]] && echo
		cat "$FRAGMENT"
	} >> "$CLAUDE_MD"
	fragment_status="appended"
fi

echo "claude-code-effect installed in $TARGET"
echo "  skills: linked $linked"
echo "  hooks:  linked $hooks_linked"
echo "  CLAUDE.md fragment: $fragment_status"
echo
echo "Next steps:"
echo "  - Open a new Claude Code session in $TARGET"
echo "  - The SessionStart hook will clone Effect-TS/effect-smol into .references/effect-v4/"
echo "  - Add '.references/' to .gitignore if not already present"
