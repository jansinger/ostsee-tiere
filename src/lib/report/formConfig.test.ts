import { describe, expect, it } from 'vitest';
import type * as yup from 'yup';
import { SightingFromEnum } from './formOptions/sightingFrom';
import {
	formStepsConfig,
	getFormSteps,
	getSightingSchemaFields,
	hiddenFormFields,
	type FormStepsInput
} from './formConfig';
import { getSightingSchema } from '#lib/form/validation/sightingSchema.ts';

// Testet weiterhin den deutschen Ist-Zustand (Default-Locale) — unveraendert
// gegenueber der frueheren Modulkonstante.
const sightingSchemaFields = getSightingSchemaFields();
const sightingSchema = getSightingSchema();
import type { SightingFormData } from './types';
import type { UploadedFileInfo } from '#lib/types/index.ts';

/**
 * Ein abgeschlossen hochgeladenes File, wie es `$form.uploadedFiles`
 * (dieselbe Größe, die `getFormSteps` seit Task 15 (Review-Befund 1, zweite
 * Runde) direkt entgegennimmt) nach einem erfolgreichen Upload enthält.
 */
const UPLOADED_FILE: UploadedFileInfo = {
	uid: 'uid-1',
	filePath: 'ref-1/uid-1.jpg',
	originalName: 'foto.jpg',
	fileName: 'uid-1.jpg',
	mimeType: 'image/jpeg',
	size: 1234
} as UploadedFileInfo;

/**
 * Die Ortsbeschreibung im **Meldeformular** ist seit dem Wunsch des Deutschen
 * Meeresmuseums (A2.4) genau ein Freitextfeld: `waterway`. `seaMark` ist nur aus
 * dem Melde-Schritt genommen — Schema-Eintrag und DB-Spalte `seezeichen` bleiben,
 * weil die Admin-Maske (`sections/Location.svelte`) den Altbestand weiter
 * anzeigen und korrigieren können muss und die Legacy-API `seezeichen` weiterhin
 * entgegennimmt.
 *
 * Die Tests hier halten beide Hälften zusammen: Was aus dem Schritt verschwindet,
 * darf nicht aus dem Schema verschwinden.
 */
const step1Fields = formStepsConfig[0]?.fields ?? [];

function describeField(name: string): yup.SchemaDescription {
	const field = sightingSchemaFields[name] as yup.SchemaDescription | undefined;
	if (!field) throw new Error(`Feld "${name}" fehlt im Schema`);
	return field;
}

function meta(name: string): Record<string, unknown> {
	return (describeField(name).meta ?? {}) as Record<string, unknown>;
}

describe('formStepsConfig — Ortsbeschreibung in Schritt 1', () => {
	it('führt waterway als Feld des Melde-Schritts', () => {
		expect(step1Fields).toContain('waterway');
	});

	// Über ALLE Schritte geprüft, nicht nur über Schritt 1: Ein Feld, das aus dem
	// Melde-Schritt genommen und versehentlich anderswo einsortiert wird, wäre
	// weiterhin im Formular — nur an der falschen Stelle.
	it('führt seaMark in keinem Schritt mehr', () => {
		expect(formStepsConfig.flatMap((step) => step.fields)).not.toContain('seaMark');
	});
});

describe('sightingSchema — seaMark bleibt erhalten', () => {
	it('kennt seaMark weiterhin, damit Admin-Maske und Legacy-API es schreiben können', () => {
		expect(sightingSchemaFields.seaMark).toBeDefined();
	});

	it('hält seaMark bedienbar: Label und Feld-Meta bleiben gepflegt', () => {
		// Ohne `meta` wirft `FormField` — die Admin-Maske könnte das Feld dann
		// nicht mehr rendern, und der Altbestand wäre nicht korrigierbar.
		expect(meta('seaMark')).not.toEqual({});
	});

	/**
	 * `seaMark` steht nur noch in der Admin-Maske — dort direkt unter `waterway`,
	 * dessen Hilfetext ebenfalls Orientierungspunkte nennt. Ohne einen Hinweis auf
	 * den Altbestand beanspruchen beide Felder sichtbar dasselbe, und wer den
	 * Datensatz korrigiert, weiß nicht, in welches der beiden er schreiben soll.
	 */
	it('weist seaMark als Altbestands-Feld aus', () => {
		const copy = [describeField('seaMark').label, meta('seaMark').helpText].join(' ').toLowerCase();

		expect(copy).toContain('altbestand');
	});
});

/**
 * Der Wortlaut muss **beide** bisherigen Felder abdecken. Fiele er auf die alte
 * Fahrwasser-Beschriftung zurück, verlöre das zusammengelegte Feld genau den
 * Aspekt, für den `seaMark` da war — die Orientierungspunkte.
 */
