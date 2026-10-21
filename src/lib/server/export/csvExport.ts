/**
 * @fileoverview CSV-Export-Funktionen für Sichtungsdaten
 *
 * Dieses Modul generiert CSV-Dateien aus Sichtungsdaten für den wissenschaftlichen
 * Export und die weitere Datenanalyse. Das CSV-Format entspricht dem ursprünglichen
 * PHP-System und gewährleistet Kompatibilität mit bestehenden Analysewerkzeugen.
 *
 * Verwendet Semikolon als Trennzeichen entsprechend der deutschen CSV-Norm
 * und exportiert alle relevanten Sichtungsfelder mit lesbaren Labels.
 *
 * @author Ostsee-Tiere Team
 * @since 1.0.0
 */

import { getAnimalBehaviorLabel } from '#lib/report/formOptions/animalBehavior.ts';
import { getBoatDriveLabel } from '#lib/report/formOptions/boatDrive.ts';
import { getDistanceLabel } from '#lib/report/formOptions/distance.ts';
import { getDistributionLabel } from '#lib/report/formOptions/distribution.ts';
import { getSeaStateLabel } from '#lib/report/formOptions/seaState.ts';
import { getSightingFromLabel } from '#lib/report/formOptions/sightingFrom.ts';
import { getSpeciesLabel } from '#lib/report/formOptions/species.ts';
import { getVisibilityLabel } from '#lib/report/formOptions/visibility.ts';
import { baseLocale } from '#lib/paraglide/runtime.js';
import type { FrontendSighting } from '#lib/types/index.ts';
import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
import {
	getSightingStatus,
	SIGHTING_STATUS_PRESENTATION
} from '#lib/components/admin/sightingStatus.ts';

/**
 * Generiert CSV-Daten aus einer Sammlung von Sichtungen
 *
 * Konvertiert Frontend-Sichtungsdaten in ein strukturiertes CSV-Format
 * mit deutschen Spaltennamen und lesbaren Werten für den wissenschaftlichen Export.
 * Basiert auf der ursprünglichen PHP-Implementierung für Kompatibilität.
 *
 * @param sightings Array von Sichtungsdaten aus der Datenbank
 * @returns CSV-String mit Header und Datenzeilen, Semikolon-getrennt
 *
 * @example
 * const csvData = generateCsvData(sightings);
 * // Ergebnis: "ID;Datum;Uhrzeit;Tierart;...\n123;15.03.2024;14:30;Schweinswal;..."
 *
 * @note
 * - Verwendet Semikolon (;) als Feldtrennzeichen (deutsche CSV-Norm)
 * - Alle Werte sind in Anführungszeichen eingeschlossen
 * - Datums- und Zeitformat entspricht deutscher Lokalisierung
 * - Respektiert Datenschutz-Einwilligung für Namen und Schiffsnamen
 */
