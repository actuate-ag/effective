#!/usr/bin/env bun
/**
 * manage-package-script.ts — install or uninstall the `audit:effect` script
 * in a project's package.json.
 *
 * Usage:
 *   manage-package-script.ts install   <package.json> <repo-root>
 *   manage-package-script.ts uninstall <package.json>
 *
 * Idempotent. Sets `scripts['audit:effect']` to `effect-audit` (the global
 * binary) on install.
 */

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, pipe } from 'effect';
import * as Option from 'effect/Option';

const SCRIPT_KEY = 'audit:effect';
const SCRIPT_VALUE = 'effect-audit';

interface PackageJson {
	readonly scripts?: Record<string, string>;
	readonly [key: string]: unknown;
}

const failExit = (message: string, code: number): Effect.Effect<never> =>
	Effect.sync(() => {
		process.stderr.write(`manage-package-script: ${message}\n`);
		process.exit(code);
	});

const readPackage = (path: string): Effect.Effect<PackageJson, never, FileSystem.FileSystem> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(path).pipe(
			Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
		);
		if (!exists) return yield* failExit(`${path} does not exist`, 1);

		const rawOpt = yield* fs.readFileString(path).pipe(
			Effect.match({
				onFailure: () => Option.none<string>(),
				onSuccess: Option.some,
			}),
		);
		if (Option.isNone(rawOpt)) return yield* failExit(`failed to read ${path}`, 1);

		const parsed = yield* Effect.try({
			try: (): unknown => JSON.parse(rawOpt.value),
			catch: (cause) => String(cause),
		}).pipe(
			Effect.match({
				onFailure: (msg) => Option.none<unknown>().pipe((_) => ({ ok: false as const, msg })),
				onSuccess: (v) => ({ ok: true as const, value: v }),
			}),
		);
		if (!parsed.ok) return yield* failExit(`failed to parse ${path}: ${parsed.msg}`, 1);

		return typeof parsed.value === 'object' && parsed.value !== null
			? (parsed.value as PackageJson)
			: ({} as PackageJson);
	});

const writePackage = (
	path: string,
	pkg: PackageJson,
): Effect.Effect<void, never, FileSystem.FileSystem> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		yield* fs.writeFileString(path, JSON.stringify(pkg, null, '\t') + '\n').pipe(
			Effect.match({
				onFailure: () => false,
				onSuccess: () => true,
			}),
		);
	});

const install = (path: string): Effect.Effect<void, never, FileSystem.FileSystem> =>
	pipe(
		readPackage(path),
		Effect.map((pkg) => {
			const scripts: Record<string, string> = { ...(pkg.scripts ?? {}) };
			scripts[SCRIPT_KEY] = SCRIPT_VALUE;
			const next: PackageJson = { ...pkg, scripts };
			return next;
		}),
		Effect.flatMap((next) => writePackage(path, next)),
	);

const uninstall = (path: string): Effect.Effect<void, never, FileSystem.FileSystem> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(path).pipe(
			Effect.match({ onFailure: () => false, onSuccess: (b) => b }),
		);
		if (!exists) return;

		const pkg = yield* readPackage(path);
		if (pkg.scripts === undefined) return;

		const { [SCRIPT_KEY]: _removed, ...rest } = pkg.scripts;
		void _removed;
		const next: PackageJson = Object.keys(rest).length === 0
			? (() => {
				const { scripts: _, ...others } = pkg;
				void _;
				return others;
			})()
			: { ...pkg, scripts: rest };
		yield* writePackage(path, next);
	});

const program = Effect.gen(function*() {
	const [subcommand, packagePath] = process.argv.slice(2);
	if (subcommand === 'install' && packagePath !== undefined) {
		yield* install(packagePath);
		return;
	}
	if (subcommand === 'uninstall' && packagePath !== undefined) {
		yield* uninstall(packagePath);
		return;
	}
	yield* failExit(
		'usage: manage-package-script.ts install <package.json> <repo-root>\n' +
			'       manage-package-script.ts uninstall <package.json>',
		2,
	);
});

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
