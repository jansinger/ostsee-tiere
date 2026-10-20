import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectHits, sourceFiles, stripComments } from '#lib/testing/sourceScan.testutil.ts';
import type { SourceHit } from '#lib/testing/sourceScan.testutil.ts';

/**
 * @fileoverview Das Freigabe-Prädikat darf nur in `approvalFilter.ts` stehen
 *
 * **Warum es diesen Test gibt.** Das Datei-Doc von `approvalFilter.ts` begründet
 * die Zentralisierung mit einem Satz, der sich als falsch erwiesen hat: „Ein
 * Aufrufer, der den Freigabestatus ignoriert, fällt beim Review auf, weil er
 * diesen Import nicht hat." `/sichtungen/showreports.json` hat das Prädikat
 * monatelang als `sql`-Literal nachgebaut, und es ist niemandem aufgefallen —
 * behoben in PR #701, aber eben nur die eine Fundstelle. Die Kontrolle, die den
 * Fall hätte finden sollen, war ein Mensch, der einen fehlenden Import bemerkt.
 * Dieser Test ersetzt sie durch etwas, das nicht müde wird.
 *
 * **Was er prüft.** Jede `.ts`/`.js`-Datei unter `src/` wird nach einem Prädikat
 * auf `approvedAt`/`freigegeben_am` in Kombination mit `IS [NOT] NULL`,
 * `isNull(`/`isNotNull(` oder `IS [NOT] DISTINCT FROM NULL` durchsucht. Wer eins
 * baut, bekommt in der Fehlermeldung den Import, den er stattdessen braucht.
 *
 * **Warum eine Datei und nicht zwei.** Das Vorbild `e2e/helpers/bannedClasses.ts`
 * trennt Regel und Test, weil die Regel dort in zwei Umgebungen laufen muss —
 * im Browser-Scan und im Node-Unit-Test. Dieser Grund fehlt hier: Scan und
 * Gegenbeispiele laufen beide in Node, in diesem Prozess. Eine Aufteilung ohne
 * den Grund wäre Nachahmung, kein Nutzen. Die Lehre aus dem Vorbild ist eine
 * andere und gilt sehr wohl (siehe `bannedClasses.test.ts`): *Ein Scan über
 * einen konformen Bestand belegt nichts über die Regel.* Der Bestand ist seit
 * PR #701 sauber, der Scan ist also grün — auch dann, wenn das Muster eine
 * Lücke hat. Deshalb steht unter „Mustererkennung" je Schreibweise ein
 * konstruiertes Beispiel, und unter „Gegenproben" steht, was **nicht**
 * anschlagen darf.
 *
 * Läuft im Node-Projekt (`npm run test:unit`, damit auch in `test:quick`).
 *
 * Regelquellen: `.claude/rules/api.md` („Prüfstatus einer Sichtung"),
 * `.claude/rules/database.md` („Prüfstatus in Auswertungen").
 */

/** Was der Entwickler stattdessen tun soll — erscheint in jeder Fehlermeldung. */
const REMEDIATION = [
	'Das Freigabe-Prädikat wird nicht selbst gebaut, sondern importiert:',
	"  import { approvedOnly, pendingOnly } from '#lib/server/db/approvalFilter';",
	'  .where(approvedOnly())   // öffentlich: nur freigegebene Sichtungen',
	'  .where(pendingOnly())    // Admin: nur noch nicht freigegebene',
	'  .where(openOnly())       // Eingangsseite: weder freigegeben noch abgelehnt',
	'  .where(rejectedOnly())   // Admin-Tabelle: nur abgelehnte',
	'Die Ablehnung ist eine Triage-Dimension, kein dritter Freigabe-Zustand (api.md).',
	'',
	'Über einer bereits geladenen Zeile gilt derselbe Helper in JavaScript:',
	"  import { isSightingApproved, isSightingRejected } from '#lib/server/db/approvalFilter';",
	'  if (!isSightingApproved(file)) { /* nicht freigegeben */ }',
	'  if (isSightingRejected(sighting)) { /* abgelehnt */ }'
].join('\n');

