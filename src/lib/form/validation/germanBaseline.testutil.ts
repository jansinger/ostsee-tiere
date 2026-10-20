/**
 * Sammelt den deutschen Ist-Zustand des Formular-Schemas und der
 * Domänen-Labels ein — Grundlage für den eingecheckten Schnappschuss
 * `germanBaseline.json` (Aufgabe i18n-t2 2.1) — sowie, seit 2.2, die
 * Validierungsmeldungen, die `describe()` nicht auflöst (siehe
 * `collectValidationMessages()` unten).
 *
 * Nicht Teil dieser Aufgabe: der große Bestimmungshilfe-Fließtext in
 * `speciesIdentification.ts` (Name/Beschreibung je Art) — das ist Fließtext,
 * keine Beschriftung/kein Label, und bläht den Schnappschuss unnötig auf.
 */
import type { CustomSchemaMetadata, SchemaDescription } from 'yup';
import { ValidationError } from 'yup';
import { getAdminSightingSchema, getSightingSchema } from './sightingSchema';
import { baseLocale } from '#lib/paraglide/runtime.js';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';

// Der deutsche Schnappschuss ist bewusst an `baseLocale` festgenagelt — er
// friert genau den deutschen Wortlaut ein, nicht "die gerade aktive Locale".
const sightingSchema = getSightingSchema(baseLocale);
const adminSightingSchema = getAdminSightingSchema(baseLocale);

import {
	getAnimalBehaviorLabel,
	getAnimalBehaviorOptions
} from '#lib/report/formOptions/animalBehavior.ts';
import {
	getAnimalConditionLabel,
	getAnimalConditionOptions
} from '#lib/report/formOptions/animalCondition.ts';
import { getBoatDriveLabel, getBoatDriveOptions } from '#lib/report/formOptions/boatDrive.ts';
import { getBoatTypeLabel, getBoatTypeOptions } from '#lib/report/formOptions/boatType.ts';
import { getDistanceLabel, getDistanceOptions } from '#lib/report/formOptions/distance.ts';
import {
	getDistributionLabel,
	getDistributionOptions
} from '#lib/report/formOptions/distribution.ts';
import {
	getEntryChannelLabel,
	getEntryChannelOptions
} from '#lib/report/formOptions/entryChannel.ts';
import { getMediaTypeLabel, getMediaTypeOptions } from '#lib/report/formOptions/mediaType.ts';
import {
	getReactionToBoatLabel,
	getReactionToBoatOptions
} from '#lib/report/formOptions/reactionToBoat.ts';
import { getSeaStateLabel, getSeaStateOptions } from '#lib/report/formOptions/seaState.ts';
import { getSexLabel, getSexOptions } from '#lib/report/formOptions/sex.ts';
import {
	getSightingFromLabel,
	getSightingFromOptions
} from '#lib/report/formOptions/sightingFrom.ts';
import {
	getSpeciesLabel,
	getSpeciesOptions,
	speciesGroups
} from '#lib/report/formOptions/species.ts';
import {
	getFrequencyLabels,
	getObservabilityLabels
} from '#lib/report/formOptions/speciesIdentification.ts';
import { getVisibilityLabel, getVisibilityOptions } from '#lib/report/formOptions/visibility.ts';
import {
	getWindDirectionLabel,
	getWindDirectionOptions
} from '#lib/report/formOptions/windDirection.ts';
import {
	getWindStrengthLabel,
	getWindStrengthOptions
} from '#lib/report/formOptions/windStrength.ts';

// -----------------------------------------------------------------------
// Schicht A: Schema-Beschriftungen und meta
// -----------------------------------------------------------------------

/** Nur die nutzersichtbaren `meta`-Felder — `icon`/`options`/`autocomplete`/`step` bleiben draußen. */
export interface FieldMetaSnapshot {
	type?: string;
	placeholder?: string;
	helpText?: string;
	valueText?: string;
}

export interface FieldShapeSnapshot {
	label?: string;
	meta: FieldMetaSnapshot;
}

export type SchemaShapeSnapshot = Record<string, FieldShapeSnapshot>;

