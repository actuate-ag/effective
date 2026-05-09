import type { AuditMatch } from '../runner.ts';

export const formatJson = (matches: ReadonlyArray<AuditMatch>): string =>
	JSON.stringify({ matches }, null, '\t') + '\n';
