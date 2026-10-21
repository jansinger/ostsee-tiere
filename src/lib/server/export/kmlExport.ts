import type { FrontendSighting } from '#lib/types/index.ts';
import { formatForKmlExport } from '#lib/utils/format/dateTime.ts';

/**
 * Repräsentiert ein KML-Placemark für eine Meeressäuger-Sichtung.
 * Ein Placemark ist ein geografischer Punkt in KML mit Metadaten.
 */
interface KmlPlacemark {
	/** Anzeigename des Placemarks (normalerweise Datum/Zeit) */
	name: string;
	/** HTML-Beschreibung mit Sichtungsdetails (CDATA-wrapped) */
	description: string;
	/** Koordinaten im Format 'longitude,latitude' */
	coordinates: string;
	/** Referenz zu einem Style (z.B. '#style1') */
	styleUrl: string;
	/** ISO 8601 Zeitstempel */
	timestamp: string;
}

/**
 * Generiert KML-Daten aus Meeressäuger-Sichtungen für Google Earth/Maps.
 *
 * Diese Funktion erstellt ein vollständiges KML-Dokument mit:
 * - Verschiedenen Marker-Stilen basierend auf Tieranzahl und Totfund-Status
 * - Geografischen Placemarks mit detaillierten Beschreibungen
 * - Zeitstempel-Informationen für zeitbasierte Visualisierung
 * - Statistiken über die Verteilung der Sichtungen
 *
 * Die Marker-Stile folgen einem Farbschema:
 * - Rot: Totfunde
 * - Blau: 1 Tier
 * - Grün: 2-5 Tiere
 * - Gelb: 6-10 Tiere
 * - Lila: 11-15 Tiere
 * - Orange: >15 Tiere
 *
 * @param sightings - Array von Frontend-Sichtungsdaten
 * @returns Vollständiges KML-Dokument als String
 *
 * @example
 * ```typescript
 * const sightings: FrontendSighting[] = [
 *   {
 *     id: 1,
 *     latitude: 54.5,
 *     longitude: 13.2,
 *     sightingDate: '2024-01-15T14:30:00Z',
 *     species: 0, // Schweinswal
 *     totalCount: 3,
 *     isDead: false
 *   }
 * ];
 *
 * const kmlData = generateKmlData(sightings);
 * // Kann in .kml-Datei gespeichert oder an Google Earth gesendet werden
 * ```
 */
