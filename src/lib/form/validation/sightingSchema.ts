/**
 * @fileoverview Yup-Validierungsschema für Sichtungsformulare
 *
 * Dieses Modul definiert das zentrale Validierungsschema für alle Sichtungsformulare
 * in der Ostsee-Tiere-Anwendung. Es nutzt Yup für typsichere Validierung und
 * umfasst alle Felder vom GPS-Koordinaten bis zu Kontaktdaten.
 *
 * Das Schema ist in logische Abschnitte unterteilt und bietet sowohl Frontend-
 * als auch Backend-Validierung mit detaillierten Fehlermeldungen und Metadaten
 * für die automatische UI-Generierung.
 *
 * @author Ostsee-Tiere Team
 * @since 1.0.0
 */

import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import type { Locale } from '#lib/paraglide/runtime.js';
import {
	getAnimalBehaviorOptions,
	isValidAnimalBehavior
} from '#lib/report/formOptions/animalBehavior.ts';
import {
	getAnimalConditionOptions,
	isValidAnimalCondition
} from '#lib/report/formOptions/animalCondition.ts';
import { getBoatDriveOptions, isValidBoatDrive } from '#lib/report/formOptions/boatDrive.ts';
import {
	DISTANCE_UNSPECIFIED,
	getDistanceOptions,
	isValidDistance
} from '#lib/report/formOptions/distance.ts';
import {
	getDistributionOptions,
	isValidDistribution
} from '#lib/report/formOptions/distribution.ts';
import {
	getEntryChannelOptions,
	isValidEntryChannel
} from '#lib/report/formOptions/entryChannel.ts';
import { getSeaStateOptions, isValidSeaState } from '#lib/report/formOptions/seaState.ts';
import { getSexOptions, isValidSex } from '#lib/report/formOptions/sex.ts';
import {
	getSightingFromOptions,
	isValidSightingFrom,
	SightingFromEnum
} from '#lib/report/formOptions/sightingFrom.ts';
import { getSpeciesOptions, isValidSpecies } from '#lib/report/formOptions/species.ts';
import { getVisibilityOptions, isValidVisibility } from '#lib/report/formOptions/visibility.ts';
import { getWindDirectionOptions } from '#lib/report/formOptions/windDirection.ts';
import { getWindStrengthOptions } from '#lib/report/formOptions/windStrength.ts';
import * as yup from 'yup';

/**
 * Heutiger Kalendertag in Deutschland als "YYYY-MM-DD".
 *
 * Der Sichtungstag ist fachlich immer Berlin-Ortszeit. Über UTC gerechnet
 * (`toISOString()`) wäre der Tag zwischen 00:00 und 02:00 deutscher Zeit noch
 * der Vortag — heutige Sichtungen gälten dann als „Zukunft".
 *
 * Diese Datei läuft auch im Browser: Die Zone wird deshalb explizit angegeben
 * und nicht der Geräte-Zeitzone überlassen. `sv-SE` liefert die ISO-Reihenfolge.
 */
function berlinToday(): string {
	return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

/**
 * Reduziert eine Datumseingabe auf ihren Kalendertag "YYYY-MM-DD".
 *
 * Akzeptiert sowohl das Formularformat als auch einen ISO-Zeitstempel (so
 * liefert die Legacy-API). Der Vergleich läuft anschließend als String — bei
 * ISO-Datum ist die lexikalische Ordnung die chronologische, und damit hängt
 * das Urteil an keiner Zeitzone.
 *
 * @returns Der Kalendertag oder `null`, wenn die Eingabe kein gültiges Datum ist
 */
function toCalendarDay(value: string | undefined): string | null {
	const match = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null;
	if (!match) {
		return null;
	}

	const calendarDay = match[1] as string;
	// Fängt Angaben wie "2026-13-45" ab, die zwar zum Muster passen, aber keinen Tag benennen.
	const parsed = new Date(`${calendarDay}T00:00:00.000Z`);
	if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== calendarDay) {
		return null;
	}

	return calendarDay;
}

// Icon names for the schema - using unplugin-icons format with lucide: prefix
// These will be mapped to actual icon components in the UI layer
const icons = {
	Activity: 'lucide:activity',
	AddressIcon: 'lucide:map-pin',
	Anchor: 'lucide:anchor',
	Archive: 'lucide:archive',
	Baby: 'lucide:baby',
	Calendar: 'lucide:calendar',
	Camera: 'lucide:camera',
	Car: 'lucide:car',
	Check: 'lucide:check',
	Clock: 'lucide:clock',
	CloudRain: 'lucide:cloud-rain',
	CountIcon: 'lucide:hash',
	Eye: 'lucide:eye',
	FileText: 'lucide:file-text',
	Globe: 'lucide:globe',
	Hash: 'lucide:hash',
	Mail: 'lucide:mail',
	MapPin: 'lucide:map-pin',
	MessageCircle: 'lucide:message-circle',
	MousePointer: 'lucide:mouse-pointer',
	Move: 'lucide:move',
	Navigation: 'lucide:navigation',
	Navigation2: 'lucide:navigation-2',
	Phone: 'lucide:phone',
	Porpoise: 'custom:porpoise',
	ShieldCheck: 'lucide:shield-check',
	Ship: 'lucide:ship',
	Skull: 'lucide:skull',
	ToggleLeft: 'lucide:toggle-left',
	Upload: 'lucide:upload',
	User: 'lucide:user',
	UserCheck: 'lucide:user-check',
	Users: 'lucide:users',
	Waves: 'lucide:waves',
	Wind: 'lucide:wind',
	Zap: 'lucide:zap'
};

// Extract icon constants for use in the schema
const {
	Activity,
	AddressIcon,
	Anchor,
	Archive,
	Baby,
	Calendar,
	Camera,
	Car,
	Check,
	Clock,
	CloudRain,
	CountIcon,
	Eye,
	FileText,
	Globe,
	Hash,
	Mail,
	MapPin,
	MessageCircle,
	MousePointer,
	Move,
	Navigation,
	Navigation2,
	Phone,
	Porpoise,
	ShieldCheck,
	Ship,
	Skull,
	ToggleLeft,
	Upload,
	User,
	UserCheck,
	Users,
	Waves,
	Wind,
	Zap
} = icons;

/**
 * Basis-Validierungsschema für Sichtungsformulare
 *
 * Definiert alle Validierungsregeln für die Erfassung von Meerestier-Sichtungen
 * mit umfassender Abdeckung von GPS-Daten, Umweltbedingungen, Tier-Details
 * und Kontaktinformationen. Jedes Feld enthält Metadaten für automatische
 * UI-Generierung und mehrsprachige Fehlermeldungen.
 *
 * Yup-Schema mit allen Sichtungsfeldern
 */
/**
 * Baut das Basis-Schema fuer eine Locale. Modul-intern (kein Export) —
 * ausserhalb dieser Datei geht niemand ueber die ungecachte Bauform, siehe
 * `getSightingSchemaBase` unten.
 */
