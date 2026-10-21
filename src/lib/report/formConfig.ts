import * as m from '#lib/paraglide/messages.js';
/**
 * Modern whale sighting form configuration
 * Richtlinien: docs/DESIGN_GUIDE.md, verbindliche Regeln: .claude/rules/design-system.md
 */

import { getSightingSchema } from '#lib/form/validation/sightingSchema.ts';
import { baseLocale, getLocale, type Locale } from '#lib/paraglide/runtime.js';
import { SightingFromEnum } from './formOptions/sightingFrom';
import type { FormStep, SightingFormData } from './types';
// Typ-Import, kein Laufzeit-Import — der Zyklus formConfig.ts →
// components/sections/boatDriveReset.ts → formOptions/sightingFrom.ts bleibt
// damit unkritisch: `boatDriveReset.ts` importiert nichts, das seinerseits
// formConfig.ts lädt, und ein reiner Typ-Import wird beim Bundling ohnehin
// vollständig entfernt.
import type { SightingFromValue } from './components/sections/boatDriveReset';
import type { SchemaObjectDescription } from 'yup';

/**
 * Beschreibung des Sichtungs-Schemas fuer eine Locale. Ersetzt seit Aufgabe 4.2
 * die fruehere Modulkonstante — `describe()` wertet die im Schema hinterlegten
 * Botschaften aus, und die haengen jetzt an der Locale.
 */
export function getSightingSchemaDescription(
	locale: Locale = getLocale()
): SchemaObjectDescription {
	return getSightingSchema(locale).describe();
}

/**
 * `initialFormState` bleibt bewusst eine Konstante: Es traegt ausschliesslich
 * Vorgabewerte (`.default(...)` im Schema) — Zahlen, Booleans, leere Arrays —,
 * keine Anzeigetexte. Diese Werte sind fuer jede Locale identisch, ein
 * Locale-Parameter waere hier ohne Wirkung. Aus `baseLocale` abgeleitet, damit
 * die Herkunft (irgendeine feste, gebaute Schema-Instanz) sichtbar bleibt,
 * statt eine dritte, unabhaengige Quelle fuer dieselben Vorgabewerte zu sein.
 */
export const initialFormState: SightingFormData = getSightingSchemaDescription(baseLocale)
	.default as SightingFormData;

/**
 * Feldbeschreibungen (Label, `meta`, Typ) fuer eine Locale. Ersetzt die
 * fruehere Modulkonstante `sightingSchemaFields` aus denselben Gruenden wie
 * `getSightingSchemaDescription` oben.
 */
export function getSightingSchemaFields(
	locale: Locale = getLocale()
): SchemaObjectDescription['fields'] {
	return getSightingSchemaDescription(locale).fields;
}

/**
 * Multi-step form structure following UX best practices
 * Step 1: Location & Time (position and temporal data)
 * Step 2: Sighting Details (species, count, circumstances)
 * Step 3: Behavioral observations (optional details)
 * Step 4: Observer information (contact data)
 */
/**
 * Contact field names that are persisted/restored between sessions.
 * Used by FormActions and Step4Contact to clear saved contact data
 * without a page reload.
 */
/**
 * Straße, PLZ und Ort werden seit dem Wegfall der Adressabfrage NICHT mehr
 * gespeichert (`UserContactData`), stehen hier aber weiterhin: „Kontaktdaten
 * löschen" soll auch einen Wert aufräumen, den ein früherer Besuch noch in den
 * Formular-State gespiegelt hat.
 */
export const USER_CONTACT_FIELDS = [
	'firstName',
	'lastName',
	'email',
	'phone',
	'street',
	'zipCode',
	'city',
	'shipName',
	'homePort',
	'boatType',
	'nameConsent',
	'shipNameConsent',
	'persistentDataConsent'
] as const;

