import type { Rule as AstGrepRuleDefinition } from '@ast-grep/napi';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { extractBody, parseFrontmatter } from './frontmatter.ts';
import type { AstDetector, Detector, Pattern, RegexDetector, Severity } from './pattern.ts';

const SKIPPED_PREFIXES = ['readme', 'index'];

const isSkippedFile = (name: string): boolean => {
	const lower = name.toLowerCase();
	return SKIPPED_PREFIXES.some((p) => lower === `${p}.md` || lower.startsWith(`${p}.`));
};

const stringValue = (raw: unknown): string | undefined =>
	typeof raw === 'string' ? raw : undefined;

const stringArray = (raw: unknown): ReadonlyArray<string> | undefined => {
	if (!Array.isArray(raw)) return undefined;
	const strings = raw.filter((v): v is string => typeof v === 'string');
	return strings.length === raw.length ? strings : undefined;
};

const isAstRule = (v: unknown): v is AstGrepRuleDefinition =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const astRuleList = (raw: unknown): ReadonlyArray<AstGrepRuleDefinition> | undefined => {
	if (isAstRule(raw)) return [raw];
	if (!Array.isArray(raw)) return undefined;
	const rules = raw.filter(isAstRule);
	return rules.length === raw.length && rules.length > 0 ? rules : undefined;
};

const astRuleRecord = (raw: unknown): Record<string, AstGrepRuleDefinition> | undefined => {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
	const entries = Object.entries(raw as Record<string, unknown>);
	const valid = entries.filter(([, v]) => isAstRule(v)) as ReadonlyArray<
		[string, AstGrepRuleDefinition]
	>;
	return valid.length === entries.length ? Object.fromEntries(valid) : undefined;
};

const patternStringList = (raw: unknown): ReadonlyArray<string> | undefined => {
	if (typeof raw === 'string') return [raw];
	return stringArray(raw);
};

const isValidRegex = (s: string): boolean => {
	try {
		new RegExp(s);
		return true;
	} catch {
		return false;
	}
};

const toSeverity = (raw: unknown): Severity => {
	const s = stringValue(raw);
	if (s === 'critical' || s === 'high' || s === 'medium' || s === 'warning' || s === 'info') {
		return s;
	}
	return 'info';
};

const toEvent = (raw: unknown): 'before' | 'after' => {
	const s = stringValue(raw);
	return s !== undefined && s.toLowerCase() === 'after' ? 'after' : 'before';
};

const toDetector = (raw: Record<string, unknown>): Detector | undefined => {
	const detectorKind = stringValue(raw.detector) === 'ast' ? 'ast' : 'regex';

	if (detectorKind === 'ast') {
		const rules = astRuleList(raw.rule) ?? astRuleList(raw.rules);
		if (rules !== undefined) {
			const ast: AstDetector = {
				kind: 'ast',
				patterns: [],
				rules,
				...(astRuleRecord(raw.constraints) !== undefined
					? { constraints: astRuleRecord(raw.constraints)! }
					: {}),
			};
			return ast;
		}
		const patterns = patternStringList(raw.pattern);
		if (patterns === undefined || patterns.length === 0) return undefined;
		const inside = stringValue(raw.inside);
		const ast: AstDetector = {
			kind: 'ast',
			patterns,
			...(inside !== undefined ? { inside } : {}),
		};
		return ast;
	}

	const pattern = stringValue(raw.pattern);
	if (pattern === undefined || !isValidRegex(pattern)) return undefined;
	const det: RegexDetector = {
		kind: 'regex',
		pattern,
		matchInComments: raw.matchInComments === true || raw.matchInComments === 'true',
	};
	return det;
};

const toPattern = (filePath: string, content: string): Pattern | undefined => {
	const raw = parseFrontmatter(content);
	const name = stringValue(raw.name);
	if (name === undefined) return undefined;
	const detector = toDetector(raw);
	if (detector === undefined) return undefined;
	const toolRegex = stringValue(raw.tool) ?? '.*';
	if (!isValidRegex(toolRegex)) return undefined;

	const glob = stringValue(raw.glob);
	const ignoreGlob = stringArray(raw.ignoreGlob);
	const suggestedSkills = stringArray(raw.suggestSkills);
	const description = stringValue(raw.description) ?? '';

	return {
		name,
		description,
		event: toEvent(raw.event),
		toolRegex,
		level: toSeverity(raw.level),
		...(glob !== undefined ? { glob } : {}),
		...(ignoreGlob !== undefined ? { ignoreGlob } : {}),
		detector,
		guidance: extractBody(content),
		...(suggestedSkills !== undefined ? { suggestedSkills } : {}),
		sourcePath: filePath,
	};
};

const walk = (dir: string): ReadonlyArray<Pattern> => {
	let entries: ReadonlyArray<string>;
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	const out: Pattern[] = [];
	for (const entry of entries) {
		const full = join(dir, entry);
		let info;
		try {
			info = statSync(full);
		} catch {
			continue;
		}
		if (info.isDirectory()) {
			out.push(...walk(full));
			continue;
		}
		if (!info.isFile() || !entry.endsWith('.md') || isSkippedFile(entry)) continue;
		let content: string;
		try {
			content = readFileSync(full, 'utf8');
		} catch {
			continue;
		}
		const pattern = toPattern(full, content);
		if (pattern !== undefined) out.push(pattern);
	}
	return out;
};

export const loadPatterns = (patternsDir: string): ReadonlyArray<Pattern> => {
	const all = walk(patternsDir);
	return [...all].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
};