function buildSightingSchemaBase(locale: Locale) {
	return yup.object().shape({
		/**
		 * Eindeutige Referenz-ID für die Sichtung
		 * Wird automatisch generiert zur internen Nachverfolgung
		 */
		referenceId: yup.string().required().label(m.sighting_referenceid_label({}, { locale })),

		/**
		 * Array der hochgeladenen Mediendateien mit Metadaten
		 * Enthält Pfade, EXIF-Daten und Dateiermaße für Fotos/Videos
		 */
		uploadedFiles: yup
			.array()
			.of(
				yup.object().shape({
					uid: yup.string().required(), // Eindeutige ID des Clients
					filePath: yup.string().required(), // Dateipfad im Storage
					originalName: yup.string().required(), // Ursprünglicher Dateiname
					fileName: yup.string().optional(), // Interner Dateiname
					mimeType: yup.string().required(), // MIME-Type (image/jpeg, etc.)
					size: yup.number().required(), // Dateigröße in Bytes
					url: yup.string().optional(), // Öffentliche URL
					uploadedAt: yup.string().optional(), // Upload-Zeitstempel
					exifData: yup.object().optional().nullable() // EXIF-Metadaten als JSONB
				})
			)
			.optional()
			.default([]),

		//----------------------------------------------------------------------
		// Position (Positionsangabe)
		//----------------------------------------------------------------------

		/**
		 * Gibt an, ob GPS-Koordinaten verfügbar sind
		 */
		hasPosition: yup
			.boolean()
			.label(m.sighting_hasposition_label({}, { locale }))
			.meta({
				type: 'toggle',
				helpText: m.sighting_hasposition_meta_helptext({}, { locale }),
				valueText: m.sighting_hasposition_meta_valuetext({}, { locale }),
				icon: ToggleLeft
			})
			.default(false),

		//----------------------------------------------------------------------
		// Location (Standort)
		//----------------------------------------------------------------------

		/**
		 * Breitengrad der Sichtung (GPS-Koordinate)
		 * Erforderlich, wenn kein Fahrwasser angegeben ist
		 * Wird in Dezimalgrad gespeichert (z.B. 54.5)
		 */
		latitude: yup
			.number()
			.when('hasPosition', {
				is: true,
				then: (schema) =>
					schema
						.required(m.sighting_latitude_required({}, { locale }))
						.min(-90, m.sighting_latitude_min({}, { locale }))
						.max(90, m.sighting_latitude_max({}, { locale })),
				otherwise: (schema) => schema.notRequired()
			})
			.label(m.sighting_latitude_label({}, { locale }))
			.meta({
				type: 'number',
				placeholder: m.sighting_latitude_meta_placeholder({}, { locale }),
				helpText: m.sighting_latitude_meta_helptext({}, { locale }),
				valueText: m.sighting_latitude_meta_valuetext({}, { locale }),
				icon: Navigation
			}),

		/**
		 * Längengrad der Sichtung (GPS-Koordinate)
		 * Erforderlich, wenn kein Fahrwasser angegeben ist
		 * Wird in Dezimalgrad gespeichert (z.B. 13.5)
		 */
		longitude: yup
			.number()
			.when('hasPosition', {
				is: true,
				then: (schema) =>
					schema
						.required(m.sighting_longitude_required({}, { locale }))
						.min(-180, m.sighting_longitude_min({}, { locale }))
						.max(180, m.sighting_longitude_max({}, { locale })),
				otherwise: (schema) => schema.notRequired()
			})
			.label(m.sighting_longitude_label({}, { locale }))
			.meta({
				type: 'number',
				placeholder: m.sighting_longitude_meta_placeholder({}, { locale }),
				helpText: m.sighting_longitude_meta_helptext({}, { locale }),
				valueText: m.sighting_longitude_meta_valuetext({}, { locale }),
				icon: Navigation2
			}),

		/**
		 * Ortsbeschreibung in Freitext — Seegebiet, Fahrwasser oder Orientierungspunkte.
		 * Alternative zur GPS-Position: erforderlich, wenn keine GPS-Position vorliegt
		 * (hasPosition !== true), damit ein leeres Formular Schritt 1 nicht passieren kann.
		 *
		 * **Deckt seit A2.4 auch `seaMark` mit ab.** Das Meldeformular zeigt die
		 * Ortsbeschreibung als EIN Freitextfeld (Wunsch des Deutschen Meeresmuseums:
		 * „User beschreibt im Freitext"); `seaMark` ist dort nur aus `formStepsConfig`
		 * und dem Markup genommen. Beschriftung, Hilfetext und Platzhalter müssen
		 * deshalb beide Aspekte nennen — sonst verliert das Formular die
		 * Orientierungspunkte. Abgesichert in `src/lib/report/formConfig.test.ts`.
		 */
		waterway: yup
			.string()
			.max(255, m.sighting_waterway_max({}, { locale }))
			.label(m.sighting_waterway_label({}, { locale }))
			.meta({
				placeholder: m.sighting_waterway_meta_placeholder({}, { locale }),
				helpText: m.sighting_waterway_meta_helptext({}, { locale }),
				valueText: m.sighting_waterway_meta_valuetext({}, { locale }),
				icon: Waves
			})
			.when('hasPosition', {
				is: (value: unknown) => value !== true,
				then: (schema) => schema.required(m.sighting_waterway_required({}, { locale })),
				otherwise: (schema) => schema.notRequired()
			}),

		/**
		 * Seezeichen in der Nähe der Sichtung
		 * Optionale Zusatzinformation zur genaueren Ortsbestimmung
		 *
		 * **Nur noch in der Admin-Maske** (`sections/Location.svelte`) und über die
		 * Legacy-API (`seezeichen`) erreichbar — im Meldeformular ist der Aspekt in
		 * `waterway` aufgegangen (A2.4). Feld und DB-Spalte bleiben, damit der
		 * Altbestand angezeigt und korrigiert werden kann; `meta` deshalb NICHT
		 * entfernen — `FormField` wirft ohne.
		 */
		seaMark: yup
			.string()
			.max(255, m.sighting_seamark_max({}, { locale }))
			.label(m.sighting_seamark_label({}, { locale }))
			.meta({
				placeholder: m.sighting_seamark_meta_placeholder({}, { locale }),
				helpText: m.sighting_seamark_meta_helptext({}, { locale }),
				valueText: m.sighting_seamark_meta_valuetext({}, { locale }),
				icon: Anchor
			})
			.notRequired(),

		//----------------------------------------------------------------------
		// Date and Time (Datum und Zeit)
		//----------------------------------------------------------------------

		/**
		 * Datum der Sichtung
		 * Pflichtfeld, darf nicht in der Zukunft liegen
		 */
		sightingDate: yup
			.string()
			.required(m.sighting_sightingdate_required({}, { locale }))
			.test('is-valid-date', m.sighting_sightingdate_test({}, { locale }), (value) => {
				const calendarDay = toCalendarDay(value);
				return calendarDay !== null && calendarDay <= berlinToday();
			})
			.label(m.sighting_sightingdate_label({}, { locale }))
			.meta({
				helpText: m.sighting_sightingdate_meta_helptext({}, { locale }),
				valueText: m.sighting_sightingdate_meta_valuetext({}, { locale }),
				type: 'date',
				icon: Calendar
			})
			.default(() => berlinToday()), // Standard auf heute setzen

		/**
		 * Uhrzeit der Sichtung im Format HH:MM
		 * Optional, wenn nicht bekannt
		 */
		sightingTime: yup
			.string()
			.matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, m.sighting_sightingtime_matches({}, { locale }))
			.label(m.sighting_sightingtime_label({}, { locale }))
			.meta({
				placeholder: m.sighting_sightingtime_meta_placeholder({}, { locale }),
				helpText: m.sighting_sightingtime_meta_helptext({}, { locale }),
				valueText: m.sighting_sightingtime_meta_valuetext({}, { locale }),
				type: 'time',
				icon: Clock
			})
			.notRequired(),

		//----------------------------------------------------------------------
		// Animal (Tierangaben)
		//----------------------------------------------------------------------

		/**
		 * Art des gesichteten Tieres
		 * Pflichtfeld, muss einer gültigen Tierart entsprechen
		 */
		species: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.required(m.sighting_species_required({}, { locale }))
			.test('is-valid-species', m.sighting_species_test({}, { locale }), (value) =>
				isValidSpecies(String(value))
			)
			.label(m.sighting_species_label({}, { locale }))
			.meta({
				helpText: m.sighting_species_meta_helptext({}, { locale }),
				valueText: m.sighting_species_meta_valuetext({}, { locale }),
				type: 'select',
				options: getSpeciesOptions(true, locale),
				icon: Porpoise
			}),

		/**
		 * Gesamtanzahl der gesichteten Tiere
		 * Pflichtfeld, muss eine positive ganze Zahl sein
		 *
		 * Untergrenze 1: Eine Sichtung ohne Tier ist keine Sichtung. Die Grenze
		 * gehört bewusst NUR hierher — in der Legacy-API kennzeichnet
		 * `anzahl_gesamt = 0` einen Totfund (`docs/LEGACY_API_SPECIFICATION.md`),
		 * dort bleibt `min(0)` stehen.
		 */
		totalCount: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.integer(m.sighting_totalcount_integer({}, { locale }))
			.min(1, m.sighting_totalcount_min({}, { locale }))
			.max(15, m.sighting_totalcount_max({}, { locale }))
			.required(m.sighting_totalcount_required({}, { locale }))
			.label(m.sighting_totalcount_label({}, { locale }))
			.meta({
				placeholder: '1',
				helpText: m.sighting_totalcount_meta_helptext({}, { locale }),
				valueText: m.sighting_totalcount_meta_valuetext({}, { locale }),
				step: 1,
				icon: Hash
			})
			.default(1),

		/**
		 * Anzahl der Jungtiere unter den gesichteten Tieren
		 * Optional, muss eine positive ganze Zahl sein
		 *
		 * Jungtiere sind eine Teilmenge von `totalCount`, keine zusätzliche
		 * Gruppe — mehr Jungtiere als Tiere insgesamt kann es nicht geben.
		 * Beide Felder sind bei 15 gekappt; die Regel greift deshalb auch an
		 * der Kappungsgrenze (15/15 gültig, 15 von 10 nicht).
		 */
		juvenileCount: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.integer(m.sighting_juvenilecount_integer({}, { locale }))
			.min(0, m.sighting_juvenilecount_min({}, { locale }))
			.max(15, m.sighting_juvenilecount_max({}, { locale }))
			.test(
				'juveniles-within-total',
				m.sighting_juvenilecount_test({}, { locale }),
				function (value) {
					// Ohne Angabe greift die Regel nicht — das Feld bleibt optional.
					if (value === undefined || value === null) return true;

					// Fehlt oder taugt `totalCount` nicht, meldet dessen eigene
					// Validierung den Fehler. Hier zusätzlich anzuschlagen würde
					// denselben Sachverhalt zweimal anzeigen.
					const total = this.parent?.totalCount;
					if (typeof total !== 'number' || Number.isNaN(total)) return true;

					return value <= total;
				}
			)
			.label(m.sighting_juvenilecount_label({}, { locale }))
			.meta({
				placeholder: '0',
				helpText: m.sighting_juvenilecount_meta_helptext({}, { locale }),
				valueText: m.sighting_juvenilecount_meta_valuetext({}, { locale }),
				icon: Baby
			})
			.notRequired()
			.default(0),

		/**
		 * Gibt an, ob es sich um einen Totfund handelt
		 * Pflichtfeld, Boolean-Wert
		 */
		isDead: yup
			.boolean()
			.label(m.sighting_isdead_label({}, { locale }))
			.meta({
				helpText: m.sighting_isdead_meta_helptext({}, { locale }),
				valueText: m.sighting_isdead_meta_valuetext({}, { locale }),
				icon: Skull
			})
			.default(false),

		/**
		 * Zustand des toten Tieres
		 * Erforderlich, wenn isDead = true
		 */
		deadCondition: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.when('isDead', {
				is: true,
				then: (schema) =>
					schema
						.required(m.sighting_deadcondition_required({}, { locale }))
						.test(
							'is-valid-dead-condition',
							m.sighting_deadcondition_test({}, { locale }),
							(value) => isValidAnimalCondition(String(value))
						),
				otherwise: (schema) => schema.notRequired()
			})
			.label(m.sighting_deadcondition_label({}, { locale }))
			.meta({
				helpText: m.sighting_deadcondition_meta_helptext({}, { locale }),
				valueText: m.sighting_deadcondition_meta_valuetext({}, { locale }),
				type: 'select',
				options: getAnimalConditionOptions(locale),
				icon: Archive
			}),

		/**
		 * Geschlecht des toten Tieres
		 * Das Museum hat das Geschlecht am 2026-08-04 aus dem Meldeformular abbestellt
		 * (Analyse-Punkt C4): Laien können es am Strand kaum bestimmen, das Feld
		 * lieferte überwiegend „Unbekannt". Die Pflicht musste dabei zwingend mit weg —
		 * sonst wäre nach dem Entfernen des Markups keine Totfund-Meldung mehr
		 * absendbar gewesen. Das Feld bleibt optional für die Admin-Maske im Schema.
		 */
		deadSex: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.test('is-valid-dead-sex', m.sighting_deadsex_test({}, { locale }), (value) =>
				value === undefined ? true : isValidSex(String(value))
			)
			.label(m.sighting_deadsex_label({}, { locale }))
			.meta({
				helpText: m.sighting_deadsex_meta_helptext({}, { locale }),
				valueText: m.sighting_deadsex_meta_valuetext({}, { locale }),
				type: 'select',
				options: getSexOptions(locale),
				icon: Users
			}),

		/**
		 * Größe des toten Tieres in cm
		 *
		 * **Optional und nullable, in beiden Zweigen** — anders als `deadCondition`
		 * darüber. Eine am Strand geschätzte Körperlänge ist eine Zusatzangabe, keine
		 * Bedingung für die Meldung.
		 *
		 * Das `.nullable()` ist nicht kosmetisch: `totfund_groesse` ist in der DB
		 * nullable und bei jeder Nicht-Totfund-Sichtung tatsächlich `NULL`. Die
		 * Admin-Maske lädt diesen Wert in den Formular-Zustand; ohne `nullable()`
		 * scheitert dort die Validierung mit „deadSize cannot be null", und ein
		 * Bestandsdatensatz ließe sich nicht mehr speichern.
		 *
		 * Bis zum 2026-08-06 stand hier statt `.nullable()` ein `when('isDead')` mit
		 * `notRequired()` in beiden Zweigen. Das sah wie ein No-op aus und war keines:
		 * In yup 1.x hebt `notRequired()` auch die Null-Sperre auf, die Nullbarkeit
		 * hing also unsichtbar an einer Verzweigung, die sonst nichts tat. Ersetzt
		 * durch das explizite `.nullable()` — identisches Verhalten in allen
		 * geprüften Fällen, aber dort lesbar, wo es gilt. Die Null-Fälle stehen
		 * seitdem in `sightingSchemaWhen.test.ts`; sie fehlten vorher und genau
		 * deshalb fiel die Änderung erst in den Admin-E2E-Tests auf.
		 */
		deadSize: yup
			.number()
			.integer(m.sighting_deadsize_integer({}, { locale }))
			.transform((value) => (isNaN(value) ? undefined : value))
			.min(0, m.sighting_deadsize_min({}, { locale }))
			.max(300, m.sighting_deadsize_max({}, { locale }))
			.nullable()
			.label(m.sighting_deadsize_label({}, { locale }))
			.meta({
				placeholder: m.sighting_deadsize_meta_placeholder({}, { locale }),
				helpText: m.sighting_deadsize_meta_helptext({}, { locale }),
				valueText: m.sighting_deadsize_meta_valuetext({}, { locale }),
				icon: Move
			}),

		/**
		 * Gibt an, ob bei einem Totfund bereits telefonisch Kontakt aufgenommen wurde
		 * Optional, Boolean-Wert
		 */
		deadPhoneContact: yup
			.boolean()
			.label(m.sighting_deadphonecontact_label({}, { locale }))
			.meta({
				helpText: m.sighting_deadphonecontact_meta_helptext({}, { locale }),
				valueText: m.sighting_deadphonecontact_meta_valuetext({}, { locale }),
				icon: UserCheck
			})
			.default(false),

		//----------------------------------------------------------------------
		// Sighting Details (Sichtungsdetails)
		//----------------------------------------------------------------------

		/**
		 * Von wo aus wurde die Sichtung gemacht
		 * Pflichtfeld, muss einer gültigen Option entsprechen
		 */
		sightingFrom: yup
			.number()
			.required(m.sighting_sightingfrom_required({}, { locale }))
			.test('is-valid-sighting-from', m.sighting_sightingfrom_test({}, { locale }), (value) =>
				isValidSightingFrom(String(value))
			)
			.label(m.sighting_sightingfrom_label({}, { locale }))
			.meta({
				helpText: m.sighting_sightingfrom_meta_helptext({}, { locale }),
				valueText: m.sighting_sightingfrom_meta_valuetext({}, { locale }),
				type: 'select',
				options: getSightingFromOptions(locale),
				icon: MapPin
			}),

		/**
		 * Genauere Beschreibung des Sichtungsortes
		 * Erforderlich, wenn sightingFrom = 0 (Sonstiges).
		 * NICHT 5 — das ist seit 2026-07-29 `SightingFromEnum.UNKNOWN` ("Keine Angabe").
		 */
		sightingFromText: yup
			.string()
			.max(255, m.sighting_sightingfromtext_max({}, { locale }))
			.when('sightingFrom', {
				is: (v: unknown) => v === SightingFromEnum.OTHER || v === String(SightingFromEnum.OTHER),
				then: (schema) => schema.required(m.sighting_sightingfromtext_required({}, { locale })),
				otherwise: (schema) => schema.notRequired()
			})
			.label(m.sighting_sightingfromtext_label({}, { locale }))
			.meta({
				placeholder: m.sighting_sightingfromtext_meta_placeholder({}, { locale }),
				helpText: m.sighting_sightingfromtext_meta_helptext({}, { locale }),
				icon: Globe
			}),

		/**
		 * Entfernung zum gesichteten Tier
		 * Pflichtfeld bei einer Sichtung, muss einer gültigen Entfernungskategorie
		 * entsprechen.
		 *
		 * **Beim Totfund ist die Pflicht aufgehoben** (UX-Review 2026-08-07): Wer ein
		 * totes Tier meldet, steht am Strand daneben — die Frage ist dort nicht
		 * beantwortbar, und das Meldeformular zeigt sie im Totfund-Zweig seither gar
		 * nicht mehr (`HIDDEN_WHEN_DEAD` in `formConfig.ts`). Die Lockerung ist dabei
		 * keine Kür: Der Endpunkt validiert die Nutzlast gegen das **volle** Schema
		 * (`routes/api/sightings/+server.ts`, Schritt 3), und der Client lässt
		 * ausgeblendete Felder weg — ohne sie lehnte der Server jede Totfund-Meldung
		 * mit einer Meldung an einem unsichtbaren Feld ab. Genau derselbe Zwang stand
		 * am 2026-08-04 bei `deadSex` (Kommentar dort).
		 *
		 * `is: true` wie bei `deadCondition` oben: `isDead` kommt aus dem Zweig der
		 * Einstiegsseite bzw. aus `field-mapping.ts` immer als echter Boolean. Ein
		 * anderer Wahrheitswert ließe die Pflicht bestehen — die konservative
		 * Richtung.
		 *
		 * Der Basis-Aufbau bleibt `.required()`, die Bedingung kommt erst danach:
		 * `describe()` sieht ein `when()` nicht und beschreibt das Basis-Schema —
		 * Pflicht-Sternchen und `aria-required` bleiben damit im Lebend-Zweig und in
		 * der Admin-Maske unverändert stehen (`FieldRenderer`).
		 */
		distance: yup
			.number()
			.required(m.sighting_distance_required({}, { locale }))
			.when('isDead', {
				is: true,
				then: (schema) => schema.notRequired(),
				otherwise: (schema) => schema
			})
			.test(
				'is-valid-distance',
				m.sighting_distance_test({}, { locale }),
				(value) => value === undefined || isValidDistance(String(value))
			)
			.label(m.sighting_distance_label({}, { locale }))
			.meta({
				helpText: m.sighting_distance_meta_helptext({}, { locale }),
				valueText: m.sighting_distance_meta_valuetext({}, { locale }),
				type: 'select',
				options: getDistanceOptions(locale),
				icon: Eye
			}),
		/**
		 * Verteilung der Tiere
		 * Optional, muss einer gültigen Verteilungskategorie entsprechen
		 */
		distribution: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.test(
				'is-valid-distribution',
				m.sighting_distribution_test({}, { locale }),
				(value) => value === undefined || isValidDistribution(String(value))
			)
			.label(m.sighting_distribution_label({}, { locale }))
			.meta({
				helpText: m.sighting_distribution_meta_helptext({}, { locale }),
				valueText: m.sighting_distribution_meta_valuetext({}, { locale }),
				type: 'select',
				options: getDistributionOptions(locale),
				icon: Users
			})
			.notRequired(),

		/**
		 * Genauere Beschreibung der Verteilung (optional, auch bei Sonstiges)
		 */
		distributionText: yup
			.string()
			.max(255, m.sighting_distributiontext_max({}, { locale }))
			.nullable()
			.notRequired()
			.label(m.sighting_distributiontext_label({}, { locale }))
			.meta({
				placeholder: m.sighting_distributiontext_meta_placeholder({}, { locale }),
				helpText: m.sighting_distributiontext_meta_helptext({}, { locale }),
				valueText: m.sighting_distributiontext_meta_valuetext({}, { locale }),
				icon: FileText
			}),

		/**
		 * Verhalten des Tieres
		 * Optional, muss einer gültigen Verhaltenskategorie entsprechen
		 */
		behavior: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.test(
				'is-valid-behavior',
				m.sighting_behavior_test({}, { locale }),
				(value) => value === undefined || isValidAnimalBehavior(value)
			)
			.label(m.sighting_behavior_label({}, { locale }))
			.meta({
				helpText: m.sighting_behavior_meta_helptext({}, { locale }),
				valueText: m.sighting_behavior_meta_valuetext({}, { locale }),
				type: 'select',
				options: getAnimalBehaviorOptions(locale),
				icon: Activity
			})
			.notRequired(),

		/**
		 * Genauere Beschreibung des Verhaltens (optional, auch bei Sonstiges)
		 */
		behaviorText: yup
			.string()
			.max(255, m.sighting_behaviortext_max({}, { locale }))
			.nullable()
			.notRequired()
			.label(m.sighting_behaviortext_label({}, { locale }))
			.meta({
				placeholder: m.sighting_behaviortext_meta_placeholder({}, { locale }),
				helpText: m.sighting_behaviortext_meta_helptext({}, { locale }),
				valueText: m.sighting_behaviortext_meta_valuetext({}, { locale }),
				icon: MessageCircle
			}),

		/**
		 * Reaktion des Tieres
		 * Optional
		 */
		reaction: yup
			.string()
			.max(1000, m.sighting_reaction_max({}, { locale }))
			// Das Schema-Label ist die Beschriftung der ADMIN-Maske. Das Meldeformular
			// fragt seit dem UX-Review (2026-08-06, Punkt 4) allgemeiner — „Reaktion
			// auf Sie oder Ihr Fahrzeug" —, weil `isFromLand` nur ein ausdrückliches
			// „Land" ausblendet und Kajak, SUP und Seebrücke unter „Sonstiges" hier
			// stehen bleiben. Gesetzt wird das als `label`-Override an der
			// Aufrufstelle in `sections/Behavior.svelte`; die Sachbearbeitung behält
			// ihren gewohnten Wortlaut.
			.label(m.sighting_reaction_label({}, { locale }))
			.meta({
				placeholder: m.sighting_reaction_meta_placeholder({}, { locale }),
				helpText: m.sighting_reaction_meta_helptext({}, { locale }),
				valueText: m.sighting_reaction_meta_valuetext({}, { locale }),
				icon: MousePointer
			})
			.notRequired(),

		//----------------------------------------------------------------------
		// Environmental Conditions (Umweltbedingungen)
		//----------------------------------------------------------------------

		/**
		 * Seegang zum Zeitpunkt der Sichtung
		 * Optional, muss einer gültigen Seegang-Kategorie entsprechen
		 */
		seaState: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.test(
				'is-valid-sea-state',
				m.sighting_seastate_test({}, { locale }),
				(value) => value === undefined || isValidSeaState(value)
			)
			.label(m.sighting_seastate_label({}, { locale }))
			.meta({
				helpText: m.sighting_seastate_meta_helptext({}, { locale }),
				valueText: m.sighting_seastate_meta_valuetext({}, { locale }),
				type: 'select',
				options: getSeaStateOptions(locale),
				icon: Waves
			})
			.notRequired(),

		/**
		 * Sichtweite zum Zeitpunkt der Sichtung
		 * Optional, muss einer gültigen Sichtweitenkategorie entsprechen
		 */
		visibility: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.test(
				'is-valid-visibility',
				m.sighting_visibility_test({}, { locale }),
				(value) => value === undefined || isValidVisibility(value)
			)
			.label(m.sighting_visibility_label({}, { locale }))
			.meta({
				helpText: m.sighting_visibility_meta_helptext({}, { locale }),
				valueText: m.sighting_visibility_meta_valuetext({}, { locale }),
				type: 'select',
				options: getVisibilityOptions(locale),
				icon: Eye
			})
			.notRequired(),

		/**
		 * Windrichtung zum Zeitpunkt der Sichtung
		 * Optional, muss einer gültigen Himmelsrichtung entsprechen
		 */
		windDirection: yup
			.string()
			.oneOf(
				['', 'N', 'NW', 'W', 'SW', 'S', 'SO', 'O', 'NO'],
				m.sighting_winddirection_oneof({}, { locale })
			)
			.label(m.sighting_winddirection_label({}, { locale }))
			.meta({
				helpText: m.sighting_winddirection_meta_helptext({}, { locale }),
				valueText: m.sighting_winddirection_meta_valuetext({}, { locale }),
				type: 'select',
				options: getWindDirectionOptions(locale),
				icon: Wind
			})
			.notRequired(),

		/**
		 * Windstärke zum Zeitpunkt der Sichtung
		 * Optional, muss zwischen 0 und 12 (Beaufort) liegen
		 */
		windForce: yup
			.number()
			.transform((value) => (isNaN(value) ? undefined : value))
			.min(0, m.sighting_windforce_min({}, { locale }))
			.max(12, m.sighting_windforce_max({}, { locale }))
			.label(m.sighting_windforce_label({}, { locale }))
			.meta({
				placeholder: m.sighting_windforce_meta_placeholder({}, { locale }),
				helpText: m.sighting_windforce_meta_helptext({}, { locale }),
				valueText: m.sighting_windforce_meta_valuetext({}, { locale }),
				type: 'select',
				options: getWindStrengthOptions(locale),
				icon: CloudRain
			})
			.notRequired(),

		/**
		 * Wetterdaten von der Weather API (Issue #110)
		 * Optional, enthält die vollständigen Wetterdaten als JSON
		 */
		weatherData: yup
			.mixed()
			.nullable()
			.label(m.sighting_weatherdata_label({}, { locale }))
			.meta({
				helpText: m.sighting_weatherdata_meta_helptext({}, { locale }),
				valueText: m.sighting_weatherdata_meta_valuetext({}, { locale }),
				type: 'hidden'
			})
			.notRequired(),

		//----------------------------------------------------------------------
		// Media (Medien)
		//----------------------------------------------------------------------

		/**
		 * Beschreibung der vorhandenen Foto- oder Videoaufnahmen
		 * Optional, Freitextfeld
		 */
		mediaFile: yup
			.string()
			.max(255, m.sighting_mediafile_max({}, { locale }))
			.label(m.sighting_mediafile_label({}, { locale }))
			.meta({
				placeholder: m.sighting_mediafile_meta_placeholder({}, { locale }),
				helpText: m.sighting_mediafile_meta_helptext({}, { locale }),
				valueText: m.sighting_mediafile_meta_valuetext({}, { locale }),
				icon: Camera
			})
			.notRequired(),

		/**
		 * Gibt an, ob der Benutzer Medien hochladen möchte
		 * Optional, Boolean-Wert
		 */
		mediaUpload: yup
			.boolean()
			.label(m.sighting_mediaupload_label({}, { locale }))
			.meta({
				helpText: m.sighting_mediaupload_meta_helptext({}, { locale }),
				valueText: m.sighting_mediaupload_meta_valuetext({}, { locale }),
				icon: Upload
			})
			.default(false),

		/**
		 * Einwilligung zur Verwendung der Medien
		 * Optional, Boolean-Wert
		 */
		mediaConsent: yup
			.boolean()
			.label(m.sighting_mediaconsent_label({}, { locale }))
			.meta({
				helpText: m.sighting_mediaconsent_meta_helptext({}, { locale }),
				valueText: m.sighting_mediaconsent_meta_valuetext({}, { locale }),
				icon: Check
			})
			.default(false),

		//----------------------------------------------------------------------
		// Ship/Boat Information (Schiffsangaben)
		//----------------------------------------------------------------------

		/**
		 * Name des Schiffes, von dem aus die Sichtung erfolgte
		 * Optional, Freitextfeld
		 */
		shipName: yup
			.string()
			.max(64, m.sighting_shipname_max({}, { locale }))
			.label(m.sighting_shipname_label({}, { locale }))
			.meta({
				placeholder: m.sighting_shipname_meta_placeholder({}, { locale }),
				helpText: m.sighting_shipname_meta_helptext({}, { locale }),
				valueText: m.sighting_shipname_meta_valuetext({}, { locale }),
				icon: Ship
			})
			.notRequired(),

		/**
		 * Heimathafen des Schiffes
		 * Optional, Freitextfeld
		 */
		homePort: yup
			.string()
			.max(64, m.sighting_homeport_max({}, { locale }))
			.label(m.sighting_homeport_label({}, { locale }))
			.meta({
				placeholder: m.sighting_homeport_meta_placeholder({}, { locale }),
				helpText: m.sighting_homeport_meta_helptext({}, { locale }),
				valueText: m.sighting_homeport_meta_valuetext({}, { locale }),
				icon: MapPin
			})
			.notRequired(),

		/**
		 * Typ des Bootes/Schiffes
		 * Optional, Freitextfeld
		 */
		boatType: yup
			.string()
			.max(64, m.sighting_boattype_max({}, { locale }))
			.label(m.sighting_boattype_label({}, { locale }))
			.meta({
				placeholder: m.sighting_boattype_meta_placeholder({}, { locale }),
				helpText: m.sighting_boattype_meta_helptext({}, { locale }),
				valueText: m.sighting_boattype_meta_valuetext({}, { locale }),
				icon: Anchor
			})
			.notRequired(),

		/**
		 * Anzahl der Schiffe in der Umgebung
		 * Optional, muss eine positive ganze Zahl sein
		 */
		shipCount: yup
			.number()
			.integer(m.sighting_shipcount_integer({}, { locale }))
			.transform((value) => (isNaN(value) ? undefined : value))
			.min(0, m.sighting_shipcount_min({}, { locale }))
			.max(15, m.sighting_shipcount_max({}, { locale }))
			.label(m.sighting_shipcount_label({}, { locale }))
			.meta({
				placeholder: m.sighting_shipcount_meta_placeholder({}, { locale }),
				helpText: m.sighting_shipcount_meta_helptext({}, { locale }),
				valueText: m.sighting_shipcount_meta_valuetext({}, { locale }),
				icon: CountIcon
			})
			.notRequired(),

		/**
		 * Art des Bootsantriebs
		 * Nur erforderlich, wenn die Sichtung von einem Segelschiff oder Motorboot
		 * aus gemacht wurde (sightingFrom). Bei Land, Fähre, Sonstiges oder nicht
		 * gesetztem sightingFrom ist das Feld optional/nullable — wer kein Boot hat,
		 * kann keinen Bootsantrieb angeben.
		 */
		boatDrive: yup
			.number()
			.nullable()
			.test(
				'is-valid-boat-drive',
				m.sighting_boatdrive_test({}, { locale }),
				(value) => value === undefined || value === null || isValidBoatDrive(value)
			)
			.label(m.sighting_boatdrive_label({}, { locale }))
			.meta({
				helpText: m.sighting_boatdrive_meta_helptext({}, { locale }),
				valueText: m.sighting_boatdrive_meta_valuetext({}, { locale }),
				type: 'select',
				options: getBoatDriveOptions(locale),
				icon: Zap
			})
			.when('sightingFrom', {
				is: (v: unknown) =>
					v === SightingFromEnum.SAILBOAT ||
					v === String(SightingFromEnum.SAILBOAT) ||
					v === SightingFromEnum.MOTORBOAT ||
					v === String(SightingFromEnum.MOTORBOAT),
				then: (schema) => schema.required(m.sighting_boatdrive_required({}, { locale })),
				otherwise: (schema) => schema.notRequired()
			}),

		/**
		 * Genauere Beschreibung des Bootsantriebs (optional, auch bei Sonstiges)
		 */
		boatDriveText: yup
			.string()
			.max(255, m.sighting_boatdrivetext_max({}, { locale }))
			.nullable()
			.notRequired()
			.label(m.sighting_boatdrivetext_label({}, { locale }))
			.meta({
				placeholder: m.sighting_boatdrivetext_meta_placeholder({}, { locale }),
				helpText: m.sighting_boatdrivetext_meta_helptext({}, { locale }),
				valueText: m.sighting_boatdrivetext_meta_valuetext({}, { locale }),
				icon: Car
			}),

		/**
		 * Einwilligung zur Nennung des Schiffsnamens
		 * Optional, Boolean-Wert
		 */
		shipNameConsent: yup
			.boolean()
			.label(m.sighting_shipnameconsent_label({}, { locale }))
			.meta({
				helpText: m.sighting_shipnameconsent_meta_helptext({}, { locale }),
				valueText: m.sighting_shipnameconsent_meta_valuetext({}, { locale }),
				icon: Ship,
				type: 'checkbox'
			})
			.default(false),

		//----------------------------------------------------------------------
		// Contact Information (Kontaktdaten)
		//----------------------------------------------------------------------

		/**
		 * Vorname der meldenden Person
		 * Pflichtfeld, Freitextfeld
		 */
		firstName: yup
			.string()
			.max(64, m.sighting_firstname_max({}, { locale }))
			.required(m.sighting_firstname_required({}, { locale }))
			.label(m.sighting_firstname_label({}, { locale }))
			.meta({
				placeholder: m.sighting_firstname_meta_placeholder({}, { locale }),
				helpText: m.sighting_firstname_meta_helptext({}, { locale }),
				valueText: m.sighting_firstname_meta_valuetext({}, { locale }),
				autocomplete: 'given-name',
				icon: User
			}),

		/**
		 * Nachname der meldenden Person
		 * Pflichtfeld, Freitextfeld
		 */
		lastName: yup
			.string()
			.max(64, m.sighting_lastname_max({}, { locale }))
			.required(m.sighting_lastname_required({}, { locale }))
			.label(m.sighting_lastname_label({}, { locale }))
			.meta({
				placeholder: m.sighting_lastname_meta_placeholder({}, { locale }),
				helpText: m.sighting_lastname_meta_helptext({}, { locale }),
				valueText: m.sighting_lastname_meta_valuetext({}, { locale }),
				autocomplete: 'family-name',
				icon: User
			}),

		/**
		 * E-Mail-Adresse für Rückfragen
		 * Pflichtfeld, muss ein gültiges E-Mail-Format haben
		 */
		email: yup
			.string()
			.email(m.sighting_email_email({}, { locale }))
			.required(m.sighting_email_required({}, { locale }))
			.max(64, m.sighting_email_max({}, { locale }))
			.label(m.sighting_email_label({}, { locale }))
			.meta({
				placeholder: m.sighting_email_meta_placeholder({}, { locale }),
				helpText: m.sighting_email_meta_helptext({}, { locale }),
				valueText: m.sighting_email_meta_valuetext({}, { locale }),
				type: 'email',
				autocomplete: 'email',
				icon: Mail
			}),

		/**
		 * Telefonnummer für Rückfragen
		 * Optional, Freitextfeld
		 */
		/**
		 * Faxnummer
		 *
		 * Ausschließlich für die Legacy-REST-API: `docs/LEGACY_API_SPECIFICATION.md`
		 * führt `fax` als optionales Feld, und die DB-Spalte existiert seit immer —
		 * nur fehlte das Feld hier, weshalb der Legacy-Adapter den Wert bis
		 * 2026-07-30 stillschweigend verwarf.
		 *
		 * **Bewusst ohne `.meta()`**: Das Formular rendert seine Felder aus den
		 * expliziten Listen in `formConfig.ts`, nicht aus dem Schema. Ohne Metadaten
		 * bleibt `fax` damit ein reines Datenfeld und taucht in keinem Schritt auf.
		 */
		fax: yup
			.string()
			.max(64, m.sighting_fax_max({}, { locale }))
			.label(m.sighting_fax_label({}, { locale }))
			.notRequired(),

		phone: yup
			.string()
			.max(64, m.sighting_phone_max({}, { locale }))
			.label(m.sighting_phone_label({}, { locale }))
			.meta({
				placeholder: m.sighting_phone_meta_placeholder({}, { locale }),
				helpText: m.sighting_phone_meta_helptext({}, { locale }),
				valueText: m.sighting_phone_meta_valuetext({}, { locale }),
				type: 'tel',
				autocomplete: 'tel',
				icon: Phone
			})
			.notRequired(),

		/**
		 * Straße und Hausnummer
		 * Optional, Freitextfeld
		 */
		street: yup
			.string()
			.max(64, m.sighting_street_max({}, { locale }))
			.label(m.sighting_street_label({}, { locale }))
			.meta({
				placeholder: m.sighting_street_meta_placeholder({}, { locale }),
				helpText: m.sighting_street_meta_helptext({}, { locale }),
				valueText: m.sighting_street_meta_valuetext({}, { locale }),
				autocomplete: 'street-address',
				icon: AddressIcon
			})
			.notRequired(),

		/**
		 * Postleitzahl
		 * Optional, maximal 5 Zeichen
		 */
		zipCode: yup
			.string()
			.max(5, m.sighting_zipcode_max({}, { locale }))
			.label(m.sighting_zipcode_label({}, { locale }))
			.meta({
				placeholder: '12345',
				helpText: m.sighting_zipcode_meta_helptext({}, { locale }),
				valueText: m.sighting_zipcode_meta_valuetext({}, { locale }),
				autocomplete: 'postal-code',
				icon: Hash
			})
			.notRequired(),

		/**
		 * Wohnort
		 * Optional, Freitextfeld
		 */
		city: yup
			.string()
			.max(64, m.sighting_city_max({}, { locale }))
			.label(m.sighting_city_label({}, { locale }))
			.meta({
				placeholder: m.sighting_city_meta_placeholder({}, { locale }),
				helpText: m.sighting_city_meta_helptext({}, { locale }),
				valueText: m.sighting_city_meta_valuetext({}, { locale }),
				autocomplete: 'address-level2',
				icon: MapPin
			})
			.notRequired(),

		/**
		 * Einwilligung zur Nennung des Namens
		 * Optional, Boolean-Wert
		 */
		nameConsent: yup
			.boolean()
			.label(m.sighting_nameconsent_label({}, { locale }))
			.meta({
				helpText: m.sighting_nameconsent_meta_helptext({}, { locale }),
				valueText: m.sighting_nameconsent_meta_valuetext({}, { locale }),
				icon: UserCheck,
				type: 'checkbox'
			})
			.default(false),

		//----------------------------------------------------------------------
		// Additional Information (Zusätzliche Informationen)
		//----------------------------------------------------------------------

		/**
		 * Allgemeine Bemerkungen zur Sichtung
		 * Optional, Freitextfeld
		 */
		notes: yup
			.string()
			.max(1000, m.sighting_notes_max({}, { locale }))
			.label(m.sighting_notes_label({}, { locale }))
			.meta({
				placeholder: m.sighting_notes_meta_placeholder({}, { locale }),
				helpText: m.sighting_notes_meta_helptext({}, { locale }),
				valueText: m.sighting_notes_meta_valuetext({}, { locale }),
				type: 'textarea',
				icon: FileText
			})
			.notRequired(),

		/**
		 * Sonstige Beobachtungen oder Auffälligkeiten
		 * Optional, Freitextfeld
		 */
		otherObservations: yup
			.string()
			.max(1000, m.sighting_otherobservations_max({}, { locale }))
			.label(m.sighting_otherobservations_label({}, { locale }))
			.meta({
				placeholder: m.sighting_otherobservations_meta_placeholder({}, { locale }),
				helpText: m.sighting_otherobservations_meta_helptext({}, { locale }),
				valueText: m.sighting_otherobservations_meta_valuetext({}, { locale }),
				icon: MessageCircle
			})
			.notRequired(),

		privacyConsent: yup
			.boolean()
			.required(m.sighting_privacyconsent_required({}, { locale }))
			.label(m.sighting_privacyconsent_label({}, { locale }))
			.meta({
				helpText: m.sighting_privacyconsent_meta_helptext({}, { locale }),
				valueText: m.sighting_privacyconsent_meta_valuetext({}, { locale }),
				icon: ShieldCheck,
				type: 'checkbox'
			}),

		/**
		 * Einwilligung zur dauerhaften Speicherung der Kontaktdaten
		 * Optional, Boolean-Wert
		 */
		persistentDataConsent: yup
			.boolean()
			.label(m.sighting_persistentdataconsent_label({}, { locale }))
			.meta({
				helpText: m.sighting_persistentdataconsent_meta_helptext({}, { locale }),
				valueText: m.sighting_persistentdataconsent_meta_valuetext({}, { locale }),
				icon: Archive,
				type: 'checkbox'
			})
			.default(false)
	});
}

