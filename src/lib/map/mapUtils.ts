/**
 * @fileoverview Kartendarstellung und GeoJSON-Konvertierung für OpenLayers
 *
 * Dieses Modul enthält Funktionen und Typen für die Darstellung von
 * Meeressäuger-Sichtungen auf der interaktiven Karte. Es konvertiert
 * Datenbank-Sichtungen in GeoJSON-Features für OpenLayers und definiert
 * die Schnittstelle für Kartenübersetzungen.
 *
 * Die GeoJSON-Struktur folgt der RFC 7946 Spezifikation und ist
 * optimiert für die Anzeige in OpenLayers mit Performance-Optimierungen
 * für große Datenmengen.
 *
 * @author Ostsee-Tiere Team
 * @since 1.0.0
 */

import { getSightingStatus, type SightingStatus } from '#lib/components/admin/sightingStatus.ts';

/**
 * Übersetzungsschnittstelle für Kartenbeschriftungen
 *
 * Definiert alle benötigten Übersetzungsschlüssel für die
 * mehrsprachige Darstellung der interaktiven Karte.
 */
export interface MapTranslations {
	overview: string; // "Übersicht" - Kartenübersicht
	zoom_title: string; // Tooltip für Zoom-Kontrolle
	zoom: string; // "Zoom" - Zoom-Label
	report_date: string; // "Meldedatum" - Datum der Sichtung
	language: string; // "Sprache" - Sprachauswahl
	species: string; // "Tierart" - Spezies-Label
	species_legend: string; // Legende für Tierarten
	position: string; // "Position" - Koordinaten
	count: string; // "Anzahl" - Tierzahl
	young: string; // "Jungtiere" - Kälber/Jungtiere
	ship: string; // "Schiff" - Fahrzeug
	name: string; // "Name" - Beobachter
	area: string; // "Gebiet" - Seegebiet
	latitude: string; // "Breitengrad" - Lat-Koordinate
	longitude: string; // "Längengrad" - Lon-Koordinate
	found_dead: string; // "Totfund" - Tote Tiere
	speciesMap: Record<string, string>; // Mapping von Spezies-IDs zu Namen
}

/**
 * GeoJSON-Feature für eine einzelne Sichtung
 *
 * Entspricht der GeoJSON-Spezifikation für Punkt-Features
 * mit Sichtung-spezifischen Eigenschaften für die Kartendarstellung.
 */
export interface SightingFeature {
	type: 'Feature'; // GeoJSON-Typ (immer "Feature")
	id: number; // Eindeutige Sichtungs-ID
	geometry: {
		type: 'Point'; // Geometrie-Typ (immer "Point" für Sichtungen)
		coordinates: [number, number]; // [Längengrad, Breitengrad] - WICHTIG: Reihenfolge!
	};
	properties: {
		id: number; // Sichtungs-ID (doppelt für Kompatibilität)
		ts: number; // Unix-Zeitstempel in Sekunden
		ta: number; // Tierart (Species-Enum-Wert)
		ct: number; // Gesamtanzahl der Tiere
		jt: number; // Anzahl Jungtiere/Kälber
		tf: boolean; // Totfund ja/nein
		st: SightingStatus; // Bearbeitungszustand — öffentlich immer 'approved'
		// Optionale Eigenschaften (nur bei Einwilligung/Verfügbarkeit)
		name?: string | undefined; // Nachname des Beobachters
		firstname?: string | undefined; // Vorname des Beobachters
		shipname?: string | undefined; // Name des Beobachtungsschiffs
		waterway?: string | undefined; // Gewässername
		seaMark?: string | undefined; // Seezeichen als Referenz
	};
}

/**
 * GeoJSON-FeatureCollection für alle Sichtungen
 *
 * Standard-GeoJSON-Container für eine Sammlung von Sichtungs-Features,
 * optimiert für die Darstellung in OpenLayers.
 */
export interface GeoJSONResponse {
	type: 'FeatureCollection'; // GeoJSON-Typ (immer "FeatureCollection")
	features: SightingFeature[]; // Array aller Sichtungs-Features
}

/**
 * Datenbank-Sichtung wie sie aus der DB kommt
 *
 * Repräsentiert eine Sichtung in dem Format, wie sie aus der
 * Drizzle-Datenbank gelesen wird, bevor sie zu GeoJSON konvertiert wird.
 */
export interface DBSighting {
	id: number; // Primärschlüssel
	sightingDate: string; // ISO-Datum-String
	longitude: number | string; // Längengrad (kann String sein bei Legacy-Daten)
	latitude: number | string; // Breitengrad (kann String sein bei Legacy-Daten)
	species: number; // Species-Enum-Wert
	totalCount: number; // Gesamtanzahl Tiere
	juvenileCount: number; // Anzahl Jungtiere
	isDead: boolean; // Totfund-Flag
	firstName?: string; // Vorname (optional)
	lastName?: string; // Nachname (optional)
	nameConsent: boolean; // Einwilligung zur Namensnennung
	shipName?: string; // Schiffsname (optional)
	shipNameConsent: boolean; // Einwilligung zur Schiffsnamen-Nennung
	waterway?: string; // Gewässername (optional)
	seaMark?: string; // Seezeichen (optional)
	approvedAt?: Date | string | null; // Freigabezeitpunkt (freigegeben_am)
	rejectedAt?: Date | string | null; // Ablehnungszeitpunkt (abgelehnt_am)
	[key: string]: unknown; // Weitere Felder für Flexibilität
}

