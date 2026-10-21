import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { multiWordLiterals, sourceFiles, stripComments } from '#lib/testing/sourceScan.testutil.ts';
import type { SourceHit } from '#lib/testing/sourceScan.testutil.ts';

/**
 * @fileoverview Hartcodierter Anzeigetext in Schicht A (Yup-Schema) und Schicht B
 * (Domänen-Label-Dateien) — der Rückfall, den Paraglide nicht melden kann.
 *
 * **Das Problem.** Paraglide meldet eine Botschaft, die extrahiert wurde und deren
 * englische Fassung fehlt — das ist ein Build-Fehler. Es kann prinzipbedingt
 * **nicht** melden, was nie ein Schlüssel wurde: Ein hartcodierter deutscher Text
 * fehlt in keiner Sprachdatei. Genau das ist der Zustand, in dem das englische
 * Formular deutsche Brocken zeigt, ohne dass irgendetwas rot wird.
 *
 * **Warum dieser Scan den Extraktor nicht benutzt.** Naheliegend wäre,
 * `collectSchemaSites` aus `src/tools/i18n-extract/` wiederzuverwenden — es
 * meldet für diese Dateien inzwischen 0 Funde, der Guard wäre eine Zeile. Aber
 * dann wäre er für genau das blind, wofür er gebaut wird: `.integer(message)`
 * war für den Extraktor unsichtbar und wäre es für einen darauf gestützten Scan
 * ebenso gewesen. Zwei **unabhängige** Mechanismen sind Redundanz; einer,
 * zweimal gezählt, ist keine. Der Scan arbeitet deshalb wie die vier
 * bestehenden Guards des Projekts (`approvalPredicateScan`, `verifiedReadScan`,
 * `statusLogWriteScan`, `openQueueOrderScan`) über
 * `src/lib/testing/sourceScan.testutil.ts` mit Mustern auf dem Quelltext.
 *
 * **Die Regel — bewusst ohne Sprachheuristik.** Ein Zeichenketten-Literal, das
 * Leerzeichen und mindestens zwei Buchstabengruppen enthält, ist in diesen
 * Dateien ein Befund. Eine Umlaut-Heuristik versagt genau dort, wo es zählt:
 * Eine versehentlich englisch hartcodierte Zeichenkette hat keine Umlaute. Die
 * Mehrwort-Regel trifft `'Bitte wählen Sie eine Tierart'` und
 * `'Please select a species'` gleichermaßen und lässt technische Tokens ohne
 * Leerzeichen durch (`'select'`, `'given-name'`, `'lucide:map-pin'`, `'sv-SE'`).
 *
 * **Umfang.** `sightingSchema.ts` und alle `formOptions/*.ts` außer
 * `speciesIdentification.ts` — siehe `EXEMPT_FILES` unten für die Begründung.
 * Admin-Bereich, Markup, `/docs` und `/styleguide` (Schicht C) sind bewusst
 * nicht dabei (Entwurf Abschnitt 7, `docs/i18n/PLAN_ETAPPE1_AUFGABE5_SCAN.md`):
 * Ein Guard, der ab Tag eins rot ist, wird abgeschaltet und schützt danach
 * nichts.
 *
 * Läuft im Node-Projekt (`npm run test:unit`, damit auch in `test:quick`).
 */

/** Was der Entwickler stattdessen tun soll — erscheint in jeder Fehlermeldung. */
const REMEDIATION = [
	'Hartcodierter Anzeigetext in Schicht A/B. Statt des Literals eine',
	'Paraglide-Botschaft benutzen: Schlüssel in messages/de.json UND',
	'messages/en.json anlegen (beide zunächst mit dem deutschen Wortlaut), dann',
	'm.<schlüssel>({}, { locale }) aufrufen. `npm run i18n:extract` zeigt',
	'Fundstelle und Schlüsselvorschlag. Danach germanBaseline.json prüfen — es',
	'muss unverändert bleiben.'
].join('\n');

/**
 * Meldet jedes mehrwortige Zeichenketten-Literal in `source`.
 *
 * @returns Fundstellen (leer = konform), aufsteigend nach Zeile.
 */
export function findHardcodedStrings(source: string): SourceHit[] {
	return multiWordLiterals(stripComments(source));
}

const SCHEMA_FILE = 'src/lib/form/validation/sightingSchema.ts';
const FORM_OPTIONS_DIR = 'src/lib/report/formOptions';