/** Baut das Basis-Schema je Locale genau einmal und haelt es danach vor. */
export const getSightingSchemaBase = memoizePerLocale(buildSightingSchemaBase);

function buildSightingSchema(locale: Locale) {
	return yup
		.object()
		.shape({
			/**
			 * Gibt an, ob die Sichtung bestätigt wurde
			 * Optional, Boolean-Wert
			 */
			verified: yup
				.boolean()
				.label(m.sighting_verified_label({}, { locale }))
				.meta({
					helpText: m.sighting_verified_meta_helptext({}, { locale }),
					valueText: m.sighting_verified_meta_valuetext({}, { locale }),
					icon: Check
				})
				.default(false),

			internalComment: yup
				.string()
				.max(1000, m.sighting_internalcomment_max({}, { locale }))
				.label(m.sighting_internalcomment_label({}, { locale }))
				.meta({
					placeholder: m.sighting_internalcomment_meta_placeholder({}, { locale }),
					helpText: m.sighting_internalcomment_meta_helptext({}, { locale }),
					valueText: m.sighting_internalcomment_meta_valuetext({}, { locale }),
					icon: FileText,
					type: 'textarea'
				})
				.notRequired(),

			entryChannel: yup
				.number()
				.required(m.sighting_entrychannel_required({}, { locale }))
				.test('is-valid-entry-channel', m.sighting_entrychannel_test({}, { locale }), (value) =>
					isValidEntryChannel(String(value))
				)
				.label(m.sighting_entrychannel_label({}, { locale }))
				.meta({
					helpText: m.sighting_entrychannel_meta_helptext({}, { locale }),
					valueText: m.sighting_entrychannel_meta_valuetext({}, { locale }),
					type: 'select',
					options: getEntryChannelOptions(locale),
					icon: Navigation
				})
				.default(0)
		})
		.concat(getSightingSchemaBase(locale));
}

