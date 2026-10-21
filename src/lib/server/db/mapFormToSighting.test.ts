import { AnimalBehaviorEnum } from '#lib/report/formOptions/animalBehavior.ts';
import { BoatDriveEnum } from '#lib/report/formOptions/boatDrive.ts';
import { DistributionEnum } from '#lib/report/formOptions/distribution.ts';
import { EntryChannelEnum } from '#lib/report/formOptions/entryChannel.ts';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import { SpeciesEnum } from '#lib/report/formOptions/species.ts';
import { mapLegacyToCurrentSchema } from '#lib/legacy-api/field-mapping.ts';
import type { LegacySightingRequest } from '#lib/legacy-api/types.ts';
import type { SightingFormData } from '#lib/report/types.ts';
import type { SightingFormValues } from '#lib/types/Form.ts';
import { TEST_TIME_ZONES, withTimeZone } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapFormToSighting } from './mapFormToSighting';

// Mock der Geo-Validierung
vi.mock('../geo/checkBalticSeaFile', () => ({
	checkBalticSeaFile: vi.fn()
}));

// Mock von drizzle-orm sql
vi.mock('drizzle-orm', () => ({
	sql: vi.fn((strings: TemplateStringsArray, ...values: any[]) => ({
		type: 'sql',
		strings,
		values
	}))
}));

import { sql } from 'drizzle-orm';
import { checkBalticSeaFile } from '../geo/checkBalticSeaFile';