/**
 * Dateien, die dieser Scan bewusst nicht anfasst — je mit Begründung.
 *
 * `speciesIdentification.ts` ist die einzige Ausnahme: Sie trägt 316 Literale
 * Fachtext (elf Artdatensätze, Schicht E — Etappe 4 dieses Vorhabens, noch
 * nicht umgesetzt). Ihre beiden schmalen Label-Records
 * (`observabilityLabels`, `frequencyLabels`) sind davon nicht betroffen und
 * bereits über Botschaften abgedeckt — sie stehen im deutschen Schnappschuss
 * `germanBaseline.json`, und die Grenze zu den elf Artdatensätzen ist in
 * `germanBaseline.testutil.ts` bereits per Test markiert. Wer die Datei
 * später umbaut (Etappe 4), nimmt sie hier aus dieser Ausnahmeliste heraus.
 */
const EXEMPT_FILES: ReadonlyMap<string, string> = new Map([
	[
		`${FORM_OPTIONS_DIR}/speciesIdentification.ts`,
		'316 Literale Fachtext für elf Artdatensätze (Schicht E, Etappe 4 — noch nicht umgesetzt). Die beiden Label-Records der Datei sind bereits über Botschaften abgedeckt und stehen im Schnappschuss germanBaseline.json; die Grenze dorthin markiert germanBaseline.testutil.ts.'
	]
]);

/**
 * Der aktuelle Umfang: `sightingSchema.ts` plus alle `formOptions/*.ts` außer
 * den begründeten Ausnahmen und den Testdateien selbst.
 *
 * `.test.ts`/`.testutil.ts` bleiben draußen, weil dort Prosa (Testtitel,
 * konstruierte Beispiele — auch die dieser Datei) unvermeidlich mehrwortige
 * Literale enthält, ohne dass sie je an einer Formular-Oberfläche erscheinen.
 */
function scopeFiles(): string[] {
	const optionFiles = sourceFiles(FORM_OPTIONS_DIR, /\.ts$/).filter(
		(path) =>
			!path.endsWith('.test.ts') && !path.endsWith('.testutil.ts') && !EXEMPT_FILES.has(path)
	);

	return [SCHEMA_FILE, ...optionFiles];
}

describe('Mustererkennung', () => {
	it.each([
		[".label('Wo ungefähr?')", 'Wo ungefähr?'],
		[".max(255, 'Die Ortsbeschreibung ist zu lang')", 'Die Ortsbeschreibung ist zu lang'],
		[".meta({ helpText: 'Seegebiet oder Fahrwasser' })", 'Seegebiet oder Fahrwasser'],
		["[SpeciesEnum.HARBOR_PORPOISE]: 'Unbekannte Walart'", 'Unbekannte Walart']
	])('meldet das deutsche Literal in %s', (code) => {
		expect(findHardcodedStrings(code)).toHaveLength(1);
	});

	it('meldet ein englisches Literal ohne Umlaute genauso — keine Sprachheuristik', () => {
		const code = ".label('Please select a species')";

		expect(findHardcodedStrings(code)).toHaveLength(1);
	});

	it('meldet das doppelt-angeführte Literal genauso wie das einfach-angeführte', () => {
		const code = '.label("Bitte Tierart wählen")';

		expect(findHardcodedStrings(code)).toHaveLength(1);
	});

	it('meldet das Literal, auch wenn der Aufruf über zwei Zeilen umbricht', () => {
		const code = ['.label(', "\t'Wo ungefähr?'", ')'].join('\n');

		expect(findHardcodedStrings(code)).toEqual([{ line: 2, text: "'Wo ungefähr?'" }]);
	});

	it('meldet mehrere Fundstellen in einer Datei, aufsteigend nach Zeile', () => {
		const code = [
			".label('Wo ungefähr?')",
			".meta({ helpText: 'Seegebiet oder Fahrwasser' })"
		].join('\n');

		expect(findHardcodedStrings(code).map((hit) => hit.line)).toEqual([1, 2]);
	});

	/**
	 * Die feste Randgrenze (`MAX_LITERAL_EDGE`, vormals 300 Zeichen je Seite der
	 * beiden Buchstabengruppen) machte den Scan blind für lange Literale — ein
	 * Konstrukt, das ein Review am 2026-08-11 belegt hat. Beide folgenden Fälle
	 * wurden gegen die alte, längenbegrenzte Fassung geprüft und blieben dort
	 * ohne Fund; siehe Commit-Beschreibung für den Nachweis (Lauf vor dem Umbau
	 * auf die zweistufige Extraktion).
	 */
	it('meldet ein langes deutsches Fließtext-Literal (~700 Zeichen) — vormals ab ~650 blind', () => {
		const sentence =
			'Diese ausführliche Ortsbeschreibung erläutert die Umstände der Sichtung und enthält viele Details, die für die spätere Nachverfolgung durch die Meldestelle wichtig sind. ';
		const prose = sentence.repeat(5).slice(0, 700);
		const code = `.meta({ helpText: '${prose}' })`;

		expect(findHardcodedStrings(code)).toHaveLength(1);
	});

	it('meldet ein Literal mit zwei frühen Wortgruppen und langem nicht-buchstäblichem Nachlauf — vormals 0 Treffer trotz Gesamtlänge >600', () => {
		const tail = ',1,2,3,4,5,6,7,8,9,10'.repeat(20).slice(0, 400);
		const literalContent = `Wo ungefähr${tail}`;
		const code = `.label('${literalContent}')`;

		expect(literalContent.length).toBeGreaterThan(400);
		expect(findHardcodedStrings(code)).toHaveLength(1);
	});
});

