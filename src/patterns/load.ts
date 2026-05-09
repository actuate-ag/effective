import type { Rule as AstGrepRuleDefinition } from '@ast-grep/napi';

import { Effect, FileSystem, Order, Path, pipe } from 'effect';
import * as Arr from 'effect/Array';
import * as Option from 'effect/Option';

import { extractBody, parseFrontmatter } from './frontmatter.ts';
import type { AstDetector, Detector, Pattern, RegexDetector, Severity } from './types.ts';

const SKIPPED_PREFIXES = ['readme', 'index'];

const isSkippedFile = (name: string): boolean => {
	const lower = name.toLowerCase();
	return SKIPPED_PREFIXES.some((p) => lower === `${p}.md` || lower.startsWith(`${p}.`));
};

const stringValue = (raw: unknown): Option.Option<string> =>
	typeof raw === 'string' ? Option.some(raw) : Option.none();

const stringArray = (raw: unknown): Option.Option<ReadonlyArray<string>> => {
	if (!Array.isArray(raw)) return Option.none();
	const strings = raw.filter((v): v is string => typeof v === 'string');
	return strings.length === raw.length ? Option.some(strings) : Option.none();
};

const isAstRule = (v: unknown): v is AstGrepRuleDefinition =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const astRuleList = (raw: unknown): Option.Option<ReadonlyArray<AstGrepRuleDefinition>> => {
	if (isAstRule(raw)) return Option.some([raw]);
	if (!Array.isArray(raw)) return Option.none();
	const rules = raw.filter(isAstRule);
	return rules.length === raw.length && rules.length > 0 ? Option.some(rules) : Option.none();
};

const astRuleRecord = (raw: unknown): Option.Option<Record<string, AstGrepRuleDefinition>> => {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return Option.none();
	const entries = Object.entries(raw as Record<string, unknown>);
	const valid = entries.filter(([, v]) => isAstRule(v)) as ReadonlyArray<
		[string, AstGrepRuleDefinition]
	>;
	return valid.length === entries.length
		? Option.some(Object.fromEntries(valid))
		: Option.none();
};

const patternStringList = (raw: unknown): Option.Option<ReadonlyArray<string>> => {
	if (typeof raw === 'string') return Option.some([raw]);
	return stringArray(raw);
};

const validRegex = (s: string): Effect.Effect<Option.Option<string>> =>
	Effect.try({
		try: () => new RegExp(s),
		catch: () => null,
	}).pipe(
		Effect.match({
			onFailure: () => Option.none<string>(),
			onSuccess: () => Option.some(s),
		}),
	);

const toSeverity = (raw: unknown): Severity =>
	pipe(
		stringValue(raw),
		Option.match({
			onNone: (): Severity => 'info',
			onSome: (s): Severity =>
				s === 'critical' || s === 'high' || s === 'medium' || s === 'warning' || s === 'info'
					? s
					: 'info',
		}),
	);

const toEvent = (raw: unknown): 'before' | 'after' =>
	pipe(
		stringValue(raw),
		Option.match({
			onNone: () => 'before' as const,
			onSome: (s) => (s.toLowerCase() === 'after' ? ('after' as const) : ('before' as const)),
		}),
	);

const toAstDetector = (raw: Record<string, unknown>): Option.Option<AstDetector> => {
	const ruleList = pipe(astRuleList(raw.rule), Option.orElse(() => astRuleList(raw.rules)));
	if (Option.isSome(ruleList)) {
		const constraints = astRuleRecord(raw.constraints);
		const det: AstDetector = {
			kind: 'ast',
			patterns: [],
			rules: ruleList.value,
			...(Option.isSome(constraints) ? { constraints: constraints.value } : {}),
		};
		return Option.some(det);
	}
	return pipe(
		patternStringList(raw.pattern),
		Option.filter((ps) => ps.length > 0),
		Option.map((patterns) => {
			const inside = stringValue(raw.inside);
			const det: AstDetector = {
				kind: 'ast',
				patterns,
				...(Option.isSome(inside) ? { inside: inside.value } : {}),
			};
			return det;
		}),
	);
};

const toRegexDetector = (
	raw: Record<string, unknown>,
): Effect.Effect<Option.Option<RegexDetector>> =>
	Effect.gen(function*() {
		const pat = stringValue(raw.pattern);
		if (Option.isNone(pat)) return Option.none<RegexDetector>();
		const valid = yield* validRegex(pat.value);
		if (Option.isNone(valid)) return Option.none<RegexDetector>();
		const det: RegexDetector = {
			kind: 'regex',
			pattern: pat.value,
			matchInComments: raw.matchInComments === true || raw.matchInComments === 'true',
		};
		return Option.some(det);
	});

