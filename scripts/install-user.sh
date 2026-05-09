#!/usr/bin/env bash
# install-user.sh — install claude-code-effect.
#
# Usage:
#   ./scripts/install-user.sh                    # user-level (default)
#   ./scripts/install-user.sh --project          # project-level (current dir)
#   ./scripts/install-user.sh --project DIR      # project-level (target dir)
#   ./scripts/install-user.sh [--project [DIR]] --uninstall
#
# User mode (default):
#   ~/.claude/skills/effect-*           (symlinks)
#   ~/.claude/CLAUDE.md                 (fragment appended, idempotent)
#   ~/.claude/settings.json             (SessionStart + PostToolUse hooks merged)
#   ~/.references/effect-v4/            (canonical clone, shared across projects)
#   $SHELL_RC                           (CLAUDE_CODE_EFFECT_REFERENCE_DIR export)
#
# Project mode (--project [DIR]):
#   <DIR>/.claude/skills/effect-*       (symlinks)
#   <DIR>/CLAUDE.md                     (fragment appended, idempotent)
#   <DIR>/.claude/settings.json         (SessionStart + PostToolUse hooks merged)
#   <DIR>/.references/effect-v4/        (per-project clone, lazy via SessionStart)
#   <DIR>/.gitignore                    (.references/ added if missing)
#
# All file operations are idempotent. --uninstall reverses everything except
# the canonical / per-project reference clones (those are data; rm -rf if you
# don't want them).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_SHARED_REF_DIR="$HOME/.references/effect-v4"
BEGIN_MARK='<!-- claude-code-effect:begin -->'
END_MARK='<!-- claude-code-effect:end -->'

# --- arg parsing ---
mode="user"
project_dir=""
uninstall=0
while [[ $# -gt 0 ]]; do
	case "$1" in
		--project)
			mode="project"
			if [[ $# -gt 1 && "$2" != --* ]]; then
				project_dir="$(cd "$2" && pwd)"
				shift 2
			else
				project_dir="$(pwd)"
				shift
			fi
			;;
		--uninstall)
			uninstall=1
			shift
			;;
		-h|--help)
			sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			echo "error: unknown argument: $1" >&2
			exit 2
			;;
	esac
done

# --- resolve paths based on mode ---
if [[ "$mode" == "user" ]]; then
	claude_dir="$HOME/.claude"
	claude_md="$claude_dir/CLAUDE.md"
else
	claude_dir="$project_dir/.claude"
	claude_md="$project_dir/CLAUDE.md"
fi
skills_dst="$claude_dir/skills"
settings_path="$claude_dir/settings.json"

session_start_cmd="bun run \"$REPO_ROOT/hooks/ensure-reference-clone.ts\""
post_tool_use_cmd="bun run \"$REPO_ROOT/hooks/pattern-feedback.ts\""

# --- helpers ---
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
		*) echo "" ;;
	esac
}

skill_link_install() {
	local linked=0
	mkdir -p "$skills_dst"
	for skill_dir in "$REPO_ROOT/skills"/*/; do
		local skill_name link
		skill_name="$(basename "$skill_dir")"
		link="$skills_dst/$skill_name"
		if [[ -L "$link" && "$(readlink "$link")" == "${skill_dir%/}" ]]; then
			continue
		fi
		if [[ -e "$link" || -L "$link" ]]; then
			echo "  skip $skill_name (existing non-matching entry at $link)" >&2
			continue
		fi
		ln -s "${skill_dir%/}" "$link"
		linked=$((linked + 1))
	done
	echo "  $linked new skill symlink(s)"
}

skill_link_uninstall() {
	local removed=0
	[[ -d "$skills_dst" ]] || { echo "  (skills dir absent)"; return; }
	for skill_dir in "$REPO_ROOT/skills"/*/; do
		local skill_name link
		skill_name="$(basename "$skill_dir")"
		link="$skills_dst/$skill_name"
		if [[ -L "$link" && "$(readlink "$link")" == "${skill_dir%/}" ]]; then
			rm "$link"
			removed=$((removed + 1))
		fi
	done
	echo "  $removed skill symlink(s) removed"
}