/**
 * Konvertiert Datenbank-Sichtungen in GeoJSON-Format für OpenLayers-Darstellung
 *
 * Diese Funktion transformiert Sichtungen aus dem Datenbankformat in eine
 * standardkonforme GeoJSON-FeatureCollection, die direkt in OpenLayers
 * geladen werden kann. Dabei werden Datenschutz-Einstellungen respektiert
 * und Legacy-Datenformate unterstützt.
 *
 * @param sightingsFromDB Array von Sichtungen aus der Datenbank
 * @returns GeoJSON-FeatureCollection mit allen Sichtungen als Punkt-Features
 *
 * @example
 * const geoJson = sightingsToGeoJSON(databaseSightings);
 * map.addLayer(new VectorLayer({ source: new VectorSource({ features: geoJson }) }));
 *
 * @note
 * - Koordinaten-Reihenfolge: [Längengrad, Breitengrad] (GeoJSON-Standard)
 * - Zeitstempel werden in Unix-Sekunden konvertiert für JavaScript-Kompatibilität
 * - Personenbezogene Daten nur bei expliziter Einwilligung
 * - Legacy-String-Koordinaten werden automatisch zu Zahlen konvertiert
 */
export function sightingsToGeoJSON(sightingsFromDB: DBSighting[]): GeoJSONResponse {
	// Transformiere jede DB-Sichtung zu einem GeoJSON-Feature
	const features: SightingFeature[] = sightingsFromDB.map((dbSighting) => {
		// Unix-Zeitstempel in Sekunden für JavaScript-Kompatibilität generieren
		const timestamp = new Date(dbSighting.sightingDate).getTime() / 1000;

		// Koordinaten-Normalisierung: String -> Number (Legacy-Daten-Support)
		// WICHTIG: Fallback auf 0 für ungültige Koordinaten
		const longitude =
			typeof dbSighting.longitude === 'string'
				? parseFloat(dbSighting.longitude) || 0 // parseFloat kann NaN zurückgeben
				: dbSighting.longitude || 0;

		const latitude =
			typeof dbSighting.latitude === 'string'
				? parseFloat(dbSighting.latitude) || 0 // parseFloat kann NaN zurückgeben
				: dbSighting.latitude || 0;

		// GeoJSON-Feature-Objekt nach RFC 7946 Standard erstellen
		return {
			type: 'Feature' as const,
			id: dbSighting.id,
			geometry: {
				type: 'Point' as const,
				// WICHTIG: GeoJSON verwendet [Längengrad, Breitengrad] - nicht umgekehrt!
				coordinates: [longitude, latitude]
			},
			properties: {
				id: dbSighting.id, // Feature-ID
				ts: timestamp, // Zeitstempel (Unix-Sekunden)
				ta: dbSighting.species, // Tierart (Species-Enum)
				ct: dbSighting.totalCount, // Anzahl Tiere
				jt: dbSighting.juvenileCount, // Anzahl Jungtiere
				tf: dbSighting.isDead, // Totfund-Flag
				// Bearbeitungszustand aus denselben zwei Spalten wie im Admin
				// abgeleitet (sightingStatus.ts), nicht hier neu entschieden.
				st: getSightingStatus({
					approvedAt: dbSighting.approvedAt,
					rejectedAt: dbSighting.rejectedAt
				}),
				// Datenschutz-konforme Namensanzeige
				name: dbSighting.nameConsent ? dbSighting.lastName : undefined,
				firstname: dbSighting.nameConsent ? dbSighting.firstName : undefined,
				// Datenschutz-konforme Schiffsnamenanzeige
				shipname: dbSighting.shipNameConsent ? dbSighting.shipName : undefined,
				// Geografische Referenzen (immer verfügbar)
				waterway: dbSighting.waterway, // Gewässername
				seaMark: dbSighting.seaMark // Seezeichen
			}
		};
	});

	// Standard-GeoJSON-FeatureCollection zurückgeben
	return {
		type: 'FeatureCollection',
		features
	};
}

/**
 * Prüft ob alle Koordinatenpaare nahe beieinander liegen.
 * Wird verwendet um zu erkennen, ob Cluster-Features an derselben Position sind
 * (in dem Fall hilft Zoomen nicht weiter).
 *
 * @param extents Array von [minX, minY, maxX, maxY] Extents (EPSG:3857)
 * @param threshold Maximaler Abstand in Projektion-Einheiten (~Metern bei EPSG:3857)
 * @returns true wenn alle Extents innerhalb des Thresholds des ersten liegen
 */
export function areExtentsColocated(
	extents: [number, number, number, number][],
	threshold: number = 100
): boolean {
	if (extents.length <= 1) return false;
	const first = extents[0];
	if (!first) return false;
	return extents.every((ext) => {
		return Math.abs(ext[0] - first[0]) < threshold && Math.abs(ext[1] - first[1]) < threshold;
	});
}
