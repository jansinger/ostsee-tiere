import { AnimalBehaviorEnum } from '#lib/report/formOptions/animalBehavior.ts';
import { BoatDriveEnum } from '#lib/report/formOptions/boatDrive.ts';
import { DistributionEnum } from '#lib/report/formOptions/distribution.ts';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import { SpeciesEnum } from '#lib/report/formOptions/species.ts';
/**
 * @fileoverview Field mapping adapter for PDF-compliant Legacy REST API
 *
 * Provides bidirectional field mapping between legacy API format and current schema.
 * Handles data transformation, validation, and format conversion for backwards compatibility.
 *
 * @author Ostsee-Tiere Team
 * @since 1.10.0
 */

import { EntryChannelEnum } from '#lib/report/formOptions/entryChannel.ts';
import type { SightingFormData } from '#lib/types/index.ts';
import { createId } from '@paralleldrive/cuid2';
import type { LegacySightingRequest } from './types.js';

/**
 * „Wurde das Feld überhaupt übermittelt?"
 *
 * Legacy-Clients dürfen Formulardaten schicken; der Endpunkt baut daraus
 * `Object.fromEntries(formData.entries())`, also **Strings**. Eine aktiv
 * gemeldete `0` (bzw. `'0'`) ist ein echter Wert und muss von „nicht
 * übermittelt" (`undefined`/`null`/`''`) unterscheidbar bleiben — genau
 * diese Grenze ziehen alle drei Helfer unten gemeinsam.
 */
function isLegacyValuePresent<T extends number | string>(value: T | undefined | null): value is T {
	return value !== undefined && value !== null && value !== '';
}

/**
 * Prüft ein Legacy-0/1-Feld auf „gesetzt".
 *
 * String-tolerant: `!!'0'` wäre `true` — deshalb wird numerisch verglichen.
 */
function isLegacyFlagSet(value: number | string | undefined | null): boolean {
	return isLegacyValuePresent(value) && Number(value) === 1;
}

/**
 * Prüft ein Legacy-Zahlenfeld auf exakt 0 — ebenfalls string-tolerant,
 * weil `'0' === 0` in TypeScript false ist.
 */
function isLegacyZero(value: number | string | undefined | null): boolean {
	return isLegacyValuePresent(value) && Number(value) === 0;
}

/**
 * Maps legacy API request to current SightingFormData format
 *
 * @param legacyData - Legacy API request data
 * @returns Transformed data in current schema format
 */