/**
 * `distribution` (Verteilung der Tiere) bleibt nur in der Admin-Maske —
 * `sections/OptionalSightingDetails.svelte` zeigt das Feld dort ausschließlich
 * hinter `adminMode` (wie schon `shipCount`). Schema-Eintrag, DB-Spalte
 * (`verteilung`) und `formOptions/distribution.ts` bleiben unverändert; hier
 * wird nur geprüft, dass der Melde-Schritt das Feld nicht mehr führt.
 */
describe('formStepsConfig — Verteilung nur in der Admin-Maske', () => {
	const observationsStep = formStepsConfig.find((step) => step.id === 'observations');

	it('führt distribution nicht mehr im Schritt "observations"', () => {
		expect(observationsStep?.fields).not.toContain('distribution');
	});

	it('führt distributionText nicht mehr im Schritt "observations"', () => {
		expect(observationsStep?.fields).not.toContain('distributionText');
	});
});

/**
 * `deadSex` (Geschlecht beim Totfund) bleibt nur in der Admin-Maske —
 * `sections/DeadAnimal.svelte` zeigt das Feld dort ausschließlich hinter
 * `adminMode` (PR 2, Teil b — Analyse-Punkt C4, Museum am 2026-08-04
 * abbestellt). Schema-Eintrag, DB-Spalte (`totfund_geschlecht`) und
 * `formOptions/sex.ts` bleiben unverändert; hier wird nur geprüft, dass der
 * Melde-Schritt "sighting-details" das Feld nicht mehr führt.
 */
describe('formStepsConfig — Geschlecht beim Totfund nur in der Admin-Maske', () => {
	const sightingDetailsStep = formStepsConfig.find((step) => step.id === 'sighting-details');

	it('führt deadSex nicht mehr im Schritt "sighting-details"', () => {
		expect(sightingDetailsStep?.fields).not.toContain('deadSex');
	});

	// Gegenprobe: Nur `deadSex` verschwindet aus der Schritt-Konfiguration, die
	// übrigen Totfund-Felder bleiben Teil des Melde-Schritts. `isDead` steht
	// hier NICHT mehr — Task 7 nimmt es ebenfalls heraus, siehe die eigene
	// Beschreibung unten.
	//
	// Geprüft wird `formStepsConfig`, also der ungefilterte Bestand: Ob die drei
	// Felder im konkreten Zweig auch validiert werden, entscheidet seit
	// `HIDDEN_WHEN_ALIVE` erst `getFormSteps` — dazu die eigene Beschreibung
	// „getFormSteps — Totfund-Felder nur im Totfund-Zweig" weiter unten. Der
	// Unterschied ist der springende Punkt dieser Gegenprobe: `deadSex` ist
	// dauerhaft draußen, die drei hier nur zweigabhängig.
	it.each(['deadCondition', 'deadSize', 'deadPhoneContact'])(
		'behält %s im Schritt "sighting-details"',
		(name) => {
			expect(sightingDetailsStep?.fields).toContain(name);
		}
	);

	it('kennt deadSex im Schema weiterhin, damit die Admin-Maske es schreiben kann', () => {
		expect(sightingSchemaFields.deadSex).toBeDefined();
	});
});

/**
 * `isDead` (der Totfund-Schalter) bleibt nur in der Admin-Maske —
 * `sections/AnimalInfo.svelte` zeigt das Feld dort ausschließlich hinter
 * `adminMode`, im Meldeformular tritt eine Rückmeldung an seine Stelle
 * (Task 7). Grund: Die Einstiegsseite „Was möchten Sie melden?" beantwortet
 * Sichtung/Totfund bereits vor dem Formular; ein zweiter Schalter auf
 * Schritt 2 könnte dieselbe Frage abweichend beantworten. Schema-Eintrag und
 * DB-Spalte (`totfund`) bleiben unverändert; hier wird nur geprüft, dass der
 * Melde-Schritt "sighting-details" das Feld nicht mehr führt.
 */
describe('formStepsConfig — Totfund-Schalter nur in der Admin-Maske (Task 7)', () => {
	const sightingDetailsStep = formStepsConfig.find((step) => step.id === 'sighting-details');

	it('führt isDead nicht mehr im Schritt "sighting-details"', () => {
		expect(sightingDetailsStep?.fields).not.toContain('isDead');
	});

	it('kennt isDead im Schema weiterhin, damit die Admin-Maske es schreiben kann', () => {
		expect(sightingSchemaFields.isDead).toBeDefined();
	});
});

/**
 * `boatDriveText` (Beschreibung eines "sonstigen" Antriebs) hängt an
 * `BoatDriveEnum.OTHER`, das im Meldeformular nach PR 4 (Museum, 2026-08-04)
 * nicht mehr wählbar ist — dort gibt es nur noch "Motor an" (`MOTOR = 1`) und
 * "Motor aus" (`MOTOR_OFF = 6`). Schema-Eintrag und DB-Spalte bleiben
 * unverändert — die Admin-Maske zeigt weiterhin den vollen Bootsantrieb
 * inklusive `boatDriveText`; hier wird nur geprüft, dass der Melde-Schritt
 * "sighting-details" das Feld nicht mehr führt.
 */