const toDetector = (raw: Record<string, unknown>): Effect.Effect<Option.Option<Detector>> =>
	pipe(stringValue(raw.detector), Option.getOrElse(() => 'regex')) === 'ast'
		? Effect.succeed(toAstDetector(raw))
		: toRegexDetector(raw);

const toPattern = (
	filePath: string,
	content: string,
	raw: Record<string, unknown>,
): Effect.Effect<Option.Option<Pattern>> =>
	Effect.gen(function*() {
		const name = stringValue(raw.name);
		if (Option.isNone(name)) return Option.none<Pattern>();
		const detector = yield* toDetector(raw);
		if (Option.isNone(detector)) return Option.none<Pattern>();
		const toolRegexRaw = pipe(stringValue(raw.tool), Option.getOrElse(() => '.*'));
		const toolRegexValid = yield* validRegex(toolRegexRaw);
		if (Option.isNone(toolRegexValid)) return Option.none<Pattern>();

		const glob = stringValue(raw.glob);
		const ignoreGlob = stringArray(raw.ignoreGlob);
		const suggestedSkills = stringArray(raw.suggestSkills);
		const description = pipe(stringValue(raw.description), Option.getOrElse(() => ''));

		const pattern: Pattern = {
			name: name.value,
			description,
			event: toEvent(raw.event),
			toolRegex: toolRegexValid.value,
			level: toSeverity(raw.level),
			...(Option.isSome(glob) ? { glob: glob.value } : {}),
			...(Option.isSome(ignoreGlob) ? { ignoreGlob: ignoreGlob.value } : {}),
			detector: detector.value,
			guidance: extractBody(content),
			...(Option.isSome(suggestedSkills) ? { suggestedSkills: suggestedSkills.value } : {}),
			sourcePath: filePath,
		};
		return Option.some(pattern);
	});

const readPatternFile = (
	filePath: string,
): Effect.Effect<Option.Option<Pattern>, never, FileSystem.FileSystem> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const content = yield* fs.readFileString(filePath).pipe(
			Effect.match({
				onFailure: () => Option.none<string>(),
				onSuccess: Option.some,
			}),
		);
		if (Option.isNone(content)) return Option.none<Pattern>();
		const raw = yield* parseFrontmatter(filePath, content.value).pipe(
			Effect.catchTag('FrontmatterParseError', () =>
				Effect.succeed<Record<string, unknown>>({})),
		);
		return yield* toPattern(filePath, content.value, raw);
	});

const walk = (dir: string): Effect.Effect<
	ReadonlyArray<Pattern>,
	never,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function*() {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const entries = yield* fs.readDirectory(dir).pipe(
			Effect.match({
				onFailure: () => [] as ReadonlyArray<string>,
				onSuccess: (xs) => xs,
			}),
		);

		const results = yield* Effect.forEach(
			entries,
			(entry) =>
				Effect.gen(function*() {
					const full = path.join(dir, entry);
					const info = yield* fs.stat(full).pipe(Effect.option);
					if (Option.isNone(info)) return [] as ReadonlyArray<Pattern>;

					if (info.value.type === 'Directory') {
						return yield* walk(full);
					}
					if (info.value.type !== 'File' || !entry.endsWith('.md') || isSkippedFile(entry)) {
						return [] as ReadonlyArray<Pattern>;
					}

					const loaded = yield* readPatternFile(full);
					return Option.match(loaded, {
						onNone: () => [] as ReadonlyArray<Pattern>,
						onSome: (p) => [p] as ReadonlyArray<Pattern>,
					});
				}),
			{ concurrency: 8 },
		);
		return results.flatMap((rs) => rs);
	});

const bySourcePath = Order.mapInput(Order.String, (p: Pattern) => p.sourcePath);

/**
 * Load every pattern markdown file under `patternsDir` (recursively) and
 * return them sorted by source path. Files with malformed frontmatter or
 * missing required fields are silently skipped — one bad pattern doesn't
 * break the catalog.
 */
export const loadPatterns = (
	patternsDir: string,
): Effect.Effect<ReadonlyArray<Pattern>, never, FileSystem.FileSystem | Path.Path> =>
	walk(patternsDir).pipe(Effect.map((all) => Arr.sort(all, bySourcePath)));