// Getter statt Werte: `formStepsConfig` ist eine MODULKONSTANTE. Ein fertiger
// String würde beim Modulladen einmal aufgelöst und fröre die Sprache für die
// Lebensdauer des Prozesses ein — der Defekt, den Entwurf 2.3/4.1 für die
// Modulkonstanten der Schicht B beschreibt.
export const formStepsConfig: FormStep[] = [
	{
		id: 'location-time',
		get title(): string {
			return m.report_formconfig_text_position_zeitpunkt();
		},
		get description(): string {
			return m.report_formconfig_text_wo_und_wann_haben_sie_die_sichtung_gemac();
		},
		fields: [
			'hasPosition',
			'latitude',
			'longitude',
			// `seaMark` steht hier bewusst NICHT mehr: Die Ortsbeschreibung ist seit
			// A2.4 ein einziges Freitextfeld (`waterway`). Schema-Eintrag und
			// DB-Spalte `seezeichen` bleiben — die Admin-Maske und die Legacy-API
			// schreiben es weiter.
			'waterway',
			'sightingDate',
			'sightingTime'
		]
	},
	{
		id: 'sighting-details',
		get title(): string {
			return m.report_formconfig_text_angaben_zum_tier();
		},
		get description(): string {
			return m.report_formconfig_text_was_haben_sie_genau_beobachtet();
		},
		fields: [
			// Die Medien-DATEI-Felder stehen seit dem 2026-08-04 hier und VOR den
			// Tierangaben (Wunsch des Museums: „Foto hochladen als erste Abfrage noch
			// vor Tierinformation"). Der Grund wiegt schwerer als die Reihenfolge: Auf
			// Schritt 3 stand der Upload unter dem prominenten „Schritt
			// überspringen"-Knopf und blieb damit für jeden unsichtbar, der ihn
			// benutzte — obwohl Aufnahmen die wertvollste Einzelangabe der Meldung
			// sind. Schritt 2 ist Pflichtschritt.
			//
			// Die Reihenfolge in dieser Liste ist nicht kosmetisch: `scrollToFirstError`
			// läuft sie ab, um zum ersten fehlerhaften Feld zu springen. (Nicht
			// `findStepForErrors` — das liest nur die Zugehörigkeit zum Schritt,
			// siehe die Feldliste von `observations` weiter unten.)
			'mediaFile',
			'mediaUpload',
			// `mediaConsent` steht hier bewusst NICHT mehr: Es steht seit dem
			// 2026-08-05 auf Schritt 4 bei den übrigen Einwilligungen — Begründung
			// dort, bei der `contact`-Feldliste. Die DATEI-Felder bleiben hier.
			'species',
			'totalCount',
			'juvenileCount',
			'distance',
			'sightingFrom',
			'sightingFromText',
			'boatDrive',
			// `boatDriveText` steht hier bewusst NICHT mehr: Es hängt an
			// `BoatDriveEnum.OTHER`, und das Meldeformular bietet seit dem 2026-08-04
			// nur noch "Motor lief"/"Motor lief nicht" an (PR 4). Schema-Eintrag und
			// DB-Spalte `bootsantrieb_text` bleiben — die Admin-Maske schreibt es weiter.
			//
			// `isDead` steht hier bewusst NICHT mehr: Die Einstiegsseite („Was
			// möchten Sie melden?") beantwortet Sichtung/Totfund bereits vor dem
			// Formular und schreibt den Wert über `initialIsDead` in den State
			// (Task 6/7). Der Schalter auf Schritt 2 ist im Meldeformular durch eine
			// Rückmeldung ersetzt (`AnimalInfo.svelte`) — ein Feld, das dort nicht
			// mehr bedient wird, braucht auch keine Schritt-Validierung. Schema-
			// Eintrag und DB-Spalte `totfund` bleiben — die Admin-Maske zeigt den
			// Schalter weiterhin und schreibt ihn.
			'deadCondition',
			// `deadSex` steht hier bewusst NICHT mehr: Das Museum hat das Geschlecht
			// beim Totfund am 2026-08-04 aus dem Meldeformular abbestellt (C4) —
			// Laien können es am Strand kaum bestimmen. Schema-Eintrag und DB-Spalte
			// `totfund_geschlecht` bleiben — die Admin-Maske schreibt es weiter.
			'deadSize',
			'deadPhoneContact'
		]
	},
	{
		id: 'observations',
		get title(): string {
			return m.report_formconfig_text_weitere_informationen();
		},
		get description(): string {
			return m.report_formconfig_text_details_zu_verhalten_und_umweltbedingung();
		},
		fields: [
			// `distribution`/`distributionText` stehen hier bewusst NICHT mehr: Das
			// Museum hat das Feld am 2026-08-04 aus dem Meldeformular abbestellt —
			// es lässt sich aus der Anzahl der Tiere erschließen. Schema-Eintrag und
			// DB-Spalte `verteilung` bleiben — die Admin-Maske schreibt es weiter.
			'behavior',
			'behaviorText',
			'reaction',
			// Die Reihenfolge dieser vier folgt `Environment.svelte` und ist nicht
			// kosmetisch: `scrollToFirstError` läuft die Liste ab, um zum ersten
			// fehlerhaften Feld zu springen (`fieldNavigation.ts` — die Aufrufstelle
			// baut `fieldOrder` in `StepNavigation.svelte` aus genau dieser Config).
			// `findStepForErrors` liest daraus dagegen nur die Zugehörigkeit zum
			// Schritt, nicht die Position darin.
			'seaState',
			'visibility',
			'windForce',
			// Hinter der Windstärke, nicht davor: das einzige Feld der Karte, das
			// der Wetter-Abruf nie füllt — Begründung in `Environment.svelte`.
			'shipCount',
			'shipName',
			'homePort',
			'boatType'
			// `mediaFile`/`mediaUpload` stehen seit dem 2026-08-04 im Schritt
			// „sighting-details" — Begründung dort. `mediaConsent` steht seit dem
			// 2026-08-05 im Schritt „contact" — Begründung dort.
		],
		isOptional: true
	},
	{
		id: 'contact',
		get title(): string {
			return m.report_formconfig_text_kontaktdaten();
		},
		get description(): string {
			return m.report_formconfig_text_ihre_informationen_fuer_rueckfragen();
		},
		fields: [
			'firstName',
			'lastName',
			'email',
			'phone',
			'nameConsent',
			'shipNameConsent',
			// `mediaConsent` steht seit dem 2026-08-05 auf Schritt 4 bei den
			// übrigen Einwilligungen. Alle vier Felder mit Nachweisspalten (`…_am`,
			// `…_version` in `schema.ts`) stehen damit an einer Stelle. Die
			// DATEI-Felder bleiben hier — der Upload gehört weiterhin vor die
			// Tierangaben (Wunsch des Museums, 2026-08-04).
			'mediaConsent',
			'notes',
			'privacyConsent',
			'persistentDataConsent'
		]
	}
];

