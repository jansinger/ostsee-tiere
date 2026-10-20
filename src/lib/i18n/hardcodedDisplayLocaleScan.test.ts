import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectHits, sourceFiles, stripComments } from '#lib/testing/sourceScan.testutil.ts';
import type { SourceHit } from '#lib/testing/sourceScan.testutil.ts';

/**
 * @fileoverview Ein hartcodiertes `'de-DE'`/`'en-US'`/`'en-GB'` in einem
 * `Intl`-/`toLocale*`-Aufruf des öffentlichen Codes ist der Rückfall, den
 * dieser Guard verhindert.
 *
 * **Hintergrund.** Etappe 2 führte `resolveDisplayLocale()` in
 * `src/lib/utils/format/dateTime.ts` ein: die eine Stelle, die die kurze
 * Paraglide-Locale (`de`/`en`) auf die BCP-47-Anzeigesprache abbildet, mit
 * der `Intl`/`toLocaleString` formatiert. Der ursprüngliche Migrationsplan
 * behauptete, `src/routes/about/+page.svelte` sei die einzige öffentlich
 * sichtbare Formatierungsstelle — ein Review vom 2026-08-11 widerlegte das:
 * neun weitere Stellen in `src/lib/map/**` und im Meldeformular
 * (`FormHelp.svelte`, `DropzoneEnhanced.svelte`) hingen ebenfalls hart an
 * `'de-DE'` und blieben unter `/en` deutsch formatiert, ohne dass irgendetwas
 * rot wurde. Siehe `docs/i18n/PLAN_ETAPPE2.md`, Aufgabe 2.1, Schritt 4.
 *
 * **Umfang.** Ganz `src/` (`.ts`/`.svelte`), abzüglich vier begründeter
 * Ausnahmegruppen:
 *
 *   1. Der Admin-Bereich (`src/routes/admin/**`, `src/lib/components/admin/**`)
 *      — wird nicht lokalisiert, siehe CLAUDE.md.
 *   2. Export- und Legacy-API-Pfade (`src/lib/server/export/**`,
 *      `src/routes/rest_sichtungen/**`, `src/routes/sichtungen/**`) — müssen
 *      deutsch bleiben, das ist der bestehende Vertrag mit dem Altsystem und
 *      der angebundenen iOS-App.
 *   3. Einzelne Dateien mit eigener Begründung (`EXEMPT_FILES` unten) —
 *      Rechenstellen (`sv-SE` fällt ohnehin nicht unters Muster, siehe
 *      Musterbeschreibung), die Zuordnung selbst (`dateTime.ts`) und ein paar
 *      Stellen ohne Bezug zur aktiven Anzeigesprache.
 *
 * **Warum das Muster nicht jedes `'de-DE'`-Literal meldet.** Ein nacktes
 * Literal träfe auch Prosa, Testtitel und JSON-Fixtures. Gemeldet wird nur ein
 * Literal, das **direkt** als erstes Argument eines `Intl`-/`toLocale*`-Aufrufs
 * steht — genau der Fall, den `resolveDisplayLocale(getLocale())` ersetzt.
 * `sv-SE` steht bewusst nicht in der Liste: Diese Aufrufe sind Berechnung
 * (ISO-Reihenfolge für `<input type="date">`, Zeitzonen-Offset), keine
 * Anzeige — dokumentiert in `dateTime.ts` selbst. Ein bloßes `'de'`/`'en'`
 * direkt im Aufruf zählt trotzdem: Node löst ein bares `'en'` als `'en-US'`
 * auf (siehe `dateTime.ts`), auch das ist ein hartcodierter Sprach-Tag statt
 * der Zuordnung.
 *
 * Textaufbereitung und Dateisuche kommen aus `#lib/testing/sourceScan.testutil.js`
 * — dieselbe getestete `stripComments()` wie die vier bestehenden Guards
 * (`approvalPredicateScan`, `verifiedReadScan`, `statusLogWriteScan`,
 * `openQueueOrderScan`) und der jüngste (`hardcodedStringScan`).
 *
 * Läuft im Node-Projekt (`npm run test:unit`, damit auch in `test:quick`).
 */