export function mapLegacyToCurrentSchema(legacyData: LegacySightingRequest): SightingFormData {
	// Parse the single datetime field (YYYY-MM-DD HH:MI) into separate date and time
	const { sightingDate, sightingTime } = parseLegacyDateTimeToFields(legacyData.sichtungsdatum);

	return {
		// Date and location
		sightingDate,
		sightingTime,
		latitude: legacyData.gps_breite || 0,
		longitude: legacyData.gps_laenge || 0,
		waterway: legacyData.fahrwasser || '',
		seaMark: legacyData.seezeichen || '',

		// Observer information
		firstName: legacyData.vorname,
		lastName: legacyData.name, // Note: "name" in legacy API, not "nachname"
		email: legacyData.email,
		phone: legacyData.telefon || '',
		fax: legacyData.fax || '',
		street: legacyData.strasse || '',
		zipCode: legacyData.plz || '',
		city: legacyData.ort || '',

		// Sighting details
		totalCount: legacyData.anzahl_gesamt,
		juvenileCount: legacyData.anzahl_jung || 0,
		// Bleibt bei 0: Die Spec dokumentiert für `tierart` ausdrücklich
		// "Default = 0" (= Schweinswal). Das ist ein zugesagter Vertrag,
		// kein Versehen — anders als bei den Feldern darunter.
		species: legacyData.tierart ?? SpeciesEnum.HARBOR_PORPOISE,

		// Observation context
		// `??` statt `||`: Eine übermittelte 0 ist die aktive Auswahl "Sonstiges"
		// und darf nicht zum Sentinel werden. Die Spec sagt für dieses Feld
		// keinen Default zu — "nicht übermittelt" ist deshalb "keine Angabe",
		// nicht "Sonstiges".
		sightingFrom: legacyData.vonwo ?? SightingFromEnum.UNKNOWN, // vonwo maps to sightingFrom
		sightingFromText: legacyData.vonwo_text || '',
		distance: legacyData.entfernung || 0,
		distribution: legacyData.verteilung ?? DistributionEnum.UNKNOWN,
		distributionText: legacyData.verteilung_text, // Legacy API doesn't separate this
		behavior: legacyData.verhalten ?? AnimalBehaviorEnum.UNKNOWN,
		behaviorText: legacyData.verhalten_text, // Legacy API doesn't separate this
		reaction: legacyData.reaktion || '',

		// Environmental conditions
		seaState: legacyData.seegang || 0,
		windDirection: normalizeWindDirection(legacyData.windrichtung),
		windForce: parseWindForce(legacyData.windstaerke),
		visibility: legacyData.sichtweite || 0,

		// Vessel information
		shipName: legacyData.schiffsname || '',
		homePort: legacyData.heimathafen || '',
		boatType: legacyData.bootstyp || '',
		boatDrive: legacyData.bootsantrieb ?? BoatDriveEnum.NONE,
		boatDriveText: legacyData.bootsantrieb_text, // Legacy API doesn't separate this

		// Media and observations
		mediaFile: legacyData.aufnahme || '',
		mediaUpload: isLegacyFlagSet(legacyData.aufnahmeHochladen),
		// Die Spezifikation nennt das Feld `sonstige_auffaelligkeiten` (mit `ae`);
		// diese Implementierung las bis 2026-07-30 nur die Umlaut-Variante und
		// verwarf den Freitext spec-konformer Clients kommentarlos.
		//
		// Beide Schreibweisen werden gelesen. Unter zwei **gefüllten** Werten
		// gewinnt der Vertragsname; ein leerer Vertragsname verdrängt dagegen
		// keinen vorhandenen Umlaut-Text. Deshalb `||` und nicht `??`: Ein
		// Serializer, der abwesende Felder als `""` ausgibt, würde mit `??` den
		// vorhandenen Text verwerfen — genau der stille Datenverlust, den diese
		// Änderung behebt. Festgenagelt in field-mapping.test.ts.
		otherObservations:
			legacyData.sonstige_auffaelligkeiten || legacyData.sonstige_auffälligkeiten || '',
		notes: legacyData.bemerkungen || '',

		// Consent flags (convert 0/1 to boolean)
		//
		// `isLegacyFlagSet` statt `? true : false`: Über den Formulardaten-Pfad
		// kommt jedes Feld als String an (`Object.fromEntries(formData.entries())`
		// in src/routes/rest_sichtungen/+server.ts). Ein vertragskonformes
		// `namensnennung=0` war damit `'0'` — und `'0' ? true : false` ist `true`.
		// Das ausdrückliche „nein" des Melders wurde bis 2026-07-30 als
		// Zustimmung gespeichert und sein Name in showreports.json
		// veröffentlicht. Nur eine explizite 1 ist eine Zustimmung.
		nameConsent: isLegacyFlagSet(legacyData.namensnennung),
		shipNameConsent: isLegacyFlagSet(legacyData.schiffnamensnennung),
		privacyConsent: isLegacyFlagSet(legacyData.datenschutzEinverstaendnis),

		// Death finding detection and fields
		//
		// Die Spec kennt zwei Wege zum Totfund: das eigene 0/1-Feld `totfund` und
		// die Regel „`anzahl_gesamt = 0` wird als Totfund interpretiert". Bis
		// 2026-07-30 wurde nur der Zähler ausgewertet — ein explizites
		// `totfund: 1` bei `anzahl_gesamt > 0` verschwand. Der neu angebundene
		// iOS-Client (OstSeeTiere/8) sendet genau das (beobachtet: 1, 2, 3, 7).
		isDead: isLegacyFlagSet(legacyData.totfund) || isLegacyZero(legacyData.anzahl_gesamt),
		deadSize: legacyData.totfund_groesse || undefined,
		deadCondition: legacyData.totfund_zustand || 0,
		deadSex: legacyData.totfund_geschlecht || 0,
		deadPhoneContact: isLegacyFlagSet(legacyData.totfund_telefon),

		// System fields
		entryChannel: legacyData.eingangskanal || EntryChannelEnum.APP,
		shipCount: legacyData.anzahl_schiffe || undefined, // Legacy API doesn't track ship count separately

		// Required fields that legacy API doesn't provide
		verified: false,
		referenceId: createId(), // Generate a reference ID for legacy imports
		uploadedFiles: [], // Legacy API handles media differently
		hasPosition: !!(legacyData.gps_breite && legacyData.gps_laenge), // True if coordinates provided

		// Additional required fields
		persistentDataConsent: false, // Legacy API users implicitly consent to data storage
		// Legacy-Clients kennen das Feld nicht und können die Veröffentlichung
		// von Aufnahmen daher nicht erklären. Ein `true` würde einen
		// Einwilligungsnachweis erfinden (siehe mediaConsent.test.ts).
		mediaConsent: false
	};
}