/**
 * Die Spalte in beiden Schreibweisen.
 *
 * Der **nackte** Name deckt jede Qualifizierung mit ab: `sightings.approvedAt`,
 * `s."freigegeben_am"` und `sichtungen.freigegeben_am` enthalten ihn alle. Eine
 * Aufzählung der Präfixe wäre genau die Sorte Liste, die nur kennt, was schon
 * jemand geschrieben hat.
 */
const COLUMN = String.raw`(?:approvedAt|freigegeben_am|rejectedAt|abgelehnt_am)`;

/**
 * Was zwischen Spalte und `IS NULL` stehen darf.
 *
 * Absichtlich eng: Anführungszeichen (`"freigegeben_am" IS NOT NULL`), die
 * schließende Klammer einer Template-Interpolation (`${sightings.approvedAt}`)
 * und Weißraum. Ein Komma, ein Doppelpunkt oder ein Bezeichner beendet die
 * Brücke — deshalb schlägt weder `approvedAt: null` in einer Fixture noch
 * `approvedAt: sightings.approvedAt` in einer Select-Projektion an.
 *
 * Weißraum schließt den Zeilenumbruch ein, und das ist der Punkt: Prettier
 * bricht lange Ausdrücke um. Ein zeilenweiser Scan hätte genau dann eine Lücke,
 * wenn der Ausdruck lang genug ist — also bei jeder zusammengesetzten
 * `where`-Klausel, in der das Prädikat überhaupt erst gefährlich wird.
 */
const BRIDGE = String.raw`["'}\s]*`;

/**
 * `IS NULL` und seine Schreibweisen.
 *
 * `IS DISTINCT FROM NULL` steht dabei, obwohl es im Bestand nicht vorkommt. Es
 * ist die SQL-Standard-Schreibweise **desselben** Tests, und das Argument „gibt
 * es hier nicht" hat schon dreimal eine Lücke offengehalten (Deckkraft-Suffix,
 * `white`/`black`, Gradient-Stops — alle drei in `bannedClasses.ts` nachlesbar).
 * Der variable Weißraum ist aus demselben Grund `\s+` und kein Leerzeichen.
 */
const NULL_TEST = String.raw`is\s+(?:not\s+)?(?:distinct\s+from\s+)?null\b`;

/** `${sightings.approvedAt} IS NOT NULL` — die Schreibweise des Vorfalls. */
const SQL_ORDER = new RegExp(String.raw`${COLUMN}${BRIDGE}${NULL_TEST}`, 'gi');

/**
 * `isNotNull(sightings.approvedAt)` — Drizzle-Reihenfolge, Operator zuerst.
 *
 * Zwischen Klammer und Spalte darf nur ein qualifizierter Bezeichner stehen
 * (`sightings.`), plus Weißraum für den Prettier-Umbruch. Klammern und Kommata
 * fehlen in der Zeichenklasse mit Absicht: Sonst würde
 * `isNull(sightings.deletedAt), eq(x, sightings.approvedAt)` als ein Treffer
 * durchgehen und die Meldung auf die falsche Stelle zeigen.
 */
const FUNCTION_ORDER = new RegExp(String.raw`\bis(?:not)?null\s*\(\s*[\w.$\s]*?${COLUMN}`, 'gi');

/**
 * Dieselbe Regel in JavaScript, über einer bereits geladenen Zeile.
 *
 * Seit PR #704 gibt es dafür `isSightingApproved()` — und damit erst den Grund,
 * diese Formen überhaupt zu melden. Solange der Helper fehlte, war eine Meldung
 * hier eine Aufforderung ins Leere; eine Regel ohne gangbare Antwort wird beim
 * ersten roten Lauf entschärft statt befolgt.
 *
 * **Nur die drei eindeutigen Schreibweisen**, wörtlich dieselben wie in
 * `approvalFilter.test.ts`. Ein blankes `if (row.approvedAt)` fehlt hier aus dem
 * Grund, den PR #704 dort nennt: Es ist von einer legitimen Verwendung des Werts
 * (`approvedAt ?? null` in derselben Antwort, ein Datum formatieren) ohne Parser
 * nicht zu unterscheiden. Diese Grenze ist übernommen, nicht neu entschieden.
 *
 * Der Unterschied zu jenem Guard ist die **Reichweite**: Dort steht eine Liste
 * der drei heute bekannten Routen, hier läuft es über `src/`. Eine vierte Route
 * mit eigener Inline-Prüfung fiele nur hier auf — genau die Fehlerklasse, gegen
 * die diese Datei antritt.
 */
