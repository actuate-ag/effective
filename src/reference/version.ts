import { Effect, FileSystem, Path, pipe, Schema } from 'effect';
import * as Option from 'effect/Option';

export const DEFAULT_EFFECT_VERSION = '4.0.0-beta.59';
export const EFFECT_SMOL_REPO = 'https://github.com/Effect-TS/effect-smol.git';

class EffectPackageJson extends Schema.Class<EffectPackageJson>('EffectPackageJson')({
	version: Schema.optionalKey(Schema.String),
}) {}

/**
 * Detect the installed Effect version from a project's node_modules.
 * Falls back to DEFAULT_EFFECT_VERSION when:
 *  - the file is missing
 *  - the file is unreadable
 *  - the file is malformed JSON
 *  - the file lacks a `version` field
 *
 * The fallback semantic mirrors the original sync version; the function
 * itself is fail-silent so a missing reference doesn't block a session.
 */
export const detectEffectVersion = (
	projectDir: string,
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const pkgPath = path.join(projectDir, 'node_modules', 'effect', 'package.json');

		const content = yield* fs.readFileString(pkgPath).pipe(
			Effect.match({
				onFailure: () => Option.none<string>(),
				onSuccess: Option.some,
			}),
		);
		if (Option.isNone(content)) return DEFAULT_EFFECT_VERSION;

		const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(EffectPackageJson))(
			content.value,
		).pipe(
			Effect.match({
				onFailure: () => Option.none<EffectPackageJson>(),
				onSuccess: Option.some,
			}),
		);
		return pipe(
			decoded,
			Option.flatMap((pkg) =>
				pkg.version === undefined ? Option.none<string>() : Option.some(pkg.version)
			),
			Option.getOrElse(() => DEFAULT_EFFECT_VERSION),
		);
	});