/** Windrichtungen, wie die Spec, die DB-Spalte, das Formular und `antworten.json` sie kennen. */
const GERMAN_WIND_DIRECTIONS = ['', 'N', 'NW', 'W', 'SW', 'S', 'SO', 'O', 'NO'] as const;
type GermanWindDirection = (typeof GERMAN_WIND_DIRECTIONS)[number];

/**
 * Der neu gebaute iOS-Client (OstSeeTiere/8) sendet englische
 * Himmelsrichtungs-Abkürzungen statt der deutschen. Nur drei der acht Werte
 * unterscheiden sich zwischen den Sprachen — diese Tabelle bildet sie auf die
 * deutsche Form ab. `N`, `S`, `W`, `NW`, `SW` sind in beiden Sprachen
 * identisch und brauchen keinen Eintrag.
 */
const ENGLISH_TO_GERMAN_WIND_DIRECTION: Record<string, GermanWindDirection> = {
	NE: 'NO',
	E: 'O',
	SE: 'SO'
};

/**
 * Normalisiert eine Windrichtung auf die deutsche Form. Deutsche Eingaben
 * durchlaufen unverändert (byte-identisch zum bisherigen Verhalten), englische
 * Abkürzungen werden übersetzt. Alles andere — inklusive fehlender Angabe —
 * wird zu `''`, wie bisher.
 */
function normalizeWindDirection(value: string | undefined | null): GermanWindDirection {
	if (!isLegacyValuePresent(value)) {
		return '';
	}
	const normalized = ENGLISH_TO_GERMAN_WIND_DIRECTION[value] ?? value;
	return (GERMAN_WIND_DIRECTIONS as readonly string[]).includes(normalized)
		? (normalized as GermanWindDirection)
		: '';
}

/**
 * Wandelt `windstaerke` in eine Zahl um, ohne eine aktiv gemeldete `0`
 * (Windstille, ein reales Beaufort-Maß) mit „nicht übermittelt" zu verwechseln.
 * `undefined`/`null`/`''` bleiben `undefined`; alles andere — Zahl oder String,
 * je nach JSON- oder Formular-Encoding — wird zur Zahl. Dieselbe Grenze wie
 * bei `isLegacyFlagSet`/`isLegacyZero`, deshalb derselbe Helfer.
 */
function parseWindForce(value: number | string | undefined | null): number | undefined {
	if (!isLegacyValuePresent(value)) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Parses legacy datetime string (YYYY-MM-DD HH:MI) into separate date and time fields
 *
 * @param datetime - DateTime in "YYYY-MM-DD HH:MI" format
 * @returns Object with separate sightingDate and sightingTime fields
 */
function parseLegacyDateTimeToFields(datetime: string): {
	sightingDate: string;
	sightingTime: string;
} {
	// Split datetime into date and time parts
	const parts = datetime.trim().split(' ');
	if (parts.length !== 2) {
		throw new Error(`Invalid datetime format: ${datetime}. Expected "YYYY-MM-DD HH:MI"`);
	}

	const date = parts[0]!;
	const time = parts[1]!;

	// Validate date format (YYYY-MM-DD)
	const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
	if (!dateRegex.test(date)) {
		throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
	}

	// Validate time format (HH:MM)
	const timeRegex = /^\d{2}:\d{2}$/;
	if (!timeRegex.test(time)) {
		throw new Error(`Invalid time format: ${time}. Expected HH:MM`);
	}

	// Return ISO date string and time string
	return {
		sightingDate: new Date(date + 'T12:00:00.000Z').toISOString(), // Use date at noon UTC to prevent timezone issues
		sightingTime: time
	};
}
