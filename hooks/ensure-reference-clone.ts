#!/usr/bin/env bun
/**
 * SessionStart hook: ensure .references/effect-v4/ is a shallow clone of
 * Effect-TS/effect-smol at the tag matching the project's installed effect
 * version.
 *
 * Reads the standard Claude Code hook payload from stdin (JSON with `cwd`).
 * Always exits 0; surfaces a one-line stderr note on failure but never
 * blocks the session.
 */

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, pipe, Schema } from 'effect';
import * as Option from 'effect/Option';

import { ensureReferenceClone } from '../src/reference/clone.ts';
import { detectEffectVersion } from '../src/reference/version.ts';

class HookInput extends Schema.Class<HookInput>('HookInput')({
	cwd: Schema.optionalKey(Schema.String),
	hook_event_name: Schema.optionalKey(Schema.String),
}) {}

const decodeHookInput = Schema.decodeUnknownEffect(Schema.fromJsonString(HookInput));

const readStdinText: Effect.Effect<string> = Effect.tryPromise({
	try: () => Bun.stdin.text(),
	catch: () => null,
}).pipe(Effect.match({ onFailure: () => '', onSuccess: (s) => s }));

const program = Effect.gen(function*() {
	const raw = yield* readStdinText;
	const parsed = raw.trim() === ''
		? Option.none<HookInput>()
		: yield* decodeHookInput(raw).pipe(
			Effect.match({
				onFailure: () => Option.none<HookInput>(),
				onSuccess: Option.some,
			}),
		);

	const cwd = pipe(
		parsed,
		Option.flatMap((input) => Option.fromNullishOr(input.cwd)),
		Option.getOrElse(() => process.cwd()),
	);

	const version = yield* detectEffectVersion(cwd);
	const ok = yield* ensureReferenceClone(cwd, version);
	if (!ok) {
		yield* Console.error(
			`claude-code-effect: reference clone unavailable (effect@${version}); the agent will continue without .references/effect-v4/`,
		);
	}
}).pipe(Effect.ignore);

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