describe('mapFormToSighting', () => {
	// Mock für konsistente Zeitzone-Tests
	const originalTimeZone = process.env.TZ;

	beforeEach(() => {
		// Setze Zeitzone für Tests
		process.env.TZ = 'UTC';

		vi.clearAllMocks();
		// Standard-Mock für Baltic Sea Check
		vi.mocked(checkBalticSeaFile).mockReturnValue({
			inBaltic: true,
			inChartArea: true,
			longitude: 13.2,
			latitude: 54.5
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		// Stelle ursprüngliche Zeitzone wieder her
		if (originalTimeZone !== undefined) {
			process.env.TZ = originalTimeZone;
		} else {
			delete process.env.TZ;
		}
	});

	/**
	 * Hilfsfunktion: Erstellt minimale Testdaten
	 */
	const createMinimalFormData = (): SightingFormData => ({
		referenceId: 'test-ref-123',
		uploadedFiles: [],
		hasPosition: true,
		latitude: 54.5,
		longitude: 13.2,
		waterway: undefined,
		seaMark: undefined,
		sightingDate: '2024-01-15',
		sightingTime: undefined,
		species: 0,
		totalCount: 1,
		juvenileCount: 0,
		isDead: false,
		deadCondition: undefined,
		deadSex: undefined,
		deadSize: undefined,
		sightingFrom: 1,
		sightingFromText: undefined,
		distance: 1,
		distribution: 1,
		distributionText: undefined,
		behavior: undefined,
		behaviorText: undefined,
		reaction: undefined,
		seaState: 1,
		visibility: 1,
		windForce: undefined,
		windDirection: undefined,
		mediaUpload: false,
		mediaFile: undefined,
		mediaConsent: false,
		shipName: undefined,
		homePort: undefined,
		boatType: undefined,
		shipCount: undefined,
		boatDrive: 1,
		boatDriveText: undefined,
		firstName: 'Test',
		lastName: 'User',
		email: 'test@example.com',
		phone: undefined,
		street: undefined,
		zipCode: undefined,
		city: undefined,
		shipNameConsent: false,
		nameConsent: false,
		privacyConsent: false,
		persistentDataConsent: false,
		entryChannel: 0,
		verified: false,
		deadPhoneContact: false,
		notes: undefined,
		otherObservations: undefined
	});

	/**
	 * Setzt Rohwerte an einem Formularobjekt, wie sie zur Laufzeit tatsächlich
	 * ankommen.
	 *
	 * `SightingFormData` ist aus dem Yup-Schema abgeleitet und kennt für die
	 * Koordinaten nur `number`. Über die Legacy-REST-Grenze und aus dem
	 * DOM-Eingabefeld kommen aber Zeichenketten — genau die Fälle, um die es in
	 * den Tests unten geht. Der Umweg über `Record<string, unknown>` hält das
	 * ohne `any` fest.
	 */
	const withRawValues = (
		formData: SightingFormData,
		raw: Record<string, unknown>
	): SightingFormData => Object.assign(formData, raw);

	/**
	 * Hilfsfunktion: Erstellt vollständige Testdaten
	 */
	const createCompleteFormData = (): SightingFormData => ({
		referenceId: 'test-ref-456',
		uploadedFiles: [
			{
				uid: 'file1-uid',
				originalName: 'file1.jpg',
				filePath: '/uploads/file1.jpg',
				mimeType: 'image/jpeg',
				size: 1024,
				fileName: 'file1.jpg',
				url: 'https://example.com/file1.jpg',
				uploadedAt: '2024-01-15T14:30:00Z',
				exifData: null
			},
			{
				uid: 'file2-uid',
				originalName: 'file2.jpg',
				filePath: '/uploads/file2.jpg',
				mimeType: 'image/jpeg',
				size: 2048,
				fileName: 'file2.jpg',
				url: 'https://example.com/file2.jpg',
				uploadedAt: '2024-01-15T14:30:00Z',
				exifData: null
			}
		],
		hasPosition: true,
		latitude: 54.5,
		longitude: 13.2,
		waterway: 'Greifswalder Bodden',
		seaMark: 'Leuchtturm Warnemünde',
		sightingDate: '2024-01-15',
		sightingTime: '14:30',
		species: 1,
		totalCount: 3,
		juvenileCount: 1,
		isDead: false,
		deadCondition: undefined,
		deadSex: undefined,
		deadSize: undefined,
		sightingFrom: 2,
		sightingFromText: 'Segelboot',
		distance: 3,
		distribution: 1,
		distributionText: 'Gruppe schwimmend',
		behavior: 2,
		behaviorText: 'Spielverhalten',
		reaction: 'Neugierig',
		seaState: 2,
		visibility: 3,
		windForce: undefined,
		windDirection: 'NW',
		mediaUpload: true,
		mediaFile: 'https://example.com/photo.jpg',
		mediaConsent: true,
		shipName: 'Meeresforschung I',
		homePort: 'Rostock',
		boatType: 'Segelboot',
		shipCount: 2,
		boatDrive: 1,
		boatDriveText: 'Elektromotor',
		firstName: 'Max',
		lastName: 'Mustermann',
		email: 'max@example.com',
		phone: '+49 123 456789',
		street: 'Musterstraße 1',
		zipCode: '18055',
		city: 'Rostock',
		shipNameConsent: true,
		nameConsent: true,
		privacyConsent: true,
		persistentDataConsent: true,
		entryChannel: 0,
		verified: false,
		deadPhoneContact: false,
		notes: 'Admin-Notiz',
		otherObservations: 'Weitere Beobachtungen'
	});

	describe('Grundfunktionalität', () => {
		it('sollte minimale Formulardaten korrekt konvertieren', () => {
			const formData = createMinimalFormData();
			const result = mapFormToSighting(formData);

			// Basis-Felder prüfen
			expect(result.referenceId).toBe('test-ref-123');
			expect(result.created).toBeDefined();
			expect(new Date(result.created)).toBeInstanceOf(Date);

			// Standardwerte prüfen
			expect(result.entryChannel).toBe(Number(EntryChannelEnum.WEB));
			expect(result.verified).toBe(0);
			expect(result.mediaUpload).toBe(0); // Keine Dateien hochgeladen
			expect(result.isDead).toBe(0);
			expect(result.shipNameConsent).toBe(0);
			expect(result.nameConsent).toBe(0);
			expect(result.privacyConsent).toBe(0);
			expect(result.deadPhoneContact).toBe(0);
		});

		it('sollte vollständige Formulardaten korrekt konvertieren', () => {
			const formData = createCompleteFormData();
			const result = mapFormToSighting(formData);

			// Metadaten
			expect(result.referenceId).toBe('test-ref-456');
			expect(result.created).toBeDefined();

			// Geografische Daten
			expect(result.latitude).toBe('54.5');
			expect(result.longitude).toBe('13.2');
			expect(result.waterway).toBe('Greifswalder Bodden');
			expect(result.seaMark).toBe('Leuchtturm Warnemünde');

			// Tierbeobachtung
			expect(result.species).toBe(1);
			expect(result.totalCount).toBe(3);
			expect(result.juvenileCount).toBe(1);

			// Umweltbedingungen
			expect(result.seaState).toBe(2);
			expect(result.visibility).toBe(3);
			expect(result.windForce).toBeNull();
			expect(result.windDirection).toBe('NW');

			// Kontaktdaten
			expect(result.firstName).toBe('Max');
			expect(result.lastName).toBe('Mustermann');
			expect(result.email).toBe('max@example.com');

			// Einwilligungen (boolean zu int)
			expect(result.shipNameConsent).toBe(1);
			expect(result.nameConsent).toBe(1);
			expect(result.privacyConsent).toBe(1);

			// Medien
			expect(result.mediaUpload).toBe(1); // Dateien vorhanden
			expect(result.mediaFile).toBe('https://example.com/photo.jpg');
		});
	});

	describe('Geografische Verarbeitung', () => {
		it('sollte PostGIS-Geometrie für gültige Koordinaten erstellen', () => {
			const formData = createMinimalFormData();
			formData.latitude = 54.5;
			formData.longitude = 13.2;

			const result = mapFormToSighting(formData);

			// PostGIS SQL sollte aufgerufen werden
			expect(sql).toHaveBeenCalledWith(
				expect.arrayContaining(['ST_SetSRID(ST_MakePoint(', ', ', '), 4326)']),
				13.2,
				54.5
			);
			expect(result.location).toBeDefined();
			expect(result.latitude).toBe('54.5');
			expect(result.longitude).toBe('13.2');
		});

		it('sollte Baltic Sea Validierung für gültige Koordinaten durchführen', () => {
			const formData = createMinimalFormData();
			formData.latitude = 54.5;
			formData.longitude = 13.2;

			vi.mocked(checkBalticSeaFile).mockReturnValue({
				inBaltic: true,
				inChartArea: false,
				longitude: 13.2,
				latitude: 54.5
			});

			const result = mapFormToSighting(formData);

			expect(checkBalticSeaFile).toHaveBeenCalledWith(13.2, 54.5);
			expect(result.inBalticSea).toBe(1);
			expect(result.inBalticSeaGeo).toBe(0);
		});

		it('sollte ungültige Koordinaten ignorieren', () => {
			const formData = createMinimalFormData();
			formData.latitude = NaN;
			formData.longitude = 13.2;

			const result = mapFormToSighting(formData);

			// Die Funktion prüft isNaN(), daher wird location null
			// formData.latitude ist NaN, formData.latitude ? String(formData.latitude) : null -> null
			expect(result.location).toBeNull();
			expect(result.latitude).toBeNull(); // NaN ist falsy, daher null
			expect(result.longitude).toBe('13.2');
			expect(result.inBalticSea).toBe(0);
			expect(result.inBalticSeaGeo).toBe(0);
			expect(checkBalticSeaFile).not.toHaveBeenCalled();
		});

		it('sollte fehlende Koordinaten handhaben', () => {
			const formData = createMinimalFormData();
			// latitude und longitude explizit auf null setzen
			formData.latitude = null as any;
			formData.longitude = null as any;

			const result = mapFormToSighting(formData);

			expect(result.location).toBeNull();
			expect(result.latitude).toBeNull();
			expect(result.longitude).toBeNull();
			expect(checkBalticSeaFile).not.toHaveBeenCalled();
		});

		/**
		 * Eine Null als **Zeichenkette** ist keine Position.
		 *
		 * Die Prüfung lief bis 2026-08-02 über die Truthiness des Rohwerts. Für
		 * eine Zahl stimmt das — `0` ist falsy —, für den String `'0.0000'` nicht:
		 * er ist truthy und hätte einen PostGIS-Punkt bei 0°/0° erzeugt.
		 *
		 * Erreichbar ist dieser Eingang über die Legacy-REST-Grenze:
		 * `mapLegacyToCurrentSchema` reicht `gps_breite` weiter, wie es ankommt,
		 * und die Spezifikation sieht dort Strings vor. Der Formularpfad castet
		 * vorher über Yup und kam nie hier an.
		 */
		it('sollte eine Koordinaten-Null als Zeichenkette nicht als Position werten', () => {
			const formData = withRawValues(createMinimalFormData(), {
				latitude: '0.0000',
				longitude: '0.0000'
			});

			const result = mapFormToSighting(formData);

			expect(result.location).toBeNull();
			expect(result.latitude).toBeNull();
			expect(result.longitude).toBeNull();
			expect(checkBalticSeaFile).not.toHaveBeenCalled();
		});

		it('sollte die volle Nachkommastellen-Genauigkeit übernehmen', () => {
			const formData = withRawValues(createMinimalFormData(), {
				latitude: '54.123456',
				longitude: '13.654321'
			});

			const result = mapFormToSighting(formData);

			expect(result.latitude).toBe('54.123456');
			expect(result.longitude).toBe('13.654321');
		});
	});

	describe('Freitext-Felder', () => {
		it('sollte den internen Kommentar übernehmen', () => {
			// Das Admin-Formular bietet das Feld an (`Administrative.svelte`), der
			// Mapper bildete es aber nicht ab — getippter Text war nach dem
			// Speichern spurlos weg. Clients können es nicht setzen: Der öffentliche
			// POST überschreibt es mit `undefined` (`api/sightings/+server.ts`).
			const formData = createMinimalFormData();
			formData.internalComment = 'Rückfrage an den Melder offen';

			expect(mapFormToSighting(formData).internalComment).toBe('Rückfrage an den Melder offen');
		});
	});

	describe('Datum/Zeit-Verarbeitung', () => {
		it('sollte Datum und Zeit korrekt kombinieren', () => {
			const formData = createMinimalFormData();
			formData.sightingDate = '2024-01-15';
			formData.sightingTime = '14:30';

			const result = mapFormToSighting(formData);
			const parsedDate = new Date(result.sightingDate);

			// correctCestOffsetUTC zieht 1h ab (Januar = CET = UTC+1),
			// sodass 14:30 Ortszeit als 13:30 UTC gespeichert wird.
			// UTC-Accessor verwenden, damit der Test timezone-unabhängig läuft.
			expect(parsedDate.getUTCFullYear()).toBe(2024);
			expect(parsedDate.getUTCMonth()).toBe(0); // Januar = 0
			expect(parsedDate.getUTCDate()).toBe(15);
			expect(parsedDate.getUTCHours()).toBe(13);
			expect(parsedDate.getUTCMinutes()).toBe(30);
			expect(parsedDate.getUTCSeconds()).toBe(0);
		});

		it('sollte nur Datum verwenden wenn Zeit fehlt', () => {
			const formData = createMinimalFormData();
			formData.sightingDate = '2024-01-15';
			// sightingTime bleibt null

			const result = mapFormToSighting(formData);

			// Sollte aktuelles Datum verwenden, da Zeit fehlt
			const now = new Date(formData.sightingDate);
			const parsedDate = new Date(result.sightingDate);

			// Prüfe dass es das aktuelle Datum ist (grober Check)
			expect(Math.abs(parsedDate.getTime() - now.getTime())).toBeLessThan(2 * 60 * 60 * 1000 + 100); // 2 Stunden Toleranz
		});

		it('sollte aktuelles Datum verwenden wenn beides fehlt', () => {
			const formData = createMinimalFormData();
			formData.sightingDate = '';
			formData.sightingTime = undefined;

			const result = mapFormToSighting(formData);

			const now = new Date();
			const parsedDate = new Date(result.sightingDate);

			expect(Math.abs(parsedDate.getTime() - now.getTime())).toBeLessThan(2 * 60 * 60 * 1000 + 100);
		});

		it('sollte ungültiges Zeitformat robust behandeln', () => {
			const formData = createMinimalFormData();
			formData.sightingDate = '2024-01-15';
			formData.sightingTime = 'invalid-time';

			const result = mapFormToSighting(formData);

			// Ungültiges Zeitformat passt nicht auf /^\d{2}:\d{2}$/ →
			// combineToDate gibt midnight UTC zurück (new Date('2024-01-15') = 2024-01-15T00:00:00Z).
			// correctCestOffsetUTC zieht 1h ab (Januar = CET) → 2024-01-14T23:00:00Z.
			// UTC-Accessor verwenden für timezone-unabhängige Prüfung.
			const parsedDate = new Date(result.sightingDate);
			expect(parsedDate.getUTCDate()).toBe(14); // Überlauf auf Vortag durch CET-Korrektur
			expect(parsedDate.getUTCHours()).toBe(23); // midnight - 1h = 23:00 UTC
			expect(parsedDate.getUTCMinutes()).toBe(0);
		});
	});

	describe('Zeitzonen-Robustheit (K1)', () => {
		it('ignoriert ein mitgeschicktes sightingDatetime und kombiniert Sommerzeit selbst', () => {
			const formData = createMinimalFormData();
			formData.sightingDate = '2026-07-15';
			formData.sightingTime = '14:30';
			// Ein Client könnte (mit seiner eigenen Zeitzone) einen abweichenden
			// Instant mitschicken — der Server darf ihn nicht übernehmen.
			(formData as Record<string, unknown>).sightingDatetime = new Date('2026-07-15T20:30:00.000Z');

			const result = mapFormToSighting(formData as SightingFormValues);

			// Berlin ist im Juli MESZ (UTC+2): 14:30 Wanduhr → 12:30 UTC
			expect(new Date(result.sightingDate).toISOString()).toBe('2026-07-15T12:30:00.000Z');
		});

		it('ignoriert ein mitgeschicktes sightingDatetime und kombiniert Winterzeit selbst', () => {
			const formData = createMinimalFormData();
			formData.sightingDate = '2026-01-15';
			formData.sightingTime = '14:30';
			(formData as Record<string, unknown>).sightingDatetime = new Date('2026-01-15T20:30:00.000Z');

			const result = mapFormToSighting(formData as SightingFormValues);

			// Berlin ist im Januar MEZ (UTC+1): 14:30 Wanduhr → 13:30 UTC
			expect(new Date(result.sightingDate).toISOString()).toBe('2026-01-15T13:30:00.000Z');
		});

		it('liefert in jeder Prozess-Zeitzone denselben Instant', () => {
			const results = TEST_TIME_ZONES.map((timeZone) =>
				withTimeZone(timeZone, () => {
					const formData = createMinimalFormData();
					formData.sightingDate = '2026-07-15';
					formData.sightingTime = '14:30';
					return new Date(mapFormToSighting(formData).sightingDate).toISOString();
				})
			);

			expect(results).toEqual(TEST_TIME_ZONES.map(() => '2026-07-15T12:30:00.000Z'));
		});
	});

	describe('String-zu-Number-Konvertierungen', () => {
		it('sollte numerische Strings korrekt konvertieren', () => {
			const formData = createMinimalFormData();
			formData.species = 5;
			formData.totalCount = 12;
			formData.juvenileCount = 3;
			formData.distance = 2;
			formData.seaState = 4;
			formData.visibility = 1;

			const result = mapFormToSighting(formData);

			expect(result.species).toBe(5);
			expect(result.totalCount).toBe(12);
			expect(result.juvenileCount).toBe(3);
			expect(result.distance).toBe(2);
			expect(result.seaState).toBe(4);
			expect(result.visibility).toBe(1);
		});

		it('sollte leere Strings als 0 behandeln', () => {
			const formData = createMinimalFormData();
			formData.species = 0;
			formData.totalCount = 0;

			const result = mapFormToSighting(formData);

			expect(result.species).toBe(0);
			expect(result.totalCount).toBe(0);
		});

		it('behandelt NaN bei der Tierart als fehlende Angabe, nicht als Schweinswal', () => {
			// Früher fiel NaN über den Falsy-Zweig auf `0` — und `0` ist
			// "Schweinswal". Eine kaputte Eingabe erzeugte damit eine
			// erfundene Artmeldung.
			const formData = createMinimalFormData();
			formData.species = NaN;

			expect(() => mapFormToSighting(formData)).toThrowError(/Tierart/i);
		});

		it('konvertiert NaN bei der Gesamtzahl weiterhin zu 0', () => {
			const formData = createMinimalFormData();
			formData.totalCount = NaN;

			expect(mapFormToSighting(formData).totalCount).toBe(0);
		});
	});

	describe('Boolean-zu-Integer-Konvertierungen', () => {
		it('sollte true-Werte zu 1 konvertieren', () => {
			const formData = createMinimalFormData();
			formData.isDead = true;
			formData.shipNameConsent = true;
			formData.nameConsent = true;
			formData.privacyConsent = true;
			formData.verified = true;
			formData.deadPhoneContact = true;

			const result = mapFormToSighting(formData);

			expect(result.isDead).toBe(1);
			expect(result.shipNameConsent).toBe(1);
			expect(result.nameConsent).toBe(1);
			expect(result.privacyConsent).toBe(1);
			expect(result.verified).toBe(1);
			expect(result.deadPhoneContact).toBe(1);
		});

		it('sollte false-Werte zu 0 konvertieren', () => {
			const formData = createMinimalFormData();
			// Alle boolean-Felder sind bereits false in createMinimalFormData

			const result = mapFormToSighting(formData);

			expect(result.isDead).toBe(0);
			expect(result.shipNameConsent).toBe(0);
			expect(result.nameConsent).toBe(0);
			expect(result.privacyConsent).toBe(0);
			expect(result.verified).toBe(0);
			expect(result.deadPhoneContact).toBe(0);
		});
	});

	describe('Media-Upload-Behandlung', () => {
		it('sollte mediaUpload=1 setzen wenn Dateien vorhanden', () => {
			const formData = { ...createMinimalFormData(), mediaUpload: true };
			formData.uploadedFiles = [
				{
					uid: 'file1-uid',
					originalName: 'file1.jpg',
					filePath: '/uploads/file1.jpg',
					mimeType: 'image/jpeg',
					size: 1024,
					fileName: 'file1.jpg',
					url: 'https://example.com/file1.jpg',
					uploadedAt: '2024-01-15T14:30:00Z',
					exifData: null
				}
			];

			const result = mapFormToSighting(formData);

			expect(result.mediaUpload).toBe(1);
		});

		it('sollte mediaUpload=0 setzen wenn keine Dateien vorhanden', () => {
			const formData = createMinimalFormData();
			formData.uploadedFiles = [];

			const result = mapFormToSighting(formData);

			expect(result.mediaUpload).toBe(0);
		});
	});

	describe('Totfund-Spezifische Felder', () => {
		it('sollte Totfund-Felder korrekt behandeln', () => {
			const formData = createMinimalFormData();
			formData.isDead = true;
			formData.deadCondition = 2;
			formData.deadSex = 1;
			formData.deadSize = 150;
			formData.deadPhoneContact = true;

			const result = mapFormToSighting(formData);

			expect(result.isDead).toBe(1);
			expect(result.deadCondition).toBe(2);
			expect(result.deadSex).toBe(1);
			expect(result.deadSize).toBe(150);
			expect(result.deadPhoneContact).toBe(1);
		});

		it('sollte null-Werte bei Totfund-Feldern handhaben', () => {
			const formData = createMinimalFormData();
			formData.isDead = true;
			// Andere Totfund-Felder bleiben null

			const result = mapFormToSighting(formData);

			expect(result.isDead).toBe(1);
			expect(result.deadCondition).toBe(0);
			expect(result.deadSex).toBe(0);
			expect(result.deadSize).toBeNull(); // deadSize kann null sein
		});
	});

	describe('Entry Channel Standard', () => {
		it('sollte Standard Entry Channel setzen wenn nicht angegeben', () => {
			const formData = createMinimalFormData();
			// entryChannel bleibt null

			const result = mapFormToSighting(formData);

			expect(result.entryChannel).toBe(Number(EntryChannelEnum.WEB));
		});

		it('sollte angegebenen Entry Channel verwenden', () => {
			const formData = createMinimalFormData();
			formData.entryChannel = 2; // Mobile App

			const result = mapFormToSighting(formData);

			expect(result.entryChannel).toBe(2);
		});
	});

	describe('entryClient wird nie aus den Formulardaten übernommen', () => {
		it('übernimmt ein in den Formulardaten mitgeschicktes entryClient nicht ins Insert-Objekt', () => {
			// entryClient wird ausschließlich vom Aufrufer (resolveEntryClient)
			// bestimmt und als eigener Parameter an saveSighting durchgereicht —
			// nie aus formData. Das ist heute nur dadurch sicher, dass diese
			// Funktion ein explizites Objektliteral ohne Spread baut. Führte
			// jemand hier ein `...formData` ein, würde dieser Test rot: Ein
			// Angreifer könnte sich sonst über den Request-Body eine beliebige
			// Client-Kennung ausdenken.
			const formData = withRawValues(createMinimalFormData(), {
				entryClient: 'gefälscht/1.0'
			});

			const result = mapFormToSighting(formData);

			expect(result).not.toHaveProperty('entryClient');
		});
	});

	describe('Edge Cases und Robustheit', () => {
		it('sollte sehr große Zahlen handhaben', () => {
			const formData = createMinimalFormData();
			formData.totalCount = 999999;
			formData.shipCount = 50;

			const result = mapFormToSighting(formData);

			expect(result.totalCount).toBe(999999);
			expect(result.shipCount).toBe(50);
		});

		it('sollte leere Strings als null behandeln für optionale Felder', () => {
			const formData = createMinimalFormData();
			formData.waterway = '';
			formData.firstName = '';
			formData.notes = '';

			const result = mapFormToSighting(formData);

			expect(result.waterway).toBe('');
			expect(result.firstName).toBe('');
			expect(result.notes).toBe('');
		});

		it('sollte Sonderzeichen in Text-Feldern handhaben', () => {
			const formData = createMinimalFormData();
			formData.behaviorText = 'Äöü ß & < > " \' 🐋';
			formData.otherObservations = 'Line 1\\nLine 2\\tTabbed';

			const result = mapFormToSighting(formData);

			expect(result.behaviorText).toBe('Äöü ß & < > " \' 🐋');
			expect(result.otherObservations).toBe('Line 1\\nLine 2\\tTabbed');
		});
	});

	describe('Bootsantrieb bei Land-Sichtungen', () => {
		/**
		 * Die Spalte `bootsantrieb` ist `integer default(0) notNull` und `0`
		 * bedeutet "Sonstiger Bootsantrieb". Ohne expliziten Wert trug jede
		 * Land-Sichtung damit die aktive Behauptung, es habe ein Boot mit
		 * ungewöhnlichem Antrieb gegeben. `NONE` macht "kein Boot" eindeutig.
		 */
		it('speichert NONE statt OTHER, wenn von Land beobachtet wurde', () => {
			const formData = createMinimalFormData();
			formData.sightingFrom = SightingFromEnum.LAND;
			formData.boatDrive = undefined;

			const result = mapFormToSighting(formData);

			expect(result.boatDrive).toBe(BoatDriveEnum.NONE);
			expect(result.boatDrive).not.toBe(BoatDriveEnum.OTHER);
		});

		it('speichert NONE auch, wenn sightingFrom als String ankommt (HTML-Select)', () => {
			const formData = createMinimalFormData();
			formData.sightingFrom = String(SightingFromEnum.LAND) as unknown as number;
			formData.boatDrive = undefined;

			const result = mapFormToSighting(formData);

			expect(result.boatDrive).toBe(BoatDriveEnum.NONE);
		});

		it('überschreibt einen vorhandenen Antrieb bei Land NICHT', () => {
			// Admin-Edit einer Alt-Sichtung: der gespeicherte Wert darf nicht
			// still verloren gehen (76 solcher Zeilen im Bestand).
			const formData = createMinimalFormData();
			formData.sightingFrom = SightingFromEnum.LAND;
			formData.boatDrive = BoatDriveEnum.ANCHORED;

			const result = mapFormToSighting(formData);

			expect(result.boatDrive).toBe(BoatDriveEnum.ANCHORED);
		});

		it('behauptet nie "Sonstiger Antrieb", wenn kein Antrieb angegeben wurde', () => {
			// Der Fallback darf keine Antriebsart erfinden. Ohne Angabe wird
			// NONE geschrieben — nie OTHER, das eine aktive Wahl bedeutet.
			for (const from of [
				SightingFromEnum.SAILBOAT,
				SightingFromEnum.MOTORBOAT,
				SightingFromEnum.FERRY,
				SightingFromEnum.OTHER,
				SightingFromEnum.UNKNOWN
			]) {
				const formData = createMinimalFormData();
				formData.sightingFrom = from;
				formData.boatDrive = undefined;

				expect(mapFormToSighting(formData).boatDrive).toBe(BoatDriveEnum.NONE);
				expect(mapFormToSighting(formData).boatDrive).not.toBe(BoatDriveEnum.OTHER);
			}
		});

		it('schreibt NONE auch, wenn sightingFrom selbst fehlt', () => {
			const formData = createMinimalFormData();
			formData.sightingFrom = undefined as unknown as number;
			formData.boatDrive = undefined;

			expect(mapFormToSighting(formData).boatDrive).toBe(BoatDriveEnum.NONE);
		});

		it('wertet NaN und Leerstring als fehlende Angabe', () => {
			for (const value of [NaN, '']) {
				const formData = createMinimalFormData();
				formData.sightingFrom = SightingFromEnum.MOTORBOAT;
				formData.boatDrive = value as unknown as number;

				expect(mapFormToSighting(formData).boatDrive).toBe(BoatDriveEnum.NONE);
			}
		});

		it('erhält eine explizite Auswahl "Sonstiger Antrieb" auf einem Boot', () => {
			const formData = createMinimalFormData();
			formData.sightingFrom = SightingFromEnum.MOTORBOAT;
			formData.boatDrive = BoatDriveEnum.OTHER;

			expect(mapFormToSighting(formData).boatDrive).toBe(BoatDriveEnum.OTHER);
		});
	});

	describe('Beobachtungsort ohne Angabe', () => {
		/**
		 * `vonwo` ist `integer default(0) notNull` und `0` bedeutet "Sonstiges"
		 * — eine echte Kategorie. Ohne Angabe entstand bisher trotzdem eine `0`
		 * und damit eine Antwort, die nie gegeben wurde.
		 */
		it('speichert UNKNOWN, wenn nichts angegeben wurde', () => {
			const formData = createMinimalFormData();
			formData.sightingFrom = undefined as unknown as number;

			expect(mapFormToSighting(formData).sightingFrom).toBe(SightingFromEnum.UNKNOWN);
		});

		it('speichert UNKNOWN auch bei null', () => {
			const formData = createMinimalFormData();
			formData.sightingFrom = null as unknown as number;

			expect(mapFormToSighting(formData).sightingFrom).toBe(SightingFromEnum.UNKNOWN);
		});

		it('speichert UNKNOWN bei leerem String (Select ohne Auswahl)', () => {
			const formData = createMinimalFormData();
			formData.sightingFrom = '' as unknown as number;

			expect(mapFormToSighting(formData).sightingFrom).toBe(SightingFromEnum.UNKNOWN);
		});

		it('erhält eine aktive Auswahl "Sonstiges" (0) — das ist keine fehlende Angabe', () => {
			const formData = createMinimalFormData();
			formData.sightingFrom = SightingFromEnum.OTHER;

			expect(mapFormToSighting(formData).sightingFrom).toBe(SightingFromEnum.OTHER);
		});

		it('reicht alle übrigen Werte unverändert durch, auch als String', () => {
			for (const from of [
				SightingFromEnum.SAILBOAT,
				SightingFromEnum.MOTORBOAT,
				SightingFromEnum.LAND,
				SightingFromEnum.FERRY
			]) {
				const numeric = createMinimalFormData();
				numeric.sightingFrom = from;
				expect(mapFormToSighting(numeric).sightingFrom).toBe(from);

				const asString = createMinimalFormData();
				asString.sightingFrom = String(from) as unknown as number;
				expect(mapFormToSighting(asString).sightingFrom).toBe(from);
			}
		});
	});

	describe('Entfernung ohne Angabe', () => {
		/**
		 * `entfernung` ist `integer default(0) notNull`, das Enum geht aber von
		 * 1 bis 5 — `0` ist also **keine** Kategorie, sondern ein Sentinel für
		 * "nicht angegeben" (282 Bestandszeilen). Anders als bei `verteilung`
		 * oder `tierart` behauptet die Null hier nichts Falsches; sie wird als
		 * "Unbekannt" angezeigt. Bleibt deshalb bewusst bei 0.
		 */
		it('schreibt den Sentinel 0, wenn keine Entfernung angegeben wurde', () => {
			const formData = createMinimalFormData();
			formData.distance = undefined as unknown as number;

			expect(mapFormToSighting(formData).distance).toBe(0);
		});

		it('behandelt NaN und Leerstring ebenfalls als fehlende Angabe', () => {
			for (const value of [NaN, '']) {
				const formData = createMinimalFormData();
				formData.distance = value as unknown as number;

				expect(mapFormToSighting(formData).distance).toBe(0);
			}
		});

		it('reicht gültige Entfernungen unverändert durch, auch als String', () => {
			const numeric = createMinimalFormData();
			numeric.distance = 5;
			expect(mapFormToSighting(numeric).distance).toBe(5);

			const asString = createMinimalFormData();
			asString.distance = '5' as unknown as number;
			expect(mapFormToSighting(asString).distance).toBe(5);
		});
	});

	describe('Verteilung und Verhalten ohne Angabe', () => {
		it('speichert UNKNOWN statt OTHER, wenn die Verteilung fehlt', () => {
			const formData = createMinimalFormData();
			formData.distribution = undefined;

			expect(mapFormToSighting(formData).distribution).toBe(DistributionEnum.UNKNOWN);
		});

		it('speichert UNKNOWN statt OTHER, wenn das Verhalten fehlt', () => {
			const formData = createMinimalFormData();
			formData.behavior = undefined;

			expect(mapFormToSighting(formData).behavior).toBe(AnimalBehaviorEnum.UNKNOWN);
		});

		it('erhält die aktive Wahl "Sonstige" (0) in beiden Feldern', () => {
			const formData = createMinimalFormData();
			formData.distribution = DistributionEnum.OTHER;
			formData.behavior = AnimalBehaviorEnum.OTHER;

			const result = mapFormToSighting(formData);

			expect(result.distribution).toBe(DistributionEnum.OTHER);
			expect(result.behavior).toBe(AnimalBehaviorEnum.OTHER);
		});

		it('reicht übrige Werte unverändert durch, auch als String', () => {
			const formData = createMinimalFormData();
			formData.distribution = String(DistributionEnum.SCHOOLS) as unknown as number;
			formData.behavior = String(AnimalBehaviorEnum.VARYING_COURSE) as unknown as number;

			const result = mapFormToSighting(formData);

			expect(result.distribution).toBe(DistributionEnum.SCHOOLS);
			expect(result.behavior).toBe(AnimalBehaviorEnum.VARYING_COURSE);
		});
	});

	describe('Windstärke — die Null ist Windstille', () => {
		/**
		 * `windstaerke` ist die Ausnahme unter den drei Umweltfeldern: Bei
		 * `seegang` und `sichtweite` heißt `0` laut `antworten.json` tatsächlich
		 * "Keine Angabe", bei der Windstärke ist es die Beaufort-Stufe
		 * "Windstille" — ein gemessener Wert.
		 *
		 * Ein `formData.windForce ? … : null` machte daraus `NULL` und damit im
		 * Admin und im CSV-Export "Nicht angegeben". Aufgefallen am 2026-08-03
		 * an einer echten App-Meldung aus dem Legacy-Posteingang; im Bestand
		 * gibt es 7 Zeilen mit `'0'`, das Altsystem konnte es also.
		 */
		it('speichert eine gemeldete Windstille als "0" statt als NULL', () => {
			const formData = createMinimalFormData();
			formData.windForce = 0;

			expect(mapFormToSighting(formData).windForce).toBe('0');
		});

		it('speichert die Windstille auch als String, wie sie aus Formulardaten kommt', () => {
			const formData = createMinimalFormData();
			formData.windForce = '0' as unknown as number;

			expect(mapFormToSighting(formData).windForce).toBe('0');
		});

		it('schreibt NULL, wenn keine Windstärke übermittelt wurde', () => {
			for (const value of [undefined, null, '', '   ']) {
				const formData = createMinimalFormData();
				formData.windForce = value as unknown as number;

				expect(mapFormToSighting(formData).windForce).toBeNull();
			}
		});

		it('reicht übrige Windstärken unverändert durch, als Zahl wie als String', () => {
			const numeric = createMinimalFormData();
			numeric.windForce = 5;
			expect(mapFormToSighting(numeric).windForce).toBe('5');

			const asString = createMinimalFormData();
			asString.windForce = '5' as unknown as number;
			expect(mapFormToSighting(asString).windForce).toBe('5');
		});

		/**
		 * Die Spalte ist nur zwei Zeichen breit — ein durchgereichtes `NaN`
		 * würde als `'NaN'` gar nicht hineinpassen und den Insert sprengen.
		 */
		it('schreibt NULL statt "NaN", wenn die Angabe keine Zahl ist', () => {
			const formData = createMinimalFormData();
			formData.windForce = NaN;

			expect(mapFormToSighting(formData).windForce).toBeNull();
		});

		/**
		 * Der Weg, auf dem der Verlust aufgefallen ist: `parseWindForce` in
		 * `field-mapping.ts` reicht die 0 ausdrücklich durch — eine Ebene
		 * tiefer wurde sie trotzdem verworfen. Beide Hälften einzeln grün, die
		 * Kette rot; deshalb steht hier ein Test über beide.
		 */
		it('hält die Windstille über die ganze Legacy-Kette durch', () => {
			const legacy = mapLegacyToCurrentSchema({
				sichtungsdatum: '2026-07-30 15:33',
				gps_breite: '54.359396',
				gps_laenge: '10.618121',
				anzahl_gesamt: 2,
				windstaerke: 0,
				windrichtung: 'N',
				email: 'melder@example.com'
			} as unknown as LegacySightingRequest);

			expect(legacy.windForce).toBe(0);
			expect(mapFormToSighting(legacy as unknown as SightingFormValues).windForce).toBe('0');
		});
	});

	describe('Tierart — kein stiller Schweinswal', () => {
		/**
		 * `tierart` ist `smallint default(0) notNull` und `0` bedeutet
		 * "Schweinswal". Eine fehlende Art wurde damit zur Meldung eines
		 * Schweinswals — für ein Forschungsmuseum ein Phantom-Datensatz.
		 *
		 * `species` ist Pflichtfeld; ein Fehlen ist deshalb ein echter Fehler
		 * und kein zu ratender Wert. Der Legacy-Vertrag bleibt unberührt:
		 * `mapLegacyToCurrentSchema` setzt den dokumentierten Default
		 * (`tierart ?? SpeciesEnum.HARBOR_PORPOISE`) bereits an der Legacy-Grenze.
		 */
		it('wirft, wenn keine Tierart angegeben wurde', () => {
			const formData = createMinimalFormData();
			formData.species = undefined as unknown as number;

			expect(() => mapFormToSighting(formData)).toThrowError(/Tierart/i);
		});

		it('wirft auch bei null und leerem String', () => {
			for (const value of [null, '']) {
				const formData = createMinimalFormData();
				formData.species = value as unknown as number;

				expect(() => mapFormToSighting(formData)).toThrowError(/Tierart/i);
			}
		});

		it('erhält eine aktive Auswahl "Schweinswal" (0)', () => {
			const formData = createMinimalFormData();
			formData.species = SpeciesEnum.HARBOR_PORPOISE;

			expect(mapFormToSighting(formData).species).toBe(SpeciesEnum.HARBOR_PORPOISE);
		});

		it('reicht andere Arten unverändert durch, auch als String', () => {
			const numeric = createMinimalFormData();
			numeric.species = SpeciesEnum.GREY_SEAL;
			expect(mapFormToSighting(numeric).species).toBe(SpeciesEnum.GREY_SEAL);

			const asString = createMinimalFormData();
			asString.species = String(SpeciesEnum.GREY_SEAL) as unknown as number;
			expect(mapFormToSighting(asString).species).toBe(SpeciesEnum.GREY_SEAL);
		});
	});

	describe('Integration mit checkBalticSeaFile', () => {
		it('sollte verschiedene Baltic Sea Validierungsergebnisse handhaben', () => {
			const testCases = [
				{ inBaltic: true, inChartArea: true, expectedBaltic: 1, expectedGeo: 1 },
				{ inBaltic: true, inChartArea: false, expectedBaltic: 1, expectedGeo: 0 },
				{ inBaltic: false, inChartArea: true, expectedBaltic: 0, expectedGeo: 1 },
				{ inBaltic: false, inChartArea: false, expectedBaltic: 0, expectedGeo: 0 }
			];

			testCases.forEach(({ inBaltic, inChartArea, expectedBaltic, expectedGeo }) => {
				vi.mocked(checkBalticSeaFile).mockReturnValue({
					inBaltic,
					inChartArea,
					longitude: 13.2,
					latitude: 54.5
				});

				const formData = createMinimalFormData();
				formData.latitude = 54.5;
				formData.longitude = 13.2;

				const result = mapFormToSighting(formData);

				expect(result.inBalticSea).toBe(expectedBaltic);
				expect(result.inBalticSeaGeo).toBe(expectedGeo);
			});
		});
	});
});