describe('formStepsConfig — boatDriveText nur in der Admin-Maske (PR 4)', () => {
	const sightingDetailsStep = formStepsConfig.find((step) => step.id === 'sighting-details');

	it('führt boatDriveText nicht mehr im Schritt "sighting-details"', () => {
		expect(sightingDetailsStep?.fields).not.toContain('boatDriveText');
	});

	it('behält boatDrive im Schritt "sighting-details" — nur die Textbeschreibung entfällt', () => {
		expect(sightingDetailsStep?.fields).toContain('boatDrive');
	});

	it('kennt boatDriveText im Schema weiterhin, damit die Admin-Maske es schreiben kann', () => {
		expect(sightingSchemaFields.boatDriveText).toBeDefined();
	});
});

/**
 * Der Medien-UPLOAD (die Datei-Felder) steht seit dem 2026-08-04 auf Schritt 2
 * (Wunsch des Museums: „Foto hochladen als erste Abfrage noch vor
 * Tierinformation"). Die Medien-EINWILLIGUNG (`mediaConsent`) ist seit Task 14
 * (2026-08-05) davon getrennt und steht auf Schritt 4 bei den übrigen
 * Einwilligungen — eigene Tests weiter unten
 * ("Einwilligungen stehen zusammen auf Schritt 4").
 *
 * Der Grund für die Position der Datei-Felder wiegt schwerer als die
 * Reihenfolge: Schritt 3 trägt ganz oben einen prominenten „Schritt
 * überspringen"-Knopf, der direkt zu den Kontaktdaten springt — der Upload
 * stand darunter. Wer den Knopf nutzte, bekam die Foto-Frage nie zu sehen,
 * obwohl Aufnahmen die wertvollste Einzelangabe der Meldung sind. Schritt 2
 * ist Pflichtschritt und nicht überspringbar.
 *
 * Geprüft wird die Zuordnung in `formStepsConfig`, nicht nur das Markup: An ihr
 * hängen Schritt-Validierung (`validateStep`) und Fehler-Navigation
 * (`findStepForErrors`). Stünde das Feld im Markup auf Schritt 2, in der Config
 * aber auf Schritt 3, spränge die Fehlernavigation auf den falschen Schritt.
 */
describe('formStepsConfig — Medien-Upload auf Schritt 2', () => {
	const sightingDetailsStep = formStepsConfig.find((step) => step.id === 'sighting-details');
	const observationsStep = formStepsConfig.find((step) => step.id === 'observations');

	it.each(['mediaFile', 'mediaUpload'])('führt %s im Schritt "sighting-details"', (name) => {
		expect(sightingDetailsStep?.fields).toContain(name);
	});

	it.each(['mediaFile', 'mediaUpload'])('führt %s nicht mehr im Schritt "observations"', (name) => {
		expect(observationsStep?.fields).not.toContain(name);
	});

	// Der Upload steht VOR den Tierangaben: Wer unsicher ist, welche Art er
	// gesehen hat, soll das Bild hochladen können, statt zu raten. Die
	// Reihenfolge im Markup prüft `Step2SightingDetails.svelte.test.ts`; hier
	// zählt, dass die Config dieselbe Geschichte erzählt — sie bestimmt die
	// Reihenfolge, in der `scrollToFirstError` Felder abläuft. (Nicht
	// `findStepForErrors` — das liest nur die Zugehörigkeit zum Schritt, wie
	// im Block „Umweltfelder in Render-Reihenfolge" unten ausgeführt.)
	it('listet die Medien-Dateifelder vor species', () => {
		const fields = sightingDetailsStep?.fields ?? [];
		const mediaIndex = fields.indexOf('mediaFile');
		const speciesIndex = fields.indexOf('species');

		// Beide Fundstellen ausdrücklich absichern: `indexOf` liefert für ein
		// fehlendes Feld -1, und -1 ist kleiner als jeder gültige Index — der
		// Vergleich allein liefe grün durch, gerade wenn das Feld ganz fehlt.
		expect(mediaIndex).toBeGreaterThanOrEqual(0);
		expect(speciesIndex).toBeGreaterThanOrEqual(0);
		expect(mediaIndex).toBeLessThan(speciesIndex);
	});
});

/**
 * Task 14: `mediaConsent` steht seit dem 2026-08-05 nicht mehr bei der
 * Dropzone auf Schritt 2, sondern auf Schritt 4 bei den übrigen drei
 * Nachweis-Einwilligungen (`nameConsent`, `shipNameConsent`,
 * `privacyConsent`). Alle vier tragen Nachweisspalten (`…_am`/`…_version`
 * in `schema.ts`) und sollen an einer Stelle im Formular stehen.
 */
