/**
 * Welche Spalten der Loader von `/admin/sichtungen` aus `sichtungen` liest.
 *
 * Vorher stand dort `db.select()` — die **ganze** Zeile, bis zu 100-mal pro
 * Seite. Damit gingen Telefonnummer, Klarname, Anschrift und sämtliche
 * Einwilligungs-Nachweisspalten (`medien_einwilligung_am`/`_version` und die
 * drei weiteren Paare) ins ausgelieferte HTML, obwohl die Tabelle 18 Felder
 * anzeigt. Die Route ist Admin-only, ein Sicherheitsloch war das nicht;
 * personenbezogene Daten zu verbreiten, die keine Ansicht der Seite zeigt,
 * bleibt trotzdem unnötig (Datenminimierung).
 *
 * **Der Loader kennt die Spaltenwahl nicht.** Sie ist zur Laufzeit umschaltbar
 * und liegt im `localStorage` des Bearbeiters (`columnPreferences.ts`) — die
 * Auswahl hier muss deshalb die **Vereinigung aller** `AVAILABLE_COLUMNS`
 * abdecken, nicht die gerade sichtbaren. Eine vergessene Spalte fällt sonst
 * erst auf, wenn jemand sie einschaltet und dort „undefined" steht.
 *
 * Abgesichert ist das an drei Stellen, und zwar bewusst nicht dreimal
 * dasselbe:
 *
 * - `COLUMN_FIELDS` ist als `Record<keyof ColumnVisibility, …>` typisiert —
 *   eine neue Spalte in `columns.ts` erzwingt hier einen Eintrag, sonst bricht
 *   `type-check`.
 * - `listColumns.test.ts` prüft, dass jedes dort genannte Feld auch wirklich
 *   im Select landet und dass die sensiblen Spalten draußen bleiben.
 * - `page.server.test.ts` prüft, dass `load()` genau diese Auswahl an
 *   `db.select()` übergibt — ein zurückgedrehtes `db.select()` ohne Argument
 *   fällt dort auf, nicht erst beim Nutzer.
 */

import { sightings, type SightingSelect } from '#lib/server/db/schema.ts';
import type { ColumnVisibility } from './columns';

/** Feldname der Tabelle `sichtungen` (Drizzle-Property, nicht Spaltenname). */
type SightingField = keyof typeof sightings.$inferSelect;

/**
 * Welche Felder eine konfigurierbare Spalte zum Rendern braucht.
 *
 * Die Zuordnung ist nicht durchgängig 1:1 — genau deshalb steht sie hier und
 * wird nicht aus den Spaltenschlüsseln geraten: `wind` liest `windForce`,
 * `verified` leitet den Status aus **zwei** Zeitstempeln ab, `balticSea`
 * braucht die beiden Flags **und** beide Koordinaten (`getBalticSeaStatus`),
 * und `spamScore` zeigt die Indikatoren im `title`.
 */
export const COLUMN_FIELDS = {
	referenceId: ['referenceId'],
	sightingDate: ['sightingDate'],
	created: ['created'],
	email: ['email'],
	species: ['species'],
	distance: ['distance'],
	totalCount: ['totalCount'],
	juvenileCount: ['juvenileCount'],
	distribution: ['distribution'],
	behavior: ['behavior'],
	seaState: ['seaState'],
	wind: ['windForce'],
	visibility: ['visibility'],
	mediaUpload: ['mediaUpload'],
	spamScore: ['spamScore', 'spamIndicators'],
	balticSea: ['inBalticSea', 'inBalticSeaGeo', 'latitude', 'longitude'],
	verified: ['approvedAt', 'rejectedAt'],
	actions: ['id', 'referenceId']
} as const satisfies Record<keyof ColumnVisibility, readonly SightingField[]>;

/**
 * Felder, die unabhängig von der Spaltenwahl gebraucht werden.
 *
 * Zwei Gruppen, die beide nicht in `AVAILABLE_COLUMNS` stehen:
 *
 * - Die **festen Spalten** der Tabelle — `id` (Zeilenschlüssel, Auswahl-
 *   Checkbox, Detail-Link) und `isDead` (Markerspalte ganz links, bewusst
 *   nicht abschaltbar, siehe `.claude/rules/admin.md`).
 * - Alles, was die **Kartenansicht** (`SichtungenCards.svelte`) zeigt. Sie
 *   kennt die Spaltenkonfiguration nicht und rendert ihre Felder immer; ohne
 *   diese Liste hinge die kompakte Ansicht an der Spaltenwahl der weiten.
 */
export const FIXED_FIELDS = [
	'id',
	'isDead',
	'referenceId',
	'species',
	'email',
	'sightingDate',
	'created',
	'totalCount',
	'mediaUpload',
	'inBalticSea',
	'inBalticSeaGeo',
	'latitude',
	'longitude',
	'approvedAt',
	'rejectedAt'
] as const satisfies readonly SightingField[];

/**
 * Die Vereinigung aus beidem — als **Union der tatsächlich gelisteten Namen**,
 * nicht als `SightingField`.
 *
 * Der Unterschied ist nicht kosmetisch: Mit der weiten Annotation
 * (`readonly SightingField[]`) wäre `SIGHTING_LIST_COLUMNS` unten als
 * `Pick<typeof sightings, SightingField>` typisiert, also als die **ganze
 * Zeile** — und `load()` lieferte Datensätze, deren Typ weiterhin `phone`,
 * `internalComment` und die Einwilligungsspalten führt, obwohl sie zur Laufzeit
 * `undefined` sind. Genau die Fehlerklasse, gegen die die Schwester-Datei
 * `inboxColumns.ts` konstruiert ist.
 */
type ListField =
	(typeof FIXED_FIELDS)[number] | (typeof COLUMN_FIELDS)[keyof typeof COLUMN_FIELDS][number];

/** Sortiert, damit die Reihenfolge nicht an der Schreibreihenfolge oben hängt. */
export const SIGHTING_LIST_FIELDS: readonly ListField[] = [
	...new Set<ListField>([...FIXED_FIELDS, ...Object.values(COLUMN_FIELDS).flat()])
].sort();

/**
 * Das Select-Objekt für `db.select(…)`. Aus der Feldliste erzeugt und nicht
 * als zweites Literal geschrieben: Zwei Aufzählungen nebeneinander wären zwei
 * Quellen, und die zweite altert.
 */
export const SIGHTING_LIST_COLUMNS = Object.fromEntries(
	SIGHTING_LIST_FIELDS.map((field) => [field, sightings[field]])
) as Pick<typeof sightings, ListField>;

/**
 * Eine Zeile der Liste — genau die Felder, die `load()` liest.
 *
 * Tabelle und Kartenansicht sind darauf typisiert und **nicht** mehr auf
 * `FrontendSighting`: Der volle Typ behauptete Felder, die der Loader seit der
 * Spaltenauswahl nicht mehr liefert. Wer hier ein Feld liest, das nicht in
 * `COLUMN_FIELDS`/`FIXED_FIELDS` steht, bekommt jetzt einen Typfehler statt
 * einer leeren Zelle.
 */
export type SichtungenListRow = Pick<SightingSelect, ListField>;
