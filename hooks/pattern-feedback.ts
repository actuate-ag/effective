#!/usr/bin/env bun
/**
 * PostToolUse hook: after Edit / Write / MultiEdit / NotebookEdit, run the
 * pattern catalog against the post-write file and surface any matches back
 * to Claude in-band via hookSpecificOutput.additionalContext.
 *
 * Always exits 0; failures go to stderr only and never block the session.
 */

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Config, Effect, FileSystem, HashSet, Path, Schema } from 'effect';
import * as Option from 'effect/Option';

import { formatFeedback } from '../src/audit/format/claude-hook.ts';
import { matchedPatternsForFile } from '../src/audit/runner.ts';
import { loadPatterns } from '../src/patterns/load.ts';

class HookToolInput extends Schema.Class<HookToolInput>('HookToolInput')({
	file_path: Schema.optionalKey(Schema.String),
}) {}

class HookInput extends Schema.Class<HookInput>('HookInput')({
	cwd: Schema.optionalKey(Schema.String),
	tool_name: Schema.optionalKey(Schema.String),
	tool_input: Schema.optionalKey(HookToolInput),
}) {}

const decodeHookInput = Schema.decodeUnknownEffect(Schema.fromJsonString(HookInput));

const READ_TOOLS = HashSet.fromIterable(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const readStdinText: Effect.Effect<string> = Effect.tryPromise({
	try: () => Bun.stdin.text(),
	catch: () => null,
}).pipe(Effect.match({ onFailure: () => '', onSuccess: (s) => s }));

const readEnvOption = (name: string): Effect.Effect<Option.Option<string>> =>
	Effect.gen(function*() {
		const opt = yield* Config.option(Config.string(name));
		return Option.flatMap(opt, (s) => (s === '' ? Option.none<string>() : Option.some(s)));
	}).pipe(Effect.match({ onFailure: () => Option.none<string>(), onSuccess: (o) => o }));

const resolvePatternsDir = Effect.gen(function*() {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	const fromEnv = yield* readEnvOption('CLAUDE_CODE_EFFECT_PATTERNS_DIR');
	if (Option.isSome(fromEnv)) {
		const ok = yield* fs.exists(fromEnv.value).pipe(
			Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
		);
		if (ok) return fromEnv.value;
	}
	const pluginRoot = yield* readEnvOption('CLAUDE_PLUGIN_ROOT');
	if (Option.isSome(pluginRoot)) {
		const dir = path.join(pluginRoot.value, 'patterns');
		const ok = yield* fs.exists(dir).pipe(
			Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
		);
		if (ok) return dir;
	}
	const here = path.dirname(new URL(import.meta.url).pathname);
	return path.resolve(here, '..', 'patterns');
});

const program = Effect.gen(function*() {
	const raw = yield* readStdinText;
	if (raw.trim() === '') return;

	const inputOpt = yield* decodeHookInput(raw).pipe(
		Effect.match({
			onFailure: () => Option.none<HookInput>(),
			onSuccess: Option.some,
		}),
	);
	if (Option.isNone(inputOpt)) return;
	const input = inputOpt.value;

	const toolName = input.tool_name ?? '';
	if (!HashSet.has(READ_TOOLS, toolName)) return;

	const cwd = input.cwd ?? process.cwd();
	const filePathRaw = input.tool_input?.file_path;
	if (filePathRaw === undefined || filePathRaw === '') return;

	const path = yield* Path.Path;
	const filePath = path.isAbsolute(filePathRaw) ? filePathRaw : path.resolve(cwd, filePathRaw);

	const fs = yield* FileSystem.FileSystem;
	const fileExists = yield* fs.exists(filePath).pipe(
		Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
	);
	if (!fileExists) return;

	const sourceOpt = yield* fs.readFileString(filePath).pipe(
		Effect.match({
			onFailure: () => Option.none<string>(),
			onSuccess: Option.some,
		}),
	);
	if (Option.isNone(sourceOpt)) return;
	const source = sourceOpt.value;

	const patternsDir = yield* resolvePatternsDir;
	const patterns = yield* loadPatterns(patternsDir);
	const matched = yield* matchedPatternsForFile(patterns, toolName, filePath, source);
	if (matched.length === 0) return;

	const additionalContext = formatFeedback(matched, filePath);
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: 'PostToolUse',
				additionalContext,
			},
		}),
	);
}).pipe(Effect.catch(() => Effect.void));

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
