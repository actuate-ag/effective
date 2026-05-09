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
 * binary) on install. If the user doesn't have `~/.local/bin` on PATH,
 * the global binary won't be found at run time — they can run the audit
 * CLI directly via `bun run <repo>/scripts/audit.ts` instead.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SCRIPT_KEY = 'audit:effect';
const SCRIPT_VALUE = 'effect-audit';

interface PackageJson {
	readonly scripts?: Record<string, string>;
	readonly [key: string]: unknown;
}

const readPackage = (path: string): PackageJson => {
	if (!existsSync(path)) {
		process.stderr.write(`manage-package-script: ${path} does not exist\n`);
		process.exit(1);
	}
	try {
		const raw = readFileSync(path, 'utf8');
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? (parsed as PackageJson) : {};
	} catch (err) {
		process.stderr.write(
			`manage-package-script: failed to parse ${path}: ${
				err instanceof Error ? err.message : String(err)
			}\n`,
		);
		process.exit(1);
	}
};

const writePackage = (path: string, pkg: PackageJson): void => {
	writeFileSync(path, JSON.stringify(pkg, null, '\t') + '\n', 'utf8');
};

const install = (path: string): void => {
	const pkg = readPackage(path);
	const scripts: Record<string, string> = { ...(pkg.scripts ?? {}) };
	scripts[SCRIPT_KEY] = SCRIPT_VALUE;
	const next: PackageJson = { ...pkg, scripts };
	writePackage(path, next);
};

const uninstall = (path: string): void => {
	if (!existsSync(path)) return;
	const pkg = readPackage(path);
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
	writePackage(path, next);
};

const main = (): void => {
	const [subcommand, packagePath] = process.argv.slice(2);
	if (subcommand === 'install' && packagePath !== undefined) {
		install(packagePath);
		return;
	}
	if (subcommand === 'uninstall' && packagePath !== undefined) {
		uninstall(packagePath);
		return;
	}
	process.stderr.write(
		'usage: manage-package-script.ts install <package.json> <repo-root>\n' +
			'       manage-package-script.ts uninstall <package.json>\n',
	);
	process.exit(2);
};

main();