const JS_ORDER = new RegExp(
	String.raw`(?:!!|Boolean\()[\w.$\[\]\s]*${COLUMN}|${COLUMN}\s*[!=]==?\s*null`,
	'g'
);

const PATTERNS = [SQL_ORDER, FUNCTION_ORDER, JS_ORDER] as const;

/**
 * Meldet jedes selbstgebaute Freigabe-Prädikat in `source`.
 *
 * Kommentar-Ausblendung und Trefferbildung stehen seit dem Guard gegen
 * `geprueft` in `#lib/testing/sourceScan.testutil.js` — beide Regeln brauchen sie,
 * und zwei Verfahren im selben Repo altern getrennt. Die Begründungen zu den
 * URL- und Glob-Fallen sind mit dorthin gewandert.
 *
 * @returns Fundstellen (leer = konform), aufsteigend nach Zeile.
 */
export function findApprovalPredicates(source: string): SourceHit[] {
	return collectHits(stripComments(source), PATTERNS);
}

/**
 * Dateien, in denen das Prädikat stehen darf — je mit Begründung.
 *
 * Die Liste ist bewusst kurz und namentlich. Ein pauschales `**\/*.test.ts`
 * wäre bequem und würde die Regel aushöhlen: Eine Testhilfe, die ein
 * abweichendes Prädikat aufbaut, erzeugt genau die Divergenz, gegen die diese
 * Regel existiert — nur eine Ebene tiefer.
 */
const ALLOWED_FILES: ReadonlyMap<string, string> = new Map([
	[
		'src/lib/server/db/approvalFilter.ts',
		'Die Definition selbst. Sie ist der Ort, an dem das Prädikat stehen soll.'
	],
	[
		'src/lib/server/db/approvalFilter.test.ts',
		'Der Routen-Guard aus PR #704 führt die verbotenen JavaScript-Schreibweisen als Daten mit und vergleicht isSightingApproved() über alle Werte gegen das abgelöste !!approvedAt. Beides muss die Formen wörtlich nennen.'
	],
	[
		'src/lib/server/db/approvalPredicateScan.test.ts',
		'Diese Datei. Die konstruierten Beispiele unter „Mustererkennung" sind Verstöße — das ist ihr Zweck, denn ein Scan über einen konformen Bestand belegt nichts über die Regel.'
	],
	[
		'src/lib/server/db/statisticsApprovalScope.test.ts',
		'Pinnt approvedOnly() gegen den historischen Inline-Ausdruck der Legacy-Karte und liest das kompilierte SQL ("freigegeben_am" is not null) aus. Beides muss das Prädikat wörtlich nennen, um es vergleichen zu können.'
	],
	[
		'src/routes/sichtungen/showreports.json/showreports.test.ts',
		'Belegt für den Legacy-Vertrag, dass approvedOnly() dieselbe SQL erzeugt wie der Ausdruck, der bis PR #701 im Endpunkt stand. Der Vergleich braucht den alten Ausdruck.'
	]
]);

const SOURCE_ROOT = 'src';

