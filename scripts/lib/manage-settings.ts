#!/usr/bin/env bun
/**
 * manage-settings.ts — install or uninstall claude-code-effect hook entries
 * in a Claude Code settings.json file.
 *
 * Usage:
 *   manage-settings.ts install   <settings.json>  <session-start-cmd>  <post-tool-use-cmd>
 *   manage-settings.ts uninstall <settings.json>
 *
 * Idempotent. Uses the substring "claude-code-effect" in a hook command as
 * the marker for our entries — adding new entries strips any existing ones
 * first, so re-running install picks up command-path changes cleanly.
 *
 * Preserves all other settings (model, theme, env, statusLine, permissions, etc.)
 * and any third-party hook entries that don't reference claude-code-effect.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MARKER = 'claude-code-effect';

interface HookCommand {
	readonly type: 'command';
	readonly command: string;
}

interface HookEntry {
	readonly matcher?: string;
	readonly hooks: ReadonlyArray<HookCommand>;
}

interface HooksByEvent {
	readonly [event: string]: ReadonlyArray<HookEntry>;
}

interface Settings {
	readonly hooks?: HooksByEvent;
	readonly [key: string]: unknown;
}

const isHookCommand = (v: unknown): v is HookCommand =>
	typeof v === 'object' && v !== null && (v as HookCommand).type === 'command' &&
	typeof (v as HookCommand).command === 'string';

const isHookEntry = (v: unknown): v is HookEntry =>
	typeof v === 'object' && v !== null && Array.isArray((v as HookEntry).hooks) &&
	(v as HookEntry).hooks.every(isHookCommand);

const stripOurEntries = (entries: ReadonlyArray<unknown>): HookEntry[] => {
	const out: HookEntry[] = [];
	for (const entry of entries) {
		if (!isHookEntry(entry)) continue;
		const filteredHooks = entry.hooks.filter((h) => !h.command.includes(MARKER));
		if (filteredHooks.length === 0) continue;
		const next: HookEntry = entry.matcher !== undefined
			? { matcher: entry.matcher, hooks: filteredHooks }
			: { hooks: filteredHooks };
		out.push(next);
	}
	return out;
};

const readSettings = (path: string): Settings => {
	if (!existsSync(path)) return {};
	try {
		const raw = readFileSync(path, 'utf8').trim();
		if (raw === '') return {};
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? (parsed as Settings) : {};
	} catch (err) {
		process.stderr.write(
			`manage-settings: failed to parse ${path}: ${
				err instanceof Error ? err.message : String(err)
			}\n`,
		);
		process.exit(1);
	}
};

const writeSettings = (path: string, settings: Settings): void => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(settings, null, '\t') + '\n', 'utf8');
};

const install = (
	settingsPath: string,
	sessionStartCmd: string,
	postToolUseCmd: string,
): void => {
	const current = readSettings(settingsPath);
	const currentHooks: HooksByEvent = current.hooks ?? {};
	const sessionStart = stripOurEntries(currentHooks.SessionStart ?? []);
	const postToolUse = stripOurEntries(currentHooks.PostToolUse ?? []);

	sessionStart.push({
		hooks: [{ type: 'command', command: sessionStartCmd }],
	});
	postToolUse.push({
		matcher: 'Edit|Write|MultiEdit|NotebookEdit',
		hooks: [{ type: 'command', command: postToolUseCmd }],
	});

	const nextHooks: HooksByEvent = {
		...currentHooks,
		SessionStart: sessionStart,
		PostToolUse: postToolUse,
	};
	const next: Settings = { ...current, hooks: nextHooks };
	writeSettings(settingsPath, next);
};

const uninstall = (settingsPath: string): void => {
	if (!existsSync(settingsPath)) return;
	const current = readSettings(settingsPath);
	const currentHooks: HooksByEvent = current.hooks ?? {};

	const nextHooks: { [event: string]: ReadonlyArray<HookEntry> } = {};
	for (const [event, entries] of Object.entries(currentHooks)) {
		const stripped = stripOurEntries(entries);
		if (stripped.length > 0) nextHooks[event] = stripped;
	}

	const { hooks: _, ...rest } = current;
	const next: Settings = Object.keys(nextHooks).length === 0
		? rest
		: { ...rest, hooks: nextHooks };
	writeSettings(settingsPath, next);
};

const main = (): void => {
	const [subcommand, settingsPath, ...rest] = process.argv.slice(2);
	if (subcommand === 'install' && settingsPath !== undefined && rest.length === 2) {
		install(settingsPath, rest[0]!, rest[1]!);
		return;
	}
	if (subcommand === 'uninstall' && settingsPath !== undefined) {
		uninstall(settingsPath);
		return;
	}
	process.stderr.write(
		'usage: manage-settings.ts install <settings.json> <session-start-cmd> <post-tool-use-cmd>\n' +
			'       manage-settings.ts uninstall <settings.json>\n',
	);
	process.exit(2);
};

main();
