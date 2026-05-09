import type { Pattern, Severity } from '../../patterns/types.ts';
import { SEVERITY_RANK } from '../../patterns/types.ts';

const formatSummaryLine = (p: Pattern): string =>
	`- ${p.name} [${p.level}]: ${p.description}`;

const formatGuidanceBlock = (p: Pattern): string => {
	const skills = p.suggestedSkills ?? [];
	const skillHint = skills.length === 0
		? ''
		: `\n\nIf you have not invoked the ${
			skills.map((s) => `\`${s}\``).join(', ')
		} skill${skills.length > 1 ? 's' : ''}, do so before continuing.`;
	return `## ${p.name}\n\n${p.guidance}${skillHint}`;
};

const ranked = (patterns: ReadonlyArray<Pattern>): ReadonlyArray<Pattern> => {
	const seen = new Set<string>();
	const unique: Pattern[] = [];
	for (const p of patterns) {
		if (!seen.has(p.name)) {
			seen.add(p.name);
			unique.push(p);
		}
	}
	return unique.sort((a, b) => {
		const sev = SEVERITY_RANK[a.level] - SEVERITY_RANK[b.level];
		return sev !== 0 ? sev : a.name.localeCompare(b.name);
	});
};

export const formatFeedback = (
	matched: ReadonlyArray<Pattern>,
	filePath: string,
): string => {
	const ordered = ranked(matched);
	const summary = ordered.map(formatSummaryLine).join('\n');
	const guidance = ordered.map(formatGuidanceBlock).join('\n\n---\n\n');
	return [
		'claude-code-effect review request:',
		`File: \`${filePath}\``,
		'',
		'I noticed potential Effect-pattern issues in the write you just completed.',
		'Please inspect this change now.',
		'If a warning is valid, revise the code before continuing.',
		'If you believe it is a false positive or an intentional exception, briefly say so and continue.',
		'',
		'Matched patterns:',
		summary,
		'',
		'Relevant guidance:',
		guidance,
	].join('\n');
};

export const severityFloor = (
	patterns: ReadonlyArray<Pattern>,
): Severity | undefined => {
	let best: Severity | undefined;
	for (const p of patterns) {
		if (best === undefined || SEVERITY_RANK[p.level] < SEVERITY_RANK[best]) {
			best = p.level;
		}
	}
	return best;
};
