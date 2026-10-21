import type { FrontendSighting } from '#lib/types/index.ts';
import { formatForXmlExport } from '#lib/utils/format/dateTime.ts';

/**
 * Repräsentiert eine Meeressäuger-Sichtung im XML-Export-Format.
 *
 * Diese Schnittstelle definiert die Struktur für XML-Exporte, die mit
 * Legacy-Systemen und wissenschaftlichen Tools kompatibel ist.
 * Die Feldnamen entsprechen dem Original-PHP-System.
 */
interface XmlSighting {
	/** Eindeutige Sichtungs-ID */
	nr: number;
	/** Formatiertes Datum (DD.MM.YY) */
	datum: string;
	/** Formatierte Zeit (HHMM) */
	uhrzeit: string;
	/** Numerische Tierart-ID */
	tierart: number | string;
	/** Fahrwasser-/Gewässername (optional) */
	fahrwasser?: string | undefined;
	/** Breitengrad in Dezimalgrad */
	dezigrad_n: number;
	/** Längengrad in Dezimalgrad */
	dezigrad_e: number;
	/** Flag für Totfund */
	totfund: boolean;
	/** Medien-/Größenkategorie-Bezeichner */
	media: string;
	/** Berichtete Anzahl Tiere (optional) */
	anz_ber?: number | undefined;
	/** Textuelle Größenklasse */
	groessenklasse: string;
	/** Anzahl Jungtiere (optional) */
	jungtiere?: number | undefined;
	/** Normalisierte X-Koordinate für Kartensystem */
	x: number;
	/** Normalisierte Y-Koordinate für Kartensystem */
	y: number;
	/** Schiffsname (nur mit Einwilligung) */
	schiff?: string | undefined;
	/** Vollständiger Name des Melders (nur mit Einwilligung) */
	person?: string | undefined;
}

/**
 * Generiert XML-Export aus Meeressäuger-Sichtungen.
 *
 * Diese Funktion erstellt strukturiertes XML für wissenschaftliche
 * Auswertung und Legacy-System-Kompatibilität. Das XML-Format
 * enthält:
 *
 * - Alle relevanten Sichtungsdaten in strukturierter Form
 * - Koordinatentransformation für spezifische Kartensysteme
 * - Datenschutz-konforme Filterung von persönlichen Daten
 * - Kategorisierung nach Tiergrößenklassen
 * - Boolean-zu-Integer-Konvertierung für XML-Kompatibilität
 *
 * Das erzeugte XML folgt dem Schema:
 * ```xml
 * <sichtungen>
 *   <sichtung>
 *     <nr>1</nr>
 *     <datum>15.01.24</datum>
 *     <uhrzeit>1430</uhrzeit>
 *     <tierart>0</tierart>
 *     <!-- weitere Felder -->
 *   </sichtung>
 * </sichtungen>
 * ```
 *
 * @param sightings - Array von Frontend-Sichtungsdaten
 * @returns Vollständiges XML-Dokument als String
 *
 * @example
 * ```typescript
 * const sightings: FrontendSighting[] = [
 *   {
 *     id: 1,
 *     sightingDate: '2024-01-15T14:30:00Z',
 *     species: 0,
 *     totalCount: 3,
 *     latitude: 54.5,
 *     longitude: 13.2,
 *     isDead: false
 *     // ... weitere Felder
 *   }
 * ];
 *
 * const xmlData = generateXmlData(sightings);
 * // Kann als .xml-Datei exportiert oder an wissenschaftliche Tools gesendet werden
 * ```
 */
