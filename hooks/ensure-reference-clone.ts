#!/usr/bin/env bun
/**
 * SessionStart hook: ensure .references/effect-v4/ is a shallow clone of
 * Effect-TS/effect-smol at the tag matching the project's installed effect
 * version.
 *
 * Reads the standard Claude Code hook payload from stdin (JSON with `cwd`).
 * Runs the clone synchronously off the main thread (this is a child process,
 * not the agent). Always exits 0; surfaces a one-line stderr note on failure
 * but never blocks the session.
 */

import { detectEffectVersion } from '../src/reference/version.ts';
import { ensureReferenceClone } from '../src/reference/clone.ts';

interface HookInput {
	readonly cwd?: string;
	readonly hook_event_name?: string;
}

const readStdin = async (): Promise<string> => {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks).toString('utf8');
};

const main = async () => {
	let payload: HookInput = {};
	try {
		const raw = await readStdin();
		if (raw.trim() !== '') payload = JSON.parse(raw) as HookInput;
	} catch {
		// Empty or malformed input — fall back to cwd from env
	}

	const cwd = payload.cwd ?? process.cwd();
	const version = detectEffectVersion(cwd);
	const ok = ensureReferenceClone(cwd, version);
	if (!ok) {
		process.stderr.write(
			`claude-code-effect: reference clone unavailable (effect@${version}); the agent will continue without .references/effect-v4/\n`
		);
	}
	process.exit(0);
};

void main();
