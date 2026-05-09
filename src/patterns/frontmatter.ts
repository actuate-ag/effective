import YAML from 'yaml';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

const isAlreadyQuoted = (val: string): boolean =>
	(val.startsWith("'") && val.endsWith("'")) ||
	(val.startsWith('"') && val.endsWith('"'));

const SAFE_VALUE_RE = /^[\w\s.\-/]+$/;

/**
 * Pattern frontmatter often contains regex strings with YAML indicator
 * characters. Wrap unquoted scalars in double-quotes when they contain
 * anything beyond trivially safe characters.
 */
const quoteYamlValue = (line: string): string => {
	const m = line.match(/^(\s*)(\w[\w-]*):\s+(.+)$/);
	if (!m) return line;
	const indent = m[1] ?? '';
	const key = m[2] ?? '';
	const val = m[3] ?? '';
	if (isAlreadyQuoted(val) || SAFE_VALUE_RE.test(val)) return line;
	const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return `${indent}${key}: "${escaped}"`;
};

export const parseFrontmatter = (content: string): Record<string, unknown> => {
	const match = content.match(FRONTMATTER_RE);
	if (!match?.[1]) return {};
	try {
		const sanitized = match[1].split('\n').map(quoteYamlValue).join('\n');
		const parsed: unknown = YAML.parse(sanitized);
		return typeof parsed === 'object' && parsed !== null
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
};

export const extractBody = (content: string): string =>
	content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
