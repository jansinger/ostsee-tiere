import {
	NAME_CONSENT_VERSION,
	PRIVACY_CONSENT_VERSION,
	SHIP_NAME_CONSENT_VERSION
} from '#lib/form/consent/consentVersions.ts';
import { MEDIA_CONSENT_VERSION } from '#lib/form/consent/mediaConsentVersion.ts';
import { toCoordinate } from '#lib/report/components/form/coordinateValue.ts';
import { AnimalBehaviorEnum } from '#lib/report/formOptions/animalBehavior.ts';
import { BoatDriveEnum } from '#lib/report/formOptions/boatDrive.ts';
import { DISTANCE_UNSPECIFIED } from '#lib/report/formOptions/distance.ts';
import { DistributionEnum } from '#lib/report/formOptions/distribution.ts';
import { EntryChannelEnum } from '#lib/report/formOptions/entryChannel.ts';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import type { SightingFormValues } from '#lib/types/Form.ts';
import type { NewSighting } from '#lib/types/sighting.ts';
import { sql } from 'drizzle-orm';
import { berlinWallClockToUtc } from '#lib/server/datetime/berlinWallClockToUtc.ts';
import { checkBalticSeaFile } from '#lib/server/geo/checkBalticSeaFile.ts';

/**
 * Prüft, ob für ein numerisches Auswahlfeld eine verwertbare Angabe vorliegt.
 *
 * Bewusst **nicht** über Truthiness: In mehreren Enums ist `0` eine echte,
 * aktiv wählbare Kategorie ("Sonstiges", "Schweinswal") und darf nicht als
 * fehlende Angabe gelten. Genau diese Verwechslung hat den Bestand verfälscht.
 *
 * `NaN` und nicht parsebare Strings gelten ebenfalls als fehlend — sonst würde
 * eine kaputte Eingabe über `Number(…)` still zu `NaN` oder (früher, per
 * Falsy-Zweig) zum Enum-Wert `0` und damit zu einer erfundenen Aussage.
 */
function isProvided(value: unknown): boolean {
	if (value === undefined || value === null || String(value).trim() === '') {
		return false;
	}

	return !Number.isNaN(Number(value));
}

/**
 * Bestimmt die zu speichernde Tierart.
 *
 * Die Spalte `tierart` ist `smallint default(0) notNull` und `0` bedeutet
 * **"Schweinswal"**. Eine fehlende Art wurde damit zur Meldung eines
 * Schweinswals — für ein Forschungsmuseum ein Phantom-Datensatz in der
 * häufigsten Art überhaupt (16.037 von 19.880 Zeilen tragen `0`; ob darunter
 * Artefakte sind, lässt sich nachträglich nicht mehr feststellen, weil der
 * Wert fachlich plausibel ist).
 *
 * `species` ist Pflichtfeld — ein Fehlen ist deshalb ein echter Fehler und
 * kein zu ratender Wert. Anders als bei den übrigen Feldern wird hier bewusst
 * **kein** Ersatzwert gesetzt.
 *
 * Der Legacy-Vertrag bleibt unberührt: `mapLegacyToCurrentSchema` setzt den
 * dokumentierten Default (`tierart ?? SpeciesEnum.HARBOR_PORPOISE`) bereits an
 * der Legacy-Grenze, bevor diese Funktion überhaupt läuft. Nullish-Coalescing,
 * nicht `||` — eine übermittelte `0` ist eine gemeldete Art und darf nicht als
 * fehlend behandelt werden.
 */
function resolveSpecies(formData: SightingFormValues): number {
	if (!isProvided(formData.species)) {
		throw new Error(
			'Tierart fehlt: Ohne Angabe würde die Sichtung als Schweinswal (0) gespeichert werden.'
		);
	}

	return Number(formData.species);
}