/**
 * Alle gescannten Dateien.
 *
 * `.svelte` fehlt: Das Prädikat braucht `sightings` aus `#lib/server/db/schema.js`,
 * und diesen Import lässt SvelteKit in Client-Code nicht zu. Eine Komponente
 * kann die Regel also nicht verletzen, ohne vorher am Server-Import zu
 * scheitern. Testdateien sind ausdrücklich dabei (siehe `ALLOWED_FILES`).
 *
 * **Die Grenze endet an `src/`, und das ist eine Entscheidung, keine
 * Nachlässigkeit.** `scripts/seed-e2e.ts` baut in seiner Abschlussprüfung ein
 * `COUNT(*) FILTER (WHERE freigegeben_am IS NOT NULL)` — die verbotene Form,
 * knapp außerhalb. Das Skript verbindet sich direkt über `postgres`, ohne
 * Drizzle und ohne `#lib`-Alias; `approvedOnly()` liefert ein `SQL`-Objekt und
 * ist in einem `postgres`-Tagged-Template nicht verwendbar. Eine Meldung dort
 * hätte also wieder keine Antwort — derselbe Grund wie bei der JS-Prüfung
 * weiter unten. Wer das Skript auf Drizzle umstellt, zieht `SOURCE_ROOT` mit.
 *
 * **Nicht abgedeckt ist die zweite Spalte des Paares.** `admin/+page.server.ts`
 * filtert über `eq(sightings.verified, 1)`. Das ist hier kein Verstoß: Es ist
 * der Verifizierungs-Filter der Admin-Liste, an `?verified=0|1` gebunden, und
 * genau dafür gibt es die Spalte. `api.md` verbietet `verified` als
 * **öffentliche** Grundmenge, nicht als Bedienelement im Admin. Diese Regel
 * deckt deshalb `freigegeben_am` ab und nicht den Prüfstatus insgesamt.
 */
function scannedFiles(): string[] {
	return sourceFiles(SOURCE_ROOT, /\.(ts|js)$/);
}

describe('Mustererkennung', () => {
	/* Die Schreibweise, die den Vorfall ausgemacht hat: Sie stand bis PR #701
	   wörtlich in /sichtungen/showreports.json/+server.ts. */
	it('meldet das interpolierte sql-Literal aus dem Vorfall', () => {
		expect(
			findApprovalPredicates('const filter = sql`${sightings.approvedAt} IS NOT NULL`;')
		).toEqual([{ line: 1, text: 'approvedAt} IS NOT NULL' }]);
	});

	it.each([
		'isNotNull(sightings.approvedAt)',
		'isNull(sightings.approvedAt)',
		'not(isNull(sightings.approvedAt))',
		'isNotNull (sightings.approvedAt)',
		'isNotNull(approvedAt)'
	])('meldet die Drizzle-Schreibweise %s', (code) => {
		expect(findApprovalPredicates(code)).toHaveLength(1);
	});

	/* Ohne Drizzle-Spaltenreferenz, direkt auf dem Spaltennamen. Diese Form ist
	   im Projekt eine gelebte Schreibweise — admin/statistics baut
	   `sql\`email IS NOT NULL AND email != ''\`` genau so. Wer sie für
	   freigegeben_am benutzt, umgeht approvedOnly() vollständig. */
	it.each([
		'sql`freigegeben_am IS NOT NULL`',
		'sql`"freigegeben_am" IS NOT NULL`',
		'sql`sichtungen.freigegeben_am IS NULL`',
		'sql`s."freigegeben_am" is not null`',
		'sql`freigegeben_am   IS   NOT   NULL`',
		'sql`freigegeben_am IS DISTINCT FROM NULL`',
		'sql`freigegeben_am IS NOT DISTINCT FROM NULL`'
	])('meldet das rohe SQL-Prädikat %s', (code) => {
		expect(findApprovalPredicates(code)).toHaveLength(1);
	});

	it('erkennt das SQL-Muster auf der Ablehnungs-Spalte', () => {
		expect('${sightings.rejectedAt} IS NOT NULL').toMatch(SQL_ORDER);
		expect('isNull(sightings.rejectedAt)').toMatch(FUNCTION_ORDER);
	});

	/* Die Lücke, an der ein zeilenweiser Scan gescheitert wäre — und zwar nicht
	   an einem Sonderfall, sondern an Prettier: Sobald die where-Klausel lang
	   genug wird, bricht der Formatter genau so um. Das ist dieselbe Bauart wie
	   die drei Lücken in bannedClasses.ts: nicht die Aufzählung war unvollständig,
	   sondern die Form des Musters. */
	it('meldet ein umgebrochenes isNotNull(...)', () => {
		const code = [
			'const where = and(',
			'\tisNotNull(',
			'\t\tsightings.approvedAt',
			'\t)',
			');'
		].join('\n');

		expect(findApprovalPredicates(code)).toEqual([
			{ line: 2, text: 'isNotNull( sightings.approvedAt' }
		]);
	});

	it('meldet ein umgebrochenes sql-Literal', () => {
		const code = ['const filter = sql`', '\t${sightings.approvedAt}', '\tIS NOT NULL', '`;'].join(
			'\n'
		);

		expect(findApprovalPredicates(code)).toHaveLength(1);
	});

	it('meldet die Zeile, in der das Prädikat beginnt', () => {
		const code = ['// erste Zeile', '', 'const filter = isNotNull(sightings.approvedAt);'].join(
			'\n'
		);

		expect(findApprovalPredicates(code)[0]?.line).toBe(3);
	});

	it('meldet mehrere Fundstellen in einer Datei', () => {
		const code = [
			'const a = isNotNull(sightings.approvedAt);',
			'const b = sql`freigegeben_am IS NULL`;'
		].join('\n');

		expect(findApprovalPredicates(code).map((hit) => hit.line)).toEqual([1, 2]);
	});
});