describe('Einwilligungen stehen zusammen auf Schritt 4', () => {
	it('führt mediaConsent nicht mehr bei den Tierangaben', () => {
		const steps = getFormSteps({ isDead: false });
		const schrittZwei = steps.find((s) => s.id === 'sighting-details');
		expect(schrittZwei?.fields).not.toContain('mediaConsent');
	});

	// Braucht eine vorliegende Aufnahme (Task 15) — sonst blendet `getFormSteps`
	// `mediaConsent` aus, und dieser Test prüft die Position, nicht das
	// Ausblenden selbst (das steht in „mediaConsent ohne Aufnahme" unten).
	it('führt mediaConsent bei den Kontaktdaten', () => {
		const steps = getFormSteps({ isDead: false, uploadedFiles: [UPLOADED_FILE] });
		const schrittVier = steps.find((s) => s.id === 'contact');
		expect(schrittVier?.fields).toContain('mediaConsent');
	});

	it('lässt die Datei-Felder auf Schritt 2 stehen', () => {
		// Nur die Einwilligung zieht um. Der Upload bleibt, wo das Museum ihn
		// am 2026-08-04 haben wollte — vor den Tierangaben.
		const schrittZwei = getFormSteps({ isDead: false }).find((s) => s.id === 'sighting-details');
		expect(schrittZwei?.fields).toEqual(expect.arrayContaining(['mediaFile', 'mediaUpload']));
	});

	it('hält alle vier Nachweis-Einwilligungen auf demselben Schritt', () => {
		const schrittVier = getFormSteps({ isDead: false, uploadedFiles: [UPLOADED_FILE] }).find(
			(s) => s.id === 'contact'
		);
		expect(schrittVier?.fields).toEqual(
			expect.arrayContaining(['nameConsent', 'shipNameConsent', 'mediaConsent', 'privacyConsent'])
		);
	});
});

/**
 * Task 15: `mediaConsent` fragt nach der Freigabe von Aufnahmen. Ohne
 * mindestens eine vorliegende Aufnahme ist das eine Frage ohne
 * Bezugsgegenstand — dieselbe Fehlerklasse wie `shipNameConsent` bei einer
 * Land-Meldung (siehe „getFormSteps mit Beobachtungsort" unten).
 *
 * Review-Befund 1 (zweite Runde, 2026-08-06): Eine frühere Fassung übergab
 * dafür ein separates `hasMedia`-Flag — das keine Aufrufstelle je gesetzt
 * hat. `stepValidation.ts` ruft `getFormSteps(formData)` mit dem echten
 * (Partial-)Formularobjekt auf, das kein `hasMedia` kennt, nur
 * `uploadedFiles`. Die Tests hier rufen `getFormSteps` deshalb genau in DER
 * Form auf, in der die Validierung es tatsächlich tut: mit `uploadedFiles`
 * im übergebenen Objekt — dieselbe Größe, die auch `$form.uploadedFiles`
 * trägt, nicht ein zusätzliches, separat zu pflegendes Flag.
 */
describe('mediaConsent ohne Aufnahme', () => {
	const fieldsOf = (steps: ReturnType<typeof getFormSteps>) => steps.flatMap((s) => s.fields);

	it('erscheint nicht, solange getFormSteps mit leeren uploadedFiles aufgerufen wird — die tatsächliche Aufrufform aus stepValidation.ts', () => {
		const fields = fieldsOf(getFormSteps({ isDead: false, uploadedFiles: [] }));
		expect(fields).not.toContain('mediaConsent');
	});

	it('erscheint, sobald uploadedFiles mindestens eine abgeschlossen hochgeladene Datei enthält', () => {
		const fields = fieldsOf(getFormSteps({ isDead: false, uploadedFiles: [UPLOADED_FILE] }));
		expect(fields).toContain('mediaConsent');
	});

	// Anders als `sightingFrom`/`isDead` gibt es hier keinen praktischen
	// Aufrufer, der den Medienstand tatsächlich nicht kennt (Admin-Maske ruft
	// `getFormSteps` nicht auf) — ein fehlendes `uploadedFiles` verhält sich
	// deshalb wie eine leere Liste: kein Nachweis einer Aufnahme, Feld bleibt
	// ausgeblendet. Genau das ist der sichere Default: Ein zukünftiger
	// Aufrufer, der das Feld schlicht wegließe, zeigt `mediaConsent` nie
	// versehentlich sichtbar UND unvalidiert.
	it('bleibt ausgeblendet, wenn uploadedFiles gar nicht im übergebenen Objekt steht', () => {
		const fields = fieldsOf(getFormSteps({ isDead: false }));
		expect(fields).not.toContain('mediaConsent');
	});

	it('blendet ohne Aufnahme keinen anderen Consent mit aus', () => {
		const fields = fieldsOf(getFormSteps({ isDead: false, uploadedFiles: [] }));
		expect(fields).toEqual(
			expect.arrayContaining([
				'nameConsent',
				'shipNameConsent',
				'privacyConsent',
				'persistentDataConsent'
			])
		);
	});

	it('lässt die Datei-Felder auf Schritt 2 stehen, unabhängig von uploadedFiles', () => {
		// Nur die Einwilligung reagiert auf den Medienstand. Der Upload-Einstieg
		// selbst bleibt sichtbar — sonst könnte man nie eine erste Aufnahme
		// hinzufügen.
		const schrittZwei = getFormSteps({ isDead: false, uploadedFiles: [] }).find(
			(s) => s.id === 'sighting-details'
		);
		expect(schrittZwei?.fields).toEqual(expect.arrayContaining(['mediaFile', 'mediaUpload']));
	});
});