claude_md_install() {
	if [[ -f "$claude_md" ]] && grep -qF "$BEGIN_MARK" "$claude_md"; then
		echo "  fragment already present in $claude_md"
		return
	fi
	mkdir -p "$(dirname "$claude_md")"
	{
		[[ -f "$claude_md" ]] && [[ -n "$(tail -c1 "$claude_md" 2>/dev/null || true)" ]] && echo
		cat "$REPO_ROOT/claude-md/effect-fragment.md"
	} >> "$claude_md"
	echo "  fragment appended to $claude_md"
}

claude_md_uninstall() {
	[[ -f "$claude_md" ]] || { echo "  (no $claude_md)"; return; }
	awk -v begin="$BEGIN_MARK" -v end="$END_MARK" '
		BEGIN { skip = 0 }
		index($0, begin) { skip = 1; next }
		skip && index($0, end) { skip = 0; next }
		!skip { print }
	' "$claude_md" > "$claude_md.tmp" && mv "$claude_md.tmp" "$claude_md"
	echo "  fragment stripped from $claude_md"
}

settings_install() {
	bun run "$REPO_ROOT/scripts/lib/manage-settings.ts" install \
		"$settings_path" "$session_start_cmd" "$post_tool_use_cmd"
	echo "  hooks merged into $settings_path"
}

settings_uninstall() {
	if [[ ! -f "$settings_path" ]]; then
		echo "  (no $settings_path)"
		return
	fi
	bun run "$REPO_ROOT/scripts/lib/manage-settings.ts" uninstall "$settings_path"
	echo "  claude-code-effect entries stripped from $settings_path"
}

shared_ref_install() {
	local rc_file
	rc_file="$(detect_rc_file)"
	if [[ -z "$rc_file" ]]; then
		echo "  unsupported shell '${SHELL:-unknown}'; set CLAUDE_CODE_EFFECT_REFERENCE_DIR manually:" >&2
		echo "    export CLAUDE_CODE_EFFECT_REFERENCE_DIR=\"$DEFAULT_SHARED_REF_DIR\"" >&2
		return
	fi

	local export_line="export CLAUDE_CODE_EFFECT_REFERENCE_DIR=\"$DEFAULT_SHARED_REF_DIR\""
	if [[ -f "$rc_file" ]] && grep -qF "$export_line" "$rc_file"; then
		echo "  export already present in $rc_file"
	else
		{
			[[ -f "$rc_file" ]] && [[ -n "$(tail -c1 "$rc_file" 2>/dev/null || true)" ]] && echo
			echo "# claude-code-effect: shared Effect reference clone"
			echo "$export_line"
		} >> "$rc_file"
		echo "  appended export to $rc_file"
	fi

	export CLAUDE_CODE_EFFECT_REFERENCE_DIR="$DEFAULT_SHARED_REF_DIR"
	mkdir -p "$(dirname "$DEFAULT_SHARED_REF_DIR")"

	if [[ -f "$DEFAULT_SHARED_REF_DIR/.claude-code-effect-version" ]]; then
		local tag
		tag="$(cat "$DEFAULT_SHARED_REF_DIR/.claude-code-effect-version")"
		echo "  canonical clone already present ($tag)"
		return
	fi

	echo "  warming canonical clone (this may take ~30s)..."
	local warm_dir
	warm_dir="$(mktemp -d)"
	echo "{\"cwd\":\"$warm_dir\",\"hook_event_name\":\"SessionStart\"}" \
		| bun run "$REPO_ROOT/hooks/ensure-reference-clone.ts" || true
	rm -rf "$warm_dir"
	if [[ -f "$DEFAULT_SHARED_REF_DIR/.claude-code-effect-version" ]]; then
		local tag
		tag="$(cat "$DEFAULT_SHARED_REF_DIR/.claude-code-effect-version")"
		echo "  canonical clone ready at $DEFAULT_SHARED_REF_DIR ($tag)"
	else
		echo "  warm clone did not complete; SessionStart hook will retry on next Claude Code session" >&2
	fi
}