describe('Gegenproben', () => {
	/* Diese Gruppe wiegt schwerer als die obige. Eine Regel, die den Ersatz oder
	   die Nachbarschaft mitnimmt, wird beim ersten roten Lauf aufgeweicht statt
	   befolgt — und ist danach schlechter als keine. */

	it.each([
		"import { approvedOnly, pendingOnly } from '#lib/server/db/approvalFilter';",
		'.where(approvedOnly())',
		'.where(and(approvedOnly(), isNotNull(sightings.sightingDate)))',
		'const approval = approvalFilter(scope);'
	])('lässt den vorgeschriebenen Weg %s durch', (code) => {
		expect(findApprovalPredicates(code)).toEqual([]);
	});

	/* Andere Spalten dürfen ihre Null-Prädikate behalten — die drei Beispiele
	   stehen so in admin/statistics/+page.server.ts und about/+page.server.ts. */
	it.each([
		'isNotNull(sightings.sightingDate)',
		'isNotNull(sightings.latitude)',
		"sql`email IS NOT NULL AND email != ''`",
		"sql`schiffsname IS NOT NULL AND schiffsname != ''`"
	])('lässt das Prädikat auf einer anderen Spalte durch: %s', (code) => {
		expect(findApprovalPredicates(code)).toEqual([]);
	});

	/* Die Spalte lesen, zurückgeben oder vergleichen ist kein Freigabefilter.
	   Ohne die enge Brücke zwischen Spalte und `IS NULL` wäre jede Fixture und
	   jede Select-Projektion ein Treffer, und die Regel damit unbrauchbar. */
	it.each([
		'approvedAt: sightings.approvedAt,',
		'approvedAt: null,',
		'let approvedAt: Date | null = new Date();',
		'expect(body.approvedAt).toBeNull();',
		'eq(sightings.approvedAt, freigabeZeitpunkt)',
		"expect(isNotNull).toHaveBeenCalledWith('approvedAt');"
	])('lässt den Nicht-Filter %s durch', (code) => {
		expect(findApprovalPredicates(code)).toEqual([]);
	});

	it('lässt Kommentare durch, die das Prädikat zitieren', () => {
		const code = [
			'// Öffentliche Grundmenge überall: freigegeben_am IS NOT NULL.',
			'/* Der Helper rendert isNotNull(sightings.approvedAt). */',
			'/**',
			' * `${sightings.approvedAt} IS NOT NULL` stand bis PR #701 hier.',
			' */',
			'const where = approvedOnly();'
		].join('\n');

		expect(findApprovalPredicates(code)).toEqual([]);
	});

	/* Das `(?<!:)` in stripComments: Ohne es verschluckt eine URL den Rest ihrer
	   Zeile — und mit ihm ein Prädikat, das dahinter steht. */
	it('behält den Code hinter einer URL im Blick', () => {
		const code = "const url = 'https://x/y'; const f = isNotNull(sightings.approvedAt);";

		expect(findApprovalPredicates(code)).toHaveLength(1);
	});

	/* Das `(?<!\w)` in stripComments. Ohne es eröffnet der MIME-Glob einen
	   Blockkommentar, der bis zum nächsten `*\/` im Bestand alles verschluckt:
	   `UnifiedDropzone.svelte.test.ts` war so ab Zeile 200 auf 174 Zeilen blind,
	   `DropzoneEnhanced.svelte.test.ts` ab Zeile 40 auf 82 — plus drei weitere
	   Dateien, zusammen 215 Zeilen, die der Scan nie gesehen hat.

	   Der abschließende Kommentar unten ist der Teil, auf den es ankommt und der
	   in einer ersten Fassung dieses Tests fehlte: Ohne ihn bleibt der Glob
	   ungeschlossen, das Muster greift gar nicht, und der Test wäre auch ohne das
	   `(?<!\w)` grün gewesen — eine Gegenprobe, die nichts absichert. Genau die
	   Sorte Deckung, die diese Datei sonst anprangert. */
	it('behält den Code hinter einem MIME-Glob im Blick', () => {
		const code = [
			"const cfg = { accept: 'image/*,video/*' };",
			'const where = isNotNull(sightings.approvedAt);',
			'/** Irgendein späterer Kommentar, der den Glob schließen würde. */'
		].join('\n');

		expect(findApprovalPredicates(code)).toEqual([
			{ line: 2, text: 'isNotNull(sightings.approvedAt' }
		]);
	});

	/**
	 * Das blanke `if (row.approvedAt)` — die Grenze der JS-Regel.
	 *
	 * Übernommen aus `approvalFilter.test.ts` (PR #704) und dort begründet: Ohne
	 * weitere Operatoren ist die Form von einer legitimen Verwendung des Werts
	 * nicht zu unterscheiden — `approvedAt ?? null` in derselben Antwort, ein
	 * Datum formatieren, ein Feld anzeigen. Wer sie melden wollte, müsste den
	 * Quelltext parsen statt ihn zu durchsuchen.
	 *
	 * Die Grenze ist damit benannt und nicht still: Eine vierte Route, die ihre
	 * Freigabeprüfung ausgerechnet so schreibt, fällt weder hier noch dort auf.
	 * Die drei Formen, die beim Zurückbauen tatsächlich entstehen, fallen auf.
	 */
	it.each([
		'if (file.approvedAt) return file;',
		'approvedAt: sighting.approvedAt ?? null,',
		'const label = formatLocalDateTime(sighting.approvedAt);'
	])('lässt die mehrdeutige Wertverwendung %s durch', (code) => {
		expect(findApprovalPredicates(code)).toEqual([]);
	});
});

