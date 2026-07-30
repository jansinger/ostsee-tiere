/**
 * Gemeinsames `mediaUpload`-Filterprädikat für die Admin-Übersicht
 * (`routes/admin/+page.server.ts`) und den Export
 * (`routes/api/sightings/export/exportFilterParams.ts`).
 *
 * Bewusst als reine, DB-lose Funktion: Sie baut ein Drizzle-Prädikat über die
 * Schema-Spalten, führt aber keine Abfrage aus — dieselbe Trennung wie
 * `approvalFilter.ts`. Beide Aufrufer hängen das Ergebnis an ihre eigene
 * `and(...)`-Bedingungsliste.
 */
import { and, eq, gte, sql, type SQL } from 'drizzle-orm';
import {
	MEDIA_UPLOAD_ANNOUNCED_MISSING,
	NEW_IOS_CLIENT_LAUNCH_DATE
} from '$lib/utils/media/photoAnnouncement';
import { sightingFiles, sightings } from '$lib/server/db/schema';

/**
 * „Foto angekündigt, aber keine Datei angehängt" — der neu gebaute iOS-Client
 * (`OstSeeTiere/8`, Stand 2026-07-30) setzt `aufnahmeHochladen`, kann aber
 * keine Datei hochladen; das Foto kommt per E-Mail nach. Dieselbe Aussage wie
 * `isPhotoAnnouncementPending()` in `$lib/utils/media/photoAnnouncement.ts`,
 * hier aber als SQL-Prädikat statt als Vergleich gegen einen geladenen
 * Dateizähler — die Admin-Liste lädt `sichtungen_dateien` nicht pro Zeile.
 *
 * Re-Export, damit bestehende Aufrufer (`admin/+page.server.ts`,
 * `exportFilterParams.ts`) den Wert weiterhin von hier beziehen können.
 */
export { MEDIA_UPLOAD_ANNOUNCED_MISSING };

/**
 * @param mediaUpload Der rohe Query-Parameter (`'1'`, `'0'`,
 *   `'announced_missing'` oder alles andere/fehlend für „kein Filter").
 * @returns Ein Prädikat für `and(...)`, oder `undefined`, wenn der Wert keinen
 *   Filter auslöst.
 */
export function mediaUploadCondition(mediaUpload: string | null | undefined): SQL | undefined {
	if (mediaUpload === '1') {
		return eq(sightings.mediaUpload, 1);
	}
	if (mediaUpload === '0') {
		return eq(sightings.mediaUpload, 0);
	}
	if (mediaUpload === MEDIA_UPLOAD_ANNOUNCED_MISSING) {
		return and(
			eq(sightings.mediaUpload, 1),
			sql`NOT EXISTS (SELECT 1 FROM ${sightingFiles} WHERE ${sightingFiles.sightingId} = ${sightings.id})`,
			// `aufnahmeHochladen` trägt 13 Jahre Altbestand über alle
			// Eingangskanäle (früheste Zeile 2012-07-01) — dort bedeutete das
			// Flag nur „der Melder hatte ein Foto", nicht „der neue Client
			// konnte es nicht hochladen". Ohne diese Grenze meldete die
			// Arbeitsliste 2.539 nie einlösbare „ausstehende" Fotos.
			gte(sightings.created, NEW_IOS_CLIENT_LAUNCH_DATE)
		);
	}
	return undefined;
}
