/**
 * @fileoverview Gemeinsamer `mediaUpload`-Filter für Admin-Übersicht und
 * Export.
 *
 * `admin/+page.server.ts` und `api/sightings/export/exportFilterParams.ts`
 * pflegten bisher zwei unabhängige, wortgleiche `if (mediaUpload === '1') …`-
 * Verzweigungen. Für den neuen Wert `announced_missing` — Foto laut App
 * angekündigt (`aufnahmeHochladen = 1`), aber keine Datei in
 * `sichtungen_dateien` angehängt (siehe `$lib/utils/media/photoAnnouncement.ts`)
 * — reicht ein einfacher Spaltenvergleich nicht mehr; die beiden Kopien hier
 * ebenfalls zu duplizieren liefe demselben Auseinanderlaufen entgegen, das
 * `getBalticSeaStatus()` an anderer Stelle beheben sollte.
 *
 * Testansatz wie `statisticsApprovalScope.test.ts`: das Prädikat wird über den
 * echten `PgDialect` zu SQL kompiliert, keine DB-Verbindung nötig.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { MEDIA_UPLOAD_ANNOUNCED_MISSING, mediaUploadCondition } from './mediaUploadFilter';

const dialect = new PgDialect();
const toSqlText = (condition: SQL): string => dialect.sqlToQuery(condition).sql;

describe('mediaUploadCondition', () => {
	it('liefert kein Prädikat für einen unbekannten oder fehlenden Wert', () => {
		expect(mediaUploadCondition(null)).toBeUndefined();
		expect(mediaUploadCondition(undefined)).toBeUndefined();
		expect(mediaUploadCondition('all')).toBeUndefined();
		expect(mediaUploadCondition('')).toBeUndefined();
	});

	it('filtert auf "mit Aufnahme" (mediaUpload = 1)', () => {
		const condition = mediaUploadCondition('1');
		expect(condition).toBeDefined();
		expect(toSqlText(condition as SQL)).toContain('"aufnahmeHochladen" = $1');
	});

	it('filtert auf "ohne Aufnahme" (mediaUpload = 0)', () => {
		const condition = mediaUploadCondition('0');
		expect(condition).toBeDefined();
		expect(toSqlText(condition as SQL)).toContain('"aufnahmeHochladen" = $1');
	});

	// Der eigentliche neue Fall: Foto angekündigt, aber (noch) keine Datei
	// angehängt — die Arbeitsliste für Admins.
	it('kombiniert "angekündigt" (mediaUpload = 1) mit "keine Datei angehängt" (NOT EXISTS)', () => {
		const condition = mediaUploadCondition(MEDIA_UPLOAD_ANNOUNCED_MISSING);
		expect(condition).toBeDefined();

		const text = toSqlText(condition as SQL);
		expect(text).toContain('"aufnahmeHochladen" = $1');
		expect(text).toContain('not exists'.toUpperCase());
		expect(text).toContain('sichtungen_dateien');
		// Korreliert über die Fremdschlüsselspalte, nicht über eine feste ID —
		// sonst träfe die Bedingung jede Sichtung gleichermaßen.
		expect(text).toContain('sichtung_id');
	});

	/**
	 * Live auf der lokalen DB gefunden: `aufnahmeHochladen` trägt 13 Jahre
	 * Altbestand (früheste Zeile 2012-07-01) über alle Eingangskanäle. Ohne
	 * Untergrenze meldete dieses Prädikat 2.539 „ausstehende" Fotos — Zeilen,
	 * für die nie eine E-Mail nachkommen wird, weil das Flag dort historisch
	 * nur „der Melder hatte ein Foto" bedeutete. Siehe
	 * `$lib/utils/media/photoAnnouncement.ts`.
	 */
	it('grenzt "angekündigt, aber keine Datei" zusätzlich auf den Client-Start ein', () => {
		const condition = mediaUploadCondition(MEDIA_UPLOAD_ANNOUNCED_MISSING);
		const text = toSqlText(condition as SQL);

		expect(text).toContain('"created" >=');
	});

	it('lässt "mit"/"ohne Aufnahme" unverändert — keine Datumsgrenze für diese beiden Werte', () => {
		expect(toSqlText(mediaUploadCondition('1') as SQL)).not.toContain('"created"');
		expect(toSqlText(mediaUploadCondition('0') as SQL)).not.toContain('"created"');
	});
});
