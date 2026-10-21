import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectHits, sourceFiles, stripComments } from '#lib/testing/sourceScan.testutil.ts';
import type { SourceHit } from '#lib/testing/sourceScan.testutil.ts';

/**
 * @fileoverview `geprueft` (`verified`) darf nirgends mehr **gelesen** werden
 *
 * Geschrieben wird die Spalte weiterhin — vom Verify-Endpunkt und vom
 * Insert-Pfad, damit ein etwaiger Leser im Altsystem konsistente Daten sieht.
 * Verboten ist der **lesende** Zugriff für die Anzeige: Der Status kommt aus
 * `getSightingStatus()` (`sightingStatus.ts`), die öffentliche Grundmenge aus
 * `freigegeben_am` (`.claude/rules/api.md`).
 *
 * Nötig, weil die Rückkehr schleichend passiert: Ein `sighting.verified` in
 * einer neuen Zelle sieht harmlos aus und weicht doch von dem ab, was die
 * Öffentlichkeit sieht (31 abweichende Zeilen im Bestand, 2026-08-07). Ein
 * Review fängt das nicht zuverlässig — bei `freigegeben_am` hat es monatelang
 * nicht gegriffen (PR #701).
 *
 * **Warum hier konstruierte Beispiele stehen.** Die erste Fassung dieses Guards
 * bestand aus einem einzigen `it`, das über den konformen Bestand lief. Ein
 * Scan über einen konformen Bestand belegt nichts über die Regel — er ist auch
 * dann grün, wenn das Muster eine Lücke hat, und er hatte drei: Jeder
 * Empfängername außer `sighting`/`sightings` (`row.verified`, `s.verified`),
 * Destructuring und der Bracket-Zugriff rutschten durch. Belegt war das nur
 * durch eine manuelle Wegwerf-Änderung, die mit dem Bericht verdunstet ist.
 * Deshalb steht unter „Mustererkennung" je Schreibweise ein konstruiertes
 * Beispiel und unter „Gegenproben", was **nicht** anschlagen darf — nach dem
 * Vorbild `src/lib/server/db/approvalPredicateScan.test.ts`.
 *
 * Textaufbereitung und Dateisuche kommen aus `#lib/testing/sourceScan.testutil.js`
 * — dieselbe getestete `stripComments()`, die auch das Vorbild benutzt. Ein
 * zweites Verfahren im selben Repo würde getrennt altern.
 *
 * Läuft im Node-Projekt (`npm run test:unit`, damit auch in `test:quick`).
 */

/** Was der Entwickler stattdessen tun soll — erscheint in jeder Fehlermeldung. */
const REMEDIATION = [
	'Der Status einer Sichtung wird abgeleitet, nicht aus `verified`/`geprueft` gelesen:',
	"  import { getSightingStatus } from '#lib/components/admin/sightingStatus';",
	'  const status = getSightingStatus({ approvedAt, rejectedAt });',
	'',
	// Das Prädikat steht hier absichtlich nicht ausgeschrieben: Es selbst zu
	// bauen verbietet `approvalPredicateScan.test.ts` — auch in einer
	// Fehlermeldung.
	'In SQL kommt die öffentliche Grundmenge aus dem Freigabe-Filter:',
	"  import { approvedOnly, openOnly, rejectedOnly } from '#lib/server/db/approvalFilter';",
	'',
	'Geschrieben werden darf die Spalte weiter — aber nur vom Verify-Endpunkt',
	'und vom Insert-Pfad (siehe ALLOWED_FILES unten).'
].join('\n');

/**
 * Empfänger, die zufällig `verified` heißen, aber nicht die Spalte sind.
 *
 * Beide Namen stammen aus dem **Abfrage**-Vokabular der Admin-Tabelle, nicht
 * aus dem Datenmodell: `?verified=` ist der Query-Parameter des Statusfilters
 * (`.claude/rules/admin.md`), `columnVisibility.verified` der Schlüssel der
 * abschaltbaren Statusspalte. Beide würden bei einer Umbenennung eine URL
 * bzw. eine gespeicherte Nutzereinstellung brechen und bleiben deshalb so.
 *
 * Diese Ausnahme sitzt am **Ausdruck** und nicht an der Datei, und das ist der
 * Punkt: `admin/sichtungen/+page.svelte` ist genau die Datei, in der ein
 * Rückfall zuerst landen würde. Sie auf die Dateiliste zu setzen, nur weil sie
 * zwei Filterausdrücke enthält, würde die Regel dort vollständig abschalten.
 */
