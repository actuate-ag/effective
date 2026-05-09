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
 * Preserves all other settings (model, theme, env, statusLine, permissions,
 * etc.) and any third-party hook entries that don't reference claude-code-effect.
 */

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Path, pipe } from 'effect';
import * as Arr from 'effect/Array';
import * as Option from 'effect/Option';
import * as Record_ from 'effect/Record';
import * as Result from 'effect/Result';

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

const stripOurEntries = (entries: ReadonlyArray<unknown>): ReadonlyArray<HookEntry> =>
	pipe(
		entries,
		Arr.filterMap((entry) => {
			if (!isHookEntry(entry)) return Result.failVoid;
			const filteredHooks = entry.hooks.filter((h) => !h.command.includes(MARKER));
			if (filteredHooks.length === 0) return Result.failVoid;
			const next: HookEntry = entry.matcher !== undefined
				? { matcher: entry.matcher, hooks: filteredHooks }
				: { hooks: filteredHooks };
			return Result.succeed(next);
		}),
	);

const failExit = (message: string, code: number): Effect.Effect<never> =>
	Effect.sync(() => {
		process.stderr.write(`manage-settings: ${message}\n`);
		process.exit(code);
	});

const readSettings = (path: string): Effect.Effect<Settings, never, FileSystem.FileSystem> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(path).pipe(
			Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
		);
		if (!exists) return {} as Settings;

		const rawOpt = yield* fs.readFileString(path).pipe(
			Effect.match({
				onFailure: () => Option.none<string>(),
				onSuccess: Option.some,
			}),
		);
		if (Option.isNone(rawOpt) || rawOpt.value.trim() === '') return {} as Settings;

		const parsed = yield* Effect.try({
			try: (): unknown => JSON.parse(rawOpt.value),
			catch: (cause) => String(cause),
		}).pipe(
			Effect.match({
				onFailure: (msg) => ({ ok: false as const, msg }),
				onSuccess: (value) => ({ ok: true as const, value }),
			}),
		);
		if (!parsed.ok) return yield* failExit(`failed to parse ${path}: ${parsed.msg}`, 1);

		return typeof parsed.value === 'object' && parsed.value !== null
			? (parsed.value as Settings)
			: ({} as Settings);
	});

const writeSettings = (
	path: string,
	settings: Settings,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const p = yield* Path.Path;
		yield* fs.makeDirectory(p.dirname(path), { recursive: true }).pipe(Effect.ignore);
		yield* fs.writeFileString(path, JSON.stringify(settings, null, '\t') + '\n').pipe(
			Effect.match({ onFailure: () => false, onSuccess: () => true }),
		);
	});

const install = (
	settingsPath: string,
	sessionStartCmd: string,
	postToolUseCmd: string,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function*() {
		const current = yield* readSettings(settingsPath);
		const currentHooks: HooksByEvent = current.hooks ?? {};
		const sessionStart = [
			...stripOurEntries(currentHooks.SessionStart ?? []),
			{ hooks: [{ type: 'command' as const, command: sessionStartCmd }] },
		];
		const postToolUse = [
			...stripOurEntries(currentHooks.PostToolUse ?? []),
			{
				matcher: 'Edit|Write|MultiEdit|NotebookEdit',
				hooks: [{ type: 'command' as const, command: postToolUseCmd }],
			},
		];

		const nextHooks: HooksByEvent = {
			...currentHooks,
			SessionStart: sessionStart,
			PostToolUse: postToolUse,
		};
		const next: Settings = { ...current, hooks: nextHooks };
		yield* writeSettings(settingsPath, next);
	});

const uninstall = (
	settingsPath: string,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(settingsPath).pipe(
			Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
		);
		if (!exists) return;

		const current = yield* readSettings(settingsPath);
		const currentHooks: HooksByEvent = current.hooks ?? {};

		const nextHooks: HooksByEvent = pipe(
			Record_.toEntries(currentHooks),
			Arr.filterMap(([event, entries]) => {
				const stripped = stripOurEntries(entries);
				return stripped.length > 0
					? Result.succeed([event, stripped] as const)
					: Result.failVoid;
			}),
			Object.fromEntries,
		);

		const { hooks: _, ...rest } = current;
		void _;
		const next: Settings = Object.keys(nextHooks).length === 0
			? rest
			: { ...rest, hooks: nextHooks };
		yield* writeSettings(settingsPath, next);
	});

const program = Effect.gen(function*() {
	const [subcommand, settingsPath, sessionStartCmd, postToolUseCmd] = process.argv.slice(2);
	if (
		subcommand === 'install' &&
		settingsPath !== undefined &&
		sessionStartCmd !== undefined &&
		postToolUseCmd !== undefined
	) {
		yield* install(settingsPath, sessionStartCmd, postToolUseCmd);
		return;
	}
	if (subcommand === 'uninstall' && settingsPath !== undefined) {
		yield* uninstall(settingsPath);
		return;
	}
	yield* failExit(
		'usage: manage-settings.ts install <settings.json> <session-start-cmd> <post-tool-use-cmd>\n' +
			'       manage-settings.ts uninstall <settings.json>',
		2,
	);
});

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