function collectFieldMeta(meta: CustomSchemaMetadata | undefined): FieldMetaSnapshot {
	const snapshot: FieldMetaSnapshot = {};
	if (meta?.type !== undefined) snapshot.type = meta.type;
	if (meta?.placeholder !== undefined) snapshot.placeholder = meta.placeholder;
	if (meta?.helpText !== undefined) snapshot.helpText = meta.helpText;
	if (meta?.valueText !== undefined) snapshot.valueText = meta.valueText;
	return snapshot;
}

/**
 * Liest `sightingSchema.describe().fields` und gibt je Feld Beschriftung und
 * die nutzersichtbaren `meta`-Felder zurück, alphabetisch nach Feldname
 * sortiert (deterministisch für den Schnappschuss).
 */
export function collectSchemaShape(): SchemaShapeSnapshot {
	const fields = sightingSchema.describe().fields as Record<string, SchemaDescription>;
	const result: SchemaShapeSnapshot = {};

	const sortedEntries = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
	for (const [key, field] of sortedEntries) {
		const entry: FieldShapeSnapshot = { meta: collectFieldMeta(field.meta) };
		if (field.label !== undefined) entry.label = field.label;
		result[key] = entry;
	}

	return result;
}

// -----------------------------------------------------------------------
// Schicht B: Domänen-Labels aus src/lib/report/formOptions/
// -----------------------------------------------------------------------

export interface DomainOptionEntry {
	value: string | number;
	label: string;
}

export interface DomainLabelFallbacks {
	nullish: string;
	unknown: string;
}

/** Benannte Zusatz-Labelmengen für Dateien ohne get*Options/get*Label-Paar (siehe speciesIdentification). */
export interface DomainLabelSet {
	name: string;
	options: DomainOptionEntry[];
}

export interface DomainFileSnapshot {
	options: DomainOptionEntry[];
	fallbacks: DomainLabelFallbacks | null;
	groups: string[] | null;
	labelSets: DomainLabelSet[] | null;
}

/**
 * Feste Schlüsselmenge statt `Record<string, DomainFileSnapshot>` — genau die
 * 17 Dateien unter `src/lib/report/formOptions/`, namentlich als
 * Interface-Properties statt als Index-Signatur. Das macht `labels['species']`
 * zu einem bekannten Property-Zugriff (kein `| undefined` durch
 * `noUncheckedIndexedAccess`).
 *
 * Was das NICHT leistet: Eine neue, 18. Datei bricht hier gar nichts von
 * selbst — `collectDomainLabels()` unten muss den neuen Eintrag erst
 * ausdrücklich zurückgeben, sonst bleibt sie unbemerkt draußen. Was das
 * Interface tatsächlich erzwingt: Fehlt im Rückgabeobjekt von
 * `collectDomainLabels()` eine der 17 HIER benannten Eigenschaften, bricht
 * der Typ-Check — das schützt vor einem versehentlich ausgelassenen
 * bekannten Eintrag, nicht vor einer vergessenen neuen Datei.
 */
export interface DomainLabelSnapshot {
	animalBehavior: DomainFileSnapshot;
	animalCondition: DomainFileSnapshot;
	boatDrive: DomainFileSnapshot;
	boatType: DomainFileSnapshot;
	distance: DomainFileSnapshot;
	distribution: DomainFileSnapshot;
	entryChannel: DomainFileSnapshot;
	mediaType: DomainFileSnapshot;
	reactionToBoat: DomainFileSnapshot;
	seaState: DomainFileSnapshot;
	sex: DomainFileSnapshot;
	sightingFrom: DomainFileSnapshot;
	species: DomainFileSnapshot;
	speciesIdentification: DomainFileSnapshot;
	visibility: DomainFileSnapshot;
	windDirection: DomainFileSnapshot;
	windStrength: DomainFileSnapshot;
}

/** Ein mit Sicherheit ungültiger numerischer Enum-Wert für den `unknown`-Rückfall. */
const INVALID_NUMERIC_VALUE = 4242;
/** Dasselbe für den string-wertigen `windDirection`-Enum. */
const INVALID_STRING_VALUE = 'INVALID_4242';

function standardFile(
	options: DomainOptionEntry[],
	nullish: string,
	unknown: string
): DomainFileSnapshot {
	return {
		options,
		fallbacks: { nullish, unknown },
		groups: null,
		labelSets: null
	};
}