/** Was der Entwickler stattdessen tun soll — erscheint in jeder Fehlermeldung. */
const REMEDIATION = [
	'Hartcodierter Sprach-Tag in einem Intl-/toLocale*-Aufruf des öffentlichen Codes.',
	'Statt des Literals:',
	"  import { getLocale } from '#lib/paraglide/runtime';",
	"  import { resolveDisplayLocale } from '#lib/utils/format/dateTime';",
	'  date.toLocaleDateString(resolveDisplayLocale(getLocale()), { … })',
	'',
	'Muss die Ausgabe unabhängig von der Anzeigesprache deutsch bleiben (Export,',
	'Legacy-API, Admin), explizit auf baseLocale pinnen und die Stelle mit',
	'Begründung in EXEMPT_FILES dieses Scans aufnehmen — nicht kommentarlos',
	'stehen lassen.'
].join('\n');

/** Die drei in diesem Projekt tatsächlich verwendeten Anzeigesprachen-Tags plus die bloßen Kürzel. */
const LOCALE_TAG = String.raw`de-DE|en-US|en-GB|de|en`;

/** `toLocaleDateString`/`toLocaleTimeString`/`toLocaleString`/`Intl.NumberFormat`/`Intl.DateTimeFormat`. */
const CALL_PREFIX = String.raw`(?:toLocaleDateString|toLocaleTimeString|toLocaleString|Intl\s*\.\s*NumberFormat|Intl\s*\.\s*DateTimeFormat)`;

/**
 * Trifft nur, wenn der Sprach-Tag **direkt** das erste Argument des Aufrufs
 * ist — `\(\s*` lässt dabei nur Leerraum zwischen der öffnenden Klammer und
 * dem Anführungszeichen zu, keinen Bezeichner. `resolveDisplayLocale(getLocale())`
 * oder eine Variable an derselben Stelle treffen das Muster deshalb nicht.
 */
const HARDCODED_LOCALE_PATTERN = new RegExp(
	String.raw`${CALL_PREFIX}\s*\(\s*(['"\`])(?:${LOCALE_TAG})\1`,
	'g'
);

/**
 * Meldet jedes hartcodierte Sprach-Tag-Literal in einem `Intl`-/`toLocale*`-Aufruf
 * in `source`.
 *
 * @returns Fundstellen (leer = konform), aufsteigend nach Zeile.
 */
export function findHardcodedDisplayLocales(source: string): SourceHit[] {
	return collectHits(stripComments(source), [HARDCODED_LOCALE_PATTERN]);
}

const SOURCE_ROOT = 'src';
const SOURCE_EXTENSIONS = /\.(ts|svelte)$/;

/** Verzeichnisse, in denen die aktive Anzeigesprache bewusst keine Rolle spielt. */
const EXEMPT_DIR_PREFIXES = [
	'src/routes/admin/',
	'src/lib/components/admin/',
	'src/lib/server/export/',
	'src/routes/rest_sichtungen/',
	'src/routes/sichtungen/'
];

