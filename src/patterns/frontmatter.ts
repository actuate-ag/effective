import { Effect, pipe } from 'effect';
import * as Option from 'effect/Option';
import YAML from 'yaml';

import { FrontmatterParseError } from './errors.ts';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const SAFE_VALUE_RE = /^[\w\s.\-/]+$/;

const isAlreadyQuoted = (val: string): boolean =>
	(val.startsWith("'") && val.endsWith("'")) ||
	(val.startsWith('"') && val.endsWith('"'));

/**
 * Pattern frontmatter often contains regex strings with YAML indicator
 * characters. Wrap unquoted scalars in double-quotes when they contain
 * anything beyond trivially safe characters.
 */
const quoteYamlValue = (line: string): string => {
	const m = line.match(/^(\s*)(\w[\w-]*):\s+(.+)$/);
	if (m === null) return line;
	const indent = m[1] ?? '';
	const key = m[2] ?? '';
	const val = m[3] ?? '';
	if (isAlreadyQuoted(val) || SAFE_VALUE_RE.test(val)) return line;
	const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return `${indent}${key}: "${escaped}"`;
};

const sanitize = (block: string): string =>
	block.split('\n').map(quoteYamlValue).join('\n');

/**
 * Parse the YAML frontmatter block of a markdown file.
 *
 * Returns an empty record when the file has no frontmatter; fails with
 * `FrontmatterParseError` when the block exists but is malformed YAML.
 * Callers that prefer to skip malformed frontmatter can recover via
 * `Effect.catchTag('FrontmatterParseError', () => Effect.succeed({}))`.
 */
export const parseFrontmatter = (
	path: string,
	content: string,
): Effect.Effect<Record<string, unknown>, FrontmatterParseError> =>
	pipe(
		Option.fromNullishOr(content.match(FRONTMATTER_RE)?.[1]),
		Option.match({
			onNone: () => Effect.succeed<Record<string, unknown>>({}),
			onSome: (block) =>
				Effect.try({
					try: (): unknown => YAML.parse(sanitize(block)),
					catch: (cause) =>
						new FrontmatterParseError({ path, message: String(cause) }),
				}).pipe(
					Effect.map((parsed) =>
						typeof parsed === 'object' && parsed !== null
							? (parsed as Record<string, unknown>)
							: {},
					),
				),
		}),
	);

export const extractBody = (content: string): string =>
	content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