/** Baut das volle Melde-Schema je Locale genau einmal und haelt es danach vor. */
export const getSightingSchema = memoizePerLocale(buildSightingSchema);

/**
 * Schema der Admin-Maske: dasselbe Formular, aber ohne die Eingabegrenzen, die
 * nur für **neue** Meldungen gelten.
 *
 * Die Grenzen in `sightingSchema` sind Eingaberegeln am Meldeformular —
 * mindestens ein Tier, höchstens 15, Jungtiere nicht mehr als Tiere insgesamt,
 * eine Entfernungskategorie, ein Freitext zu „Sonstiges". Auf den Bestand
 * angewendet sperren sie die Korrektur genau der Datensätze, die eine Korrektur
 * am ehesten brauchen (Messung 2026-08-02, 19.881 Zeilen):
 *
 * | Bedingung                             | Zeilen | Herkunft                        |
 * | ------------------------------------- | -----: | ------------------------------- |
 * | `anzahl_gesamt = 0`                   |      5 | Legacy-Konvention „0 = Totfund" |
 * | `anzahl_jung > anzahl_gesamt`         |      8 | Altbestand                      |
 * | `anzahl_gesamt > 15`                  |     22 | Altbestand, Kappung kam später  |
 * | `entfernung = 0`                      |    282 | Sentinel „nicht angegeben"      |
 * | `vonwo = 0` ohne `vonwo_text`         |  1.120 | Altbestand ohne Nachfrage       |
 *
 * Ohne diese Lockerung könnte ein Admin eine solche Zeile nicht mehr speichern
 * — auch dann nicht, wenn er an einem ganz anderen Feld etwas richtigstellt.
 * Beim Melden bleibt jede dieser Regeln unverändert in Kraft.
 *
 * Abgeleitet statt neu geschrieben: `.min()`/`.max()` und ein `.test()` mit
 * gleichem Namen ersetzen in Yup den vorhandenen Eintrag. Label und `meta`
 * bleiben damit erhalten — die Feld-Pipeline (`FieldRenderer`) liest sie aus
 * `describe()`, eine Kopie würde beim nächsten Textwechsel auseinanderlaufen.
 *
 * Nur `sightingFromText` geht diesen Weg nicht: Seine Pflicht steckt in einem
 * `when()`, und Yup kennt keinen Weg, eine gesetzte Bedingung wieder zu
 * entfernen — sie wird bei jedem Lauf **nach** allem angewandt, was hier
 * überschrieben würde. Das Feld wird deshalb neu aufgebaut, holt Beschriftung
 * und `meta` aber ausdrücklich aus dem Basis-Schema, damit die Texte weiterhin
 * an genau einer Stelle stehen (abgesichert in `adminSightingSchemaLegacy.test.ts`).
 */
