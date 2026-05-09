import type { NapiConfig, Rule as AstGrepRuleDefinition } from '@ast-grep/napi';
import { Lang, parse } from '@ast-grep/napi';
import picomatch from 'picomatch';

import type { AstDetector, Pattern, RegexDetector } from './types.ts';
import { stripComments } from './strip-comments.ts';

const tryRegex = (s: string, flags = ''): RegExp | undefined => {
	try {
		return new RegExp(s, flags);
	} catch {
		return undefined;
	}
};

const tryGlob = (g: string): ((p: string) => boolean) | undefined => {
	try {
		return picomatch(g);
	} catch {
		return undefined;
	}
};

const langFromPath = (filePath: string): Lang | undefined =>
	filePath.endsWith('.tsx')
		? Lang.Tsx
		: filePath.endsWith('.ts')
		? Lang.TypeScript
		: filePath.endsWith('.jsx')
		? Lang.Tsx
		: filePath.endsWith('.js')
		? Lang.JavaScript
		: undefined;

const globalRegex = (regex: RegExp): RegExp =>
	new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);

const regexHasMatch = (det: RegexDetector, source: string): boolean => {
	const re = tryRegex(det.pattern);
	if (re === undefined) return false;
	const haystack = det.matchInComments ? source : stripComments(source);
	const g = globalRegex(re);
	for (const m of haystack.matchAll(g)) {
		if (typeof m.index === 'number' && m[0].length > 0) return true;
	}
	return false;
};

const astRuleMatcher = (det: AstDetector, rule: AstGrepRuleDefinition): NapiConfig =>
	det.constraints === undefined ? { rule } : { rule, constraints: det.constraints };

const legacyAstMatcher = (det: AstDetector, candidate: string): string | NapiConfig =>
	det.inside === undefined
		? candidate
		: { rule: { pattern: candidate, inside: { pattern: det.inside, stopBy: 'end' } } };

const astHasMatch = (det: AstDetector, filePath: string, source: string): boolean => {
	const lang = langFromPath(filePath);
	if (lang === undefined) return false;
	let root: ReturnType<ReturnType<typeof parse>['root']>;
	try {
		root = parse(lang, source).root();
	} catch {
		return false;
	}
	for (const candidate of det.patterns) {
		try {
			if (root.findAll(legacyAstMatcher(det, candidate)).length > 0) return true;
		} catch {
			// invalid pattern — skip
		}
	}
	for (const rule of det.rules ?? []) {
		try {
			if (root.findAll(astRuleMatcher(det, rule)).length > 0) return true;
		} catch {
			// invalid rule — skip
		}
	}
	return false;
};

export const patternMatches = (
	pattern: Pattern,
	toolName: string,
	filePath: string,
	source: string,
): boolean => {
	if (pattern.event !== 'after') return false;

	// Pattern files use Pi's lowercase tool names (edit|write). Claude Code
	// emits PascalCase (Edit, Write). Match case-insensitively.
	const toolRegex = tryRegex(pattern.toolRegex, 'i');
	if (toolRegex === undefined || !toolRegex.test(toolName)) return false;

	if (pattern.glob !== undefined) {
		const matcher = tryGlob(pattern.glob);
		if (matcher === undefined || !matcher(filePath)) return false;
	}

	if (pattern.ignoreGlob !== undefined) {
		for (const g of pattern.ignoreGlob) {
			const matcher = tryGlob(g);
			if (matcher !== undefined && matcher(filePath)) return false;
		}
	}

	return pattern.detector.kind === 'ast'
		? astHasMatch(pattern.detector, filePath, source)
		: regexHasMatch(pattern.detector, source);
};
