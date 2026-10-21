/**
 * @fileoverview Die Auswertung des `?order`-Parameters — einmal definiert.
 *
 * Drei Stellen brauchen dieselbe Regel: die Eingangsliste (`/admin`), der
 * Warteschlangen-Endpunkt (`/api/sightings/[id]/queue`) und der universelle
 * `load` der Detailansicht (`/admin/[id]/+page.ts`). Die ersten beiden dürfen
 * `#lib/server/db/openQueueOrder.js` importieren — das Modul zieht das DB-Schema
 * mit. Der universelle Loader läuft aber auch im Browser und darf das nicht.
 *
 * Deshalb liegt die reine Auswertung hier, ohne jeden Import — weder Schema
 * noch Svelte noch `$app/*` — und `openQueueOrder.ts` reicht sie nur durch.
 * So bleibt es bei einer Quelle für die Regel, ohne die Importrichtung
 * umzudrehen (der Server-Code importiert weiterhin aus `#lib/server/db/*`,
 * nicht umgekehrt).
 */

/** Sortierrichtung des Stapels nach Meldedatum. */
export type QueueOrder = 'asc' | 'desc';

/**
 * Auswertung des `?order`-Parameters.
 *
 * Default `desc` (neueste zuerst, Entscheidung Jan 2026-08-08): Der Altbestand
 * ab 2013 macht FIFO als Default unbrauchbar. Alles außer `asc` fällt zurück,
 * statt in die SQL zu wandern.
 */
export function resolveQueueOrder(value: string | null): QueueOrder {
	return value === 'asc' ? 'asc' : 'desc';
}