export function generateXmlData(sightings: FrontendSighting[]): string {
	const xmlSightings = sightings.map(transformToXmlSighting);

	// XML-Header erstellen
	let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
	xmlContent += '<sichtungen>\n';

	// Jede Sichtung in XML umwandeln
	xmlSightings.forEach((sighting) => {
		xmlContent += '  <sichtung>\n';

		// Jedes Feld der Sichtung als XML-Element hinzufügen
		Object.entries(sighting).forEach(([key, value]) => {
			if (value !== undefined && value !== null && value !== '') {
				// Konvertiere true/false zu 1/0 für XML
				const xmlValue = typeof value === 'boolean' ? (value ? '1' : '0') : value;
				xmlContent += `    <${key}>${xmlValue}</${key}>\n`;
			}
		});

		xmlContent += '  </sichtung>\n';
	});

	xmlContent += '</sichtungen>';

	return xmlContent;
}

/**
 * Transformiert eine Frontend-Sichtung in das XML-Export-Format.
 *
 * Diese komplexe Transformationsfunktion:
 *
 * 1. **Zeitstempel-Konvertierung**: ISO 8601 → DD.MM.YY + HHMM
 * 2. **Koordinaten-Transformation**: WGS84 → normalisiertes Kartensystem
 * 3. **Kategorisierung**: Tieranzahl → Größenklassen und Media-Tags
 * 4. **Datenschutz**: Nur autorisierte Namen/Schiffsdaten exportieren
 * 5. **Legacy-Kompatibilität**: Feldnamen und -werte für bestehende Tools
 *
 * **Koordinaten-Transformation:**
 * Die X/Y-Koordinaten werden durch eine spezifische Mercator-Projektion
 * berechnet, die auf das verwendete Kartensystem normalisiert ist.
 * Diese Transformation stammt aus dem Original-PHP-Code.
 *
 * **Größenklassen:**
 * - Einzeltier: 1 Tier
 * - 2-5 Tiere: 2-5 Tiere
 * - 6-10 Tiere: 6-10 Tiere
 * - 11-15 Tiere: 11-15 Tiere  
 * - Mehr als 15 Tiere: >15 Tiere
 * - tot: Totfunde (unabhängig von Anzahl)
 *
 * @param sighting - Eine Frontend-Sichtung
 * @returns XML-kompatible Sichtungsstruktur
 * @internal
 */