describe('waterway — Beschriftung deckt beide bisherigen Felder ab', () => {
	const waterwayMeta = meta('waterway');
	const copy = [describeField('waterway').label, waterwayMeta.helpText, waterwayMeta.placeholder]
		.join(' ')
		.toLowerCase();

	it('nennt das Seegebiet', () => {
		expect(copy).toContain('seegebiet');
	});

	it('nennt das Fahrwasser', () => {
		expect(copy).toContain('fahrwasser');
	});

	it('nennt Orientierungspunkte — den Aspekt des entfallenen Seezeichen-Feldes', () => {
		expect(copy).toContain('orientierungspunkt');
	});

	it('bietet im Platzhalter ein Beispiel für einen Orientierungspunkt', () => {
		expect(String(waterwayMeta.placeholder).toLowerCase()).toContain('leuchtturm');
	});
});

describe('getFormSteps', () => {
	const fieldsOf = (steps: ReturnType<typeof getFormSteps>) => steps.flatMap((s) => s.fields);

	it('behält für den Lebend-Zweig alle bisherigen Felder', () => {
		const fields = fieldsOf(getFormSteps({ isDead: false }));
		expect(fields).toContain('behavior');
		expect(fields).toContain('behaviorText');
		expect(fields).toContain('reaction');
	});

	it('entfernt beim Totfund genau die drei Verhaltensfelder', () => {
		const fields = fieldsOf(getFormSteps({ isDead: true }));
		expect(fields).not.toContain('behavior');
		expect(fields).not.toContain('behaviorText');
		expect(fields).not.toContain('reaction');
	});

	/**
	 * Gegenrichtung zu `HIDDEN_WHEN_DEAD`: Ein lebendes Tier hat keinen
	 * Verwesungszustand und keine Bergungslänge. Die drei Felder waren bis
	 * hierher NUR im Markup ausgeblendet (`AnimalInfo.svelte`, `{#if
	 * isDeadFinding($form.isDead)}`) und blieben im Lebend-Zweig trotzdem
	 * validiert — genau die Hälfte-ohne-die-andere, vor der die Kopfkommentare
	 * von `HIDDEN_WHEN_DEAD`/`HIDDEN_WHEN_FROM_LAND` warnen. Praktisch spürbar
	 * wurde das bei `deadSize`: Dessen `min(0)`/`max(300)`/`integer()` hängen
	 * NICHT an `isDead` und hätten „Weiter" auf Schritt 2 wegen eines Feldes
	 * gesperrt, das der Melder im Lebend-Zweig nicht sehen und nicht
	 * korrigieren kann.
	 */
	it('entfernt im Lebend-Zweig genau die drei Totfund-Felder', () => {
		const fields = fieldsOf(getFormSteps({ isDead: false }));
		expect(fields).not.toContain('deadCondition');
		expect(fields).not.toContain('deadSize');
		expect(fields).not.toContain('deadPhoneContact');
	});

	it('behält die drei Totfund-Felder beim Totfund', () => {
		const fields = fieldsOf(getFormSteps({ isDead: true }));
		expect(fields).toEqual(
			expect.arrayContaining(['deadCondition', 'deadSize', 'deadPhoneContact'])
		);
	});

	// Wie bei den Verhaltensfeldern: Der Zweig kommt auch als DB-Zahl oder
	// Storage-String an. Ein `'1'` darf die Totfund-Felder nicht wegräumen.
	it('behält die Totfund-Felder auch bei isDead als Zahl oder String', () => {
		expect(fieldsOf(getFormSteps({ isDead: 1 }))).toContain('deadCondition');
		expect(fieldsOf(getFormSteps({ isDead: '1' }))).toContain('deadCondition');
		expect(fieldsOf(getFormSteps({ isDead: 0 }))).not.toContain('deadCondition');
	});

	it('lässt beim Totfund Wetter und die Anzahl anderer Schiffe stehen', () => {
		// Achse C der Spezifikation: Diese Felder hängen nicht am Zustand des
		// Tieres. `shipCount` fragt nach ANDEREN Schiffen — Störungskontext, der
		// auch am Fundort gilt.
		const fields = fieldsOf(getFormSteps({ isDead: true }));
		expect(fields).toEqual(
			expect.arrayContaining(['seaState', 'visibility', 'windForce', 'shipCount'])
		);
	});

	/**
	 * UX-Review 2026-08-07: „Entfernung zum Tier" war auch beim Totfund
	 * Pflichtfeld — an einem Strandfund steht der Melder aber neben dem Tier.
	 * Die Frage ist dort nicht bloß entbehrlich, sie ist unbeantwortbar, und
	 * `distance` ist im Meldeformular Pflicht: Sie sperrte „Weiter", bis
	 * irgendeine Kategorie geraten war.
	 */
	it('entfernt die Entfernung beim Totfund, behält sie im Lebend-Zweig', () => {
		expect(fieldsOf(getFormSteps({ isDead: true }))).not.toContain('distance');
		expect(fieldsOf(getFormSteps({ isDead: false }))).toContain('distance');
	});

	it('behält in beiden Zweigen vier Schritte — kein Schritt wird leer', () => {
		for (const isDead of [false, true]) {
			const steps = getFormSteps({ isDead });
			expect(steps).toHaveLength(4);
			for (const step of steps) {
				expect(step.fields.length).toBeGreaterThan(0);
			}
		}
	});

	it('nimmt isDead auch als Zahl oder String entgegen', () => {
		// Aus dem localStorage und der Legacy-API kommt `isDead` nicht immer als
		// Boolean zurück.
		expect(fieldsOf(getFormSteps({ isDead: 1 }))).not.toContain('behavior');
		expect(fieldsOf(getFormSteps({ isDead: '1' }))).not.toContain('behavior');
		expect(fieldsOf(getFormSteps({ isDead: 0 }))).toContain('behavior');
	});
});