export function generateKmlData(sightings: FrontendSighting[]): string {
	const placemarks = sightings.map(sightingToKmlPlacemark);

	// Zählen der verschiedenen Kategorien für Statistiken
	const counts = {
		eq_1: 0,
		'2_5': 0,
		'5_10': 0,
		'11_15': 0,
		gt_15: 0,
		dead: 0
	};

	// Style-URLs für Placemarks festlegen und Zähler aktualisieren
	placemarks.forEach((placemark, index) => {
		const sighting = sightings[index];

		if (sighting?.isDead) {
			placemark.styleUrl = '#style0';
			counts.dead++;
		} else {
			const count = sighting?.totalCount || 0;

			if (count === 1) {
				placemark.styleUrl = '#style1';
				counts.eq_1++;
			} else if (count < 6) {
				placemark.styleUrl = '#style2';
				counts['2_5']++;
			} else if (count < 11) {
				placemark.styleUrl = '#style3';
				counts['5_10']++;
			} else if (count < 16) {
				placemark.styleUrl = '#style4';
				counts['11_15']++;
			} else {
				placemark.styleUrl = '#style5';
				counts.gt_15++;
			}
		}
	});

	// KML-Dokument erstellen
	let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Style id="style0">
      <IconStyle>
        <Icon>
          <href>https://maps.google.com/mapfiles/ms/icons/red-dot.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="style1">
      <IconStyle>
        <Icon>
          <href>https://maps.google.com/mapfiles/ms/icons/blue-dot.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="style2">
      <IconStyle>
        <Icon>
          <href>https://maps.google.com/mapfiles/ms/icons/green-dot.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="style3">
      <IconStyle>
        <Icon>
          <href>https://maps.google.com/mapfiles/ms/icons/yellow-dot.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="style4">
      <IconStyle>
        <Icon>
          <href>https://maps.google.com/mapfiles/ms/icons/purple-dot.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="style5">
      <IconStyle>
        <Icon>
          <href>https://maps.google.com/mapfiles/ms/icons/orange-dot.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Folder>
      <name>Sichtungen</name>`;

	// Placemarks hinzufügen
	placemarks.forEach((placemark) => {
		kmlContent += `
      <Placemark>
        <name>${escapeXml(placemark.name)}</name>
        <description>${placemark.description}</description>
        <Point>
          <coordinates>${placemark.coordinates}</coordinates>
        </Point>
        <TimeStamp>
          <when>${placemark.timestamp}</when>
        </TimeStamp>
        <styleUrl>${placemark.styleUrl}</styleUrl>
      </Placemark>`;
	});

	// Statistiken hinzufügen
	kmlContent += `
      <ExtendedData>
        <Data name="counts">
          <value>${counts.eq_1},${counts['2_5']},${counts['5_10']},${counts['11_15']},${counts.gt_15},${counts.dead}</value>
        </Data>
      </ExtendedData>
    </Folder>
  </Document>
</kml>`;

	return kmlContent;
}

/**
 * Konvertiert eine Meeressäuger-Sichtung in ein KML-Placemark.
 *
 * Diese interne Funktion transformiert die strukturierten Sichtungsdaten
 * in das KML-Placemark-Format. Sie erstellt:
 *
 * - Einen aussagekräftigen Namen (Datum/Zeit)
 * - Eine detaillierte HTML-Beschreibung mit allen relevanten Feldern
 * - Korrekt formatierte Koordinaten
 * - ISO 8601 Zeitstempel
 *
 * Die Beschreibung berücksichtigt Datenschutz-Einwilligungen und zeigt
 * nur autorisierte Informationen an.
 *
 * @param sighting - Eine Frontend-Sichtung
 * @returns KML-Placemark-Objekt
 * @internal
 */
function sightingToKmlPlacemark(sighting: FrontendSighting): KmlPlacemark {
	// Formatiere Datum und Zeit mit korrekter Zeitzonenkonvertierung
	const formattedDate = formatForKmlExport(sighting.sightingDate);

	// Name des Placemarks (Datum und Uhrzeit)
	const name = formattedDate;

	// Beschreibung des Placemarks
	let description = '<![CDATA[';

	if (sighting.species !== null && sighting.species !== undefined) {
		description += `<p><label>Tierart: </label>${getSpeciesName(sighting.species)}</p>`;
	}

	const lat =
		typeof sighting.latitude === 'number'
			? sighting.latitude
			: parseFloat(sighting.latitude || '0');
	const lon =
		typeof sighting.longitude === 'number'
			? sighting.longitude
			: parseFloat(sighting.longitude || '0');
	description += `<p><label>Position: </label>${formatDMS(lat, lon)}</p>`;
	description += `<p><label>Anzahl Tiere: </label>${sighting.totalCount}</p>`;

	if (sighting.juvenileCount && sighting.juvenileCount > 0) {
		description += `<p><label>Davon Jungtiere: </label>${sighting.juvenileCount}</p>`;
	}

	if (sighting.shipName && (sighting.nameConsent || sighting.shipNameConsent)) {
		description += `<p><label>Schiffsname: </label>${sighting.shipName}</p>`;
	}

	if (sighting.nameConsent && sighting.firstName && sighting.lastName) {
		description += `<p><label>Name: </label>${sighting.firstName} ${sighting.lastName}</p>`;
	}

	if (sighting.waterway) {
		description += `<p><label>Fahrwasser: </label>${sighting.waterway}</p>`;
	}

	description += ']]>';

	// Koordinaten
	const coordinates = `${sighting.longitude},${sighting.latitude}`;

	// Zeitstempel im KML-Format
	const timestamp = formatKmlTimestamp(sighting.sightingDate);

	return {
		name,
		description,
		coordinates,
		styleUrl: '#style1', // Standardwert, wird später basierend auf der Anzahl aktualisiert
		timestamp
	};
}

/**
 * Konvertiert einen Datumsstring in einen KML-kompatiblen ISO 8601 Zeitstempel.
 *
 * KML erwartet Zeitstempel im Format: YYYY-MM-DDTHH:mm:ssZ
 * Dies ermöglicht zeitbasierte Animationen in Google Earth.
 *
 * @param dateString - Eingabedatum (beliebiges gültiges Format)
 * @returns ISO 8601 Zeitstempel
 * @internal
 */
function formatKmlTimestamp(dateString: Date): string {
	return dateString.toISOString();
}

/**
 * Konvertiert Dezimalkoordinaten in das DMS-Format (Grad, Minuten, Sekunden).
 *
 * Diese Formatierung ist benutzerfreundlicher als Dezimalgrade und wird
 * in der KML-Beschreibung angezeigt. Das Format folgt dem nautischen Standard:
 *
 * - Breitengrad: DD° MM' SS.SS"N/S
 * - Längengrad: DDD° MM' SS.SS"E/W
 *
 * @param latitude - Breitengrad in Dezimalgrad (-90 bis +90)
 * @param longitude - Längengrad in Dezimalgrad (-180 bis +180)
 * @returns Formatierter String im DMS-Format
 *
 * @example
 * ```typescript
 * formatDMS(54.5, 13.2);
 * // Returns: "54° 30' 00.00"N - 013° 12' 00.00"E"
 * ```
 *
 * @internal
 */
function formatDMS(latitude: number, longitude: number): string {
	function _formatDMS(dec: number): { deg: number; min: number; sec: number; isNegative: boolean } {
		const isNegative = dec < 0;
		const abs = Math.abs(dec);
		let deg = Math.floor(abs);
		const minFloat = (abs - deg) * 60;
		let min = Math.floor(minFloat);
		let sec = (minFloat - min) * 60;

		// Handle rounding of seconds that might result in 60
		if (sec >= 59.995) {
			// Round to 2 decimal places
			sec = 0;
			min += 1;
			if (min >= 60) {
				min = 0;
				deg += 1;
			}
		}

		return { deg, min, sec, isNegative };
	}

	const latDMS = _formatDMS(latitude);
	const lonDMS = _formatDMS(longitude);

	// Format: 00° 00' 00.00"N - 000° 00' 00.00"E
	const latStr = `${latDMS.deg.toString().padStart(2, '0')}° ${latDMS.min.toString().padStart(2, '0')}' ${latDMS.sec.toFixed(2).padStart(5, '0')}"${latDMS.isNegative ? 'S' : 'N'}`;
	const lonStr = `${lonDMS.deg.toString().padStart(3, '0')}° ${lonDMS.min.toString().padStart(2, '0')}' ${lonDMS.sec.toFixed(2).padStart(5, '0')}"${lonDMS.isNegative ? 'W' : 'E'}`;

	return `${latStr} - ${lonStr}`;
}