const KEIN_SPALTENZUGRIFF: ReadonlyMap<string, string> = new Map([
	[
		'currentFilters',
		'Der Query-Parameter `?verified=` der Admin-Tabelle. Er trägt seit der Umstellung die Werte open/approved/rejected und nicht mehr 0/1 — der Name ist Teil des URL-Vertrags, nicht des Datenmodells.'
	],
	[
		'columnVisibility',
		'Schlüssel der abschaltbaren Statusspalte in der Admin-Tabelle. Die Spalte selbst rendert getSightingStatus(); der Schlüssel steht in gespeicherten Nutzereinstellungen und wird deshalb nicht umbenannt.'
	]
]);

const AUSGENOMMENE_EMPFAENGER = [...KEIN_SPALTENZUGRIFF.keys()].join('|');

/**
 * Der Property-Zugriff — **jeder** Empfänger, nicht nur `sighting`.
 *
 * Die abgelöste Fassung verlangte `\bsightings?\.verified\b`. Damit blieben
 * `row.verified`, `s.verified`, `item.verified` und `data.verified` unsichtbar,
 * und genau so heißen die Variablen in Tabellenzeilen und Repository-Ergebnissen.
 * Zwei Lesestellen im Bestand (`jsonExport.test.ts`, `verify.contract.test.ts`)
 * standen unbemerkt da, während der Guard grün war.
 *
 * `email_verified` (der Auth0-Claim) braucht keine eigene Ausnahme mehr: Vor
 * `verified` steht dort ein `_` und kein Punkt. Die frühere `includes()`-Prüfung
 * verwarf dagegen die ganze Zeile — ein `sighting.verified` neben einem
 * `email_verified` wäre mit durchgerutscht.
 *
 * Ein Zeilenumbruch zwischen Empfänger und Punkt (`currentSighting\n\t.verified`,
 * so bricht Prettier lange Ketten um) fällt automatisch mit an: Gesucht wird ab
 * dem Punkt, nicht ab dem Empfänger.
 */
const PROPERTY = new RegExp(String.raw`(?<!${AUSGENOMMENE_EMPFAENGER})\.verified\b`, 'g');

/**
 * Der Bracket-Zugriff `sighting['verified']`.
 *
 * Der Lookbehind verlangt vor der Klammer ein Wortzeichen, `]` oder `)` — also
 * einen Empfänger. Ohne ihn wäre jedes Array-Literal mit dem Feldnamen ein
 * Treffer, etwa `forbiddenFields: ['verified']` in `submitSightingForm.test.ts`,
 * das die Spalte gerade **verbietet**.
 */