/**
 * Task 11: Felder zum eigenen Wasserfahrzeug entfallen, wenn ausdrücklich von
 * Land gemeldet wird. `sightingFrom` ist `integer default(0) notNull`, und `0`
 * bedeutet gleichzeitig „noch nicht beantwortet" UND „Sonstiges" (Kajak, SUP,
 * Seebrücke — 1.893 Zeilen im Bestand) — nur `LAND` ist eine eindeutige Aussage.
 */
describe('getFormSteps mit Beobachtungsort', () => {
	const fieldsOf = (steps: ReturnType<typeof getFormSteps>) => steps.flatMap((s) => s.fields);

	it('blendet die Felder zum eigenen Boot aus, wenn von Land gemeldet wird', () => {
		const fields = fieldsOf(getFormSteps({ isDead: false, sightingFrom: SightingFromEnum.LAND }));
		for (const feld of ['boatDrive', 'boatType', 'shipName', 'homePort', 'reaction']) {
			expect(fields).not.toContain(feld);
		}
	});

	it('blendet die Einwilligung zum Schiffsnamen mit aus', () => {
		// Sonst fragt Schritt 4 nach der Freigabe für einen Schiffsnamen, den
		// nie jemand erhoben hat.
		const fields = fieldsOf(getFormSteps({ isDead: false, sightingFrom: SightingFromEnum.LAND }));
		expect(fields).not.toContain('shipNameConsent');
	});

	it('lässt Anzahl anderer Schiffe und Entfernung auch bei Land stehen', () => {
		// `shipCount` fragt nach ANDEREN Schiffen — Störungskontext, von Land
		// aus genauso beobachtbar. `distance` ist auch vom Strand sinnvoll.
		const fields = fieldsOf(getFormSteps({ isDead: false, sightingFrom: SightingFromEnum.LAND }));
		expect(fields).toContain('shipCount');
		expect(fields).toContain('distance');
	});

	it('zeigt die Bootsfelder bei „Sonstiges" — und vor der Beantwortung', () => {
		// `sightingFrom` ist `default(0)`, und 0 heißt gleichzeitig „noch nicht
		// beantwortet" UND „Sonstiges" (Kajak, SUP, Seebrücke — 1.893 Zeilen im
		// Bestand). Nur LAND ist eine eindeutige Aussage.
		for (const von of [SightingFromEnum.OTHER, undefined, null]) {
			const fields = fieldsOf(getFormSteps({ isDead: false, sightingFrom: von }));
			expect(fields).toContain('boatDrive');
			expect(fields).toContain('shipName');
		}
	});

	it('verknüpft beide Achsen, statt sie gegeneinander zu setzen', () => {
		// `reaction` entfällt beim Totfund UND bei Land — eine Bedingung darf
		// die andere nicht überschreiben.
		const totUndLand = fieldsOf(
			getFormSteps({ isDead: true, sightingFrom: SightingFromEnum.LAND })
		);
		expect(totUndLand).not.toContain('reaction');
		expect(totUndLand).not.toContain('behavior');
		expect(totUndLand).not.toContain('shipName');
		// und die vier Felder, die bleiben müssen:
		expect(totUndLand).toEqual(
			expect.arrayContaining(['shipCount', 'seaState', 'visibility', 'windForce'])
		);
	});

	it('behält auch in der knappsten Kombination vier nicht-leere Schritte', () => {
		const steps = getFormSteps({ isDead: true, sightingFrom: SightingFromEnum.LAND });
		expect(steps).toHaveLength(4);
		for (const step of steps) {
			expect(step.fields.length).toBeGreaterThan(0);
		}
	});
});