/**
 * Escaped XML-Sonderzeichen für sichere KML-Ausgabe.
 *
 * Verhindert XML-Injection und stellt sicher, dass Benutzerdaten
 * sicher in KML-Attributen verwendet werden können.
 *
 * Ersetzt:
 * - & → &amp;
 * - < → &lt;
 * - > → &gt;
 * - " → &quot;
 * - ' → &apos;
 *
 * @param unsafe - Ungefilterte Benutzereingabe
 * @returns XML-sicherer String
 * @internal
 */
function escapeXml(unsafe: string): string {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/**
 * Konvertiert numerische Tierart-IDs in lesbare deutsche Namen.
 *
 * Diese Funktion mappt die in der Datenbank verwendeten numerischen
 * Bezeichner auf benutzerfreundliche deutsche Tiernamen für die
 * KML-Ausgabe.
 *
 * Die IDs entsprechen den Werten aus dem species-Dropdown im Frontend.
 *
 * @param speciesId - Numerische Tierart-ID (0-10)
 * @returns Deutscher Name der Tierart
 *
 * @example
 * ```typescript
 * getSpeciesName(0); // 'Schweinswal'
 * getSpeciesName(3); // 'Delphin (mehrere Arten)'
 * getSpeciesName(999); // 'Unbekannt'
 * ```
 *
 * @internal
 */
function getSpeciesName(speciesId: number): string {
	const speciesMap: Record<number, string> = {
		0: 'Schweinswal',
		1: 'Kegelrobbe',
		2: 'Seehund',
		3: 'Delphin (mehrere Arten)',
		4: 'Beluga',
		5: 'Zwergwal',
		6: 'Finnwal',
		7: 'Buckelwal',
		8: 'Unbekannte Walart',
		9: 'Ringelrobbe',
		10: 'Unbekannte Robbenart'
	};

	return speciesMap[speciesId] || 'Unbekannt';
}