/**
 * Deckt alle 17 Dateien unter `src/lib/report/formOptions/` ab — namentlich
 * aufgeführt statt zur Laufzeit gelistet, damit eine neue Datei diesen Test
 * bricht, statt still mitzulaufen.
 *
 * Die Reihenfolge unten im Quelltext ist von Hand alphabetisch gepflegt —
 * das ist Handdisziplin, kein Determinismus. Damit ein künftiger, unsortiert
 * eingetragener Eintrag nicht unbemerkt Diff-Rauschen in den Schnappschuss
 * bringt, sortiert die Rückgabe hier programmatisch nach Schlüssel, genau
 * wie `collectSchemaShape()` es für die Feld-Reihenfolge bereits tut.
 */
export function collectDomainLabels(): DomainLabelSnapshot {
	// `windStrength` steht hier bewusst VOR `animalBehavior` — nicht
	// alphabetisch. Stünde diese Liste zufällig doch in alphabetischer
	// Quelltext-Reihenfolge, würde eine entfernte Sortierung im Rückgabewert
	// unbemerkt bleiben (siehe Test „sortiert die Ausgabe unabhängig von der
	// Quelltext-Reihenfolge" in germanBaseline.test.ts). Diese eine
	// Umstellung erzwingt, dass die programmatische Sortierung unten
	// tatsächlich etwas leistet.
	const unsorted: DomainLabelSnapshot = {
		windStrength: standardFile(
			getWindStrengthOptions(),
			getWindStrengthLabel(null),
			getWindStrengthLabel(INVALID_NUMERIC_VALUE)
		),
		animalBehavior: standardFile(
			getAnimalBehaviorOptions(),
			getAnimalBehaviorLabel(null),
			getAnimalBehaviorLabel(INVALID_NUMERIC_VALUE)
		),
		animalCondition: standardFile(
			getAnimalConditionOptions(),
			getAnimalConditionLabel(null),
			getAnimalConditionLabel(INVALID_NUMERIC_VALUE)
		),
		boatDrive: standardFile(
			getBoatDriveOptions(),
			getBoatDriveLabel(null),
			getBoatDriveLabel(INVALID_NUMERIC_VALUE)
		),
		boatType: standardFile(
			getBoatTypeOptions(),
			getBoatTypeLabel(null),
			getBoatTypeLabel(INVALID_NUMERIC_VALUE)
		),
		distance: standardFile(
			getDistanceOptions(),
			getDistanceLabel(null),
			getDistanceLabel(INVALID_NUMERIC_VALUE)
		),
		distribution: standardFile(
			getDistributionOptions(),
			getDistributionLabel(null),
			getDistributionLabel(INVALID_NUMERIC_VALUE)
		),
		entryChannel: standardFile(
			getEntryChannelOptions(),
			getEntryChannelLabel(null),
			getEntryChannelLabel(INVALID_NUMERIC_VALUE)
		),
		mediaType: standardFile(
			getMediaTypeOptions(),
			getMediaTypeLabel(null),
			getMediaTypeLabel(INVALID_NUMERIC_VALUE)
		),
		reactionToBoat: standardFile(
			getReactionToBoatOptions(),
			getReactionToBoatLabel(null),
			getReactionToBoatLabel(INVALID_NUMERIC_VALUE)
		),
		seaState: standardFile(
			getSeaStateOptions(),
			getSeaStateLabel(null),
			getSeaStateLabel(INVALID_NUMERIC_VALUE)
		),
		sex: standardFile(getSexOptions(), getSexLabel(null), getSexLabel(INVALID_NUMERIC_VALUE)),
		sightingFrom: standardFile(
			getSightingFromOptions(),
			getSightingFromLabel(null),
			getSightingFromLabel(INVALID_NUMERIC_VALUE)
		),
		species: {
			options: getSpeciesOptions(),
			fallbacks: {
				nullish: getSpeciesLabel(null),
				unknown: getSpeciesLabel(INVALID_NUMERIC_VALUE)
			},
			groups: Object.keys(speciesGroups),
			labelSets: null
		},
		// Besonderheit: speciesIdentification.ts exportiert kein
		// get*Options()/get*Label()-Paar — anders als die restlichen 16
		// Dateien. Es traegt stattdessen zwei eigene Record<Enum, string>
		// direkt als Konstanten (observabilityLabels, frequencyLabels), ohne
		// Options-Generator und ohne Fallback-Funktion. Deshalb hier ueber
		// `labelSets` erfasst statt ueber `options`/`fallbacks`.
		//
		// AUSDRÜCKLICHE GRENZE: `labelSets` erfasst NUR diese zwei schmalen
		// Label-Records. Der `speciesIdentification`-Export selbst (elf
		// vollständige Artdatensätze: name, scientificName, size, weight,
		// frequency.text, surfacing[], distinguishing[].text, behavior[],
		// confusion[], fieldTip, images[].alt — rund 316 deutsche
		// String-Literale Fließtext) ist HIER NICHT erfasst. Das ist
		// beabsichtigt: Dieser Text ist Bestimmungshilfe-Fließtext (Schicht E),
		// keine Beschriftung/kein Label, und gehört zu einer eigenen, späteren
		// Migrations-Etappe, nicht zu diesem Schnappschuss. Woran man eine
		// Verschiebung dieser Grenze erkennt: der Test „markiert die
		// Ausschlussgrenze der Artdatensätze" in germanBaseline.test.ts hält
		// `labelSets` exakt auf die zwei Namen 'observability'/'frequency' fest
		// — wer die Artdatensätze hier mit aufnehmen will, muss diesen Test
		// anfassen, nicht nur diese Datei.
		speciesIdentification: {
			options: [],
			fallbacks: null,
			groups: null,
			labelSets: [
				{
					name: 'observability',
					options: Object.entries(getObservabilityLabels()).map(([value, label]) => ({
						value,
						label
					}))
				},
				{
					name: 'frequency',
					options: Object.entries(getFrequencyLabels()).map(([value, label]) => ({ value, label }))
				}
			]
		},
		visibility: standardFile(
			getVisibilityOptions(),
			getVisibilityLabel(null),
			getVisibilityLabel(INVALID_NUMERIC_VALUE)
		),
		windDirection: standardFile(
			getWindDirectionOptions(),
			getWindDirectionLabel(null),
			getWindDirectionLabel(INVALID_STRING_VALUE)
		)
	};

	const sortedEntries = Object.entries(unsorted).sort(([a], [b]) => a.localeCompare(b));
	return Object.fromEntries(sortedEntries) as DomainLabelSnapshot;
}

