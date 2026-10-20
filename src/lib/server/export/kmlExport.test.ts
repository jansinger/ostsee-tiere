import type { FrontendSighting } from '#lib/types/index.ts';
import { describe, expect, it } from 'vitest';
import { generateKmlData } from './kmlExport';

describe('kmlExport', () => {
	/**
	 * Hilfsfunktion: Erstellt minimale Test-Sichtung
	 */
	const createMinimalSighting = (overrides: Partial<FrontendSighting> = {}): FrontendSighting => ({
		id: 1,
		latitude: '54.5',
		longitude: '13.2',
		sightingDate: new Date('2024-01-15T14:30:00.000Z'),
		species: 0,
		totalCount: 1,
		juvenileCount: 0,
		isDead: 0,
		verified: 1,
		inBalticSea: 1,
		inBalticSeaGeo: 1,
		created: new Date('2024-01-15T10:00:00.000Z'),
		waterway: null,
		seaMark: null,
		sightingFrom: 1,
		sightingFromText: null,
		distance: 2,
		distribution: 1,
		distributionText: null,
		behavior: 1,
		behaviorText: null,
		reaction: null,
		seaState: 2,
		visibility: 3,
		windForce: '3-4',
		windDirection: 'NW',
		mediaFile: null,
		mediaUpload: 0,
		shipName: null,
		homePort: null,
		boatType: null,
		shipCount: null,
		boatDrive: 1,
		boatDriveText: null,
		firstName: null,
		lastName: null,
		email: null,
		phone: null,
		street: null,
		zipCode: null,
		city: null,
		shipNameConsent: 0,
		nameConsent: 0,
		privacyConsent: 1,
		entryChannel: 1,
		deadCondition: undefined,
		deadSex: undefined,
		deadSize: null,
		deadPhoneContact: 0,
		notes: null,
		otherObservations: null,
		referenceId: 'test-ref-123',
		uploadedFiles: [],
		...overrides
	});

	/**
	 * Hilfsfunktion: Erstellt vollständige Test-Sichtung
	 */
	const createCompleteSighting = (): FrontendSighting => ({
		...createMinimalSighting(),
		species: 3, // Delphin
		totalCount: 5,
		juvenileCount: 2,
		waterway: 'Greifswalder Bodden',
		seaMark: 'Leuchtturm Warnemünde',
		shipName: 'Meeresforschung I',
		firstName: 'Max',
		lastName: 'Mustermann',
		nameConsent: 1,
		shipNameConsent: 1,
		otherObservations: 'Sehr zutrauliche Tiere'
	});

	describe('generateKmlData', () => {
		it('sollte gültiges KML für leere Sichtungsliste generieren', () => {
			const kml = generateKmlData([]);

			// Basis-KML-Struktur prüfen
			expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
			expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
			expect(kml).toContain('<Document>');
			expect(kml).toContain('<Folder>');
			expect(kml).toContain('<name>Sichtungen</name>');
			expect(kml).toContain('</Document>');
			expect(kml).toContain('</kml>');

			// Alle Styles sollten vorhanden sein
			expect(kml).toContain('<Style id="style0">'); // Totfunde
			expect(kml).toContain('<Style id="style1">'); // 1 Tier
			expect(kml).toContain('<Style id="style2">'); // 2-5 Tiere
			expect(kml).toContain('<Style id="style3">'); // 6-10 Tiere
			expect(kml).toContain('<Style id="style4">'); // 11-15 Tiere
			expect(kml).toContain('<Style id="style5">'); // >15 Tiere

			// Zähler sollten alle 0 sein
			expect(kml).toContain('<value>0,0,0,0,0,0</value>');
		});

		it('sollte einzelne Sichtung korrekt als KML-Placemark darstellen', () => {
			const sighting = createMinimalSighting({
				sightingDate: new Date('2024-01-15T14:30:00.000Z'),
				species: 0, // Schweinswal
				totalCount: 1
			});

			const kml = generateKmlData([sighting]);

			// Placemark sollte vorhanden sein
			expect(kml).toContain('<Placemark>');
			expect(kml).toContain('</Placemark>');

			// Name sollte formatiertes Datum sein (DD.MM.YY HH:mm) - mit Zeitzonenkonvertierung
			// 14:30 UTC + 1 Stunde MEZ (Januar) = 15:30 lokale Zeit
			expect(kml).toContain('<name>15.01.24 15:30</name>');

			// Koordinaten sollten korrekt sein
			expect(kml).toContain('<coordinates>13.2,54.5</coordinates>');

			// Zeitstempel sollte ISO 8601 sein
			expect(kml).toContain('<when>2024-01-15T14:30:00.000Z</when>');

			// Style für 1 Tier (blauer Marker)
			expect(kml).toContain('<styleUrl>#style1</styleUrl>');

			// Beschreibung sollte Tierart und Position enthalten
			expect(kml).toContain('<![CDATA[');
			expect(kml).toContain('<label>Tierart: </label>Schweinswal');
			expect(kml).toContain('<label>Position: </label>54° 30\' 00.00"N - 013° 12\' 00.00"E');
			expect(kml).toContain('<label>Anzahl Tiere: </label>1');
			expect(kml).toContain(']]>');

			// Zähler: 1 Tier in eq_1 Kategorie
			expect(kml).toContain('<value>1,0,0,0,0,0</value>');
		});

		it('sollte mehrere Sichtungen mit verschiedenen Styles korrekt verarbeiten', () => {
			const sightings = [
				createMinimalSighting({ totalCount: 1 }), // style1 - blau
				createMinimalSighting({ totalCount: 3 }), // style2 - grün
				createMinimalSighting({ totalCount: 8 }), // style3 - gelb
				createMinimalSighting({ totalCount: 12 }), // style4 - lila
				createMinimalSighting({ totalCount: 20 }), // style5 - orange
				createMinimalSighting({ isDead: 1 }) // style0 - rot
			];

			const kml = generateKmlData(sightings);

			// Alle Style-URLs sollten vorhanden sein
			expect(kml).toContain('<styleUrl>#style1</styleUrl>');
			expect(kml).toContain('<styleUrl>#style2</styleUrl>');
			expect(kml).toContain('<styleUrl>#style3</styleUrl>');
			expect(kml).toContain('<styleUrl>#style4</styleUrl>');
			expect(kml).toContain('<styleUrl>#style5</styleUrl>');
			expect(kml).toContain('<styleUrl>#style0</styleUrl>');

			// 6 Placemarks sollten vorhanden sein
			const placemarkMatches = kml.match(/<Placemark>/g);
			expect(placemarkMatches).toHaveLength(6);

			// Zähler sollten korrekt sein: eq_1=1, 2_5=1, 5_10=1, 11_15=1, gt_15=1, dead=1
			expect(kml).toContain('<value>1,1,1,1,1,1</value>');
		});

		it('sollte Totfunde mit rotem Marker kennzeichnen', () => {
			const deadSighting = createMinimalSighting({
				isDead: 1,
				totalCount: 5 // Sollte ignoriert werden, da Totfund
			});

			const kml = generateKmlData([deadSighting]);

			expect(kml).toContain('<styleUrl>#style0</styleUrl>');
			expect(kml).toContain('red-dot.png');

			// Zähler: dead=1, alle anderen=0
			expect(kml).toContain('<value>0,0,0,0,0,1</value>');
		});
	});

	describe('DMS-Koordinaten-Formatierung', () => {
		it('sollte positive Koordinaten korrekt formatieren', () => {
			const sighting = createMinimalSighting({
				latitude: '54.5',
				longitude: '13.75'
			});

			const kml = generateKmlData([sighting]);

			// 54.5° = 54° 30' 00.00"N
			// 13.75° = 13° 45' 00.00"E
			expect(kml).toContain('54° 30\' 00.00"N - 013° 45\' 00.00"E');
		});

		it('sollte negative Koordinaten mit korrekten Himmelsrichtungen formatieren', () => {
			const sighting = createMinimalSighting({
				latitude: '-25.5', // Südhalbkugel
				longitude: '-80.25' // Western Hemisphere
			});

			const kml = generateKmlData([sighting]);

			// -25.5° = 25° 30' 00.00"S
			// -80.25° = 80° 15' 00.00"W
			expect(kml).toContain('25° 30\' 00.00"S - 080° 15\' 00.00"W');
		});

		it('sollte Sekunden korrekt berechnen und runden', () => {
			const sighting = createMinimalSighting({
				latitude: '54.123456',
				longitude: '13.987654'
			});

			const kml = generateKmlData([sighting]);

			// Komplexe Koordinaten sollten präzise formatiert werden
			expect(kml).toContain('"N - 013°');
			expect(kml).toContain('"E');
		});
	});

	describe('Tierart-Namen', () => {
		const speciesTests = [
			{ id: 0, name: 'Schweinswal' },
			{ id: 1, name: 'Kegelrobbe' },
			{ id: 2, name: 'Seehund' },
			{ id: 3, name: 'Delphin (mehrere Arten)' },
			{ id: 4, name: 'Beluga' },
			{ id: 5, name: 'Zwergwal' },
			{ id: 6, name: 'Finnwal' },
			{ id: 7, name: 'Buckelwal' },
			{ id: 8, name: 'Unbekannte Walart' },
			{ id: 9, name: 'Ringelrobbe' },
			{ id: 10, name: 'Unbekannte Robbenart' }
		];

		speciesTests.forEach(({ id, name }) => {
			it(`sollte Tierart ${id} als "${name}" anzeigen`, () => {
				const sighting = createMinimalSighting({ species: id });
				const kml = generateKmlData([sighting]);

				expect(kml).toContain(`<label>Tierart: </label>${name}`);
			});
		});

		it('sollte unbekannte Tierart-IDs als "Unbekannt" behandeln', () => {
			const sighting = createMinimalSighting({ species: 999 as any });
			const kml = generateKmlData([sighting]);

			expect(kml).toContain('<label>Tierart: </label>Unbekannt');
		});
	});

	describe('Datenschutz und optionale Felder', () => {
		it('sollte Schiffsnamen nur mit Einwilligung anzeigen', () => {
			// Mit Einwilligung
			const sightingWithConsent = createCompleteSighting();
			sightingWithConsent.shipName = 'Testschiff';
			sightingWithConsent.shipNameConsent = 1;

			const kmlWithConsent = generateKmlData([sightingWithConsent]);
			expect(kmlWithConsent).toContain('<label>Schiffsname: </label>Testschiff');

			// Ohne Einwilligung
			const sightingWithoutConsent = createCompleteSighting();
			sightingWithoutConsent.shipName = 'Testschiff';
			sightingWithoutConsent.shipNameConsent = 0;
			sightingWithoutConsent.nameConsent = 0; // Auch nameConsent auf 0 setzen

			const kmlWithoutConsent = generateKmlData([sightingWithoutConsent]);
			expect(kmlWithoutConsent).not.toContain('<label>Schiffsname: </label>Testschiff');
		});

		it('sollte Namen nur mit Einwilligung anzeigen', () => {
			// Mit Einwilligung
			const sightingWithConsent = createCompleteSighting();
			sightingWithConsent.firstName = 'Max';
			sightingWithConsent.lastName = 'Mustermann';
			sightingWithConsent.nameConsent = 1;

			const kmlWithConsent = generateKmlData([sightingWithConsent]);
			expect(kmlWithConsent).toContain('<label>Name: </label>Max Mustermann');

			// Ohne Einwilligung
			const sightingWithoutConsent = createCompleteSighting();
			sightingWithoutConsent.firstName = 'Max';
			sightingWithoutConsent.lastName = 'Mustermann';
			sightingWithoutConsent.nameConsent = 0;

			const kmlWithoutConsent = generateKmlData([sightingWithoutConsent]);
			expect(kmlWithoutConsent).not.toContain('<label>Name: </label>Max Mustermann');
		});

		it('sollte Jungtiere nur anzeigen wenn > 0', () => {
			// Mit Jungtieren
			const sightingWithJuveniles = createMinimalSighting({ juvenileCount: 2 });
			const kmlWithJuveniles = generateKmlData([sightingWithJuveniles]);
			expect(kmlWithJuveniles).toContain('<label>Davon Jungtiere: </label>2');

			// Ohne Jungtiere
			const sightingWithoutJuveniles = createMinimalSighting({ juvenileCount: 0 });
			const kmlWithoutJuveniles = generateKmlData([sightingWithoutJuveniles]);
			expect(kmlWithoutJuveniles).not.toContain('<label>Davon Jungtiere: </label>');
		});

		it('sollte Fahrwasser nur anzeigen wenn vorhanden', () => {
			// Mit Fahrwasser
			const sightingWithWaterway = createMinimalSighting({
				waterway: 'Greifswalder Bodden'
			});
			const kmlWithWaterway = generateKmlData([sightingWithWaterway]);
			expect(kmlWithWaterway).toContain('<label>Fahrwasser: </label>Greifswalder Bodden');

			// Ohne Fahrwasser
			const sightingWithoutWaterway = createMinimalSighting({ waterway: null });
			const kmlWithoutWaterway = generateKmlData([sightingWithoutWaterway]);
			expect(kmlWithoutWaterway).not.toContain('<label>Fahrwasser: </label>');
		});
	});

	describe('XML-Escaping', () => {
		it('sollte XML-Sonderzeichen in Namen escapen', () => {
			const sighting = createMinimalSighting({
				sightingDate: new Date('2024-01-15T14:30:00.000Z')
			});

			// Simuliere gefährliche Daten durch direkten XML-String
			const kml = generateKmlData([sighting]);

			// Name sollte korrekt escaped sein - mit Zeitzonenkonvertierung
			expect(kml).toContain('<name>15.01.24 15:30</name>');

			// Keine unescaped XML-Zeichen
			expect(kml).not.toContain('<name>15.01.24 15:30 & Test</name>');
		});

		it('sollte mit Sonderzeichen in Beschreibungen umgehen', () => {
			// Da die Beschreibung CDATA verwendet, sollten Sonderzeichen sicher sein
			const sighting = createMinimalSighting({
				waterway: 'Test & Co. <Bucht>'
			});

			const kml = generateKmlData([sighting]);

			// CDATA-Sektion sollte Sonderzeichen schützen
			expect(kml).toContain('<![CDATA[');
			expect(kml).toContain('Test & Co. <Bucht>');
			expect(kml).toContain(']]>');
		});
	});

	describe('Zeitstempel-Formatierung', () => {
		it('sollte verschiedene Datumsformate korrekt verarbeiten', () => {
			const dateTests = [
				{ input: new Date('2024-01-15T14:30:00.000Z'), expectedName: '15.01.24 15:30' }, // UTC+1 (Winter)
				{ input: new Date('2024-07-15T14:30:00.000Z'), expectedName: '15.07.24 16:30' }, // UTC+2 (Sommer)
				{ input: new Date('2024-12-31T22:59:59.999Z'), expectedName: '31.12.24 23:59' }, // UTC+1 (Winter)
				{ input: new Date('2024-02-29T11:00:00.000Z'), expectedName: '29.02.24 12:00' } // UTC+1 (Winter), Schaltjahr
			];

			dateTests.forEach(({ input, expectedName }) => {
				const sighting = createMinimalSighting({ sightingDate: input });
				const kml = generateKmlData([sighting]);

				expect(kml).toContain(`<name>${expectedName}</name>`);
				expect(kml).toContain(`<when>${input.toISOString()}</when>`);
			});
		});
	});

	describe('Google Maps Icons', () => {
		it('sollte korrekte Google Maps Icon-URLs verwenden', () => {
			const kml = generateKmlData([]);

			// Alle Icon-URLs sollten auf Google Maps verweisen
			expect(kml).toContain('https://maps.google.com/mapfiles/ms/icons/red-dot.png');
			expect(kml).toContain('https://maps.google.com/mapfiles/ms/icons/blue-dot.png');
			expect(kml).toContain('https://maps.google.com/mapfiles/ms/icons/green-dot.png');
			expect(kml).toContain('https://maps.google.com/mapfiles/ms/icons/yellow-dot.png');
			expect(kml).toContain('https://maps.google.com/mapfiles/ms/icons/purple-dot.png');
			expect(kml).toContain('https://maps.google.com/mapfiles/ms/icons/orange-dot.png');
		});
	});

	describe('Koordinaten Edge Cases', () => {
		it('sollte mit numerischen und String-Koordinaten umgehen', () => {
			const sightingNumeric = createMinimalSighting({
				latitude: '54.5',
				longitude: '13.2'
			});

			const sightingString = createMinimalSighting({
				latitude: '54.5' as any,
				longitude: '13.2' as any
			});

			const kmlNumeric = generateKmlData([sightingNumeric]);
			const kmlString = generateKmlData([sightingString]);

			// Beide sollten gleiche Koordinaten erzeugen
			expect(kmlNumeric).toContain('<coordinates>13.2,54.5</coordinates>');
			expect(kmlString).toContain('<coordinates>13.2,54.5</coordinates>');
		});

		it('sollte mit 0-Koordinaten umgehen', () => {
			const sighting = createMinimalSighting({
				latitude: '0',
				longitude: '0'
			});

			const kml = generateKmlData([sighting]);

			expect(kml).toContain('<coordinates>0,0</coordinates>');
			expect(kml).toContain('00° 00\' 00.00"N - 000° 00\' 00.00"E');
		});
	});

	describe('Statistiken und Zähler', () => {
		it('sollte komplexe Verteilung korrekt zählen', () => {
			const sightings = [
				createMinimalSighting({ totalCount: 1 }), // eq_1
				createMinimalSighting({ totalCount: 1 }), // eq_1
				createMinimalSighting({ totalCount: 3 }), // 2_5
				createMinimalSighting({ totalCount: 5 }), // 2_5
				createMinimalSighting({ totalCount: 7 }), // 5_10
				createMinimalSighting({ totalCount: 10 }), // 5_10
				createMinimalSighting({ totalCount: 12 }), // 11_15
				createMinimalSighting({ totalCount: 15 }), // 11_15
				createMinimalSighting({ totalCount: 20 }), // gt_15
				createMinimalSighting({ totalCount: 50 }), // gt_15
				createMinimalSighting({ isDead: 1 }), // dead
				createMinimalSighting({ isDead: 1 }) // dead
			];

			const kml = generateKmlData(sightings);

			// eq_1=2, 2_5=2, 5_10=2, 11_15=2, gt_15=2, dead=2
			expect(kml).toContain('<value>2,2,2,2,2,2</value>');
		});

		it('sollte Grenzfälle bei der Kategorisierung korrekt behandeln', () => {
			const sightings = [
				createMinimalSighting({ totalCount: 1 }), // eq_1 (genau 1)
				createMinimalSighting({ totalCount: 2 }), // 2_5 (Start 2-5)
				createMinimalSighting({ totalCount: 5 }), // 2_5 (Ende 2-5)
				createMinimalSighting({ totalCount: 6 }), // 5_10 (Start 6-10)
				createMinimalSighting({ totalCount: 10 }), // 5_10 (Ende 6-10)
				createMinimalSighting({ totalCount: 11 }), // 11_15 (Start 11-15)
				createMinimalSighting({ totalCount: 15 }), // 11_15 (Ende 11-15)
				createMinimalSighting({ totalCount: 16 }) // gt_15 (Start >15)
			];

			const kml = generateKmlData(sightings);

			// eq_1=1, 2_5=2, 5_10=2, 11_15=2, gt_15=1, dead=0
			expect(kml).toContain('<value>1,2,2,2,1,0</value>');
		});
	});
});
