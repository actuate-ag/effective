import type { NapiConfig, Rule as AstGrepRuleDefinition } from '@ast-grep/napi';
import { Lang, parse } from '@ast-grep/napi';
import picomatch from 'picomatch';

import { Effect, Match, pipe } from 'effect';
import * as Arr from 'effect/Array';
import * as Option from 'effect/Option';
import * as Result from 'effect/Result';

import { stripComments } from './strip-comments.ts';
import type { AstDetector, MatchLocation, Pattern, RegexDetector } from './types.ts';

const compileRegex = (s: string, flags = ''): Effect.Effect<Option.Option<RegExp>> =>
	Effect.try({
		try: () => new RegExp(s, flags),
		catch: () => null,
	}).pipe(
		Effect.match({
			onFailure: () => Option.none<RegExp>(),
			onSuccess: Option.some,
		}),
	);

const compileGlob = (
	g: string,
): Effect.Effect<Option.Option<(p: string) => boolean>> =>
	Effect.try({
		try: () => picomatch(g),
		catch: () => null,
	}).pipe(
		Effect.match({
			onFailure: () => Option.none<(p: string) => boolean>(),
			onSuccess: Option.some,
		}),
	);

const langFromPath = (filePath: string): Option.Option<Lang> =>
	Match.value(filePath).pipe(
		Match.when((p: string) => p.endsWith('.tsx'), () => Option.some(Lang.Tsx)),
		Match.when((p: string) => p.endsWith('.jsx'), () => Option.some(Lang.Tsx)),
		Match.when((p: string) => p.endsWith('.ts'), () => Option.some(Lang.TypeScript)),
		Match.when((p: string) => p.endsWith('.js'), () => Option.some(Lang.JavaScript)),
		Match.orElse(() => Option.none<Lang>()),
	);

const ensureGlobalFlag = (re: RegExp): RegExp =>
	new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);

const locationFromSpan = (
	source: string,
	start: number,
	end: number,
): MatchLocation => {
	const before = source.slice(0, start);
	const line = before.split('\n').length;
	const previousLineBreak = before.lastIndexOf('\n');
	const lineStart = previousLineBreak === -1 ? 0 : previousLineBreak + 1;
	const snippet = source.slice(start, end).split('\n')[0] ?? '';
	return {
		start,
		end,
		line,
		column: start - lineStart + 1,
		snippet: snippet.trim(),
	};
};

const regexLocations = (
	det: RegexDetector,
	source: string,
): Effect.Effect<ReadonlyArray<MatchLocation>> =>
	Effect.gen(function*() {
		const reOpt = yield* compileRegex(det.pattern);
		if (Option.isNone(reOpt)) return [] as ReadonlyArray<MatchLocation>;
		const haystack = det.matchInComments ? source : stripComments(source);
		const matches = Arr.fromIterable(haystack.matchAll(ensureGlobalFlag(reOpt.value)));
		return pipe(
			matches,
			Arr.filterMap((m) =>
				typeof m.index === 'number' && m[0].length > 0
					? Result.succeed(locationFromSpan(source, m.index, m.index + m[0].length))
					: Result.failVoid
			),
		);
	});

const astRuleMatcher = (det: AstDetector, rule: AstGrepRuleDefinition): NapiConfig =>
	det.constraints === undefined ? { rule } : { rule, constraints: det.constraints };

const legacyAstMatcher = (det: AstDetector, candidate: string): string | NapiConfig =>
	det.inside === undefined
		? candidate
		: { rule: { pattern: candidate, inside: { pattern: det.inside, stopBy: 'end' } } };

type AstRoot = ReturnType<ReturnType<typeof parse>['root']>;

const parseAst = (
	lang: Lang,
	source: string,
): Effect.Effect<Option.Option<AstRoot>> =>
	Effect.try({
		try: () => parse(lang, source).root(),
		catch: () => null,
	}).pipe(
		Effect.match({
			onFailure: () => Option.none<AstRoot>(),
			onSuccess: Option.some,
		}),
	);

const findAllSafe = (
	root: AstRoot,
	matcher: string | NapiConfig,
): Effect.Effect<ReadonlyArray<{ start: number; end: number }>> =>
	Effect.try({
		try: () =>
			root.findAll(matcher).map((node) => ({
				start: node.range().start.index,
				end: node.range().end.index,
			})),
		catch: () => null,
	}).pipe(
		Effect.match({
			onFailure: () => [] as ReadonlyArray<{ start: number; end: number }>,
			onSuccess: (xs) => xs,
		}),
	);