describe('Gegenproben', () => {
	/* Diese Gruppe wiegt schwerer als die obige. Eine Regel, die technische
	   Tokens oder den vorgeschriebenen Botschaftsweg mitnimmt, wird beim ersten
	   roten Lauf aufgeweicht statt befolgt — und ist danach schlechter als
	   keine. */

	it.each([
		"meta: { type: 'select' }",
		"autocomplete: 'given-name'",
		"icon: 'lucide:map-pin'",
		"toLocaleDateString('sv-SE', { hour: '2-digit' })",
		"placeholder: '12345'"
	])('lässt das technische Token %s durch — kein Leerzeichen im Literal', (code) => {
		expect(findHardcodedStrings(code)).toEqual([]);
	});

	it("lässt .test('is-valid-species', …) durch", () => {
		const code = ".test('is-valid-species', 'ungültige Art', (value) => isValidSpecies(value))";

		// Der Testname selbst hat kein Leerzeichen und bleibt durch. Die zweite
		// Zeichenkette ('ungültige Art') ist dagegen ein echtes Anzeigeliteral
		// und muss auffallen — die Gegenprobe darf das nicht verdecken.
		expect(findHardcodedStrings(code)).toEqual([{ line: 1, text: "'ungültige Art'" }]);
	});

	it('lässt den vorgeschriebenen Botschaftsaufruf durch', () => {
		const code = 'm.sighting_waterway_label({}, { locale })';

		expect(findHardcodedStrings(code)).toEqual([]);
	});

	it('lässt den Zeilenkommentar mit deutschem Satz durch', () => {
		const code = [
			'// Bitte wählen Sie eine Tierart — Begründung für die Auswahlreihenfolge.',
			'export const x = 1;'
		].join('\n');

		expect(findHardcodedStrings(code)).toEqual([]);
	});

	it('lässt den Blockkommentar mit deutschem Satz durch', () => {
		const code = [
			'/**',
			' * Bitte wählen Sie eine Tierart, wenn der Bestand mehrdeutig ist.',
			' */',
			'export const y = 2;'
		].join('\n');

		expect(findHardcodedStrings(code)).toEqual([]);
	});

	it.each([...EXEMPT_FILES.keys()])('nimmt die begründete Ausnahme %s aus dem Umfang', (path) => {
		expect(scopeFiles()).not.toContain(path);
	});
});

describe('Bestand', () => {
	it('findet außerhalb der begründeten Ausnahme kein mehrwortiges Literal', () => {
		const offenders = scopeFiles().flatMap((path) =>
			findHardcodedStrings(readFileSync(path, 'utf-8')).map(
				(hit) => `${path}:${hit.line} — ${hit.text}`
			)
		);

		expect(offenders, `${offenders.length} Fund(e).\n\n${REMEDIATION}\n`).toEqual([]);
	});

	/* Selbsttests. Ein Scan, der nichts liest, nichts erkennt oder ins Leere
	   zeigt, ist grün und beweist nichts. */
	it('scannt sightingSchema.ts und alle nicht ausgenommenen formOptions-Dateien', () => {
		const files = scopeFiles();

		expect(files).toContain(SCHEMA_FILE);
		expect(files.length).toBeGreaterThan(15);
		expect(files).not.toContain(`${FORM_OPTIONS_DIR}/speciesIdentification.ts`);
	});

	it('würde speciesIdentification.ts melden, stünde sie nicht auf der Ausnahmeliste', () => {
		const datei = readFileSync(`${FORM_OPTIONS_DIR}/speciesIdentification.ts`, 'utf-8');

		expect(findHardcodedStrings(datei).length).toBeGreaterThan(0);
	});

	it('nennt für die Ausnahme eine Begründung', () => {
		for (const reason of EXEMPT_FILES.values()) {
			expect(reason.length).toBeGreaterThan(40);
		}
	});
});
