/**
 * @fileoverview Prädikate, die öffentliche Statistik (`getSightingStatistics`)
 * und Admin-Statistik (`/admin/statistics`) gemeinsam benutzen
 *
 * Beide Seiten führen eigene Abfragen — sie gruppieren und filtern
 * verschieden —, aber was eine Kennzahl *bedeutet*, steht nur einmal. Die
 * Zusatzfeld-Zählung liegt aus demselben Grund in `optionalFields.ts`.
 */

import { sightingFiles, sightings } from '#lib/server/db/schema.ts';
import { sql, type SQL } from 'drizzle-orm';

/**
 * Zur Sichtung liegt mindestens eine hochgeladene Datei vor.
 *
 * Nicht `aufnahmeHochladen`: Das Kennzeichen heißt nur „Aufnahme
 * angekündigt" und wurde im Altbestand 13 Jahre lang gesetzt, oft ohne dass je
 * eine Datei kam (lokal 2026-11-02: 3.314 Kennzeichen gegen 829 Sichtungen mit
 * Datei). Als `EXISTS` und nicht als Join, damit es als Bedingung in jeder
 * Abfrage auf `sichtungen` stehen kann, ohne Zeilen zu vervielfachen.
 */
export function hasMediaFiles(): SQL {
	return sql`exists (select 1 from ${sightingFiles} where ${sightingFiles.sightingId} = ${sightings.id})`;
}