/**
 * Eingabe für `getFormSteps`. Bewusst das Formularobjekt statt einzelner Flags:
 * Kommt eine dritte Bedingung dazu, ändert sich die Signatur nicht mehr.
 */
export type FormStepsInput = {
	isDead?: boolean | number | string | null;
	// `| undefined` steht explizit dabei (nicht nur implizit über `?:`): Das
	// Projekt fährt `exactOptionalPropertyTypes: true` — ohne den expliziten
	// Zusatz lässt sich `undefined` einem Objektliteral nicht als Wert
	// zuweisen, nur weglassen. `getFormSteps({ sightingFrom: undefined })`
	// kommt so aber tatsächlich vor (Admin-Maske vor dem Laden eines
	// Datensatzes) und muss zuweisbar bleiben.
	sightingFrom?: number | string | null | undefined;
	/**
	 * Dieselbe Größe, mit der `$form.uploadedFiles` im Formular geführt wird —
	 * bewusst KEIN separates `hasMedia`-Flag. Ein früherer Versuch mit einem
	 * eigenen Boolean-Flag war totes Beiwerk: `stepValidation.ts` ruft
	 * `getFormSteps(formData)` mit dem echten (Partial-)Formularobjekt auf,
	 * das kein `hasMedia` kennt — das Flag blieb zur Laufzeit immer
	 * `undefined`, und `mediaConsent` wurde nie ausgeblendet, obwohl das
	 * Markup (`Step4Contact.svelte`) es schon tat (Review-Befund, Task 15,
	 * zweite Runde). Wie bei `sightingFrom` oben gilt deshalb: dasselbe
	 * Formularfeld direkt entgegennehmen, aus dem `getFormSteps` selbst
	 * ableitet — dann kann keine Aufrufstelle vergessen werden, ein Wert zu
	 * setzen, den es gar nicht mehr gibt. Siehe `hasUploadedMedia` unten.
	 */
	uploadedFiles?: SightingFormData['uploadedFiles'];
};