/**
 * Dieselbe Regel in JavaScript — seit PR #704 mit eigenem Helper.
 *
 * Diese Gruppe stand in der ersten Fassung dieses PR als **Ausnahme** da, mit
 * der Begründung, es gebe für eine geladene Zeile keine importierbare Antwort.
 * Das stimmte, und die Datei schrieb dazu: „Wer daraus einen gemeinsamen Helper
 * macht, kann diese Ausnahme streichen." PR #704 hat ihn gemacht —
 * `isSightingApproved()` steht neben `approvedOnly()` in derselben Datei. Die
 * Bedingung, unter der die Ausnahme fallen sollte, ist eingetreten; sie
 * stehenzulassen wäre genau die abgestandene Begründung, gegen die dieser PR
 * antritt.
 */
describe('JavaScript-Schreibweisen', () => {
	it.each([
		'const isApproved = !!file.approvedAt;',
		'const isApproved = !!row.approvedAt;',
		'const isApproved = Boolean(file.approvedAt);',
		'const isApproved = file.approvedAt !== null;',
		'const isApproved = file.approvedAt != null;',
		'if (sighting.approvedAt !== null) publish();'
	])('meldet %s', (code) => {
		expect(findApprovalPredicates(code)).toHaveLength(1);
	});

	/* Dieselben drei Schreibweisen, jetzt auf der Ablehnungs-Spalte — spiegelbildlich
	   zum approvedAt-Block oben. Ohne diese Beispiele wäre COLUMN in JS_ORDER zwar
	   erweitert, aber unbelegt: Der Scan könnte weiterhin nur approvedAt erkennen und
	   der Test bliebe grün. */
	it.each([
		'const isRejected = !!file.rejectedAt;',
		'const isRejected = !!row.rejectedAt;',
		'const isRejected = Boolean(file.rejectedAt);',
		'const isRejected = file.rejectedAt !== null;',
		'const isRejected = file.rejectedAt != null;',
		'if (sighting.rejectedAt !== null) triage();'
	])('meldet %s', (code) => {
		expect(findApprovalPredicates(code)).toHaveLength(1);
	});

	/* Der Ersatz muss durchkommen, sonst ist die Regel unerfüllbar — und der
	   Import gleich mit, sonst meldet die Regel ihre eigene Lösung. */
	it.each([
		"import { isSightingApproved } from '#lib/server/db/approvalFilter';",
		'if (!isSightingApproved(file)) throw error(403);',
		'const isApproved = isSightingApproved(file);'
	])('lässt den vorgeschriebenen Weg %s durch', (code) => {
		expect(findApprovalPredicates(code)).toEqual([]);
	});

	/* Derselbe Ersatz für die Ablehnungs-Spalte. */
	it.each([
		"import { isSightingRejected } from '#lib/server/db/approvalFilter';",
		'if (isSightingRejected(sighting)) return;',
		'const isRejected = isSightingRejected(sighting);'
	])('lässt den vorgeschriebenen Weg %s durch', (code) => {
		expect(findApprovalPredicates(code)).toEqual([]);
	});

	/* Andere Spalten behalten ihre Truthy-Prüfungen. */
	it.each([
		'const hasDate = !!sighting.sightingDate;',
		'if (file.deletedAt !== null) skip();',
		'const ok = Boolean(sighting.email);'
	])('lässt %s durch', (code) => {
		expect(findApprovalPredicates(code)).toEqual([]);
	});
});