// -----------------------------------------------------------------------
// Schicht C: Validierungsmeldungen (nur per echter Validierung erreichbar)
// -----------------------------------------------------------------------

/** Eine Yup-Nutzlast — bewusst locker typisiert, sie geht direkt in `schema.validate()`. */
type ValidationPayload = Record<string, unknown>;

type SchemaUnderTest = typeof sightingSchema | typeof adminSightingSchema;

/**
 * Ein durchgehend gültiger Grundzustand. Jedes Szenario unten überschreibt
 * gezielt EIN bis ZWEI Felder mit einem verletzenden Wert — der Rest bleibt
 * gültig, damit im gesammelten Fehler-Set nicht zufällig ein anderes
 * Pflichtfeld mitrauscht und der Bezug zum eigentlichen Testziel des
 * Szenarios lesbar bleibt.
 */
const VALID_BASE: ValidationPayload = {
	privacyConsent: true,
	firstName: 'Max',
	lastName: 'Mustermann',
	email: 'max@example.de',
	species: 0,
	totalCount: 1,
	sightingFrom: SightingFromEnum.SAILBOAT,
	distance: 1,
	sightingDate: '2020-01-01',
	entryChannel: 0,
	waterway: 'Kieler Bucht'
};

/** Alle Meldungspositionen, die in `sightingSchema`/`adminSightingSchema` NICHT hinter einem when() stecken. */
const FLAT_FIELD_SCENARIOS: ValidationPayload[] = [
	// Komplett leere Eingabe: provoziert die schlichten Pflichtfelder, die in
	// VALID_BASE sonst immer gültig mitlaufen (waterway, distance — beide über
	// ihren jeweiligen when()-Normalzweig, siehe CONDITIONAL_BRANCH_SCENARIOS
	// unten — sowie firstName/lastName/email/privacyConsent ohne when()).
	{},
	{ ...VALID_BASE, sightingDate: '' }, // required — .default() greift nur bei undefined, nicht bei ''
	{ ...VALID_BASE, sightingDate: '2999-01-01' }, // Datum in der Zukunft
	{ ...VALID_BASE, sightingTime: '99:99' },
	{ ...VALID_BASE, species: undefined }, // required
	{ ...VALID_BASE, species: 9999 }, // test: unbekannte Art
	{ ...VALID_BASE, totalCount: null }, // required — .default(1) greift nur bei undefined
	{ ...VALID_BASE, totalCount: 0 }, // min
	{ ...VALID_BASE, totalCount: 99 }, // max
	{ ...VALID_BASE, juvenileCount: -1 }, // min
	{ ...VALID_BASE, juvenileCount: 20, totalCount: 1 }, // max
	{ ...VALID_BASE, totalCount: 1, juvenileCount: 2 }, // test: mehr Jungtiere als Tiere insgesamt
	{ ...VALID_BASE, deadSex: 9999 }, // test — kein when(), gilt unabhängig von isDead
	{ ...VALID_BASE, deadSize: -1 }, // min
	{ ...VALID_BASE, deadSize: 9999 }, // max
	{ ...VALID_BASE, distance: 9999 }, // test
	{ ...VALID_BASE, distribution: 9999 },
	{ ...VALID_BASE, behavior: 9999 },
	{ ...VALID_BASE, seaState: 9999 },
	{ ...VALID_BASE, visibility: 9999 },
	{ ...VALID_BASE, windDirection: 'ZZZ' }, // oneOf
	{ ...VALID_BASE, windForce: -1 }, // min
	{ ...VALID_BASE, windForce: 99 }, // max
	{ ...VALID_BASE, shipCount: -1 }, // min
	{ ...VALID_BASE, shipCount: 99 }, // max
	{ ...VALID_BASE, email: 'not-an-email' }, // email
	{ ...VALID_BASE, entryChannel: 9999 }, // test
	{ ...VALID_BASE, entryChannel: null }, // required — .default(0) greift nur bei undefined
	{
		// Alle `.max(...)`-Freitextfelder in einem Lauf — jedes Feld einzeln zu
		// überschreiten bräuchte ein eigenes Szenario, ohne dass sich am
		// Provoziermuster (zu lange Zeichenkette) etwas unterschiede.
		...VALID_BASE,
		waterway: 'x'.repeat(300),
		seaMark: 'x'.repeat(300),
		distributionText: 'x'.repeat(300),
		behaviorText: 'x'.repeat(300),
		reaction: 'x'.repeat(1200),
		mediaFile: 'x'.repeat(300),
		shipName: 'x'.repeat(100),
		homePort: 'x'.repeat(100),
		boatType: 'x'.repeat(100),
		boatDriveText: 'x'.repeat(300),
		firstName: 'x'.repeat(100),
		lastName: 'x'.repeat(100),
		email: 'a@' + 'x'.repeat(100) + '.de',
		fax: 'x'.repeat(100),
		phone: 'x'.repeat(100),
		street: 'x'.repeat(100),
		zipCode: 'x'.repeat(20),
		city: 'x'.repeat(100),
		notes: 'x'.repeat(1200),
		otherObservations: 'x'.repeat(1200),
		internalComment: 'x'.repeat(1200)
	}
];