/**
 * Normalisiert `isDead` aus allen Quellen, in denen es auftaucht: Boolean aus dem
 * Formular, `0`/`1` aus der Datenbank, String aus dem localStorage.
 *
 * Einzige Definition im Projekt — auch `wording.ts` importiert sie für die
 * Totfund-Ansprache auf Schritt 2, statt eine eigene Kopie zu pflegen. Genau
 * das war vorher nicht der Fall: Eine zweite, enger rechnende Kopie in
 * `wording.ts` prüfte Strings nur gegen `'true'` und wertete den DB-Wert
 * `'1'` fälschlich als Sichtung — das Formular hätte dann die
 * Verhaltensfelder ausgeblendet, während die Überschrift weiter „Was haben
 * Sie beobachtet?" fragte.
 *
 * Für den Totfund-Schalter selbst liefert `createForm.handleChange` einen
 * echten Boolean (`target.checked`); der String-Fall entsteht dort nicht.
 * `undefined` kommt trotzdem vor: Die Admin-Maske füllt das Formular aus
 * einem geladenen Datensatz. Ein String an einer solchen Stelle war in
 * dieser Codebasis schon einmal ein echter Fehler (`BaseRadio` verglich
 * strikt gegen Zahlen, im State lag der String aus dem DOM-Event — PR 4).
 *
 * Nimmt `unknown` an (nicht nur `FormStepsInput['isDead']`), weil
 * `wording.ts`s öffentliche Funktionen `isDead` ebenfalls als `unknown`
 * führen — der Wert kommt dort teils direkt aus reaktivem Formular-State.
 */