function isInExemptDirectory(path: string): boolean {
	return EXEMPT_DIR_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Einzeldateien mit eigener Begründung — außerhalb der Verzeichnis-Ausnahmen
 * oben, aber jeweils kein öffentlicher Anzeigepfad, der von der aktiven
 * Locale abhängen sollte.
 */
const EXEMPT_FILES: ReadonlyMap<string, string> = new Map([
	[
		'src/lib/utils/format/dateTime.ts',
		'Trägt DISPLAY_LOCALE_BY_LOCALE selbst — die eine Stelle, die de/en auf de-DE/en-GB abbildet. Ein Scan, der diese Zuordnung meldet, verbietet ihre eigene Grundlage.'
	],
	[
		'src/lib/legacy-api/date-utils.ts',
		"Legacy-REST-Kontrakt für die angebundene iOS-App (siehe CLAUDE.md → Legacy REST API): das feste DD/MM/YY-Format über Intl.DateTimeFormat('en-GB') ist Formatvorgabe, nicht an die aktive Anzeigesprache gekoppelt."
	],
	[
		'src/lib/components/charts/BarChart.svelte',
		'Default für formatValue einer wiederverwendbaren Chart-Komponente; die einzige aktuelle Aufrufstelle ist src/routes/admin/statistics/+page.svelte und übergibt ohnehin ein eigenes Format. Zieht die Komponente auf eine öffentliche Route, braucht formatValue dort einen expliziten resolveDisplayLocale(getLocale())-Default.'
	],
	[
		'src/lib/server/middleware/rateLimit.ts',
		'Serverseitige HTTP-429-Fehlermeldung (Freitext für alle API-Clients inkl. Legacy/Mobile), kein UI-Rendering und nicht an die Paraglide-Locale des anfragenden Browsers gebunden.'
	],
	[
		'src/lib/server/services/emailService.ts',
		'Deutsche Konfigurations-Testmail an Admins, ausgelöst aus den Einstellungen — kein an einen Melder gerichteter, lokalisierter Nutzertext.'
	],
	[
		'src/lib/utils/file/fileSize.ts',
		'formatFileSizeDE hat keine Aufrufstelle im Bestand (nur re-exportiert über utils/index.ts); der Namensteil DE ist bewusst so und nicht durch resolveDisplayLocale ersetzbar, ohne die Funktion umzubenennen oder zu entfernen.'
	]
]);

function scopeFiles(): string[] {
	return sourceFiles(SOURCE_ROOT, SOURCE_EXTENSIONS).filter(
		(path) =>
			!path.endsWith('.test.ts') &&
			!path.endsWith('.svelte.test.ts') &&
			!path.endsWith('.testutil.ts') &&
			!path.startsWith('src/lib/paraglide/') &&
			!isInExemptDirectory(path) &&
			!EXEMPT_FILES.has(path)
	);
}

describe('Mustererkennung', () => {
	it.each([
		["date.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })", "'de-DE'"],
		['date.toLocaleTimeString("de-DE")', '"de-DE"'],
		['date.toLocaleString(`en-GB`)', '`en-GB`'],
		["new Intl.NumberFormat('de-DE').format(value)", "'de-DE'"],
		["new Intl.DateTimeFormat('en-US', { month: 'long' })", "'en-US'"]
	])('meldet das hartcodierte Sprach-Tag in %s', (code) => {
		expect(findHardcodedDisplayLocales(code)).toHaveLength(1);
	});

	it.each([
		["date.toLocaleDateString('de')", "'de'"],
		["date.toLocaleString('en')", "'en'"]
	])('meldet auch das bare Sprach-Tag %s — Node löst es sonst als en-US auf', (code) => {
		expect(findHardcodedDisplayLocales(code)).toHaveLength(1);
	});

	it('meldet den Treffer, auch wenn der Aufruf über mehrere Zeilen umbricht', () => {
		const code = [
			"date.toLocaleDateString('de-DE', {",
			"\tday: '2-digit',",
			"\tmonth: '2-digit'",
			'})'
		].join('\n');

		expect(findHardcodedDisplayLocales(code)).toEqual([
			{ line: 1, text: "toLocaleDateString('de-DE'" }
		]);
	});

	it('meldet mehrere Fundstellen in einer Datei, aufsteigend nach Zeile', () => {
		const code = ["a.toLocaleDateString('de-DE')", "b.toLocaleTimeString('de-DE')"].join('\n');

		expect(findHardcodedDisplayLocales(code).map((hit) => hit.line)).toEqual([1, 2]);
	});

	it('erlaubt beliebigen Leerraum zwischen Intl und NumberFormat/DateTimeFormat', () => {
		const code = "new Intl . NumberFormat('de-DE')";

		expect(findHardcodedDisplayLocales(code)).toHaveLength(1);
	});
});

describe('Gegenproben', () => {
	/* Diese Gruppe wiegt schwerer als die obige. Eine Regel, die den
	   vorgeschriebenen Weg oder eine Rechenstelle mitnimmt, wird beim ersten
	   roten Lauf aufgeweicht statt befolgt — und ist danach schlechter als
	   keine. */

	it('lässt den vorgeschriebenen Weg durch', () => {
		const code =
			"date.toLocaleDateString(resolveDisplayLocale(getLocale()), { timeZone: 'Europe/Berlin' })";

		expect(findHardcodedDisplayLocales(code)).toEqual([]);
	});

	it('lässt eine Variable an der Locale-Position durch', () => {
		const code = 'date.toLocaleDateString(displayLocale, options)';

		expect(findHardcodedDisplayLocales(code)).toEqual([]);
	});

	it.each([
		"date.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' })",
		"instant.toLocaleDateString('sv-SE', { timeZone: APP_TIMEZONE })"
	])('lässt die Rechenstelle %s durch — sv-SE ist ISO-Reihenfolge, keine Anzeige', (code) => {
		expect(findHardcodedDisplayLocales(code)).toEqual([]);
	});

	it('lässt ein Sprach-Tag durch, das nicht direkt an der Aufrufstelle steht', () => {
		const code = [
			"const APP_LOCALE = 'de-DE';",
			'return date.toLocaleString(APP_LOCALE, options);'
		].join('\n');

		expect(findHardcodedDisplayLocales(code)).toEqual([]);
	});

	it('lässt den Kommentar mit dem Sprach-Tag durch', () => {
		const code = [
			"// Vorher: date.toLocaleDateString('de-DE') — jetzt über resolveDisplayLocale.",
			'export const x = 1;'
		].join('\n');

		expect(findHardcodedDisplayLocales(code)).toEqual([]);
	});

	it('lässt Prosa in einem Testtitel durch', () => {
		const code = 'it("formatiert mit \'de-DE\'", () => {});';

		expect(findHardcodedDisplayLocales(code)).toEqual([]);
	});

	it.each([...EXEMPT_FILES.keys()])('nimmt die begründete Ausnahme %s aus dem Umfang', (path) => {
		expect(scopeFiles()).not.toContain(path);
	});

	it('nimmt den Admin-Bereich aus dem Umfang', () => {
		expect(scopeFiles()).not.toContain('src/routes/admin/statistics/statisticsFormat.ts');
		expect(scopeFiles()).not.toContain('src/routes/admin/statistics/activityHeatmap.ts');
	});

	it('nimmt den Legacy-API-Kontrakt aus dem Umfang', () => {
		expect(scopeFiles().some((path) => path.startsWith('src/routes/rest_sichtungen/'))).toBe(false);
		expect(scopeFiles().some((path) => path.startsWith('src/routes/sichtungen/'))).toBe(false);
	});
});

describe('Bestand', () => {
	it('findet außerhalb der begründeten Ausnahmen kein hartcodiertes Sprach-Tag', () => {
		const offenders = scopeFiles().flatMap((path) =>
			findHardcodedDisplayLocales(readFileSync(path, 'utf-8')).map(
				(hit) => `${path}:${hit.line} — ${hit.text}`
			)
		);

		expect(offenders, `${offenders.length} Fund(e).\n\n${REMEDIATION}\n`).toEqual([]);
	});

	/* Selbsttests. Ein Scan, der nichts liest, nichts erkennt oder ins Leere
	   zeigt, ist grün und beweist nichts. */
	it('liest überhaupt Quelldateien ein', () => {
		expect(scopeFiles().length).toBeGreaterThan(50);
	});

	/**
	 * `dateTime.ts` ist ein Sonderfall unter den EXEMPT_FILES: Es trägt die
	 * Zuordnung `de: 'de-DE'`/`en: 'en-GB'` als Objektwerte, nicht als erstes
	 * Argument eines `Intl`-/`toLocale*`-Aufrufs — das Muster (bewusst eng,
	 * siehe Docblock) trifft dort strukturell nie, unabhängig von der
	 * Ausnahmeliste. Die Aufnahme in EXEMPT_FILES ist trotzdem richtig: Ohne
	 * sie stünde nirgends dokumentiert, warum ausgerechnet diese Datei die
	 * Literale enthalten darf.
	 */
	it('würde jede EXEMPT_FILES-Datei außer dateTime.ts melden, stünde sie nicht auf der Ausnahmeliste', () => {
		for (const [path, reason] of EXEMPT_FILES) {
			expect(reason.length, `Ausnahme ohne Begründung: ${path}`).toBeGreaterThan(40);
			if (path === 'src/lib/utils/format/dateTime.ts') continue;

			expect(
				findHardcodedDisplayLocales(readFileSync(path, 'utf-8')).length,
				`Ausnahme ohne Fundstelle — bitte streichen: ${path}`
			).toBeGreaterThan(0);
		}
	});

	it('würde eine Admin-Datei mit hartcodiertem Sprach-Tag melden, läge sie außerhalb des Admin-Verzeichnisses', () => {
		const datei = readFileSync('src/routes/admin/statistics/statisticsFormat.ts', 'utf-8');

		expect(findHardcodedDisplayLocales(datei).length).toBeGreaterThan(0);
	});
});