function transformToXmlSighting(sighting: FrontendSighting): XmlSighting {
	/**
	 * SCHRITT 1: Zeitstempel-Konvertierung
	 * ISO 8601 → Legacy-Format (DD.MM.YY + HHMM) mit korrekter Zeitzonenkonvertierung
	 */
	const xmlDateTime = formatForXmlExport(sighting.sightingDate);
	const formattedDate = xmlDateTime.date;
	const formattedTime = xmlDateTime.time;

	/**
	 * SCHRITT 2: Basis-XML-Struktur initialisieren
	 * Alle Pflichtfelder mit Standardwerten setzen
	 */
	const xmlSighting: XmlSighting = {
		nr: sighting.id, // Eindeutige DB-ID
		datum: formattedDate, // DD.MM.YY Format
		uhrzeit: formattedTime, // HHMM Format
		tierart: sighting.species, // Numerische Tierart-ID
		fahrwasser: sighting.waterway || undefined, // Null → undefined für XML
		// Koordinaten mit Typ-Sicherheit
		dezigrad_n:
			typeof sighting.latitude === 'number'
				? sighting.latitude
				: parseFloat(sighting.latitude || '0'),
		dezigrad_e:
			typeof sighting.longitude === 'number'
				? sighting.longitude
				: parseFloat(sighting.longitude || '0'),
		totfund: sighting.isDead ? true : false, // Explizite Boolean-Konvertierung
		// Temporäre Werte - werden basierend auf Tieranzahl überschrieben
		media: 'Einzeltier',
		groessenklasse: 'Einzeltier',
		// Koordinaten-Platzhalter - werden durch Transformation berechnet
		x: 0,
		y: 0
	};

	/**
	 * SCHRITT 3: Kategorisierung nach Tieranzahl
	 * Bestimmt Media-Tag und Größenklasse basierend auf totalCount
	 */
	const totalCount = sighting.totalCount;

	// Totfunde haben Priorität - ignorieren Tieranzahl
	if (sighting.isDead) {
		xmlSighting.media = 'tot';
		xmlSighting.groessenklasse = 'tot';
	} else {
		// Lebende Tiere: Kategorisierung nach Anzahl
		// Media-Tags entsprechen Legacy-System-Konventionen
		if (totalCount !== undefined && totalCount === 1) {
			xmlSighting.media = 'Einzeltier';
			xmlSighting.anz_ber = totalCount; // Exakte Anzahl speichern
			xmlSighting.groessenklasse = 'Einzeltier';
		} else if (totalCount !== undefined && totalCount < 6) {
			xmlSighting.media = '2_5'; // 2-5 Tiere
			xmlSighting.anz_ber = totalCount;
			xmlSighting.groessenklasse = '2-5 Tiere';
		} else if (totalCount !== undefined && totalCount < 11) {
			xmlSighting.media = '6_10'; // 6-10 Tiere
			xmlSighting.anz_ber = totalCount;
			xmlSighting.groessenklasse = '6-10 Tiere';
		} else if (totalCount !== undefined && totalCount < 16) {
			xmlSighting.media = '11_15'; // 11-15 Tiere
			xmlSighting.anz_ber = totalCount;
			xmlSighting.groessenklasse = '11-15 Tiere';
		} else {
			xmlSighting.media = '_15'; // >15 Tiere (Legacy-Namenskonvention)
			xmlSighting.anz_ber = totalCount;
			xmlSighting.groessenklasse = 'Mehr als 15 Tiere';
		}
	}

	/**
	 * SCHRITT 4: Optionale Jungtier-Information
	 * Nur hinzufügen wenn explizit > 0 gemeldet
	 */
	if (sighting.juvenileCount && sighting.juvenileCount > 0) {
		xmlSighting.jungtiere = sighting.juvenileCount;
	}

	/**
	 * SCHRITT 5: Koordinaten-Transformation
	 * Konvertiert WGS84 zu normalisiertem Kartensystem
	 * (Original-Algorithmus aus PHP-Legacy-System)
	 */
	const gps_n = typeof sighting.latitude === 'number' ? sighting.latitude : 0;
	const gps_e = typeof sighting.longitude === 'number' ? sighting.longitude : 0;

	// Mercator-Projektion: Longitude zu X-Koordinate
	const X =
		gps_e !== null && gps_e !== undefined ? Math.round((gps_e * 6371000 * Math.PI) / 180) : 0;

	// Mercator-Projektion: Latitude zu Y-Koordinate
	// Formel: ln(tan(lat/2 + π/4)) * Erdradius
	const Y =
		gps_n !== null && gps_n !== undefined
			? Math.round(Math.log(Math.tan((gps_n * Math.PI) / 360 + Math.PI / 4)) * 6371000)
			: 0;

	// Normalisierung auf Kartensystem-spezifische Werte
	// Diese Konstanten stammen aus dem Original-PHP-System
	xmlSighting.x = Math.round(((X - 1050792.0567911) / 628251.3355417) * 1000) / 1000;
	xmlSighting.y = Math.round(((Y - 7138521.4416712) / 909594.5299957) * 1000) / 1000;

	/**
	 * SCHRITT 6: Datenschutz-konforme persönliche Daten
	 * Nur mit expliziter Einwilligung des Melders
	 */
	// Schiffsname nur bei expliziter Einwilligung
	if (sighting.shipNameConsent && sighting.shipName) {
		xmlSighting.schiff = sighting.shipName;
	}

	// Personenname nur bei expliziter Einwilligung und vollständigen Daten
	if (sighting.nameConsent && sighting.firstName && sighting.lastName) {
		xmlSighting.person = `${sighting.firstName} ${sighting.lastName}`;
	}

	return xmlSighting;
}