export function isDeadFinding(value: unknown): boolean {
	return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * Felder, die beim Totfund entfallen. Ein totes Tier zeigt kein Verhalten und
 * reagiert nicht — die Angaben wären für den Melder unbeantwortbar.
 *
 * `distance` steht seit dem UX-Review 2026-08-07 mit in der Liste, aus
 * derselben Begründung: Ein Totfund wird am Strand gefunden, der Melder steht
 * neben dem Tier. „Entfernung zum Tier" ist dort keine Schätzung mehr, sondern
 * eine Frage ohne sinnvolle Antwort — und im Meldeformular Pflicht, sie sperrte
 * „Weiter", bis irgendeine Kategorie geraten war. Anders als bei den
 * Verhaltensfeldern reicht der Eintrag hier nicht: `distance` ist im vollen
 * `sightingSchema` unbedingt `.required()`, und der Endpunkt validiert dagegen
 * — die Pflicht hängt dort jetzt über `when('isDead')` am selben Zweig
 * (Begründung im Schema, gleiche Lage wie bei `deadSex` 2026-08-04).
 *
 * WICHTIG: Diese Liste ist die halbe Miete, nicht die ganze. Sie steuert
 * ausschließlich die Validierung — gelesen wird sie nur von `stepValidation`,
 * gerendert wird aus ihr nichts. Wer ein Feld nur hier entfernt, bekommt ein
 * sichtbares, aber unvalidiertes Feld, dessen Wert trotzdem mit ans Backend
 * geht. Wer es nur im Markup versteckt, bekommt die Umkehrung: ein unsichtbares
 * Feld, das weiter validiert wird, und einen Melder in einer Sackgasse ohne
 * sichtbare Fehlermeldung.
 *
 * Beides gehört deshalb zusammen entschieden: Eintrag hier UND eine Bedingung
 * an der Aufrufstelle im Markup, beide über `isDeadFinding` — nie eine zweite,
 * eigene Regel daneben. Für die drei Verhaltensfelder sitzt die Markup-Seite in
 * `steps/Step3Observations.svelte`, für `distance` in
 * `sections/SightingDetails.svelte`.
 */
const HIDDEN_WHEN_DEAD = ['distance', 'behavior', 'behaviorText', 'reaction'] as const;

/**
 * Die Gegenrichtung: Felder, die im Lebend-Zweig entfallen. Ein lebendes Tier
 * hat keinen Verwesungszustand, keine am Strand gemessene Körperlänge und
 * niemanden, der deswegen schon beim Meeresmuseum angerufen hätte.
 *
 * Nachgezogen am 2026-08-06. Bis dahin blendete diese Felder ausschließlich
 * das Markup aus (`sections/AnimalInfo.svelte`, `{#if isDeadFinding($form.isDead)}`
 * um den `DeadAnimal`-Block) — die Schritt-Konfiguration führte sie in BEIDEN
 * Zweigen. Das ist genau die „nur eine Hälfte"-Lage, vor der der Kopf von
 * `HIDDEN_WHEN_DEAD` oben warnt, nur in der selteneren Richtung: sichtbar
 * nichts, validiert trotzdem.
 *
 * Folgenlos war das nicht bloß theoretisch. `deadSize` trägt
 * `integer()`/`min(0)`/`max(300)` UNBEDINGT und ist in keinem Zweig Pflicht —
 * am Zustand des Tieres hängt bei diesem Feld also gar nichts. Ein zweigfremder
 * Wert im Formular-Zustand (aus dem localStorage einer früheren Sitzung) hätte
 * damit „Weiter" auf Schritt 2 gesperrt, mit einem Fehler an einem Feld, das
 * der Melder im Lebend-Zweig weder sieht noch erreichen kann. Praktisch
 * abgefangen hat das bisher
 * `fieldsOutsideReportKind` (räumt dieselben Felder beim Start aus dem
 * Zustand) — aber als zweite, unabhängig gepflegte Absicherung, nicht als
 * Regel an der Stelle, an der die Validierung entsteht.
 *
 * Dieselbe „halbe Miete"-Warnung gilt hier deshalb weiter: Eintrag hier UND die
 * Bedingung im Markup, beide über `isDeadFinding` — Markup-Seite ist
 * `sections/AnimalInfo.svelte`. Die Felder selbst liegen in
 * `sections/DeadAnimal.svelte` und bleiben unverändert, die Admin-Maske zeigt
 * sie über denselben Block weiter (sie ruft `getFormSteps` gar nicht auf,
 * sondern validiert gegen `adminSightingSchema`).
 *
 * `deadSex` und `isDead` fehlen in der Liste, weil sie in `formStepsConfig`
 * ohnehin nicht mehr stehen (Begründungen dort) — ein Eintrag hier wäre
 * wirkungslos.
 *
 * **Nicht exportiert:** Der zweite Interessent, `fieldsOutsideReportKind.ts`,
 * leitet seit dieser Änderung BEIDE Zweige aus `getFormSteps` ab (Differenz
 * der beiden Aufrufe) statt aus den Listen selbst. Ein Export wäre eine
 * zweite Quelle für dieselbe Aussage.
 */
const HIDDEN_WHEN_ALIVE = ['deadCondition', 'deadSize', 'deadPhoneContact'] as const;

/**
 * Felder, die das EIGENE Wasserfahrzeug betreffen. Sie entfallen, wenn von Land
 * gemeldet wurde.
 *
 * `shipNameConsent` steht bewusst mit in der Liste: Eine Einwilligung zur
 * Veröffentlichung des Schiffsnamens ohne erhobenen Schiffsnamen ist eine Frage
 * ohne Bezugsgegenstand.
 *
 * NICHT enthalten: `shipCount` („Anzahl ANDERER Schiffe in näherer Umgebung" —
 * Störungskontext, von Land aus genauso beobachtbar) und `distance`
 * („Entfernung zum Tier" — auch vom Strand aus sinnvoll).
 *
 * Dieselbe „halbe Miete"-Warnung wie bei `HIDDEN_WHEN_DEAD` gilt hier genauso:
 * Eintrag hier UND eine Bedingung an der Aufrufstelle im Markup, beide über
 * `isFromLand` — nie eine zweite, eigene Regel daneben. Markup-Seite:
 * `sections/BoatInfo.svelte` (`shipName`, `homePort`, `boatType`),
 * `sections/Behavior.svelte` (`reaction`) und `steps/Step4Contact.svelte`
 * (`shipNameConsent`). `boatDrive` braucht dort KEINE eigene Bedingung —
 * `sections/SightingDetails.svelte` zeigt es ohnehin nur bei Segelschiff/
 * Motorboot (`isBoatSightingFrom`), eine Teilmenge von „nicht Land".
 *
 * Ausblenden allein reicht nicht (Review-Befund, Task 11, zweite Runde) — ein
 * ausgeblendetes Feld bleibt sonst unsichtbar, aber weiter im `$form`-Zustand
 * stehen und ginge beim Absenden mit ans Backend.
 *
 * Ein erster Versuch räumte dafür `$form` per `$effect` leer, sobald „Land"
 * galt — das löste GENAU DAS aus, was es verhindern sollte: `onSubmit`
 * baut aus denselben (jetzt geleerten) Werten auch die dauerhaft zu
 * speichernden Kontaktdaten (`shipName`/`homePort`/`boatType`/
 * `shipNameConsent`), und `saveUserContactDataWithConsent` überschreibt den
 * gespeicherten Datensatz vollständig, ohne Merge
 * (`src/lib/storage/localStorage.ts`). Ein wiederkehrender Melder, dessen
 * Bootsdaten gespeichert waren, verlor sie beim nächsten Land-Bericht.
 *
 * Der Fix sitzt deshalb NICHT im Formular-Zustand, sondern am Absende-Rand:
 * `ModernReportForm.svelte`s `onSubmit` entfernt nur aus dem Objekt, das
 * tatsächlich an den Server geht. `$form` selbst bleibt unangetastet: Die
 * persistierten Kontaktdaten werden aus `values` (dem UNGEKÜRZTEN
 * Submit-Objekt) gebaut und bleiben deshalb unverändert stehen, und ein
 * Melder, der versehentlich auf „Land" stellt und zurückwechselt, findet
 * seinen getippten Schiffsnamen noch vor.
 *
 * **Nicht mehr exportiert** (2026-08-07): `ModernReportForm` führte davon
 * lange eine eigene Fassung (`OWN_VESSEL_FIELDS`, dieselbe Liste ohne
 * `boatDrive`) für genau diese Entfernung. Seit dort einheitlich
 * `hiddenFormFields` entscheidet — was ausgeblendet ist, geht auch nicht raus
 * —, gibt es keinen zweiten Interessenten mehr, und die Liste bleibt eine
 * reine Zutat von `hiddenFormFields`. Dasselbe gilt für `HIDDEN_WHEN_ALIVE`
 * und `HIDDEN_WHEN_DEAD` darüber.
 */
const HIDDEN_WHEN_FROM_LAND = [
	'boatDrive',
	'boatType',
	'shipName',
	'homePort',
	'shipNameConsent',
	'reaction'
] as const;

/**
 * Nur ein ausdrückliches „Land" blendet aus.
 *
 * `sightingFrom` ist `integer default(0) notNull`, und `0` bedeutet
 * GLEICHZEITIG „noch nicht beantwortet" und „Sonstiges" (Kajak, SUP, Seebrücke).
 * Eine Regel „zeige nur bei Segelschiff/Motorboot/Fähre" würde die Felder
 * deshalb vor der Beantwortung ausblenden und für alle Sonstiges-Melder
 * dauerhaft.
 *
 * Nimmt `SightingFromValue` (aus `boatDriveReset.ts`) statt
 * `FormStepsInput['sightingFrom']` an: Drei Komponenten (`BoatInfo.svelte`,
 * `Behavior.svelte`, `Step4Contact.svelte`) rufen diese Funktion aus dem
 * Markup heraus mit `$form.sightingFrom` auf und haben mit `getFormSteps`s
 * Validierungs-Eingabe nichts zu tun — der Parametertyp sollte das nicht
 * vortäuschen. `SightingFromValue` beschreibt denselben Wertebereich (String
 * vom HTML-Select oder Number aus dem Yup-Schema), ist aber an der Stelle
 * definiert, die auch die Markup-Aufrufer schon kennen — kein Import-Zyklus,
 * da `boatDriveReset.ts` nichts importiert, das seinerseits `formConfig.ts`
 * lädt, und es sich hier um einen reinen Typ-Import handelt.
 */
export function isFromLand(value: SightingFromValue): boolean {
	return Number(value) === SightingFromEnum.LAND;
}

/**
 * Ob mindestens eine Aufnahme abgeschlossen hochgeladen wurde. Steuert
 * `mediaConsent`: Eine Einwilligung zur Veröffentlichung von Aufnahmen ohne
 * Aufnahmen ist eine Frage ohne Bezugsgegenstand.
 *
 * **Einzige Definition im Projekt**, geteilt zwischen `getFormSteps` unten,
 * `Step4Contact.svelte` (Markup-Bedingung) und `ModernReportForm.svelte`
 * (Reset-Effekt und Absende-Riegel) — dasselbe Muster wie `isFromLand`, das
 * ebenfalls von Markup UND Config-Funktion aus derselben Stelle aufgerufen
 * wird, statt die Bedingung an jeder Aufrufstelle einzeln auszuschreiben.
 *
 * `| undefined` explizit dabei (wie bei `FormStepsInput.sightingFrom` oben):
 * `FormStepsInput.uploadedFiles` ist optional, und `exactOptionalPropertyTypes`
 * lässt den Aufruf mit einem möglicherweise fehlenden Wert sonst nicht zu.
 */
export function hasUploadedMedia(
	uploadedFiles: SightingFormData['uploadedFiles'] | undefined
): boolean {
	return (uploadedFiles?.length ?? 0) > 0;
}

/**
 * `mediaConsent` entfällt, wenn keine Aufnahme vorliegt. Anders als
 * `HIDDEN_WHEN_DEAD`/`HIDDEN_WHEN_FROM_LAND` ist das kein eigenes Feld-Array
 * mit einer Roh-Bedingung, die erst normalisiert werden müsste — `hasUploadedMedia`
 * liefert bereits einen fertigen Boolean, und es betrifft nur dieses eine Feld.
 *
 * Dieselbe „halbe Miete"-Warnung wie bei `HIDDEN_WHEN_DEAD` gilt trotzdem:
 * Eintrag hier UND eine Bedingung an der Aufrufstelle im Markup —
 * `steps/Step4Contact.svelte`, geprüft (über `hasUploadedMedia`) gegen
 * `$form.uploadedFiles` (nicht gegen den client-seitigen Medien-Store, der
 * nur solange gefüllt ist, wie eine Dropzone auf Schritt 1 oder Schritt 2
 * gemountet ist — bei einem Reload direkt auf Schritt 4 wäre er sonst
 * fälschlich leer). Beide Stellen rufen dieselbe Funktion auf `data.uploadedFiles`
 * auf — es gibt kein separates Flag mehr, das eine Aufrufstelle vergessen
 * könnte zu setzen (Review-Befund, Task 15, zweite Runde: genau das war der
 * vorherige Fehler — `getFormSteps` erwartete ein `hasMedia`, das
 * `stepValidation.ts` nie übergab, `mediaConsent` blieb dadurch validiert,
 * obwohl das Markup es längst ausblendete).
 *
 * **Dritte Stelle:** Ausblenden allein reicht nicht — ein `mediaConsent: true`,
 * das der Nutzer setzt und dessen Aufnahme danach wieder entfernt wird, bliebe
 * sonst im `$form`-Zustand stehen und ginge beim Absenden mit ans Backend, wo
 * `mapFormToSighting` daraus einen datierten, versionierten Nachweis ohne
 * Bezugsgegenstand stempelt. Der Riegel dafür sitzt in
 * `ModernReportForm.svelte`s `onSubmit` — seit dem 2026-08-07 nicht mehr als
 * eigene `hasUploadedMedia`-Abfrage, sondern über `hiddenFormFields` unten,
 * das dieselbe Funktion auf demselben `uploadedFiles` auswertet. Nur eine zum
 * Absende-Zeitpunkt tatsächlich abgeschlossene Übertragung hat serverseitig
 * ein Gegenstück, für das ein Nachweis Sinn ergäbe.
 */
export function getFormSteps(data: FormStepsInput): FormStep[] {
	const hidden = new Set<string>(hiddenFormFields(data));

	// Kein `if (hidden.size === 0) return formStepsConfig` mehr: Seit
	// `HIDDEN_WHEN_ALIVE` beantwortet der Totfund-Zweig in `hiddenFormFields`
	// BEIDE Richtungen, und damit ist die Menge nie leer — der Schnellpfad war
	// ab da toter Code, der in dieser Datei wie eine begründete Entscheidung
	// gelesen worden wäre.
	return formStepsConfig.map((step) => ({
		...step,
		fields: step.fields.filter((field) => !hidden.has(field))
	}));
}

/**
 * Die Felder, die im übergebenen Zustand nicht bedienbar sind — alle Achsen
 * aus `getFormSteps` an einer Stelle, damit niemand sie ein zweites Mal
 * ausschreibt. Eine neue Achse gehört hierher, nicht in `getFormSteps`.
 *
 * `getFormSteps` beantwortet „welche Felder validiert dieser Schritt", und das
 * ist für die Schritt-Navigation genau richtig. Für die Vorab-Prüfung beim
 * Absenden (`ModernReportForm.handleFinalSubmit`) reicht es nicht: Die prüft
 * gegen das ganze Schema, also auch gegen Felder, die in KEINEM Schritt stehen
 * (`referenceId`, `entryChannel`, `weatherData.*`). Aus den Schritt-Feldern
 * eine Positivliste zu bauen, würde die stillschweigend mit ausschließen; das
 * Komplement ist deshalb die richtige Größe — es nimmt genau das weg, was der
 * Melder im aktuellen Zweig nicht sieht, und lässt alles andere in Kraft.
 *
 * Ohne Duplikate: `reaction` steht in `HIDDEN_WHEN_DEAD` UND in
 * `HIDDEN_WHEN_FROM_LAND` — ein Totfund von Land trifft beide Bedingungen.
 *
 * Der Zweig beantwortet BEIDE Richtungen (`else`-Zweig), die Menge ist deshalb
 * nie leer — siehe die Notiz zum entfallenen Schnellpfad in `getFormSteps`.
 */
export function hiddenFormFields(data: FormStepsInput): Array<keyof SightingFormData> {
	const hidden = new Set<keyof SightingFormData>();
	if (isDeadFinding(data.isDead)) {
		HIDDEN_WHEN_DEAD.forEach((field) => hidden.add(field));
	} else {
		HIDDEN_WHEN_ALIVE.forEach((field) => hidden.add(field));
	}
	if (isFromLand(data.sightingFrom)) {
		HIDDEN_WHEN_FROM_LAND.forEach((field) => hidden.add(field));
	}
	if (!hasUploadedMedia(data.uploadedFiles)) {
		hidden.add('mediaConsent');
	}
	return [...hidden];
}
