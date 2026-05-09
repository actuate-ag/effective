#!/usr/bin/env bun
/**
 * PostToolUse hook: after Edit / Write / MultiEdit, run the pattern catalog
 * against the post-write file and surface any matches back to Claude in-band.
 *
 * Reads the standard Claude Code hook payload from stdin:
 *   {
 *     "session_id": "...",
 *     "cwd": "/abs/path",
 *     "hook_event_name": "PostToolUse",
 *     "tool_name": "Edit" | "Write" | "MultiEdit",
 *     "tool_input": { "file_path": "/abs/path/to/file.ts", ... },
 *     "tool_response": { ... }
 *   }
 *
 * Emits to stdout:
 *   {"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…"}}
 *
 * Always exits 0; failures go to stderr only and never block the session.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatFeedback } from '../src/audit/format/claude-hook.ts';
import { loadPatterns } from '../src/patterns/load.ts';
import { patternMatches } from '../src/patterns/match.ts';
import type { Pattern } from '../src/patterns/types.ts';

interface HookInput {
	readonly cwd?: string;
	readonly tool_name?: string;
	readonly tool_input?: { readonly file_path?: string };
}

const READ_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const readStdin = async (): Promise<string> => {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString('utf8');
};

const resolvePatternsDir = (): string => {
	const fromEnv = process.env.CLAUDE_CODE_EFFECT_PATTERNS_DIR;
	if (fromEnv !== undefined && fromEnv !== '' && existsSync(fromEnv)) {
		return fromEnv;
	}
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
	if (pluginRoot !== undefined && pluginRoot !== '') {
		const dir = join(pluginRoot, 'patterns');
		if (existsSync(dir)) return dir;
	}
	const here = dirname(fileURLToPath(import.meta.url));
	const sibling = resolve(here, '..', 'patterns');
	return sibling;
};

const resolveFilePath = (cwd: string, raw: string | undefined): string | undefined => {
	if (raw === undefined || raw === '') return undefined;
	return isAbsolute(raw) ? raw : resolve(cwd, raw);
};

const main = async () => {
	let payload: HookInput = {};
	try {
		const raw = await readStdin();
		if (raw.trim() !== '') payload = JSON.parse(raw) as HookInput;
	} catch {
		process.exit(0);
	}

	const toolName = payload.tool_name ?? '';
	if (!READ_TOOLS.has(toolName)) {
		process.exit(0);
	}

	const cwd = payload.cwd ?? process.cwd();
	const filePath = resolveFilePath(cwd, payload.tool_input?.file_path);
	if (filePath === undefined || !existsSync(filePath)) {
		process.exit(0);
	}

	let source: string;
	try {
		source = readFileSync(filePath, 'utf8');
	} catch {
		process.exit(0);
	}

	const patternsDir = resolvePatternsDir();
	let patterns: ReadonlyArray<Pattern>;
	try {
		patterns = loadPatterns(patternsDir);
	} catch (err) {
		process.stderr.write(
			`claude-code-effect: failed to load patterns from ${patternsDir}: ${
				err instanceof Error ? err.message : String(err)
			}\n`,
		);
		process.exit(0);
	}

	const matched = patterns.filter((p) => patternMatches(p, toolName, filePath, source));
	if (matched.length === 0) {
		process.exit(0);
	}

	const additionalContext = formatFeedback(matched, filePath);
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: 'PostToolUse',
				additionalContext,
			},
		}),
	);
	process.exit(0);
};

void main();
