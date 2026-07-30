/**
 * „Foto angekündigt, aber noch nicht eingetroffen" — Zustand einer Sichtung
 * vom neu gebauten iOS-Client (`OstSeeTiere/8`, Stand 2026-07-30).
 *
 * Der Client setzt `aufnahmeHochladen` (→ `mediaUpload`), wenn der Melder ein
 * Foto hat, kann darüber aber keine Datei übertragen — der Client kann nicht
 * geändert werden. Melder werden gebeten, das Foto per E-Mail nachzureichen.
 * Ohne diese Einordnung liest „Upload: ja" ohne angehängte Datei wie ein
 * defekter Datensatz, dabei ist es eine erwartete Zwischenphase.
 *
 * **`aufnahmeHochladen` ist kein neues Feld.** Auf der lokalen Datenbank
 * (13 Jahre Altbestand, früheste Zeile 2012-07-01) tragen 3.405 Sichtungen
 * dieses Flag, über alle Eingangskanäle hinweg — Web, E-Mail, Post, Telefon
 * und auch die frühere „App". Ohne Untergrenze meldete die Admin-Arbeitsliste
 * 2.539 „ausstehende" Fotos: Altdaten, für die nie eine E-Mail nachkommen
 * wird, weil das Flag dort historisch nur „der Melder hatte ein Foto"
 * bedeutete — nicht „der neue Client konnte es nicht hochladen". Nur
 * Sichtungen ab `NEW_IOS_CLIENT_LAUNCH_DATE` können diese Aussage tragen.
 *
 * **Einzige Stelle, an der dieser Zustand entsteht** — analog zu
 * `getBalticSeaStatus()` in `$lib/utils/geo/balticSeaStatus.ts`. Angeschlossen
 * sind die Admin-Detailansicht (`AdminSightingView.svelte`) und der
 * Datenbank-Filter für die Admin-Arbeitsliste
 * (`$lib/server/db/mediaUploadFilter.ts`). Die Benachrichtigungs-Mail prüft
 * dagegen nur das rohe Flag: beim Versand — unmittelbar nach dem Anlegen der
 * Sichtung — kann noch keine Datei angehängt sein, der Dateizähler wäre dort
 * immer 0 und träfe keine zusätzliche Aussage.
 */

/** Zählt als „gesetzt", egal ob DB-Integer (0/1) oder Formular-Boolean. */
type MediaUploadFlag = number | boolean | null | undefined;

/**
 * Der neu gebaute iOS-Client (`OstSeeTiere/8`) ist seit diesem Tag
 * angebunden (`.claude/rules/legacy-api.md`). Nur Sichtungen ab diesem
 * Zeitpunkt können „wartet auf eine per E-Mail nachgereichte Foto" bedeuten
 * — jede ältere Zeile mit `mediaUpload=1` ist Altbestand mit einer anderen,
 * unbekannten Bedeutung des Flags (siehe Modul-Kommentar oben).
 */
export const NEW_IOS_CLIENT_LAUNCH_DATE = new Date('2026-07-30T00:00:00.000Z');

function isFromNewClientEra(createdAt: Date | string | null | undefined): boolean {
	if (createdAt === null || createdAt === undefined) return false;
	const timestamp = createdAt instanceof Date ? createdAt : new Date(createdAt);
	if (Number.isNaN(timestamp.getTime())) return false;
	return timestamp >= NEW_IOS_CLIENT_LAUNCH_DATE;
}

export function isPhotoAnnouncementPending(
	mediaUpload: MediaUploadFlag,
	attachedFileCount: number,
	createdAt: Date | string | null | undefined
): boolean {
	if (!isFromNewClientEra(createdAt)) return false;
	return !!mediaUpload && attachedFileCount === 0;
}

export const PHOTO_ANNOUNCEMENT_LABEL = 'Foto angekündigt, folgt per E-Mail';

export const PHOTO_ANNOUNCEMENT_TITLE =
	'Der Melder hat laut App ein Foto, kann es darüber aber nicht hochladen — es kommt separat per E-Mail. Beim Eintreffen anhand der Referenz-ID zuordnen.';

/**
 * Wert des `mediaUpload`-Query-Parameters für die Admin-Arbeitsliste
 * „angekündigt, aber keine Datei angehängt" — dieselbe Aussage wie
 * `isPhotoAnnouncementPending()`, hier als Filterwert für Admin-Übersicht und
 * Export (`$lib/server/db/mediaUploadFilter.ts`).
 *
 * **Hier und nicht in `mediaUploadFilter.ts` definiert**, weil diese Datei
 * client-sicher ist und `mediaUploadFilter.ts` `$lib/server/db/schema`
 * importiert — ein Import von dort in `admin/+page.svelte` würde
 * SvelteKits Server-only-Grenze verletzen.
 */
export const MEDIA_UPLOAD_ANNOUNCED_MISSING = 'announced_missing';