function buildAdminSightingSchema(locale: Locale) {
	const base = getSightingSchema(locale);
	const sightingFromTextBase = base.fields.sightingFromText as yup.StringSchema;

	return base.shape({
		totalCount: (base.fields.totalCount as yup.NumberSchema)
			.min(0, m.sighting_totalcount_min_2({}, { locale }))
			.max(9999, m.sighting_totalcount_max_2({}, { locale })),
		juvenileCount: (base.fields.juvenileCount as yup.NumberSchema)
			.max(9999, m.sighting_juvenilecount_max_2({}, { locale }))
			// Hebt die Teilmengen-Regel für den Bestand auf, statt sie zu duplizieren.
			// `exclusive: true` ist dabei nicht schmückend: Yup entfernt einen
			// gleichnamigen Test nur dann, wenn der neue exklusiv ist oder dieselbe
			// Funktionsreferenz trägt (`Schema.test()`) — ohne das Flag liefen beide
			// Tests, und der alte würde weiterhin greifen.
			.test({
				name: 'juveniles-within-total',
				exclusive: true,
				message: '',
				test: () => true
			}),

		// Lässt den Sentinel `0` ("nicht angegeben") zu, ohne die Kategorien
		// aufzuweichen: Ein erfundener Wert wie 99 fällt weiterhin durch.
		distance: (base.fields.distance as yup.NumberSchema).test({
			name: 'is-valid-distance',
			exclusive: true,
			message: m.sighting_distance_test_2({}, { locale }),
			test: (value) =>
				value === undefined || value === DISTANCE_UNSPECIFIED || isValidDistance(String(value))
		}),

		// Der Freitext bleibt begrenzt, aber nicht mehr Pflicht — siehe oben. Der
		// Fallback greift nur, falls `sightingFromTextBase.spec.label` je fehlen
		// sollte (praktisch nie, da das Basis-Schema es immer setzt) — auch er
		// muss deshalb lokalisiert sein, sonst würde ein englischer Aufruf im
		// Fehlerfall auf Deutsch zurückfallen.
		sightingFromText: yup
			.string()
			.max(255, m.sighting_sightingfromtext_max_2({}, { locale }))
			.label(sightingFromTextBase.spec.label ?? m.sighting_sightingfromtext_label({}, { locale }))
			.meta(sightingFromTextBase.spec.meta ?? {})
			.notRequired()
	});
}

/** Baut das Admin-Schema je Locale genau einmal und haelt es danach vor. */
export const getAdminSightingSchema = memoizePerLocale(buildAdminSightingSchema);
