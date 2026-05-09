import { describe, expect, it } from 'vitest';

import { formatFeedback } from '../hooks/lib/format-feedback.ts';
import type { Pattern } from '../hooks/lib/pattern.ts';

const make = (over: Partial<Pattern>): Pattern => ({
	name: 'p',
	description: 'desc',
	event: 'after',
	toolRegex: '.*',
	level: 'warning',
	detector: { kind: 'regex', pattern: 'x', matchInComments: false },
	guidance: 'guidance body',
	sourcePath: '/x',
	...over,
});

describe('formatFeedback', () => {
	it('orders matches by severity then name', () => {
		const out = formatFeedback(
			[
				make({ name: 'b-warn', level: 'warning' }),
				make({ name: 'a-crit', level: 'critical' }),
				make({ name: 'a-warn', level: 'warning' }),
				make({ name: 'a-info', level: 'info' }),
			],
			'/some/file.ts',
		);
		const order = ['a-crit', 'a-warn', 'b-warn', 'a-info'];
		const positions = order.map((n) => out.indexOf(`- ${n} `));
		expect(positions, 'severity ordering broken').toEqual([...positions].sort((a, b) => a - b));
	});

	it('dedupes by name', () => {
		const p = make({ name: 'dup' });
		const out = formatFeedback([p, p, p], '/f.ts');
		const occurrences = out.split('- dup [').length - 1;
		expect(occurrences).toBe(1);
	});

	it('appends suggested-skill hint when present', () => {
		const out = formatFeedback(
			[make({ name: 'p1', suggestedSkills: ['effect-error-handling'] })],
			'/f.ts',
		);
		expect(out).toContain('effect-error-handling');
		expect(out).toMatch(/If you have not invoked .* skill/);
	});

	it('omits skill hint when no suggestions', () => {
		const out = formatFeedback([make({ name: 'p1' })], '/f.ts');
		expect(out).not.toContain('If you have not invoked');
	});

	it('embeds the file path', () => {
		const out = formatFeedback([make({ name: 'p1' })], '/abs/path/to/file.ts');
		expect(out).toContain('/abs/path/to/file.ts');
	});
});