const astLocations = (
	det: AstDetector,
	filePath: string,
	source: string,
): Effect.Effect<ReadonlyArray<MatchLocation>> =>
	Effect.gen(function*() {
		const lang = langFromPath(filePath);
		if (Option.isNone(lang)) return [] as ReadonlyArray<MatchLocation>;

		const rootOpt = yield* parseAst(lang.value, source);
		if (Option.isNone(rootOpt)) return [] as ReadonlyArray<MatchLocation>;
		const root = rootOpt.value;

		const fromPatterns = yield* Effect.forEach(
			det.patterns,
			(candidate) => findAllSafe(root, legacyAstMatcher(det, candidate)),
			{ concurrency: 'unbounded' },
		);
		const fromRules = yield* Effect.forEach(
			det.rules ?? [],
			(rule) => findAllSafe(root, astRuleMatcher(det, rule)),
			{ concurrency: 'unbounded' },
		);

		return pipe(
			[...fromPatterns.flat(), ...fromRules.flat()],
			Arr.map((span) => locationFromSpan(source, span.start, span.end)),
		);
	});

const passesToolFilter = (
	pattern: Pattern,
	toolName: string,
): Effect.Effect<boolean> =>
	pipe(
		// Pattern files use Pi's lowercase tool names (edit|write); Claude Code
		// emits PascalCase (Edit, Write). Match case-insensitively.
		compileRegex(pattern.toolRegex, 'i'),
		Effect.map((opt) =>
			Option.match(opt, {
				onNone: () => false,
				onSome: (re) => re.test(toolName),
			})
		),
	);

const passesGlobFilter = (
	pattern: Pattern,
	filePath: string,
): Effect.Effect<boolean> =>
	pipe(
		Option.fromNullishOr(pattern.glob),
		Option.match({
			onNone: () => Effect.succeed(true),
			onSome: (g) =>
				compileGlob(g).pipe(
					Effect.map((opt) =>
						Option.match(opt, {
							onNone: () => false,
							onSome: (matcher) => matcher(filePath),
						})
					),
				),
		}),
	);

const passesIgnoreGlobFilter = (
	pattern: Pattern,
	filePath: string,
): Effect.Effect<boolean> =>
	pipe(
		Option.fromNullishOr(pattern.ignoreGlob),
		Option.match({
			onNone: () => Effect.succeed(true),
			onSome: (globs) =>
				Effect.forEach(globs, compileGlob, { concurrency: 'unbounded' }).pipe(
					Effect.map((compiled) =>
						pipe(
							Arr.getSomes(compiled),
							Arr.every((matcher) => !matcher(filePath)),
						)
					),
				),
		}),
	);

/**
 * Find every location at which `pattern` matches `source` for a write of
 * `filePath` by `toolName`. Returns an empty array when:
 *  - the pattern's event is not `'after'`
 *  - the toolName doesn't match the pattern's tool regex
 *  - the file path doesn't match the pattern's glob (or matches its ignoreGlob)
 *  - no detector hit was produced
 */
export const findPatternMatches = (
	pattern: Pattern,
	toolName: string,
	filePath: string,
	source: string,
): Effect.Effect<ReadonlyArray<MatchLocation>> =>
	Effect.gen(function*() {
		if (pattern.event !== 'after') return [] as ReadonlyArray<MatchLocation>;
		if (!(yield* passesToolFilter(pattern, toolName))) {
			return [] as ReadonlyArray<MatchLocation>;
		}
		if (!(yield* passesGlobFilter(pattern, filePath))) {
			return [] as ReadonlyArray<MatchLocation>;
		}
		if (!(yield* passesIgnoreGlobFilter(pattern, filePath))) {
			return [] as ReadonlyArray<MatchLocation>;
		}

		return pattern.detector.kind === 'ast'
			? yield* astLocations(pattern.detector, filePath, source)
			: yield* regexLocations(pattern.detector, source);
	});

/** Boolean form of `findPatternMatches` — true iff at least one location matched. */
export const patternMatches = (
	pattern: Pattern,
	toolName: string,
	filePath: string,
	source: string,
): Effect.Effect<boolean> =>
	pipe(
		findPatternMatches(pattern, toolName, filePath, source),
		Effect.map((locations) => locations.length > 0),
	);
