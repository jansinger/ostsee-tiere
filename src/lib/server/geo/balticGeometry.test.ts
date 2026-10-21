import { describe, expect, it } from 'vitest';
import { checkBalticSeaFile } from '#lib/server/geo/checkBalticSeaFile.ts';

/**
 * Fachliche Referenzpunkte für die bereinigte Ostsee-Geometrie.
 * Herkunft und Begründung: docs/archive/OSTSEE_GEOMETRIE_SPEC_2026-07-30.md
 */

/** Fehler A — Binnenwasser-Artefakte der IHO-Geometrie. Müssen draußen sein. */
const FEHLER_A: ReadonlyArray<[string, number, number]> = [
	['Ladogasee', 31.5, 60.8],
	['Onegasee', 35.5, 61.8],
	['Weichsel bei Włocławek', 19.0, 52.7],
	['Torne-Flusslauf', 24.0, 66.5],
	// Die Maske schliesst den WESTLICHEN Limfjord und damit die Nordsee-Passage.
	// Der oestliche Arm bei Aalborg und Hals bleibt bewusst drin (Kattegat-Zufahrt)
	// — ein Punkt dort waere hier also falsch.
	['Limfjord Loegstoer (westlicher Arm)', 9.35, 56.97],
	['Thyboroen, Nordsee-Seite der Passage', 8.22, 56.7]
];

/**
 * Fehler B — innere Küstengewässer, die die grobe IHO-Küstenlinie weglässt.
 * Die drei nachfolgend kommentierten Punkte waren ursprünglich von Hand aus der
 * Karte geschätzt und lagen laut OSM-Küstenlinie tatsächlich auf Land (siehe
 * .superpowers/sdd/progress.md, Abschnitt „BEFUND: Aufgabe 1 hat drei
 * unbrauchbare Referenzkoordinaten"). Ersetzt durch belegte Wasserpunkte,
 * geprüft mit `ogrinfo -dialect SQLITE` (ST_Intersects/MakePoint) gegen
 * land-polygons-complete-4326.
 *
 * Korrekturlauf 2026-07-30 (zweite Runde): Der erste Ersatzsatz war zwar Wasser,
 * lag aber bereits innerhalb des heutigen, unbereinigten Polygons — die Auswahl
 * war über das gespeicherte `ostsee`-Flag statt über das Polygon selbst gelaufen
 * und testete die geplante Geometrie-Korrektur damit nicht mehr (Block grün, ohne
 * dass etwas behoben war). Neu ermittelt, doppelt qualifiziert: das heutige
 * IHO-Polygon lehnt den Punkt ab UND die OSM-Küstenlinie stuft ihn als Wasser
 * ein. Wer hier Punkte tauscht, muss beides erneut prüfen; ein reiner
 * Wasserpunkt, der schon im Polygon liegt, testet nichts.
 */
const FEHLER_B: ReadonlyArray<[string, number, number]> = [
	// Sichtung id 3946. Außerhalb des heutigen Polygons (Turf/rbush-index.json)
	// und nach OSM-Küstenlinie Wasser (ogrinfo -dialect SQLITE, ST_Intersects/MakePoint).
	['Flensburger Förde', 9.589748, 54.850426],
	// Sichtung id 25581. Außerhalb des heutigen Polygons und nach OSM Wasser.
	['Eckernförder Bucht', 9.838145, 54.475078],
	// Sichtung id 4949. Außerhalb des heutigen Polygons und nach OSM Wasser.
	['Strelasund', 13.098357, 54.314608],
	// Sichtung id 8868. Außerhalb des heutigen Polygons und nach OSM Wasser.
	['Greifswalder Bodden', 13.66281, 54.28838]
];

/** Muss auch nach der Bereinigung draußen bleiben. */
const AUSSEN: ReadonlyArray<[string, number, number]> = [
	['Helgoland (Nordsee)', 7.89, 54.18],
	['Hamburg', 10.0, 53.55],
	['Hannover', 9.73, 52.37],
	['Doggerbank', 2.02, 54.87]
];

/** Offene Ostsee — war vorher drin und muss drin bleiben (Regressionsschutz). */
const KERNGEBIET: ReadonlyArray<[string, number, number]> = [
	['Fehmarnbelt', 11.3, 54.6],
	['Arkonabecken', 13.5, 55.0],
	['Bornholmbecken', 15.0, 55.2],
	['Newa-Bucht', 30.05, 59.93]
];

describe('Ostsee-Geometrie: Fehler A — Binnenwasser ausgeschlossen', () => {
	it.each(FEHLER_A)('%s (%f/%f) liegt nicht in der Ostsee', (_name, lon, lat) => {
		expect(checkBalticSeaFile(lon, lat).inBaltic).toBe(false);
	});
});

describe('Ostsee-Geometrie: Fehler B — Küstengewässer eingeschlossen', () => {
	it.each(FEHLER_B)('%s (%f/%f) liegt in der Ostsee', (_name, lon, lat) => {
		expect(checkBalticSeaFile(lon, lat).inBaltic).toBe(true);
	});
});

describe('Ostsee-Geometrie: Außenpunkte bleiben außen', () => {
	it.each(AUSSEN)('%s (%f/%f) liegt nicht in der Ostsee', (_name, lon, lat) => {
		expect(checkBalticSeaFile(lon, lat).inBaltic).toBe(false);
	});
});

describe('Ostsee-Geometrie: Kerngebiet unverändert', () => {
	it.each(KERNGEBIET)('%s (%f/%f) liegt in der Ostsee', (_name, lon, lat) => {
		expect(checkBalticSeaFile(lon, lat).inBaltic).toBe(true);
	});
});

describe('Ostsee-Geometrie: Uferstreifen für Strandfunde', () => {
	// Strandabschnitt Prerow, Nordseite Darß, entlang des Meridians 12.5427 E.
	//
	// Die Breitengrade sind gegen die Geometrie GEMESSEN, nicht aus der Karte
	// geschätzt — ein früherer Schätzwert (54.4551) lag tatsächlich 463 m
	// landeinwärts statt 100 m. Abstände zur Küstenlinie (`geo_build.water`,
	// also vor dem Uferstreifen) per `ST_Distance` auf `geography`:
	//
	//   54.4600 →  14 m   im Uferstreifen
	//   54.4590 →  99 m   im Uferstreifen   ← der 100-m-Fall unten
	//   54.4580 → 186 m   im Uferstreifen
	//   54.4575 → 232 m   außerhalb          ← die 200-m-Kante liegt hier
	//   54.4110 → 5,4 km  außerhalb          ← der 5-km-Fall unten
	//
	// Wer den Uferstreifen in `build-baltic-geometry.sql` verändert, muss diese
	// beiden Werte neu messen.
	it('nimmt einen Punkt rund 100 m landeinwärts noch auf', () => {
		expect(checkBalticSeaFile(12.5427, 54.459).inBaltic).toBe(true);
	});

	it('schließt einen Punkt 5 km landeinwärts aus', () => {
		expect(checkBalticSeaFile(12.5427, 54.411).inBaltic).toBe(false);
	});
});
