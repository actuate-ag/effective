import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_EFFECT_VERSION = '4.0.0-beta.59';
export const EFFECT_SMOL_REPO =
	'https://github.com/Effect-TS/effect-smol.git';

/**
 * Detect the installed Effect version from a project's node_modules.
 * Falls back to DEFAULT_EFFECT_VERSION when Effect is not installed.
 */
export const detectEffectVersion = (projectDir: string): string => {
	const pkgPath = join(projectDir, 'node_modules', 'effect', 'package.json');
	if (!existsSync(pkgPath)) return DEFAULT_EFFECT_VERSION;
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
			version?: string;
		};
		return pkg.version ?? DEFAULT_EFFECT_VERSION;
	} catch {
		return DEFAULT_EFFECT_VERSION;
	}
};