/**
 * Die when()-Zweige, die `describe()` nicht auflöst — je Bedingungspaar ein
 * Szenario für beide Seiten, wie im Brief gefordert:
 * `hasPosition` true/false, `isDead` true/false, `sightingFrom` an Land/auf
 * See. (`waterway.required` bei `hasPosition: false` und `distance.required`
 * bei `isDead: false` sind bereits die Standardwerte in `VALID_BASE` bzw. in
 * den Szenarien oben und brauchen deshalb kein eigenes Szenario mehr — sie
 * laufen in praktisch jedem Aufruf mit.)
 */
const CONDITIONAL_BRANCH_SCENARIOS: ValidationPayload[] = [
	{ ...VALID_BASE, hasPosition: true }, // latitude/longitude required
	{ ...VALID_BASE, hasPosition: true, latitude: 999, longitude: 999 }, // latitude/longitude min+max
	{ ...VALID_BASE, isDead: true, distance: undefined }, // deadCondition required (distance wird notRequired)
	{ ...VALID_BASE, isDead: true, deadCondition: 9999 }, // deadCondition test
	{ ...VALID_BASE, sightingFrom: SightingFromEnum.OTHER }, // sightingFromText required
	{ ...VALID_BASE, sightingFromText: 'x'.repeat(300) }, // sightingFromText max
	{ ...VALID_BASE, sightingFrom: 9999 }, // sightingFrom test
	{ ...VALID_BASE, sightingFrom: SightingFromEnum.SAILBOAT, boatDrive: undefined }, // "auf See": boatDrive required
	{
		...VALID_BASE,
		sightingFrom: SightingFromEnum.LAND,
		boatDrive: 9999,
		waterway: 'Strandpromenade'
	} // "an Land": boatDrive test, nicht required
];

