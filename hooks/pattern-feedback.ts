#!/usr/bin/env bun
/**
 * PostToolUse hook: after Edit / Write / MultiEdit / NotebookEdit, run the
 * pattern catalog against the post-write file and surface any matches back
 * to Claude in-band via hookSpecificOutput.additionalContext.
 *
 * Always exits 0; failures go to stderr only and never block the session.
 */

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, HashSet, Path, Schema } from 'effect';
import * as Option from 'effect/Option';

import { formatFeedback } from '../src/audit/format/claude-hook.ts';
import { matchedPatternsForFile } from '../src/audit/runner.ts';
import { loadPatterns } from '../src/patterns/load.ts';

class HookInput extends Schema.Class<HookInput>('HookInput')({
	cwd: Schema.optionalKey(Schema.String),
	tool_name: Schema.optionalKey(Schema.String),
	tool_input: Schema.optionalKey(
		Schema.Struct({ file_path: Schema.optionalKey(Schema.String) }),
	),
}) {}

const decodeHookInput = Schema.decodeUnknownEffect(Schema.fromJsonString(HookInput));

const READ_TOOLS = HashSet.fromIterable(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const readStdinText: Effect.Effect<string> = Effect.tryPromise({
	try: () => Bun.stdin.text(),
	catch: () => null,
}).pipe(Effect.catch(() => Effect.succeed('')));

const resolvePatternsDir = Effect.gen(function*() {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	const fromEnv = process.env.CLAUDE_CODE_EFFECT_PATTERNS_DIR;
	if (fromEnv !== undefined && fromEnv !== '') {
		const ok = yield* fs.exists(fromEnv).pipe(Effect.catch(() => Effect.succeed(false)));
		if (ok) return fromEnv;
	}
	const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
	if (pluginRoot !== undefined && pluginRoot !== '') {
		const dir = path.join(pluginRoot, 'patterns');
		const ok = yield* fs.exists(dir).pipe(Effect.catch(() => Effect.succeed(false)));
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
	const fileExists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
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