/**
 * `shipCount` zog mit Task 12 aus „Boot-/Schiffsinformationen" in die Karte
 * „Umweltbedingungen" — fachlich richtig, es ist Störungskontext wie Seegang
 * und Sichtweite. Es landete dabei aber an der ERSTEN Stelle der Karte, direkt
 * unter dem Satz „Sobald Position und Datum gesetzt sind, werden Wetterdaten
 * automatisch vorgeschlagen." — als einziges Feld, das der Wetter-Abruf nie
 * füllt. Es steht deshalb jetzt hinter `windForce`.
 *
 * Diese Liste ist dabei nicht kosmetisch: `scrollToFirstError`
 * (`#lib/utils/fieldNavigation.js`) läuft sie ab, um zum ersten fehlerhaften Feld
 * zu springen — `StepNavigation.svelte` baut das `fieldOrder`-Argument aus
 * genau dieser Config. Weicht sie von der Render-Reihenfolge ab, springt die
 * Navigation an ein anderes Feld als das oberste sichtbare. `findStepForErrors`
 * ist davon NICHT betroffen: es prüft mit `fields.includes(...)` nur die
 * Zugehörigkeit zum Schritt und ist gegenüber der Position darin unempfindlich.
 *
 * Die Render-Reihenfolge selbst prüft `Environment.svelte.test.ts`.
 */
describe('formStepsConfig — Umweltfelder in Render-Reihenfolge', () => {
	const observationsStep = formStepsConfig.find((step) => step.id === 'observations');

	// Ein `toEqual` auf die gefilterte Liste statt zweier Index-Vergleiche: Es
	// belegt Vorhandensein UND Reihenfolge in einem. Fehlt ein Feld ganz, ist
	// die gefilterte Liste kürzer und der Vergleich schlägt fehl — die sonst
	// nötigen `indexOf`-Wächter gegen die stille -1 erübrigen sich damit.
	it('führt die Umweltfelder in der Reihenfolge der Karte', () => {
		const fields = observationsStep?.fields ?? [];
		const umwelt = ['seaState', 'visibility', 'windForce', 'shipCount'];

		expect(fields.filter((name) => umwelt.includes(name))).toEqual(umwelt);
	});
});

/**
 * Der Vertrag zwischen dem Absende-Rand und dem Server.
 *
 * `ModernReportForm.onSubmit` entfernt `hiddenFormFields(values)` aus dem
 * Objekt, das an `POST /api/sightings` geht — ausgeblendet heißt: nicht Teil
 * dieser Meldung. Der Endpunkt validiert die Nutzlast danach gegen das
 * **volle** `sightingSchema` (`src/routes/api/sightings/+server.ts`, Schritt 3).
 * Ein Feld, das der Client weglässt und der Server verlangt, wäre damit eine
 * Ablehnung, die kein Melder auflösen kann — sein Formular ist ja vollständig.
 *
 * Die Unit-Tests am Formular sehen das nicht: Sie mocken `submitSightingForm`.
 * Die E2E-Tests ebenfalls nicht: `form-from-land.spec.ts` und
 * `form-submit.spec.ts` fangen die Route mit `page.route` ab, um die Nutzlast
 * zu lesen. Die Naht wird deshalb hier geprüft — dort, wo die Auslassung
 * entsteht.
 *
 * Geprüft wird jede Achse einzeln, damit ein Fehlschlag benennt, welche
 * Auslassung der Server nicht verträgt.
 */
