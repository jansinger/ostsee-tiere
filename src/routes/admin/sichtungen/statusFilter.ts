/**
 * Serverseitige Übersetzung des Statusfilters in ein SQL-Prädikat. Das
 * Alias-Mapping selbst steht in `#lib/components/admin/sightingStatusFilter.js`
 * (client-sicher) — hier kommt nur die drizzle-Abhängigkeit dazu.
 */
import { approvedOnly, openOnly, rejectedOnly } from '#lib/server/db/approvalFilter.ts';
import { normalizeStatusParam } from '#lib/components/admin/sightingStatusFilter.ts';
import type { SQL } from 'drizzle-orm';

export function statusCondition(param: string | null): SQL | undefined {
	const status = normalizeStatusParam(param);
	if (!status) return undefined;
	if (status === 'approved') return approvedOnly();
	if (status === 'rejected') return rejectedOnly();
	return openOnly();
}