/**
 * Bestimmt den zu speichernden Beobachtungsort.
 *
 * Die Spalte `vonwo` ist `integer default(0) notNull`, und `0` bedeutet
 * "Sonstiges". Ohne Angabe entstand bisher trotzdem eine `0` — der Datensatz
 * behauptete also eine Antwort, die nie gegeben wurde.
 *
 * **Anders als beim Bootsantrieb wurde der Bestand nicht korrigiert.** Bei
 * `vonwo` ist "Sonstiges" eine echte, häufig genutzte Kategorie: 713 der 1.833
 * Null-Zeilen tragen einen Freitext (Kajak 91×, Mehrzweckschiff 37×, SUP 31×,
 * Ruderboot 24× …), 538 einen Schiffsnamen. Für die restlichen Zeilen gibt es
 * keine ableitbare Wahrheit — wer den Ort nie angegeben hat, hat ihn nirgends
 * angegeben. Ein UPDATE wäre entweder destruktiv oder unbelegt (Messung
 * 2026-07-29, Entscheidung des Nutzers).
 *
 * Diese Funktion verhindert deshalb nur, dass NEUE Zeilen dieselbe
 * Doppeldeutigkeit erben.
 */
function resolveSightingFrom(formData: SightingFormValues): number {
	// `isProvided` statt Truthiness: Eine aktive Auswahl "Sonstiges" ist `0`
	// und damit falsy — sie darf nicht als fehlende Angabe gewertet werden.
	return isProvided(formData.sightingFrom)
		? Number(formData.sightingFrom)
		: SightingFromEnum.UNKNOWN;
}

/**
 * Bestimmt den zu speichernden Bootsantrieb.
 *
 * Die Spalte `bootsantrieb` ist `integer default(0) notNull`, und `0` bedeutet
 * "Sonstiger Bootsantrieb" — nicht "unbekannt" und nicht "kein Boot". Ohne
 * diese Fallunterscheidung trug jede Sichtung von Land die aktive Behauptung,
 * es habe ein Boot mit ungewöhnlichem Antrieb gegeben. Betroffen waren 5.858
 * von 19.880 Zeilen (Stand 2026-07-29), wodurch "Sonstiger" in jeder
 * Antriebs-Auswertung fälschlich die häufigste Kategorie war.
 *
 * Das Formular fragt den Antrieb bei Land-Sichtungen nicht mehr ab
 * (`sightingSchema`, `when('sightingFrom', …)`) — hier wird entschieden, was
 * stattdessen gespeichert wird.
 *
 * Ein bereits vorhandener Wert wird **nicht** überschrieben: Beim Admin-Edit
 * einer Alt-Sichtung darf eine gespeicherte Angabe nicht still verloren gehen.
 *
 * **Ohne Angabe wird immer `NONE` geschrieben, nie `OTHER`** — `OTHER` ist eine
 * aktive Wahl des Melders und darf nicht aus einer Nicht-Antwort entstehen.
 *
 * Bekannte Unschärfe: `NONE` heißt wörtlich "Kein Boot". Bei Sichtungen von
 * einer Fähre oder von "Sonstiges" (Kajak, SUP) ist durchaus ein Fahrzeug im
 * Spiel, dessen Antrieb nur niemand angegeben hat — dort ist `NONE` streng
 * genommen zu stark. Das ist bewusst in Kauf genommen: Die Alternative wäre ein
 * weiterer Enum-Wert "Antrieb unbekannt" und damit eine dritte Änderung am
 * Legacy-Vertrag für dieselbe Spalte. Eine falsche Antriebsart zu behaupten
 * wiegt schwerer als die Aussage "kein Boot" bei einem Kajak.
 */
function resolveBoatDrive(formData: SightingFormValues): number {
	if (isProvided(formData.boatDrive)) {
		return Number(formData.boatDrive);
	}

	return BoatDriveEnum.NONE;
}

/**
 * Konvertiert Formulardaten in das Datenbankschema für Meeressäuger-Sichtungen.
 *
 * Diese zentrale Transformationsfunktion konvertiert die vom Frontend übermittelten
 * Formulardaten in die Struktur, die für die Datenbankpersistierung benötigt wird.
 * Sie führt dabei wichtige Validierungen und Datenverarbeitungen durch:
 *
 * - Erstellt PostGIS-Geometrie-Objekte für Koordinaten
 * - Validiert Koordinaten gegen Ostsee-Grenzen
 * - Kombiniert Datum und Zeit zu einem DateTime-Objekt
 * - Konvertiert String-IDs zu numerischen Werten
 * - Setzt Standard- und Berechnungswerte
 * - Behandelt optionale Felder sicher
 *
 * @param formData - Die vom Frontend übermittelten Formulardaten
 * @returns Ein strukturiertes Objekt entsprechend dem Datenbankschema
 *
 * @example
 * ```typescript
 * const formData: SightingFormData = {
 *   latitude: 54.5,
 *   longitude: 13.2,
 *   sightingDate: '2024-01-15',
 *   sightingTime: '14:30',
 *   species: '1',
 *   totalCount: '3',
 *   // ... weitere Felder
 * };
 *
 * const dbSighting = mapFormToSighting(formData);
 * // dbSighting enthält PostGIS-Geometrie, kombinierte DateTime, etc.
 * ```
 */
