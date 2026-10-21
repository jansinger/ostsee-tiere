import { describe, expect, it } from 'vitest';
import { collectFormOptionsSites, collectSchemaSites } from './collect';
import { createKeyRegistry } from './messageKey';

function collect(source: string) {
	return collectSchemaSites(
		source,
		'src/lib/form/validation/sightingSchema.ts',
		createKeyRegistry()
	);
}

describe('collectSchemaSites', () => {
	it('sammelt label, meta-Text und Regelmeldung mit Schlüssel und Offsets', () => {
		const result = collect(`
			const s = yup.object().shape({
				waterway: yup
					.string()
					.max(255, 'Die Ortsbeschreibung ist zu lang')
					.label('Wo ungefähr?')
					.meta({ helpText: 'Seegebiet oder Fahrwasser', icon: Waves, type: 'text' })
			});
		`);
		expect(result.sites.map((s) => [s.key, s.text])).toEqual([
			['sighting_waterway_max', 'Die Ortsbeschreibung ist zu lang'],
			['sighting_waterway_label', 'Wo ungefähr?'],
			['sighting_waterway_meta_helptext', 'Seegebiet oder Fahrwasser']
		]);
	});

	// Die Reihenfolge ist nicht Kosmetik: An ihr hängt, an welcher Fundstelle das
	// Zählsuffix _2 landet. ts.forEachChild besucht bei einer Aufrufkette den
	// ÄUSSERSTEN Aufruf zuerst — ohne den zweiten Durchgang in collect.ts stünde
	// hier die umgekehrte Reihenfolge und das Suffix an der falschen Stelle.
	it('liefert Fundstellen in Quelltextreihenfolge, nicht in AST-Reihenfolge', () => {
		const result = collect(`
			const s = yup.object().shape({
				deadSize: yup
					.number()
					.max(300, 'zu groß')
					.max(400, 'auch zu groß')
					.label('Größe')
			});
		`);
		expect(result.sites.map((s) => [s.key, s.text])).toEqual([
			['sighting_deadsize_max', 'zu groß'],
			['sighting_deadsize_max_2', 'auch zu groß'],
			['sighting_deadsize_label', 'Größe']
		]);
	});

	it('markiert die Offsets so, dass genau das Literal samt Anführungszeichen ersetzbar ist', () => {
		const source = `const s = yup.object().shape({ a: yup.string().label('Titel') });`;
		const [site] = collect(source).sites;
		expect(source.slice(site!.start, site!.end)).toBe(`'Titel'`);
	});

	it('überspringt meta.type und meta.icon mit Begründung', () => {
		const result = collect(`
			const s = yup.object().shape({
				species: yup.number().meta({ type: 'select', icon: Porpoise })
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => [s.text, s.reason])).toEqual([['select', 'meta-key-denied']]);
	});

	// Argument 0 von .test() ist der Testname und wird maschinell ausgewertet.
	it('extrahiert aus test() die Meldung, nie den Testnamen', () => {
		const result = collect(`
			const s = yup.object().shape({
				species: yup.number().test('is-valid-species', 'Diese Tierart gibt es nicht', fn)
			});
		`);
		expect(result.sites.map((s) => s.text)).toEqual(['Diese Tierart gibt es nicht']);
		expect(result.skipped.map((s) => [s.text, s.reason])).toEqual([
			['is-valid-species', 'test-name-argument']
		]);
	});

	// sightingSchema.ts:1400/1410 — adminSightingSchema benutzt diese Form.
	it('versteht die Objektform von test()', () => {
		const result = collect(`
			const s = base.shape({
				distance: field.test({
					name: 'is-valid-distance',
					exclusive: true,
					message: 'Bitte eine gültige Entfernung wählen.',
					test: fn
				})
			});
		`);
		expect(result.sites.map((s) => [s.key, s.text])).toEqual([
			['sighting_distance_test', 'Bitte eine gültige Entfernung wählen.']
		]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['test-name-argument']);
	});

	it('überspringt eine leere Meldung in der Objektform', () => {
		const result = collect(`
			const s = base.shape({
				juvenileCount: field.test({ name: 'x', exclusive: true, message: '', test: fn })
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toContain('empty-string');
	});

	// sightingSchema.ts:1421 — das Literal ist ein ??-Rückfallwert.
	it('fasst nicht-literale Argumente nicht an und meldet sie', () => {
		const result = collect(`
			const s = base.shape({
				sightingFromText: yup.string().label(other.spec.label ?? 'Sonstiger Ort')
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['non-literal-argument']);
	});

	// Gegenprobe zur Regel darüber: Bei .test('name', fn) steht an Position 1 eine
	// Funktion. Ein Literal aus ihrem Rumpf ist kein übergangenes Argument.
	it('meldet keine Literale aus einem Funktionsrumpf als übersprungen', () => {
		const result = collect(`
			const s = yup.object().shape({
				a: yup.string().test('is-x', (value) => value === 'roher Vergleichswert')
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => [s.text, s.reason])).toEqual([['is-x', 'test-name-argument']]);
	});

	// Befund B.3: `firstStringLiteralWithin` hat zwei Funktionsrumpf-Wächter —
	// einen vor `walk()` (greift, wenn das Argument SELBST eine Funktion ist)
	// und einen IN `walk()` (greift, wenn eine Funktion erst beim Absteigen
	// auftaucht). Der Test oben deckt nur ihre Konjunktion: Entfernt man genau
	// EINEN der beiden, bleibt er grün, weil der jeweils andere Wächter für
	// dieselbe Eingabe ebenfalls greift. Diese beiden Tests treffen die Wächter
	// mit unterschiedlichen Eingaben.

	// Trifft den Wächter VOR walk(): Das Argument an Position 1 ist direkt eine
	// Arrow Function, es wird also gar nicht erst abgestiegen.
	it('meldet keine Literale, wenn die Arrow Function das direkte Argument ist', () => {
		const result = collect(`
			const s = yup.object().shape({
				a: yup.string().test('direktes-argument', (value) => value === 'roher Vergleichswert direkt')
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => [s.text, s.reason])).toEqual([
			['direktes-argument', 'test-name-argument']
		]);
	});

	// Trifft den Wächter IN walk(): Das Argument selbst ist kein Funktionsknoten
	// (eine ConditionalExpression) — der Wächter vor walk() greift hier nicht.
	// Ohne den Wächter IN walk() würde beim Absteigen in den Arrow-Function-Zweig
	// das Literal aus ihrem Rumpf ('aus arrow function') gefunden, statt des
	// Literals im anderen Zweig ('Rückfalltext').
	it('steigt beim Suchen nicht in eine verschachtelte Arrow Function ab', () => {
		const result = collect(`
			const s = yup.object().shape({
				sightingFromText: yup
					.string()
					.label(useFallback ? (value) => 'aus arrow function' : 'Rückfalltext')
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => [s.text, s.reason])).toEqual([
			['Rückfalltext', 'non-literal-argument']
		]);
	});

	it('überspringt rein numerische Platzhalter', () => {
		const result = collect(`
			const s = yup.object().shape({
				totalCount: yup.number().meta({ placeholder: '1' })
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['numeric-only']);
	});

	it('bricht bei einem unbekannten meta-Schlüssel ab, statt ihn zu übergehen', () => {
		expect(() =>
			collect(`
				const s = yup.object().shape({
					a: yup.string().meta({ tooltipText: 'Neu und unbekannt' })
				});
			`)
		).toThrow(/tooltipText/);
	});

	// Befund A: vier Formen, an denen die geschlossene meta-Allowlist bisher
	// still umgangen wurde — jede muss jetzt als `skipped` erscheinen.

	// sightingSchema.ts:1422 — `.meta(sightingFromTextBase.spec.meta ?? {})`.
	it('meldet .meta(...) mit einem Argument, das kein Objektliteral ist', () => {
		const result = collect(`
			const s = yup.object().shape({
				sightingFromText: yup.string().meta(sightingFromTextBase.spec.meta ?? {})
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['non-literal-argument']);
		expect(result.skipped[0]?.aspect).toBe('meta');
	});

	it('meldet ein Spread in einem meta-Objektliteral', () => {
		const result = collect(`
			const s = yup.object().shape({
				a: yup.string().meta({ ...baseMeta })
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['non-literal-argument']);
		expect(result.skipped[0]?.aspect).toBe('meta');
	});

	it('meldet eine ShorthandPropertyAssignment in meta({ helpText })', () => {
		const result = collect(`
			const s = yup.object().shape({
				a: yup.string().meta({ helpText })
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['non-literal-argument']);
		expect(result.skipped[0]?.aspect).toBe('meta.helpText');
	});

	it('meldet einen erlaubten meta-Schlüssel mit nicht-literalem Initializer', () => {
		const result = collect(`
			const s = yup.object().shape({
				a: yup.string().meta({ helpText: someVar })
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['non-literal-argument']);
		expect(result.skipped[0]?.aspect).toBe('meta.helpText');
	});

	// Dieselben vier Formen gelten sinngemäß für die Objektform von .test().
	it('meldet ein Spread in der Objektform von .test({...}), lässt ein literales message aber weiter extrahieren', () => {
		const result = collect(`
			const s = base.shape({
				distance: field.test({ ...baseTest, message: 'x' })
			});
		`);
		// Der Spread selbst kann eine eigene message tragen — das ersetzt das
		// literale message hier nicht, deshalb bleibt es eine reguläre Fundstelle.
		expect(result.sites.map((s) => s.text)).toEqual(['x']);
		expect(result.skipped.map((s) => s.reason)).toEqual(['non-literal-argument']);
		expect(result.skipped[0]?.aspect).toBe('test');
	});

	it('meldet eine ShorthandPropertyAssignment in der Objektform von .test({ message })', () => {
		const result = collect(`
			const s = base.shape({
				distance: field.test({ message })
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['non-literal-argument']);
		expect(result.skipped[0]?.aspect).toBe('test');
	});

	it('meldet ein nicht-literales message in der Objektform von .test()', () => {
		const result = collect(`
			const s = base.shape({
				distance: field.test({ name: 'x', message: someVar, test: fn })
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual([
			'test-name-argument',
			'non-literal-argument'
		]);
		expect(result.skipped[1]?.aspect).toBe('test');
	});

	// Aufgabe 4: .integer(message) verschwand bisher spurlos — weder Fund noch
	// Übersprungen. Der Schlüssel `sighting_totalcount_integer` muss mit dem von
	// Hand angelegten Schlüssel in messages/de.json übereinstimmen (aspect ==
	// Methodenname, wie bei `sighting_totalcount_min`/`_max`).
	it('extrahiert aus .integer() die Meldung', () => {
		const result = collect(`
			const s = yup.object().shape({
				totalCount: yup
					.number()
					.integer('Bitte nur ganze Zahlen eingeben')
					.min(1, 'zu wenig')
			});
		`);
		expect(result.sites.map((s) => [s.key, s.text, s.aspect])).toEqual([
			['sighting_totalcount_integer', 'Bitte nur ganze Zahlen eingeben', 'integer'],
			['sighting_totalcount_min', 'zu wenig', 'min']
		]);
		expect(result.skipped).toEqual([]);
	});

	// Die eigentliche Reparatur: Eine Methode, die der Extraktor nicht kennt,
	// verschwindet nicht mehr wortlos, sondern erscheint mit Grund im
	// Übersprungen-Abschnitt. Mutationsnachweis (siehe Bericht): Entfernt man in
	// collect.ts den `else if (!isKnownNoMessageMethod(method))`-Zweig, wird
	// dieser Test rot — `result.skipped` bleibt leer statt den Fund zu melden.
	it('meldet eine unbekannte Methode mit String-Literal-Argument als übersprungen, statt sie verschwinden zu lassen', () => {
		const result = collect(`
			const s = yup.object().shape({
				totalCount: yup.number().someFutureRule('Ein deutscher Text')
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => [s.text, s.aspect, s.reason])).toEqual([
			['Ein deutscher Text', 'someFutureRule', 'method-unknown']
		]);
		expect(result.skipped[0]?.explanation).toContain('someFutureRule');
	});

	it('meldet eine unbekannte Methode nicht, wenn kein Argument ein String-Literal ist', () => {
		const result = collect(`
			const s = yup.object().shape({
				totalCount: yup.number().someFutureRule(someVar)
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped).toEqual([]);
	});

	// Die vier von Hand nachgetragenen Schlüssel in messages/de.json
	// (sighting_totalcount_integer, sighting_juvenilecount_integer,
	// sighting_deadsize_integer, sighting_shipcount_integer) müssen mit dem
	// Schema übereinstimmen, das der Extraktor jetzt selbst vergibt — sonst
	// hätte der Fix zwar das Melden repariert, aber unter einem anderen
	// Schlüssel als dem bereits gepflegten.
	it('vergibt für alle vier betroffenen Felder denselben Schlüssel wie der Handeintrag in messages/de.json', () => {
		const result = collect(`
			const s = yup.object().shape({
				totalCount: yup.number().integer('Bitte nur ganze Zahlen eingeben'),
				juvenileCount: yup.number().integer('Bitte nur ganze Zahlen eingeben'),
				deadSize: yup.number().integer('Bitte geben Sie eine ganze Zahl ein.'),
				shipCount: yup.number().integer('Bitte geben Sie eine ganze Zahl ein.')
			});
		`);
		expect(result.sites.map((s) => s.key)).toEqual([
			'sighting_totalcount_integer',
			'sighting_juvenilecount_integer',
			'sighting_deadsize_integer',
			'sighting_shipcount_integer'
		]);
	});

	it('meldet eine bekannte meldungsfreie Methode nicht, selbst mit String-Literal-Argument', () => {
		const result = collect(`
			const s = yup.object().shape({
				a: yup.string().default('Rückfallwert')
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped).toEqual([]);
	});

	// Der eigentliche Befund dieser Aufgabe: Nach dem Umbau von sightingSchema.ts
	// steht an vielen meta-Stellen kein Literal mehr, sondern ein Aufruf einer
	// Paraglide-Botschaftsfunktion (`m.sighting_x_meta_helptext({}, { locale })`).
	// Das ist erledigte Arbeit, kein offener Fall — sie zählt als 'already-translated',
	// nicht als 'non-literal-argument', und darf im Trockenlauf-Bericht nicht mehr
	// einzeln erscheinen (render.ts).
	it('zählt ein meta-Argument, das bereits eine Paraglide-Botschaftsfunktion aufruft, als bereits übersetzt', () => {
		const result = collect(`
			import * as m from '#lib/paraglide/messages.js';
			const s = yup.object().shape({
				latitude: yup
					.number()
					.meta({ helpText: m.sighting_latitude_meta_helptext({}, { locale }) })
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => [s.reason, s.aspect])).toEqual([
			['already-translated', 'meta.helpText']
		]);
	});

	// Gegenprobe: Ein anderer Nicht-Literal-Ausdruck — kein Aufruf des
	// Paraglide-Botschaftsmoduls — muss weiterhin als 'non-literal-argument'
	// einzeln erscheinen. Ohne diese Gegenprobe wäre die Erkennung ein
	// Freibrief, jeden beliebigen Ausdruck als „schon übersetzt" zu verschlucken.
	it('zählt ein anderes nicht-literales meta-Argument weiterhin als offenen, einzeln zu prüfenden Fall', () => {
		const result = collect(`
			import * as m from '#lib/paraglide/messages.js';
			const s = yup.object().shape({
				sightingFromText: yup
					.string()
					.meta({ helpText: other.spec.label ?? 'Sonstiger Ort' })
			});
		`);
		expect(result.skipped.map((s) => s.reason)).toEqual(['non-literal-argument']);
	});

	// Dasselbe gilt für die Objektform von .test({ message: ... }).
	it('zählt ein bereits übersetztes message in der Objektform von .test() als bereits übersetzt', () => {
		const result = collect(`
			import * as m from '#lib/paraglide/messages.js';
			const s = base.shape({
				distance: field.test({
					name: 'is-valid-distance',
					exclusive: true,
					message: m.sighting_distance_test({}, { locale }),
					test: fn
				})
			});
		`);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual([
			'test-name-argument',
			'already-translated'
		]);
	});

	// Ein Namespace-Import unter einem anderen Bezeichner oder ein Aufruf, dessen
	// Empfänger nicht der importierte Paraglide-Namespace ist, darf NICHT als
	// bereits übersetzt gelten — sonst würde jeder beliebige Funktionsaufruf mit
	// dem Namen `m` verschluckt.
	it('erkennt einen Aufruf mit demselben Namen aber ohne den Paraglide-Import nicht als bereits übersetzt', () => {
		const result = collect(`
			const s = yup.object().shape({
				a: yup.string().meta({ helpText: m.someOtherHelper({}, { locale }) })
			});
		`);
		expect(result.skipped.map((s) => s.reason)).toEqual(['non-literal-argument']);
	});
});

describe('collectFormOptionsSites', () => {
	it('sammelt die Werte eines Record<Enum, string>', () => {
		const result = collectFormOptionsSites(
			`
			export const speciesLabels: Record<SpeciesEnum, string> = {
				[SpeciesEnum.HARBOR_PORPOISE]: 'Schweinswal',
				[SpeciesEnum.GREY_SEAL]: 'Kegelrobbe'
			};
			`,
			'src/lib/report/formOptions/species.ts',
			createKeyRegistry()
		);
		expect(result.sites.map((s) => [s.key, s.text])).toEqual([
			['formoptions_species_harbor_porpoise', 'Schweinswal'],
			['formoptions_species_grey_seal', 'Kegelrobbe']
		]);
	});

	// Diese beiden führt das Inventar als `technisch` — das MIME-Muster
	// (i18n-inventory.ts:93) ist case-insensitiv und trifft jedes deutsche
	// Wortpaar mit Schrägstrich. Die strukturelle Regel kennt die Ausnahme nicht:
	// Was in einem Labels-Record steht, ist Anzeigetext.
	it('sammelt auch Werte, die das Inventar für MIME-Typen hält', () => {
		const result = collectFormOptionsSites(
			`
			export const mediaTypeLabels: Record<MediaTypeEnum, string> = {
				[MediaTypeEnum.DRAWING]: 'Zeichnung/Skizze'
			};
			`,
			'src/lib/report/formOptions/mediaType.ts',
			createKeyRegistry()
		);
		expect(result.sites.map((s) => s.text)).toEqual(['Zeichnung/Skizze']);
	});

	it('lässt Records ohne Record<…, string>-Annotation unangetastet', () => {
		const result = collectFormOptionsSites(
			`export const speciesGroups = { Kleinwale: [0, 3] };`,
			'src/lib/report/formOptions/species.ts',
			createKeyRegistry()
		);
		expect(result.sites).toEqual([]);
	});

	// Anders als der Test darüber HAT diese Deklaration eine Typannotation —
	// `decl.type !== undefined` lässt sie also durch. Erst das zweite
	// Typargument (`IconName`, nicht `string`) darf sie stoppen. Nur so wird
	// die StringKeyword-Prüfung in isStringRecordDeclaration überhaupt erreicht;
	// der Nachbartest mit `speciesGroups` scheitert schon an der ersten Prüfung.
	it('lässt Records mit Annotation, aber nicht-string-wertigem Typargument unangetastet', () => {
		const result = collectFormOptionsSites(
			`export const speciesIcons: Record<SpeciesEnum, IconName> = {
				[SpeciesEnum.HARBOR_PORPOISE]: 'custom:porpoise'
			};`,
			'src/lib/report/formOptions/species.ts',
			createKeyRegistry()
		);
		expect(result.sites).toEqual([]);
	});

	// Befund B.1: `if (!check.ok)` in collectFormOptionsSites war ungetestet —
	// eine Mutation zu `if (false)` ließ alle 48 Tests grün. Leere und rein
	// numerische Werte in einem Labels-Record müssen als `skipped` landen,
	// nicht als Botschaft.
	it('überspringt einen leeren Wert in einem Labels-Record', () => {
		const result = collectFormOptionsSites(
			`
			export const sexLabels: Record<SexEnum, string> = {
				[SexEnum.UNKNOWN]: ''
			};
			`,
			'src/lib/report/formOptions/sex.ts',
			createKeyRegistry()
		);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['empty-string']);
	});

	it('überspringt einen rein numerischen Wert in einem Labels-Record', () => {
		const result = collectFormOptionsSites(
			`
			export const windStrengthLabels: Record<WindStrengthEnum, string> = {
				[WindStrengthEnum.CALM]: '0'
			};
			`,
			'src/lib/report/formOptions/windStrength.ts',
			createKeyRegistry()
		);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => s.reason)).toEqual(['numeric-only']);
	});

	// Defekt 1a: ein Record, dessen Werttyp NICHT `string` ist
	// (`speciesIdentification.ts`: `Record<SpeciesEnum, SpeciesIdentificationEntry>`),
	// trägt trotzdem deutschen Anzeigetext. Bisher verschwand das spurlos — weder
	// eingesammelt noch gemeldet. Jetzt landet der Export mit Namen und Anzahl der
	// enthaltenen String-Literale im Übersprungen-Abschnitt.
	it('meldet ein Record mit Fremdtyp-Werten als übersprungen, sammelt aber nichts ein', () => {
		const result = collectFormOptionsSites(
			`
			export const speciesIdentification: Record<SpeciesEnum, SpeciesIdentificationEntry> = {
				[SpeciesEnum.HARBOR_PORPOISE]: {
					name: 'Schweinswal',
					size: 'bis 2m lang'
				}
			};
			`,
			'src/lib/report/formOptions/speciesIdentification.ts',
			createKeyRegistry()
		);
		expect(result.sites).toEqual([]);
		expect(result.skipped).toEqual([
			expect.objectContaining({
				text: 'speciesIdentification',
				aspect: 'export',
				reason: 'record-pattern-miss',
				explanation: expect.stringContaining('2 String-Literal(e)')
			})
		]);
	});

	// Defekt 1b: ein exportiertes Array-Literal (`PUBLIC_BOAT_DRIVE_OPTIONS`) trifft
	// weder das Record- noch irgendein anderes Muster und blieb bisher unsichtbar.
	it('meldet ein exportiertes Array-Literal mit String-Literalen als übersprungen', () => {
		const result = collectFormOptionsSites(
			`
			export const PUBLIC_BOAT_DRIVE_OPTIONS = [
				{ value: 1, label: 'Motor lief' },
				{ value: 6, label: 'Motor lief nicht' }
			];
			`,
			'src/lib/report/formOptions/boatDrive.ts',
			createKeyRegistry()
		);
		expect(result.sites).toEqual([]);
		expect(result.skipped).toEqual([
			expect.objectContaining({
				text: 'PUBLIC_BOAT_DRIVE_OPTIONS',
				aspect: 'export',
				reason: 'record-pattern-miss',
				explanation: expect.stringContaining('2 String-Literal(e)')
			})
		]);
	});

	// Defekt 1c: die Rückfalltexte 'Nicht angegeben'/'Unbekannt' stehen in
	// `return`-Anweisungen der `getXLabel`-Funktionen, nicht in einem Record. Nur
	// String-Literale in `return`-Anweisungen exportierter Funktionen zählen —
	// nicht jede Zeichenkette im Modul (sonst Rauschen durch Vergleichscode).
	it('meldet Rückfalltexte in return-Anweisungen einer exportierten Funktion als übersprungen', () => {
		const result = collectFormOptionsSites(
			`
			export function getBoatDriveLabel(value) {
				if (value === null || value === undefined) return 'Nicht angegeben';
				const numericValue = value;
				return boatDriveLabels[numericValue] || 'Unbekannt';
			}
			`,
			'src/lib/report/formOptions/boatDrive.ts',
			createKeyRegistry()
		);
		expect(result.sites).toEqual([]);
		expect(result.skipped.map((s) => [s.text, s.aspect, s.reason])).toEqual([
			['Nicht angegeben', 'getBoatDriveLabel (return)', 'record-pattern-miss'],
			['Unbekannt', 'getBoatDriveLabel (return)', 'record-pattern-miss']
		]);
	});

	// Rein numerische Array- oder Objekt-Literale ohne jedes String-Literal
	// bleiben unangetastet — dieselbe Nicht-Meldung wie bisher, nur jetzt bewusst
	// geprüft statt zufällig richtig.
	it('meldet ein exportiertes Objektliteral ohne String-Literale nicht', () => {
		const result = collectFormOptionsSites(
			`export const speciesGroups = { Kleinwale: [0, 3] };`,
			'src/lib/report/formOptions/species.ts',
			createKeyRegistry()
		);
		expect(result.sites).toEqual([]);
		expect(result.skipped).toEqual([]);
	});
});