export function generateCsvData(sightings: FrontendSighting[]): string {
	// CSV-Header definieren - entspricht der Struktur der ursprünglichen PHP-Version
	const headers = [
		'ID', // Eindeutige Sichtungs-ID
		'Datum', // Sichtungsdatum im deutschen Format
		'Uhrzeit', // Sichtungszeit im 24h-Format
		'Tierart', // Spezies-Name (lesbar)
		'Anzahl', // Gesamtanzahl der gesichteten Tiere
		'Jungtiere', // Anzahl Jungtiere/Kälber
		'Verteilung', // Räumliche Verteilung der Tiere
		'Lat', // Breitengrad (Dezimalgrad)
		'Lon', // Längengrad (Dezimalgrad)
		'Verhalten', // Beobachtetes Verhalten
		'Reaktion', // Reaktion auf Boot/Beobachter
		'Entfernung', // Entfernung zum Tier
		'Sichtung von', // Beobachtungsplattform
		'Toter Fund', // Ja/Nein für Totfund
		'Zustand', // Zustand bei Totfund
		'Geschlecht', // Geschlecht bei Totfund
		'Größe', // Größe bei Totfund
		'Fahrwasser', // Gewässername
		'Seezeichen', // Navigationshilfe als Referenz
		'Seegang', // Wellenhöhe/Seegang
		'Sicht', // Sichtweite
		'Windrichtung', // Windrichtung
		'Windstärke', // Windgeschwindigkeit/Beaufort
		'Schiffsname', // Name des Beobachtungsschiffs
		'Heimathafen', // Heimathafen des Schiffs
		'Bootstyp', // Art des Fahrzeugs
		'Bootsantrieb', // Antriebsart
		'Schiffsanzahl', // Anzahl Schiffe in der Nähe
		'Foto', // Ja/Nein für Foto/Video vorhanden
		'Name', // Beobachter-Name (bei Einwilligung)
		'Email', // Kontakt-E-Mail
		'Telefon', // Telefonnummer
		'Fax', // Faxnummer (legacy)
		'Straße', // Adresse
		'PLZ', // Postleitzahl
		'Stadt', // Ort
		'Anmerkungen', // Zusätzliche Notizen
		'Andere Beobachtungen', // Weitere Beobachtungen
		'Status', // Abgeleitet aus freigegeben_am/abgelehnt_am — siehe sightingStatus.ts
		'Erstellt am' // Erstellungszeitpunkt
	];

	// CSV-Header als erste Zeile mit Semikolon-Trennung
	let csvContent = headers.join(';') + '\n';

	// Verarbeite jede Sichtung zu einer CSV-Zeile
	sightings.forEach((sighting) => {
		// Datum und Zeit in deutscher Ortszeit formatieren.
		// Bewusst über formatLocalDateTime (fixe Zeitzone Europe/Berlin) statt über
		// getDate()/getHours(): diese Getter arbeiten in der Zeitzone des Prozesses,
		// womit der Export im UTC-Container 1–2 Stunden gegenüber KML-, XML- und
		// JSON-Export abgewichen wäre.
		const date = formatLocalDateTime(sighting.sightingDate, 'date');
		const time = formatLocalDateTime(sighting.sightingDate, 'time');

		// Enum-Werte in lesbare Labels konvertieren
		// Tierart bewusst auf baseLocale ('de') gepinnt: laut
		// docs/i18n/DESIGN_MEHRSPRACHIGKEIT_2026-08-10.md Abschnitt 6 bleiben
		// Exportformate (CSV/XML/KML/JSON) deutsch — sie gehen an die
		// Wissenschaft, stabile deutsche Kopfzeilen/Werte sind dort ein
		// Merkmal. `getSpeciesLabel()` würde ohne diesen Parameter sonst die
		// aktive Anfrage-Locale übernehmen, sobald echte englische Artnamen
		// eingepflegt sind (heute maskiert das messages/en.json == de.json).
		const speciesName = getSpeciesLabel(sighting.species, baseLocale);
		// Verhalten bewusst auf baseLocale gepinnt — dieselbe Begründung wie bei
		// `speciesName` oben (Exportformate bleiben deutsch).
		const behaviorText = getAnimalBehaviorLabel(sighting.behavior, baseLocale);

		// Datenschutz: Namen nur bei expliziter Einwilligung anzeigen
		const name =
			sighting.nameConsent && sighting.firstName && sighting.lastName
				? `${sighting.firstName} ${sighting.lastName}`
				: ''; // Leer bei fehlender Einwilligung

		// Werte für die CSV-Zeile
		const row = [
			sighting.id,
			date,
			time,
			speciesName,
			sighting.totalCount,
			sighting.juvenileCount || '',
			// Verteilung/Entfernung bewusst auf baseLocale gepinnt — dieselbe
			// Begründung wie bei `speciesName` oben (Exportformate bleiben deutsch).
			getDistributionLabel(sighting.distribution, baseLocale),
			sighting.latitude,
			sighting.longitude,
			behaviorText,
			sighting.reaction || '',
			getDistanceLabel(sighting.distance, baseLocale),
			// Sichtung von bewusst auf baseLocale gepinnt — dieselbe Begründung wie
			// bei `speciesName` oben (Exportformate bleiben deutsch).
			getSightingFromLabel(sighting.sightingFrom, baseLocale),
			sighting.isDead ? 'Ja' : 'Nein',
			sighting.deadCondition || '',
			sighting.deadSex || '',
			sighting.deadSize || '',
			sighting.waterway || '',
			sighting.seaMark || '',
			// Seegang/Sicht bewusst auf baseLocale gepinnt — dieselbe Begründung
			// wie bei `speciesName` oben (Exportformate bleiben deutsch).
			getSeaStateLabel(sighting.seaState, baseLocale),
			getVisibilityLabel(sighting.visibility, baseLocale),
			sighting.windDirection || '',
			sighting.windForce || '',
			sighting.shipNameConsent ? sighting.shipName || '' : '',
			sighting.homePort || '',
			sighting.boatType || '',
			// Bootsantrieb bewusst auf baseLocale gepinnt — dieselbe Begründung wie
			// bei `speciesName` oben (Exportformate bleiben deutsch).
			getBoatDriveLabel(sighting.boatDrive, baseLocale),
			sighting.shipCount || '',
			sighting.mediaUpload ? 'Ja' : 'Nein',
			name,
			sighting.email || '',
			sighting.phone || '',
			sighting.fax || '',
			sighting.street || '',
			sighting.zipCode || '',
			sighting.city || '',
			sighting.notes || '',
			sighting.otherObservations || '',
			SIGHTING_STATUS_PRESENTATION[
				getSightingStatus({ approvedAt: sighting.approvedAt, rejectedAt: sighting.rejectedAt })
			].label,
			formatLocalDateTime(sighting.created, 'full')
		];

		// Werte mit Anführungszeichen versehen und zur CSV hinzufügen
		csvContent += row.map((value) => `"${value}"`).join(';') + '\n';
	});

	return csvContent;
}