const BRACKET = /(?<=[\w$\])])\s*\[\s*(['"`])verified\1\s*\]/g;

/**
 * Destructuring: `const { verified } = sighting;` und `({ verified }) => …`.
 *
 * `[^{}]*` hält den Treffer innerhalb **eines** Klammerpaares, damit ein
 * Objektliteral weiter oben in der Datei nicht mit dem `=` einer späteren
 * Zuweisung zu einem Treffer verklebt. Das `[^=>]` schließt `==`/`===` aus —
 * ein Vergleich gegen ein Objektliteral ist keine Entnahme — und der zweite
 * Zweig `) =>` fängt den destrukturierten Funktionsparameter, der sonst nur an
 * einer Klammer statt an einem Gleichheitszeichen endet.
 */
const DESTRUCTURING = /\{[^{}]*\bverified\b[^{}]*\}\s*(?:=[^=>]|\)\s*=>)/g;

/**
 * Die Spalte unter ihrem SQL-Namen.
 *
 * **Nur Code-Kontexte**, und das ist die Lehre aus der abgelösten Fassung: Ein
 * nacktes `\bgeprueft\b` traf jeden Testtitel und jede Fehlermeldung, in der das
 * Wort vorkam. Die Folge waren zwei zerhackte Literale (`'gepr' + 'ueft'`) im
 * Bestand, die nur den Scanner täuschen sollten — eine Zusicherung, die die
 * **Abwesenheit** der Spalte im erzeugten SQL belegt, muss sie nennen dürfen.
 *
 * Getroffen wird deshalb: der qualifizierte Zugriff (`sichtungen.geprueft`), das
 * exakte Stringliteral (`'geprueft'`, `"geprueft"`), der Beginn eines
 * Template-Literals (`` sql`geprueft IS NOT NULL` ``) und die Zuweisung bzw. der
 * Objektschlüssel (`geprueft = 1`, `geprueft:`). Prosa trifft keines davon.
 */
const SQL_COLUMN = /\.geprueft\b|`geprueft\b|(['"])geprueft\1|\bgeprueft\s*[:=]/g;

const PATTERNS = [PROPERTY, BRACKET, DESTRUCTURING, SQL_COLUMN] as const;

/**
 * Meldet jede Lesestelle auf `verified`/`geprueft` in `source`.
 *
 * @returns Fundstellen (leer = konform), aufsteigend nach Zeile.
 */
export function findVerifiedReads(source: string): SourceHit[] {
	return collectHits(stripComments(source), PATTERNS);
}

/**
 * Dateien, in denen die Spalte vorkommen darf — je mit Begründung.
 *
 * Als `ReadonlyMap` und nicht als Array: Ein Eintrag ohne Begründung ist damit
 * nicht formulierbar, und „nennt für jede Ausnahme eine Begründung" unten prüft
 * zusätzlich, dass sie eine ist. Eine pauschale Endung (`*.test.ts`) wäre
 * bequem und würde die Regel aushöhlen — die meisten Rückfälle entstehen genau
 * dort, wo jemand eine Anzeige testet.
 */
const ALLOWED_FILES: ReadonlyMap<string, string> = new Map([
	[
		'src/lib/server/db/schema.ts',
		'Die Spaltendefinition selbst. Ohne sie gäbe es die Spalte nicht, die der Verify-Endpunkt für das Altsystem weiterschreibt.'
	],
	[
		'src/routes/api/sightings/[id]/verify/+server.ts',
		'Der einzige Endpunkt, der den Prüfstatus schreibt. Er setzt geprueft und freigegeben_am gemeinsam (api.md) und muss die Spalte dafür nennen.'
	],
	[
		'src/lib/server/db/mapFormToSighting.ts',
		'Der Insert-Pfad. Eine neu gemeldete Sichtung bekommt die Spalte gesetzt, damit ein Leser im Altsystem konsistente Daten sieht.'
	],
	[
		'src/lib/server/db/mapFormToSighting.test.ts',
		'Prüft genau diesen Schreibpfad — dass die Spalte beim Insert korrekt gesetzt wird, lässt sich nur belegen, indem der Test das Ergebnis liest.'
	],
	[
		'src/lib/server/db/sightingRepository.ts',
		'Schreibt beim Anlegen und schließt die Spalte beim Admin-Update ausdrücklich aus. Beides braucht ihren Namen.'
	],
	[
		'src/lib/report/components/ModernReportForm.svelte',
		'Nimmt das Formularfeld verified vor dem Absenden per Destructuring aus den Werten heraus — es ist ein Admin-Feld und gehört nicht in die Meldung. Die Stelle entfernt die Spalte, sie zeigt sie nicht.'
	],
	[
		'src/routes/api/sightings/export/exportFilterParams.ts',
		'Der Export-Filter liest den Query-Parameter ?verified= und reicht ihn an statusCondition() weiter. Der Name gehört zum URL-Vertrag der Admin-Tabelle, der Wert ist open/approved/rejected — nicht die Spalte.'
	],
	[
		'src/routes/api/sightings/export/json/+server.ts',
		'Entnimmt denselben Query-Parameter aus den geparsten Filtern, um ihn in die Export-Metadaten zu schreiben. Gefiltert wird über buildExportConditions() und damit über freigegeben_am.'
	],
	[
		'src/lib/components/admin/verifiedReadScan.test.ts',
		'Diese Datei. Die konstruierten Beispiele unter „Mustererkennung" sind Verstöße — das ist ihr Zweck, denn ein Scan über einen konformen Bestand belegt nichts über die Regel.'
	],
	[
		'src/routes/admin/sichtungen/statusFilter.test.ts',
		'Sichert zu, dass das erzeugte SQL die alte Spalte NICHT enthält, und muss sie dafür wörtlich nennen. Das Literal stand hier bis zu diesem PR als "gepr" + "ueft" — eine Täuschung des Scanners statt einer Ausnahme.'
	],
	[
		'src/routes/admin/statistics/page.server.test.ts',
		'Sichert zu, dass keine Statistik-Abfrage mehr über die alte Spalte filtert, und muss sie dafür wörtlich nennen. Gleiche Herkunft wie der statusFilter-Test: vorher ein zerhacktes Literal.'
	],
	[
		'src/routes/api/sightings/[id]/verify/verify.test.ts',
		'Pinnt die Antwort des schreibenden Endpunkts. Die Antwort führt die Spalte, weil der Endpunkt sie schreibt — die Zusicherung darüber ist kein Anzeigepfad.'
	],
	[
		'src/tests/contract/verify.contract.test.ts',
		'Pinnt denselben Endpunkt als Vertrag gegen die Legacy-Clients. Auch hier ist die Spalte Teil der Antwort, nicht Teil einer Anzeige.'
	],
	[
		'src/lib/server/export/jsonExport.test.ts',
		'Pinnt das Feld verified im JSON-Export. Der Export bildet die Zeile ab und ist damit ein Datenpfad, keine Statusanzeige — die Zusicherung muss das Feld nennen. Dass die CSV seit 2026-08 stattdessen den abgeleiteten Status führt, ist eine bewusste Entscheidung: Die JSON-Struktur ist ein Vertrag mit ihren Weiterverarbeitern, die CSV ist Lesestoff für Menschen. Kein Grund zum Angleichen.'
	]
]);

const SOURCE_ROOT = 'src';

/**
 * `.svelte` ist dabei, `.png`/`.woff2`/`.geojson` nicht.
 *
 * Die abgelöste Fassung las **jede** Datei unter `src/` als UTF-8 ein — 751
 * statt der Quelldateien, inklusive Webfonts und GeoJSON. Anders als beim
 * Vorbild (`approvalPredicateScan.test.ts`, dort nur `.ts`/`.js`) gehören die
 * Komponenten hier zwingend dazu: Eine Tabellenzelle mit `{sighting.verified}`
 * ist genau der Rückfall, gegen den diese Regel antritt.
 */
const SOURCE_EXTENSIONS = /\.(ts|js|svelte)$/;

describe('Mustererkennung', () => {
	it.each([
		'const geprueft = sighting.verified;',
		'if (row.verified === 1) return;',
		'{#if s.verified}<span>geprüft</span>{/if}',
		'<td>{item.verified ? "ja" : "nein"}</td>',
		'const flag = data.verified;'
	])('meldet den Property-Zugriff %s', (code) => {
		expect(findVerifiedReads(code)).toHaveLength(1);
	});

	it('meldet den über mehrere Zeilen umgebrochenen Zugriff', () => {
		const code = ['const flag = currentSighting', '\t.verified;'].join('\n');

		expect(findVerifiedReads(code)).toEqual([{ line: 2, text: '.verified' }]);
	});

	it.each([
		'const { verified } = sighting;',
		'const { id, verified } = row;',
		'const render = ({ verified }) => (verified ? "ja" : "nein");'
	])('meldet das Destructuring %s', (code) => {
		expect(findVerifiedReads(code).length).toBeGreaterThan(0);
	});

	it.each([
		"const flag = sighting['verified'];",
		'const flag = sighting["verified"];',
		"const flag = rows[0]['verified'];"
	])('meldet den Bracket-Zugriff %s', (code) => {
		expect(findVerifiedReads(code)).toHaveLength(1);
	});

	it.each([
		'sql`sichtungen.geprueft = 1`',
		'sql`geprueft IS NOT NULL`',
		"sql`${sql.identifier('geprueft')} = 1`",
		'const spalte = "geprueft";',
		'const update = { geprueft: 1 };'
	])('meldet die SQL-Spalte in %s', (code) => {
		expect(findVerifiedReads(code).length).toBeGreaterThan(0);
	});

	it('meldet die Zeile, in der die Lesestelle steht', () => {
		const code = ['// erste Zeile', '', 'const flag = row.verified;'].join('\n');

		expect(findVerifiedReads(code)[0]?.line).toBe(3);
	});

	it('meldet mehrere Fundstellen in einer Datei', () => {
		const code = ['const a = row.verified;', 'const b = sql`geprueft = 1`;'].join('\n');

		expect(findVerifiedReads(code).map((hit) => hit.line)).toEqual([1, 2]);
	});
});

describe('Gegenproben', () => {
	/* Diese Gruppe wiegt schwerer als die obige. Eine Regel, die den Ersatz oder
	   die Nachbarschaft mitnimmt, wird beim ersten roten Lauf aufgeweicht statt
	   befolgt — und ist danach schlechter als keine. */

	it.each([
		'const claims = { email_verified: true };',
		'if (user.email_verified) return;',
		"const ok = payload['email_verified'];",
		'const { email_verified } = claims;'
	])('lässt den Auth0-Claim %s durch', (code) => {
		expect(findVerifiedReads(code)).toEqual([]);
	});

	it.each([
		"import { getSightingStatus } from '#lib/components/admin/sightingStatus';",
		'const status = getSightingStatus({ approvedAt, rejectedAt });',
		'.where(approvedOnly())',
		'const { approvedAt, rejectedAt } = sighting;'
	])('lässt den vorgeschriebenen Weg %s durch', (code) => {
		expect(findVerifiedReads(code)).toEqual([]);
	});

	it('lässt Kommentare durch, die die Spalte erwähnen', () => {
		const code = [
			'// sighting.verified wird hier bewusst nicht gelesen.',
			'/* Der Endpunkt schreibt geprueft weiter, damit das Altsystem konsistent bleibt. */',
			'/**',
			' * `sichtungen.geprueft` stand bis Task 9 in dieser Zelle.',
			' */',
			'const status = getSightingStatus(sighting);'
		].join('\n');

		expect(findVerifiedReads(code)).toEqual([]);
	});

	/* Der `<!-- -->`-Zweig in stripComments, den das Vorbild nicht braucht:
	   CLAUDE.md verlangt Begründungen im Svelte-Markup ausdrücklich neben dem
	   Markup und nicht im <script>-Block. Ohne diesen Zweig wäre jede solche
	   Begründung ein Treffer — und die Regel damit unbefolgbar. */
	it('lässt den Svelte-HTML-Kommentar durch', () => {
		const code = [
			'<!-- Status kommt aus getSightingStatus(), nicht aus sighting.verified. -->',
			'<td>{status.label}</td>'
		].join('\n');

		expect(findVerifiedReads(code)).toEqual([]);
	});

	it.each([
		"it('liest geprueft nirgends mehr', () => {",
		"expect(fehler).toBe('geprueft darf nicht gelesen werden');",
		"describe('geprueft und freigegeben_am', () => {"
	])('lässt die Prosa im Testtitel %s durch', (code) => {
		expect(findVerifiedReads(code)).toEqual([]);
	});

	/* Das `(?<!:)` in stripComments: Ohne es verschluckt eine URL den Rest ihrer
	   Zeile — und mit ihm eine Lesestelle, die dahinter steht. */
	it('behält den Code hinter einer URL im Blick', () => {
		const code = "const url = 'https://x/y'; const flag = row.verified;";

		expect(findVerifiedReads(code)).toHaveLength(1);
	});

	/* Ein Array-Literal mit dem Feldnamen ist kein Zugriff — im Bestand steht es
	   in submitSightingForm.test.ts als Liste der Felder, die gerade NICHT
	   übernommen werden dürfen. */
	it.each(["const forbiddenFields = ['verified'];", "forbiddenFields: ['verified', 'approvedAt']"])(
		'lässt das Array-Literal %s durch',
		(code) => {
			expect(findVerifiedReads(code)).toEqual([]);
		}
	);

	it.each([...KEIN_SPALTENZUGRIFF.keys()])(
		'lässt den Abfrage-Empfänger %s.verified durch',
		(empfaenger) => {
			expect(findVerifiedReads(`const wert = ${empfaenger}.verified;`)).toEqual([]);
		}
	);

	/* Die Ausnahme hängt am Empfänger und nicht an der Datei: In derselben Datei
	   muss ein echter Zugriff weiterhin auffallen. Ohne diese Gegenprobe wäre
	   nicht belegt, dass der Lookbehind eng genug ist. */
	it('meldet den echten Zugriff neben einem ausgenommenen Empfänger', () => {
		const code = [
			'const filter = currentFilters.verified;',
			'const flag = sighting.verified;'
		].join('\n');

		expect(findVerifiedReads(code)).toEqual([{ line: 2, text: '.verified' }]);
	});
});

describe('Bestand', () => {
	it('liest die Spalte nirgends außerhalb der Ausnahmen', () => {
		const offenders = sourceFiles(SOURCE_ROOT, SOURCE_EXTENSIONS)
			.filter((path) => !ALLOWED_FILES.has(path))
			.flatMap((path) =>
				findVerifiedReads(readFileSync(path, 'utf-8')).map(
					(hit) => `${path}:${hit.line} — ${hit.text}`
				)
			);

		expect(offenders, `Lesestelle auf verified/geprueft gefunden.\n\n${REMEDIATION}\n`).toEqual([]);
	});

	/* Zwei Selbsttests. Ein Scan, der nichts liest oder nichts erkennt, ist grün
	   und beweist nichts — das ist die Sorte Deckung, die keine ist. */
	it('liest überhaupt Quelldateien ein', () => {
		expect(sourceFiles(SOURCE_ROOT, SOURCE_EXTENSIONS).length).toBeGreaterThan(100);
	});

	it('nimmt Binärdateien nicht mit auf', () => {
		expect(
			sourceFiles(SOURCE_ROOT, SOURCE_EXTENSIONS).filter((p) => !SOURCE_EXTENSIONS.test(p))
		).toEqual([]);
	});

	it('würde den Verify-Endpunkt selbst melden, stünde er nicht auf der Ausnahmeliste', () => {
		const endpunkt = readFileSync('src/routes/api/sightings/[id]/verify/+server.ts', 'utf-8');

		expect(findVerifiedReads(endpunkt).length).toBeGreaterThan(0);
	});

	it('nennt für jede Ausnahme eine Begründung — und jede Ausnahme wird gebraucht', () => {
		const files = sourceFiles(SOURCE_ROOT, SOURCE_EXTENSIONS);

		for (const [path, reason] of ALLOWED_FILES) {
			expect(files, `Ausnahme zeigt auf eine Datei, die es nicht gibt: ${path}`).toContain(path);
			expect(reason.length, `Ausnahme ohne Begründung: ${path}`).toBeGreaterThan(40);
			// Eine Ausnahme ohne Fundstelle ist abgestanden: Sie deckt nichts mehr,
			// hält aber die Datei dauerhaft aus dem Scan heraus.
			expect(
				findVerifiedReads(readFileSync(path, 'utf-8')).length,
				`Ausnahme ohne Fundstelle — bitte streichen: ${path}`
			).toBeGreaterThan(0);
		}

		for (const reason of KEIN_SPALTENZUGRIFF.values()) {
			expect(reason.length).toBeGreaterThan(40);
		}
	});
});
