import { Match, Order, pipe } from 'effect';
import * as Arr from 'effect/Array';
import * as Result from 'effect/Result';

import type { Severity } from '../../patterns/types.ts';
import { SEVERITY_RANK } from '../../patterns/types.ts';
import type { AuditMatch } from '../runner.ts';

const severityOrder = Order.mapInput(Order.Number, (s: Severity) => SEVERITY_RANK[s]);
const matchOrder = Order.combine(
	Order.mapInput(Order.String, (m: AuditMatch) => m.filePath),
	Order.combine(
		Order.mapInput(severityOrder, (m: AuditMatch) => m.severity),
		Order.mapInput(Order.Number, (m: AuditMatch) => m.line),
	),
);

const SEVERITIES: ReadonlyArray<Severity> = [
	'critical',
	'high',
	'medium',
	'warning',
	'info',
];

const severityTag = (s: Severity): string =>
	Match.value(s).pipe(
		Match.when('critical', () => '!!'),
		Match.when('high', () => '!'),
		Match.when('medium', () => '*'),
		Match.when('warning', () => '~'),
		Match.when('info', () => '·'),
		Match.exhaustive,
	);

const formatLine = (m: AuditMatch): string =>
	`  ${m.filePath}:${m.line}:${m.column}  ${severityTag(m.severity)} [${m.severity}] ${m.patternName}\n` +
	`    ${m.description}\n` +
	(m.snippet === '' ? '' : `    > ${m.snippet}\n`);

const countSeverity = (
	matches: ReadonlyArray<AuditMatch>,
	severity: Severity,
): number => Arr.filter(matches, (m) => m.severity === severity).length;

const summarizeBySeverity = (matches: ReadonlyArray<AuditMatch>): string =>
	pipe(
		SEVERITIES,
		Arr.filterMap((sev) => {
			const count = countSeverity(matches, sev);
			return count > 0 ? Result.succeed(`${count} ${sev}`) : Result.failVoid;
		}),
	).join(', ');

export const formatHuman = (matches: ReadonlyArray<AuditMatch>): string => {
	if (matches.length === 0) {
		return 'effect-audit: no matches.\n';
	}
	const ordered = pipe(matches, Arr.sort(matchOrder));
	const body = ordered.map(formatLine).join('\n');
	const summary = summarizeBySeverity(matches);
	return `effect-audit: ${matches.length} match(es) — ${summary}\n\n${body}`;
};