describe('hiddenFormFields — der Server akzeptiert, was der Client weglässt', () => {
	/** Vollständige, in jedem Zweig gültige Meldung. */
	const baseReport = {
		referenceId: 'ref-vertrag',
		entryChannel: 0,
		firstName: 'Max',
		lastName: 'Mustermann',
		email: 'max@example.com',
		species: 0,
		totalCount: 1,
		distance: 1,
		shipCount: 2,
		hasPosition: true,
		latitude: 54.5,
		longitude: 13.5,
		sightingDate: '2024-01-15',
		privacyConsent: true
	};

	async function expectServerAccepts(report: Record<string, unknown>): Promise<void> {
		const hidden = hiddenFormFields(report as FormStepsInput);
		const sent = Object.fromEntries(
			Object.entries(report).filter(([key]) => !hidden.includes(key as keyof SightingFormData))
		);

		// Dieselbe Prüfung wie im Endpunkt: volles Schema, alle Fehler sammeln.
		await expect(sightingSchema.validate(sent, { abortEarly: false })).resolves.toBeDefined();
	}

	it('Lebend-Meldung von Land — ohne Bootsangaben, `reaction` und die Totfund-Felder', async () => {
		await expectServerAccepts({
			...baseReport,
			isDead: false,
			sightingFrom: SightingFromEnum.LAND,
			boatDrive: 1,
			shipName: 'MS Seelöwe',
			homePort: 'Kiel',
			boatType: 'Segelboot',
			shipNameConsent: true,
			reaction: 'neugierig genähert',
			deadCondition: 2,
			deadSize: 150,
			deadPhoneContact: true
		});
	});

	/**
	 * Der teuerste Teil des Entfernungs-Befunds: `distance` ist im vollen
	 * `sightingSchema` `.required()`. Ein Feld aus dem Totfund-Zweig zu nehmen
	 * heißt deshalb zwingend, seine Pflicht im Schema an denselben Zweig zu
	 * binden — sonst lehnt der Endpunkt jede Totfund-Meldung mit „Bitte geben
	 * Sie eine Entfernung an." ab, und zwar an einem Feld, das der Melder gar
	 * nicht mehr sieht. Genau derselbe Zwang stand 2026-08-04 schon bei
	 * `deadSex` (Kommentar im Schema).
	 */
	it('Totfund ohne jede Entfernungsangabe', async () => {
		const { distance: _weggelassen, ...ohneEntfernung } = baseReport;
		await expectServerAccepts({
			...ohneEntfernung,
			isDead: true,
			deadCondition: 2,
			sightingFrom: SightingFromEnum.LAND
		});
	});

	/**
	 * Die Gegenprobe dazu: Im Lebend-Zweig bleibt die Entfernung Pflicht — sonst
	 * hätte die Lockerung oben das Feld für ALLE Meldungen entwertet, und der
	 * Lebend-Weg darf sich nicht ändern.
	 */
	it('verlangt die Entfernung im Lebend-Zweig unverändert', async () => {
		const { distance: _weggelassen, ...ohneEntfernung } = baseReport;
		await expect(
			sightingSchema.validate(
				{ ...ohneEntfernung, isDead: false, sightingFrom: SightingFromEnum.LAND },
				{ abortEarly: false }
			)
		).rejects.toThrow(/Entfernung/);
	});

	it('Totfund vom Segelboot — ohne die Verhaltensfelder', async () => {
		await expectServerAccepts({
			...baseReport,
			isDead: true,
			deadCondition: 2,
			sightingFrom: SightingFromEnum.SAILBOAT,
			boatDrive: 1,
			behavior: 3,
			behaviorText: 'ruhiges Schwimmen',
			reaction: 'neugierig genähert'
		});
	});

	it('Lebend-Meldung vom Segelboot — ohne die Totfund-Felder, Bootsangaben bleiben', async () => {
		await expectServerAccepts({
			...baseReport,
			isDead: false,
			sightingFrom: SightingFromEnum.SAILBOAT,
			boatDrive: 1,
			shipName: 'MS Seelöwe',
			deadCondition: 2,
			deadSize: 150,
			deadPhoneContact: true
		});
	});

	/**
	 * Ohne Aufnahme entfällt `mediaConsent` — die einzige Achse, die weder am
	 * Zweig noch am Beobachtungsort hängt.
	 */
	it('Meldung ohne Aufnahme — ohne `mediaConsent`', async () => {
		await expectServerAccepts({
			...baseReport,
			isDead: false,
			sightingFrom: SightingFromEnum.LAND,
			mediaConsent: true
		});
	});

	/**
	 * Gegenprobe. Ohne sie belegten die vier Tests oben nur, dass
	 * `sightingSchema.validate` irgendetwas durchlässt — nicht, dass es die
	 * Auslassungen des Clients verträgt. Geprüft wird an einem Feld, das die
	 * Auslassungsregel NIE anfasst: `privacyConsent` steht in keiner der
	 * `HIDDEN_*`-Listen und ist unbedingt Pflicht.
	 */
	it('lehnt dagegen ab, wenn ein wirklich verlangtes Feld fehlt', async () => {
		const { privacyConsent, ...ohneEinwilligung } = {
			...baseReport,
			isDead: false,
			sightingFrom: SightingFromEnum.LAND
		};
		void privacyConsent;

		await expect(
			sightingSchema.validate(ohneEinwilligung, { abortEarly: false })
		).rejects.toThrow();
	});
});
