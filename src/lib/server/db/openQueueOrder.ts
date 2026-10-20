/**
 * @fileoverview Die Ordnung des offenen Sichtungsstapels — einmal definiert.
 *
 * Zwei Stellen brauchen dieselbe Reihenfolge: die Eingangsliste (`/admin`) und
 * der Warteschlangen-Endpunkt (`/api/sightings/[id]/queue`). Liefen sie
 * auseinander, wäre der Fehler nicht sichtbar, sondern still — beim Abarbeiten
 * würde eine Meldung übersprungen, und niemand bemerkt eine Sichtung, die nie
 * erschienen ist.
 *
 * **`id` ist nicht Kosmetik, sondern Voraussetzung.** `created` ist
 * `notNull`, aber nicht `unique` (`schema.ts`): Zwei am selben Zeitpunkt
 * eingegangene Meldungen haben ohne Tiebreaker keine definierte Reihenfolge,
 * und PostgreSQL darf sie zwischen zwei Abfragen unterschiedlich anordnen. Die
 * Keyset-Bedingung unten vergleicht deshalb das **Wertepaar** und nicht die
 * Spalten einzeln — `created < x OR (created = x AND id < y)` wäre dasselbe,
 * nur länger und leichter falsch abzuschreiben.
 *
 * Gleiche Bauart und gleicher Zweck wie `approvalFilter.ts`: eine Regel, die an
 * zwei Stellen nachgebaut wird, driftet.
 */
import { sightings } from '#lib/server/db/schema.ts';
import { asc, desc, sql, type SQL } from 'drizzle-orm';

/**
 * `QueueOrder` und `resolveQueueOrder` sind in `#lib/components/admin/queueOrder.js`
 * definiert und werden hier nur durchgereicht: Der universelle Loader der
 * Detailansicht (`/admin/[id]/+page.ts`) läuft auch im Browser und darf dieses
 * Modul nicht importieren (`schema.ts` hängt dran) — die reine Auswertung
 * durfte deshalb nicht hier bleiben. Bestehende Importe von hier bleiben
 * gültig, damit der Umbau kein Aufrufer-Update erzwingt.
 */
export { type QueueOrder, resolveQueueOrder } from '#lib/components/admin/queueOrder.ts';
import type { QueueOrder } from '#lib/components/admin/queueOrder.ts';

/** Die Position einer Sichtung im Stapel, so weit die Ordnung sie braucht. */
export interface QueueAnchor {
	created: Date;
	id: number;
}

/** Sortierausdrücke für `.orderBy(...)` — inklusive Tiebreaker. */
export function openQueueOrderBy(order: QueueOrder): SQL[] {
	return order === 'asc'
		? [asc(sightings.created), asc(sightings.id)]
		: [desc(sightings.created), desc(sightings.id)];
}

/**
 * Keyset-Bedingung „liegt hinter/vor dieser Sichtung".
 *
 * Der Vergleich hängt an den **Werten** des Ankers, nicht an seiner
 * Mitgliedschaft in der offenen Menge. Genau deshalb bleibt die Frage „wer
 * kommt danach" beantwortbar, nachdem die aktuelle Sichtung entschieden wurde
 * und den Stapel verlassen hat — der Auto-Advance braucht keinen Sonderfall.
 *
 * **Der Anker wird als `::timestamp`-Text gebunden, nicht als rohes `Date`.**
 * `postgres.js` leitet aus einem `Date`-Parameter OID 1184 (`timestamptz`) ab.
 * `sichtungen.created` ist aber `timestamp without time zone` (OID 1114) — im
 * Zeilenvergleich `(created, id) < (anchor, id)` löst PostgreSQL die Mischung
 * über die **Session-TimeZone** auf, und die Nachbarschaft verschiebt sich um
 * deren Offset. Das ist genau der stille Übersprung, gegen den dieses Modul
 * existiert (siehe Docblock oben). `postgresTypes.ts` beseitigt dieselbe
 * Abhängigkeit bereits für den Lesweg der Spalte; dieselbe Bindung fehlte hier
 * für den Schreibweg des Parameters. `toISOString()` + `::timestamp`-Cast
 * bindet den Wert unzweideutig als Text, den Postgres als `timestamp`
 * interpretiert — unabhängig von TZ.
 */
export function queueNeighborCondition(
	order: QueueOrder,
	direction: 'next' | 'prev',
	anchor: QueueAnchor
): SQL {
	const kleinerAlsAnker = (order === 'desc') === (direction === 'next');
	const ankerZeitpunkt = sql`${anchor.created.toISOString()}::timestamp`;
	return kleinerAlsAnker
		? sql`(${sightings.created}, ${sightings.id}) < (${ankerZeitpunkt}, ${anchor.id})`
		: sql`(${sightings.created}, ${sightings.id}) > (${ankerZeitpunkt}, ${anchor.id})`;
}

/**
 * In welcher Richtung nach dem Nachbarn gesucht wird.
 *
 * Vorwärts ist es die Queue-Richtung selbst; rückwärts muss die Sortierung
 * gedreht werden, sonst liefert `LIMIT 1` den Stapelanfang statt des direkten
 * Vorgängers.
 */
export function neighborScanOrder(order: QueueOrder, direction: 'next' | 'prev'): QueueOrder {
	if (direction === 'next') return order;
	return order === 'desc' ? 'asc' : 'desc';
}