describe('Bestand', () => {
	it('baut das Freigabe-Prädikat nirgends außerhalb von approvalFilter.ts', () => {
		const offenders = scannedFiles()
			.filter((path) => !ALLOWED_FILES.has(path))
			.flatMap((path) =>
				findApprovalPredicates(readFileSync(path, 'utf-8')).map(
					(hit) => `${path}:${hit.line} — ${hit.text}`
				)
			);

		expect(offenders, `Selbstgebautes Freigabe-Prädikat gefunden.\n\n${REMEDIATION}\n`).toEqual([]);
	});

	/* Zwei Selbsttests. Ein Scan, der nichts liest oder nichts erkennt, ist grün
	   und beweist nichts — das ist die Sorte Deckung, die keine ist. */
	it('liest überhaupt Quelldateien ein', () => {
		expect(scannedFiles().length).toBeGreaterThan(100);
	});

	it('würde approvalFilter.ts selbst melden, stünde es nicht auf der Ausnahmeliste', () => {
		const definition = readFileSync('src/lib/server/db/approvalFilter.ts', 'utf-8');

		// Alle drei Definitionen, nicht „mindestens eine": Fände das Muster nur
		// isNotNull und nicht isNull, bliebe die halbe Regel unbemerkt wirkungslos.
		// Seit PR #704 steht die JavaScript-Form daneben und gehört mit geprüft —
		// sie ist der Grund, warum diese Liste wachsen konnte, ohne dass jemand
		// den Scan anfassen musste.
		expect(findApprovalPredicates(definition).map((hit) => hit.text)).toEqual([
			'isNotNull(sightings.approvedAt',
			'isNull(sightings.approvedAt',
			'!!sighting.approvedAt',
			'isNull(sightings.approvedAt',
			'isNotNull(sightings.rejectedAt',
			'!!sighting.rejectedAt'
		]);
	});

	it('nennt für jede Ausnahme eine Begründung', () => {
		const files = scannedFiles();

		for (const [path, reason] of ALLOWED_FILES) {
			expect(files, `Ausnahme zeigt auf eine Datei, die es nicht gibt: ${path}`).toContain(path);
			expect(reason.length, `Ausnahme ohne Begründung: ${path}`).toBeGreaterThan(40);
		}
	});
});