shared_ref_uninstall() {
	local rc_file
	rc_file="$(detect_rc_file)"
	if [[ -z "$rc_file" || ! -f "$rc_file" ]]; then
		echo "  (no rc file to clean)"
		return
	fi
	local export_line="export CLAUDE_CODE_EFFECT_REFERENCE_DIR=\"$DEFAULT_SHARED_REF_DIR\""
	if grep -qF "$export_line" "$rc_file"; then
		# Remove our two-line block (header comment + export). Use sed with a
		# fixed pattern to avoid touching anything else.
		local marker_comment="# claude-code-effect: shared Effect reference clone"
		awk -v marker="$marker_comment" -v export_line="$export_line" '
			{
				if ($0 == marker) { skip = 1; next }
				if (skip == 1 && $0 == export_line) { skip = 0; next }
				print
			}
		' "$rc_file" > "$rc_file.tmp" && mv "$rc_file.tmp" "$rc_file"
		echo "  export removed from $rc_file (canonical clone preserved at $DEFAULT_SHARED_REF_DIR)"
	else
		echo "  no export line in $rc_file"
	fi
}

gitignore_install() {
	local gi="$project_dir/.gitignore"
	if [[ -f "$gi" ]] && grep -qE '^\.references/?$' "$gi"; then
		echo "  .references/ already in $gi"
		return
	fi
	{
		[[ -f "$gi" ]] && [[ -n "$(tail -c1 "$gi" 2>/dev/null || true)" ]] && echo
		echo ".references/"
	} >> "$gi"
	echo "  .references/ appended to $gi"
}

# --- execute ---
echo "claude-code-effect: ${uninstall:+un}install ($mode mode)"
echo "  repo:   $REPO_ROOT"
echo "  target: $claude_dir"
echo

if [[ "$uninstall" == "1" ]]; then
	echo "[1] removing skill symlinks"
	skill_link_uninstall
	echo "[2] stripping CLAUDE.md fragment"
	claude_md_uninstall
	echo "[3] stripping hook entries from settings.json"
	settings_uninstall
	if [[ "$mode" == "user" ]]; then
		echo "[4] removing shared reference export from shell rc"
		shared_ref_uninstall
	fi
	echo
	echo "uninstalled. The reference clone (if any) is preserved as data;"
	echo "remove it manually if no longer wanted."
	exit 0
fi

echo "[1] linking skills"
skill_link_install
echo "[2] appending CLAUDE.md fragment"
claude_md_install
echo "[3] merging hook entries into settings.json"
settings_install
if [[ "$mode" == "user" ]]; then
	echo "[4] setting up shared reference clone"
	shared_ref_install
else
	echo "[4] adding .references/ to .gitignore"
	gitignore_install
fi

echo
if [[ "$mode" == "user" ]]; then
	cat <<NOTE
Done. Open a new shell (or run 'source $(detect_rc_file)') to pick up the env
var, then start a Claude Code session in any Effect project. The SessionStart
hook will create a symlink at <project>/.references/effect-v4 pointing at
$DEFAULT_SHARED_REF_DIR.

Cost note: the PostToolUse hook fires on every Edit/Write in every project,
including non-Effect ones. In a non-Effect repo it adds ~50–100ms per Edit
(bun startup + a no-match pattern run). For Actuate-style Effect-heavy work
this is the right tradeoff. Run with --project instead to scope to one repo.
NOTE
else
	cat <<NOTE
Done. Start a Claude Code session in $project_dir. The SessionStart hook will
clone Effect-TS/effect-smol into $project_dir/.references/effect-v4 (≈30s,
one-time, fail-silent).
NOTE
fi
