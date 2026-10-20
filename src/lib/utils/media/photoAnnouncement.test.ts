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
 * **Zwei Achsen grenzen den Zustand ein, und beide sind aus Fehlmeldungen
 * entstanden.**
 *
 * *Zeit* (gefunden 2026-07-30): `aufnahmeHochladen` ist kein neues Feld — die
 * Spalte trägt 13 Jahre Altbestand (früheste Zeile 2012-07-01). Ohne
 * Untergrenze meldete die Arbeitsliste 2.539 „ausstehende" Fotos, die nie
 * eintreffen werden, weil das Flag dort historisch nur „der Melder hatte ein
 * Foto" bedeutete.
 *
 * *Eingangskanal* (gefunden 2026-08-07): Dieselbe Verwechslung noch einmal,
 * eine Achse weiter. Der Zustand ist an den **App**-Kanal gebunden — nur dort
 * kann ein Client ein Foto ankündigen, ohne es zu übertragen. Bei einer per
 * Post, E-Mail, Fax oder Telefon eingegangenen Meldung setzt der Admin das
 * Flag beim Erfassen, weil ihm ein Foto **vorliegt**; es kommt nichts mehr
 * nach. Die Arbeitsliste forderte für solche Meldungen eine Datei an, die
 * niemand mehr schicken wird — auf der lokalen DB drei von vier Treffern.
 */
import { describe, expect, it } from 'vitest';
import { EntryChannelEnum } from '#lib/report/formOptions/entryChannel.ts';
import {
	isPhotoAnnouncementPending,
	MEDIA_UPLOAD_ANNOUNCED_MISSING,
	NEW_IOS_CLIENT_LAUNCH_DATE,
	PHOTO_ANNOUNCEMENT_LABEL
} from './photoAnnouncement';

const AFTER_LAUNCH = '2026-07-30T12:00:00Z';
const BEFORE_LAUNCH = '2026-07-29T23:59:59Z';
const LEGACY_DATE = '2015-03-12T08:00:00Z';

/** Der Regelfall: App-Meldung nach Client-Start, Flag gesetzt, keine Datei. */
const ausstehend = {
	mediaUpload: 1,
	attachedFileCount: 0,
	createdAt: AFTER_LAUNCH,
	entryChannel: EntryChannelEnum.APP
};

describe('isPhotoAnnouncementPending', () => {
	it('ist wahr, wenn die App ein Foto angekündigt hat, keine Datei angehängt ist und die Sichtung nach dem Client-Start liegt', () => {
		expect(isPhotoAnnouncementPending(ausstehend)).toBe(true);
	});

	it('ist falsch, sobald mindestens eine Datei angehängt ist', () => {
		expect(isPhotoAnnouncementPending({ ...ausstehend, attachedFileCount: 1 })).toBe(false);
		expect(isPhotoAnnouncementPending({ ...ausstehend, attachedFileCount: 3 })).toBe(false);
	});

	it('ist falsch, wenn kein Foto angekündigt wurde — unabhängig von der Dateizahl', () => {
		expect(isPhotoAnnouncementPending({ ...ausstehend, mediaUpload: 0 })).toBe(false);
		expect(isPhotoAnnouncementPending({ ...ausstehend, mediaUpload: null })).toBe(false);
		expect(isPhotoAnnouncementPending({ ...ausstehend, mediaUpload: undefined })).toBe(false);
	});

	it('behandelt einen booleschen mediaUpload-Wert genauso wie das DB-Integer-Flag', () => {
		expect(isPhotoAnnouncementPending({ ...ausstehend, mediaUpload: true })).toBe(true);
		expect(isPhotoAnnouncementPending({ ...ausstehend, mediaUpload: false })).toBe(false);
	});

	// Erster Befund: Altbestand darf nicht als „wartet auf E-Mail" gelesen werden.
	it('ist falsch für eine Sichtung von vor dem Client-Start, selbst mit gesetztem Flag und ohne Datei', () => {
		expect(isPhotoAnnouncementPending({ ...ausstehend, createdAt: LEGACY_DATE })).toBe(false);
		expect(isPhotoAnnouncementPending({ ...ausstehend, createdAt: BEFORE_LAUNCH })).toBe(false);
	});

	it('ist falsch ohne verwertbares Erstellungsdatum — keine Aussage ohne Zeitbezug', () => {
		expect(isPhotoAnnouncementPending({ ...ausstehend, createdAt: null })).toBe(false);
		expect(isPhotoAnnouncementPending({ ...ausstehend, createdAt: undefined })).toBe(false);
	});

	it('akzeptiert sowohl Date-Objekte als auch ISO-Strings', () => {
		expect(isPhotoAnnouncementPending({ ...ausstehend, createdAt: new Date(AFTER_LAUNCH) })).toBe(
			true
		);
		expect(isPhotoAnnouncementPending({ ...ausstehend, createdAt: new Date(LEGACY_DATE) })).toBe(
			false
		);
	});

	// Zweiter Befund: Nur die App kündigt an, ohne liefern zu können.
	it.each([
		['Web', EntryChannelEnum.WEB],
		['E-Mail', EntryChannelEnum.EMAIL],
		['Post', EntryChannelEnum.MAIL],
		['Fax', EntryChannelEnum.FAX],
		['Telefon', EntryChannelEnum.PHONE]
	])(
		'ist falsch für eine über %s eingegangene Meldung — dort liegt dem Admin das Foto bereits vor',
		(_kanal, entryChannel) => {
			expect(isPhotoAnnouncementPending({ ...ausstehend, entryChannel })).toBe(false);
		}
	);

	it('ist falsch ohne Eingangskanal — keine Aussage ohne bekannte Herkunft', () => {
		expect(isPhotoAnnouncementPending({ ...ausstehend, entryChannel: null })).toBe(false);
		expect(isPhotoAnnouncementPending({ ...ausstehend, entryChannel: undefined })).toBe(false);
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