/** Die drei Meldungen, die `adminSightingSchema` gegenüber der Basis lockert bzw. ersetzt. */
const ADMIN_SCENARIOS: ValidationPayload[] = [
	{ ...VALID_BASE, totalCount: -1 }, // min: 'Die Anzahl darf nicht negativ sein'
	{ ...VALID_BASE, totalCount: 99999 }, // max: 'Bitte eine plausible Anzahl eintragen'
	{ ...VALID_BASE, totalCount: 99999, juvenileCount: 99999 } // dasselbe max für juvenileCount
];

async function collectErrors(
	schema: SchemaUnderTest,
	payload: ValidationPayload
): Promise<string[]> {
	try {
		await schema.validate(payload, { abortEarly: false });
		return [];
	} catch (error) {
		if (error instanceof ValidationError) {
			return error.errors;
		}
		throw error;
	}
}

/**
 * Provoziert eine gezielte Batterie ungültiger Eingaben gegen `sightingSchema`
 * UND `adminSightingSchema` (`{ abortEarly: false }`) und sammelt die dabei
 * tatsächlich ausgelösten deutschen Meldungen, sortiert und dublettenfrei.
 *
 * `describe()` kennt diese Texte nicht — `latitude.tests` ist z. B. leer,
 * weil `min`/`max` in einem `when('hasPosition', …)` stecken, das erst beim
 * echten Validieren mit konkreten Werten aufgelöst wird. Das ist der Kern
 * von Aufgabe i18n-t2 2.2: 44 von 73 vom Extraktor gefundenen Meldungen
 * ließen sich mit einer groben Batterie provozieren, die übrigen 29 stecken
 * fast alle in genau solchen Zweigen.
 */
export async function collectValidationMessages(): Promise<string[]> {
	const messages = new Set<string>();

	for (const payload of [...FLAT_FIELD_SCENARIOS, ...CONDITIONAL_BRANCH_SCENARIOS]) {
		for (const message of await collectErrors(sightingSchema, payload)) {
			messages.add(message);
		}
	}
	for (const payload of ADMIN_SCENARIOS) {
		for (const message of await collectErrors(adminSightingSchema, payload)) {
			messages.add(message);
		}
	}

	return [...messages].sort((a, b) => a.localeCompare(b));
}

/**
 * Meldungen, die der Extraktor im Quelltext von `sightingSchema.ts` findet,
 * sich aber nachweislich nicht provozieren lassen — je Eintrag mit einer
 * Begründung, WARUM (z. B. eine vorgelagerte Regel, die den Zweig nie
 * durchlässt). Ein Eintrag hier ist ein Befund über die Anwendung, kein
 * Verwaltungsakt (siehe Bericht i18n-t2 2.2).
 *
 * Aktuell leer: Jede der 73 vom Extraktor gefundenen Meldungen ließ sich in
 * der Batterie oben mindestens einmal auslösen. Es gibt damit (Stand 2.2)
 * keinen toten Meldungstext in `sightingSchema.ts`.
 */
export const UNPROVOKABLE_MESSAGES: readonly string[] = [];