export function mapFormToSighting(formData: SightingFormValues): NewSighting {
	/**
	 * SCHRITT 1: Geografische Koordinaten verarbeiten
	 * Erstellt PostGIS-Geometrie und validiert Ostsee-Zugehörigkeit
	 */
	let location = null;
	let inBaltic = false,
		inChartArea = false;

	// Erst in eine Zahl umwandeln, dann prüfen. Die Regel bleibt dieselbe wie
	// zuvor — eine Null ist keine Position —, sie hängt nur nicht mehr an der
	// Truthiness des Rohwerts: `0` ist falsy, die Zeichenkette `'0.0000'` nicht.
	//
	// Über das Formular kam dieser Unterschied nie an, weil `handleSubmit` das
	// von Yup gecastete Objekt weiterreicht und dort jede Koordinate eine Zahl
	// ist. Die Legacy-REST-Grenze castet nicht: `mapLegacyToCurrentSchema` gibt
	// die Werte des Clients weiter, wie sie ankommen. Ein `"0.0000"` von dort
	// hätte einen PostGIS-Punkt bei 0°/0° erzeugt.
	const latitude = toCoordinate(formData.latitude) || null;
	const longitude = toCoordinate(formData.longitude) || null;

	if (latitude !== null && longitude !== null) {
		// PostGIS erwartet SRID 4326 für WGS84 (GPS-Koordinaten)
		// ST_MakePoint(longitude, latitude) - Achtung: X=Longitude, Y=Latitude!
		location = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;

		// Geografische Validierung: Prüfe ob Koordinaten in der Ostsee liegen
		({ inBaltic, inChartArea } = checkBalticSeaFile(longitude, latitude));
	}

	/**
	 * SCHRITT 2: Datum/Zeit-Verarbeitung
	 *
	 * Datum und Uhrzeit sind deutsche Wanduhrzeit und werden ausschließlich hier
	 * kombiniert. Ein vom Client mitgeschickter Zeitstempel wird bewusst nicht
	 * ausgewertet — er trüge die Zeitzone des Browsers und verschöbe den
	 * gespeicherten Zeitpunkt.
	 */
	const fullDateTime = berlinWallClockToUtc(formData.sightingDate, formData.sightingTime);

	/**
	 * SCHRITT 3: Datenbankschema-Objekt erstellen
	 * Konvertiert alle Formularfelder in das erwartete Datenbankformat
	 */
	return {
		// === METADATEN ===
		// ID wird automatisch durch Datenbanksequenz generiert
		created: new Date(), // Erstellungszeitpunkt

		// === GEOGRAFISCHE DATEN ===
		// Koordinaten als Strings für Datenbankkompatibilität. Die Zahl geht dabei
		// ungekürzt in den String — die Spalten sind `numeric(8,6)`, eine
		// Anzeige-Rundung gehört ins Eingabefeld und nicht in den Bestand.
		latitude: latitude !== null ? String(latitude) : null,
		longitude: longitude !== null ? String(longitude) : null,
		// PostGIS-Geometrie für räumliche Abfragen
		location,
		// Gewässer und Seezeichen
		waterway: formData.waterway,
		seaMark: formData.seaMark,

		// === ZEITANGABEN ===
		// Nutzt kombinierte DateTime oder fällt auf aktuellen Zeitpunkt zurück
		sightingDate: fullDateTime,

		// === TIERBEOBACHTUNG ===
		// Tierart (numerische ID aus Dropdown)
		species: resolveSpecies(formData),
		// Anzahl Tiere
		totalCount: formData.totalCount ? Number(formData.totalCount) : 0,
		juvenileCount: formData.juvenileCount ? Number(formData.juvenileCount) : 0,
		// Totfund-spezifische Felder (boolean zu int-Konvertierung für SQLite)
		isDead: formData.isDead ? 1 : 0,
		deadCondition: formData.deadCondition ? Number(formData.deadCondition) : 0,
		deadSex: formData.deadSex ? Number(formData.deadSex) : 0,
		deadSize: formData.deadSize ? Number(formData.deadSize) : null,

		// === BEOBACHTUNGSDETAILS ===
		// Beobachtungsplattform (Land, Boot, etc.)
		sightingFrom: resolveSightingFrom(formData),
		sightingFromText: formData.sightingFromText, // Freitext-Ergänzung
		// Entfernung zur Sichtung
		// `entfernung` ist die Ausnahme unter den Auswahlfeldern: Das Enum geht
		// von 1 bis 5, `0` ist also keine Kategorie, sondern ein Sentinel für
		// "nicht angegeben" (282 Bestandszeilen) und wird als "Unbekannt"
		// angezeigt. Hier ist die Null deshalb korrekt und bleibt.
		distance: isProvided(formData.distance) ? Number(formData.distance) : DISTANCE_UNSPECIFIED,
		// Verteilung der Tiere
		distribution: isProvided(formData.distribution)
			? Number(formData.distribution)
			: DistributionEnum.UNKNOWN,
		distributionText: formData.distributionText,
		// Verhalten der Tiere
		behavior: isProvided(formData.behavior)
			? Number(formData.behavior)
			: AnimalBehaviorEnum.UNKNOWN,
		behaviorText: formData.behaviorText,
		// Reaktion auf Beobachter
		reaction: formData.reaction,

		// === UMWELTBEDINGUNGEN ===
		// Seegang (Beaufort-Skala)
		seaState: formData.seaState ? Number(formData.seaState) : 0,
		// Sichtweite
		visibility: formData.visibility ? Number(formData.visibility) : 0,
		// Windstärke — Beaufort 0 bis 12, aus historischen Gründen als String
		// gespeichert (`varchar(2)`).
		//
		// Anders als bei `seegang` und `sichtweite` darüber ist die `0` hier
		// keine "Keine Angabe", sondern die Stufe Windstille. Ein
		// `formData.windForce ? … : null` machte daraus NULL und im Admin wie
		// im CSV-Export "Nicht angegeben" — über die Legacy-API ging damit die
		// Windstille jeder App-Meldung verloren, obwohl `parseWindForce` sie
		// dort ausdrücklich durchreicht.
		//
		// `isProvided` und nicht bloß eine Leerprüfung: Ein `NaN` würde sonst
		// als `'NaN'` in die zwei Zeichen breite Spalte laufen.
		//
		// Gegen zu lange Werte schützt es nicht, und die vorgelagerte
		// Validierung tut es nur halb: `sightingSchema` begrenzt `windForce`
		// auf 0 bis 12, aber ohne `.integer()` — ein `3.5` käme als `'3.5'`
		// durch. Die Legacy-API prüft `windstaerke` überhaupt nicht auf einen
		// Bereich (`yup.string().nullable().optional()`), dort passiert auch
		// ein `999`. Beides war vorher genauso.
		windForce: isProvided(formData.windForce) ? String(formData.windForce) : null,
		// Windrichtung (N, NW, W, etc.)
		windDirection: formData.windDirection,

		// === MEDIEN-UPLOADS ===
		// Legacy-Feld für externe Medien-URLs
		mediaFile: formData.mediaFile ? String(formData.mediaFile) : null,
		// Flag: Wurden Dateien hochgeladen? (bestimmt ob Dateien-Tab angezeigt wird)
		mediaUpload: formData.mediaUpload ? 1 : 0,

		// === FAHRZEUG-/SCHIFFSDATEN ===
		// Schiffsname (optional)
		shipName: formData.shipName,
		// Heimathafen
		homePort: formData.homePort,
		// Bootstyp (Segelboot, Motorboot, etc.)
		boatType: formData.boatType,
		// Anzahl Schiffe in der Umgebung
		shipCount: formData.shipCount ? Number(formData.shipCount) : null,
		// Antriebsart (bei Land-Sichtungen "Kein Boot", siehe resolveBoatDrive)
		boatDrive: resolveBoatDrive(formData),
		boatDriveText: formData.boatDriveText, // Freitext-Ergänzung

		// === KONTAKTINFORMATIONEN ===
		// Persönliche Daten des Melder*in
		firstName: formData.firstName,
		lastName: formData.lastName,
		email: formData.email,
		phone: formData.phone,
		// Nur über die Legacy-REST-API befüllt (Spec-Feld `fax`); das Formular
		// bietet kein Fax-Eingabefeld an.
		fax: formData.fax,
		// Adresse
		street: formData.street,
		zipCode: formData.zipCode,
		city: formData.city,

		// === DATENSCHUTZ-EINWILLIGUNGEN ===
		// DSGVO-konforme Einwilligungen (boolean zu int). Zu jeder erteilten
		// Einwilligung gehören Zeitpunkt und Textfassung — sie sind der Nachweis
		// nach Art. 7 Abs. 1 DSGVO. Zu einer abgelehnten Einwilligung gehört
		// nichts davon: Ein Zeitstempel würde eine Zustimmung vortäuschen.
		shipNameConsent: formData.shipNameConsent ? 1 : 0,
		shipNameConsentAt: formData.shipNameConsent ? new Date() : null,
		shipNameConsentVersion: formData.shipNameConsent ? SHIP_NAME_CONSENT_VERSION : null,
		nameConsent: formData.nameConsent ? 1 : 0,
		nameConsentAt: formData.nameConsent ? new Date() : null,
		nameConsentVersion: formData.nameConsent ? NAME_CONSENT_VERSION : null,
		privacyConsent: formData.privacyConsent ? 1 : 0,
		privacyConsentAt: formData.privacyConsent ? new Date() : null,
		privacyConsentVersion: formData.privacyConsent ? PRIVACY_CONSENT_VERSION : null,
		// Einwilligung zur Veröffentlichung von Aufnahmen. Zeitpunkt und
		// Textfassung nur dann, wenn tatsächlich zugestimmt wurde — ein
		// Nachweis für eine nicht erteilte Einwilligung wäre sinnlos.
		mediaConsent: formData.mediaConsent ? 1 : 0,
		mediaConsentAt: formData.mediaConsent ? new Date() : null,
		mediaConsentVersion: formData.mediaConsent ? MEDIA_CONSENT_VERSION : null,

		// === SYSTEM-FELDER UND VALIDIERUNGEN ===
		// Eingabekanal (Web, Mobile App, Admin-Interface, etc.)
		entryChannel: formData.entryChannel
			? Number(formData.entryChannel)
			: Number(EntryChannelEnum.WEB), // Standard: Web-Formular
		// Admin-Flags
		verified: formData.verified ? 1 : 0, // Initial nicht verifiziert
		// Geografische Validierungen (basierend auf checkBalticSeaFile)
		inBalticSea: inBaltic ? 1 : 0, // Liegt in der Ostsee?
		inBalticSeaGeo: inChartArea ? 1 : 0, // Liegt im Karten-Bereich?
		// Totfund-Kontakt
		deadPhoneContact: formData.deadPhoneContact ? 1 : 0,

		// === FREITEXT-FELDER ===
		// Admin-Notizen (nur im Admin-Bereich sichtbar)
		notes: formData.notes,
		// Interner Kommentar. Das Admin-Formular bietet ihn an
		// (`Administrative.svelte`), hier fehlte er — getippter Text war nach dem
		// Speichern spurlos weg, ohne Fehlermeldung.
		//
		// Über den öffentlichen Weg kann niemand hier hineinschreiben:
		// `POST /api/sightings` überschreibt das Feld mit `undefined`, und der
		// Legacy-Eingang kennt es nicht. Ein `undefined` erreicht die Spalte nie —
		// Drizzle lässt es beim Insert wie beim Update aus.
		internalComment: formData.internalComment,
		// Weitere Beobachtungen durch Melder*in
		otherObservations: formData.otherObservations,

		// === EINDEUTIGE KENNZEICHNUNG ===
		// Referenz-ID für Zuordnung von Dateien und Nachverfolgung
		referenceId: formData.referenceId
	};
}
