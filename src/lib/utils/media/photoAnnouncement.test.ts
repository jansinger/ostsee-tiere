/**
 * @fileoverview Der neu gebaute iOS-Client (`OstSeeTiere/8`) setzt `aufnahmeHochladen`
 * (→ `mediaUpload`), kann aber selbst keine Datei hochladen — Melder werden
 * gebeten, das Foto per E-Mail nachzureichen. Bis dahin liest „Upload: ja" ohne
 * angehängte Datei wie ein defekter Datensatz.
 *
 * `isPhotoAnnouncementPending()` ist die einzige Stelle, an der dieser Zustand
 * entsteht — analog zu `getBalticSeaStatus()` in `balticSeaStatus.ts`. Admin-
 * Detailansicht und Admin-Arbeitsliste (DB-Filter) müssen dieselbe Aussage
 * treffen, sonst laufen sie auseinander wie zuvor der Ostsee-Status.
 *
 * **Bug, live auf der lokalen DB gefunden (2026-07-30):** `aufnahmeHochladen`
 * ist kein neues Feld — die Spalte trägt 13 Jahre Altbestand (früheste Zeile
 * 2012-07-01) über alle Eingangskanäle hinweg (Web, E-Mail, Post, Telefon und
 * auch die frühere „App"). Ohne Untergrenze meldete die Admin-Arbeitsliste
 * 2.539 „ausstehende" Fotos — Altdaten, die nie eine E-Mail nachreichen
 * werden, weil `aufnahmeHochladen=1` dort historisch nur „der Melder hatte
 * ein Foto" bedeutete, nicht „der neue Client konnte es nicht hochladen".
 * Nur Sichtungen ab dem Start dieses Clients (`NEW_IOS_CLIENT_LAUNCH_DATE`)
 * können diese Aussage tragen.
 */
import { describe, expect, it } from 'vitest';
import {
	isPhotoAnnouncementPending,
	MEDIA_UPLOAD_ANNOUNCED_MISSING,
	NEW_IOS_CLIENT_LAUNCH_DATE,
	PHOTO_ANNOUNCEMENT_LABEL
} from './photoAnnouncement';

const AFTER_LAUNCH = '2026-07-30T12:00:00Z';
const BEFORE_LAUNCH = '2026-07-29T23:59:59Z';
const LEGACY_DATE = '2015-03-12T08:00:00Z';

describe('isPhotoAnnouncementPending', () => {
	it('ist wahr, wenn ein Foto angekündigt ist, keine Datei angehängt wurde und die Sichtung nach dem Client-Start liegt', () => {
		expect(isPhotoAnnouncementPending(1, 0, AFTER_LAUNCH)).toBe(true);
	});

	it('ist falsch, sobald mindestens eine Datei angehängt ist', () => {
		expect(isPhotoAnnouncementPending(1, 1, AFTER_LAUNCH)).toBe(false);
		expect(isPhotoAnnouncementPending(1, 3, AFTER_LAUNCH)).toBe(false);
	});

	it('ist falsch, wenn kein Foto angekündigt wurde — unabhängig von der Dateizahl', () => {
		expect(isPhotoAnnouncementPending(0, 0, AFTER_LAUNCH)).toBe(false);
		expect(isPhotoAnnouncementPending(null, 0, AFTER_LAUNCH)).toBe(false);
		expect(isPhotoAnnouncementPending(undefined, 0, AFTER_LAUNCH)).toBe(false);
	});

	it('behandelt einen booleschen mediaUpload-Wert genauso wie das DB-Integer-Flag', () => {
		expect(isPhotoAnnouncementPending(true, 0, AFTER_LAUNCH)).toBe(true);
		expect(isPhotoAnnouncementPending(false, 0, AFTER_LAUNCH)).toBe(false);
	});

	// Der eigentliche Befund: Altbestand darf nicht als „wartet auf E-Mail" gelesen werden.
	it('ist falsch für eine Sichtung von vor dem Client-Start, selbst mit gesetztem Flag und ohne Datei', () => {
		expect(isPhotoAnnouncementPending(1, 0, LEGACY_DATE)).toBe(false);
		expect(isPhotoAnnouncementPending(1, 0, BEFORE_LAUNCH)).toBe(false);
	});

	it('ist falsch ohne verwertbares Erstellungsdatum — keine Aussage ohne Zeitbezug', () => {
		expect(isPhotoAnnouncementPending(1, 0, null)).toBe(false);
		expect(isPhotoAnnouncementPending(1, 0, undefined)).toBe(false);
	});

	it('akzeptiert sowohl Date-Objekte als auch ISO-Strings', () => {
		expect(isPhotoAnnouncementPending(1, 0, new Date(AFTER_LAUNCH))).toBe(true);
		expect(isPhotoAnnouncementPending(1, 0, new Date(LEGACY_DATE))).toBe(false);
	});

	it('exportiert einen stabilen deutschen Hinweistext', () => {
		expect(PHOTO_ANNOUNCEMENT_LABEL).toBe('Foto angekündigt, folgt per E-Mail');
	});

	it('exportiert einen stabilen Filterwert für die Admin-Arbeitsliste', () => {
		expect(MEDIA_UPLOAD_ANNOUNCED_MISSING).toBe('announced_missing');
	});

	it('exportiert das Startdatum des neuen Clients als Date', () => {
		expect(NEW_IOS_CLIENT_LAUNCH_DATE).toBeInstanceOf(Date);
		expect(NEW_IOS_CLIENT_LAUNCH_DATE.toISOString()).toBe('2026-07-30T00:00:00.000Z');
	});
});
