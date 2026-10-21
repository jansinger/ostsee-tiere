import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { multiWordLiterals, stripComments } from '#lib/testing/sourceScan.testutil.ts';
import type { SourceHit } from '#lib/testing/sourceScan.testutil.ts';
import { planExtraction } from '../../tools/i18n-extract/plan';

/**
 * Der Plan-Typ über `ReturnType` statt als Import: `ExtractionPlan` ist in
 * `plan.ts` bewusst modul-lokal, und ein Guard ist kein Grund, die
 * Schnittstelle des Werkzeugs zu erweitern.
 */
type ExtractionPlan = ReturnType<typeof planExtraction>;

/**
 * @fileoverview Hartcodierter Anzeigetext in Schicht C (Markup der 84
 * öffentlichen `.svelte`-Dateien) — das Gegenstück zu
 * `src/lib/form/validation/hardcodedStringScan.test.ts`, der nur Schicht A
 * (Yup-Schema) und Schicht B (Domänen-Labels) deckt.
 *
 * **Das Problem, gleich wie in Schicht A/B.** Paraglide meldet eine Botschaft
 * ohne englische Fassung als Build-Fehler. Was nie ein Schlüssel wurde, kann es
 * prinzipbedingt nicht melden: Ein `<p>Ein neuer Hinweis</p>`, das jemand in
 * drei Monaten schnell noch einfügt, fehlt in keiner Sprachdatei und bleibt
 * unter `/en` still deutsch.
 *
 * **Warum dieser Guard anders gebaut ist als der von Schicht A/B.** Dort war
 * die Regel „mehrwortiges Zeichenketten-Literal" ab Tag eins grün und
 * unabhängig vom Extraktor formulierbar. Im Markup trägt sie nicht: Ein
 * Textknoten ist kein Literal, und dieselbe Regel auf rohes Markup angewandt
 * wäre heute an 136 Stellen rot — den 78 Satzfragmenten und 58 Interpolationen,
 * die als **bewusst offene** Handarbeit von Aufgabe 2.3b anstehen
 * (`docs/i18n/ARBEITSPROTOKOLL_ETAPPE1.md`). Ein Guard, der ab Tag eins rot
 * ist, wird abgeschaltet und schützt danach nichts (Entwurf Abschnitt 7).
 *
 * Deshalb vier Zusicherungen statt einer:
 *
 * 1. **Kein mechanisch extrahierbarer Text mehr** (`Mechanisch`). Der
 *    Extraktor meldet für Schicht C seit Aufgabe 2.3a null Fundstellen. Ein
 *    neuer Textknoten oder ein neues `placeholder`/`title`/`aria-label`/`alt`
 *    mit deutschem Text erscheint dort sofort wieder — das ist der häufigste
 *    Rückfall und der einzige, der ohne Zählwerk auskommt.
 * 2. **Bestandszähler der offenen Handarbeit** (`Bestandszähler`). Was der
 *    Extraktor als „von Hand" verwirft, ist heute exakt beziffert. Der Zähler
 *    hält jede Kategorie einzeln fest: Wer einen deutschen Satz **neben** ein
 *    Inline-Element schreibt, hebt `sentence-fragment` von 78 auf 79, und der
 *    Test wird rot. Wer eine Welle der Handarbeit abarbeitet, senkt die Zahl
 *    hier bewusst — und sagt damit im Diff, was er gelöst hat. Genau das war
 *    in dieser Etappe viermal die Stelle, an der eine zu grobe Buchführung
 *    einen Verlust verdeckt hätte (Protokoll, „Die Buchführung, zum vierten
 *    Mal präzisiert").
 * 3. **Der unabhängige Zweitmechanismus** (`Attribute außerhalb der
 *    Extraktor-Liste`). Die Zusicherungen 1 und 2 stützen sich beide auf den
 *    Extraktor und teilen damit jede seiner blinden Stellen — genau der
 *    Fehler, den der Guard von Schicht A/B vermeidet (dort: `.integer()`, für
 *    den Extraktor unsichtbar). Die entsprechende blinde Stelle in Schicht C
 *    ist benannt und gemessen: Der Sammler betrachtet **nur** die vier
 *    Attribute `placeholder`/`title`/`aria-label`/`alt`
 *    (`SVELTE_TARGET_ATTRIBUTES` in `collect.ts`). Ein `description="…"` an
 *    einer eigenen Komponente oder ein `content="…"` in `<svelte:head>` ist
 *    für ihn nicht vorhanden. Dieser Teil des Guards prüft das mit eigener
 *    Regel — er meldete auf Anhieb 27 Stellen, die in keiner Zählung dieser
 *    Etappe je vorkamen.
 *
 * 4. **Anzeigetext im `<script>`-Block** (`Anzeigetext im <script>-Block`).
 *    Der Extraktor liest von einer `.svelte`-Datei nur das Markup. Ein
 *    `const hint = 'Karte wird initialisiert…'` ist für die Zusicherungen 1
 *    bis 3 unsichtbar; „0 mechanische Fundstellen" las sich deshalb als
 *    „Schicht C ist fertig". Sie ist es nicht — es waren 78 Stellen in 25 Dateien.
 *    Auch das ein Bestandszähler, aus demselben Grund wie (2): Er kann heute
 *    nicht null sein, aber er kann nicht mehr wachsen. Die Regel ist dieselbe
 *    wie in Schicht A/B (`multiWordLiterals`), abzüglich zweier benannter
 *    Klassen, die nie Anzeigetext sind: Tailwind-Klassenlisten (41) und
 *    Logmeldungen (39).
 *
 * **Umfang.** Dieselben 84 Dateien, die der Extraktor scannt — die
 * Ausschlussliste (`isSveltePathInScope` in `plan.ts`) ist dort benannt und
 * begründet (Admin, Styleguide, `/docs`, `ApiDocumentation.svelte`). Sie wird
 * hier bewusst **nicht** kopiert: Zwei Listen für denselben Umfang altern
 * getrennt.
 *
 * Läuft im Node-Projekt (`npm run test:unit`, damit auch in `test:quick`).
 */

/** Was der Entwickler stattdessen tun soll — erscheint in jeder Fehlermeldung. */
const REMEDIATION = [
	'Hartcodierter Anzeigetext in Schicht C (Markup). Statt des Textes eine',
	'Paraglide-Botschaft benutzen:',
	'  npm run i18n:extract                # zeigt Fundstelle und Schlüsselvorschlag',
	'  npm run i18n:extract -- --write-messages',
	'  npm run i18n:compile',
	'  npm run i18n:extract -- --write-sources',
	'Im Markup steht danach {m.<schlüssel>()} bzw. attr={m.<schlüssel>()} — bei',
	'Attributen OHNE Anführungszeichen, sonst ist es eine Zeichenketten-',
	'Interpolation und nicht der Wert. Danach die E2E-Suite fahren: 290',
	'Selektoren greifen über sichtbaren deutschen Text, und test:quick enthält',
	'sie nicht.'
].join('\n');

/**
 * Der Extraktions-Plan, einmal je Testlauf.
 *
 * `planExtraction` liest 104 Dateien und parst 86 davon mit dem
 * Svelte-Compiler; drei Zusicherungen mit je eigenem Lauf wären dreimal
 * dieselbe Arbeit.
 */
let cachedPlan: ExtractionPlan | undefined;
function sveltePlan(): ExtractionPlan {
	cachedPlan ??= planExtraction(process.cwd());
	return cachedPlan;
}

/** Nur die `.svelte`-Dateien des Plans — Schicht A und B haben ihren eigenen Guard. */
function svelteFiles(): ExtractionPlan['files'] {
	return sveltePlan().files.filter((file) => file.file.endsWith('.svelte'));
}

describe('Mechanisch — der Extraktor findet in Schicht C nichts mehr', () => {
	it('meldet für keine Markup-Datei eine extrahierbare Fundstelle', () => {
		const offenders = svelteFiles().flatMap((file) =>
			file.sites.map((site) => `${site.file}:${site.line} — ${site.text}`)
		);

		expect(offenders, `${offenders.length} Fund(e).\n\n${REMEDIATION}\n`).toEqual([]);
	});

	/* Selbsttest. Ein Guard, der über eine leere Dateimenge läuft, ist grün und
	   beweist nichts — das war der „stille Nullbefund" aus Aufgabe 1. */
	it('scannt die 87 Markup-Dateien im Umfang', () => {
		// 84 seit Aufgabe 2.3a, +1 seit Aufgabe 2.5: `HreflangHead.svelte`
		// (`src/lib/components/seo/`) ist neuer, in-scope Code ohne eigenen
		// Anzeigetext — der Zuwachs bestätigt, dass der Scan sie mitzählt,
		// nicht dass sie etwas Neues zu übersetzen hätte.
		//
		// +1 seit dem 2026-08-13: `ReportHeading.svelte` — der gemeinsame Kopf
		// von Einstiegsseite und Formular. Auch dort ist der Zuwachs nur ein
		// Umzug: Beide Texte hingen vorher an `ModernReportForm.svelte` und
		// stehen unverändert in beiden Sprachdateien.
		//
		// +1 seit dem 2026-08-13: `StructuredDataHead.svelte` — derselbe Fall wie
		// `HreflangHead.svelte` nebenan. Sie rendert JSON-LD in den Seitenkopf und
		// hat keinen Anzeigetext; die einzige sprachabhängige Angabe darin ist
		// `inLanguage`, und die kommt aus `getLocale()`, nicht aus einer Botschaft.
		//
		// +1 seit dem 2026-08-14: `routes/barrierefreiheit/+page.svelte` — die
		// Erklärung zur Barrierefreiheit (§ 14 LBGG M-V), vollständig über
		// Paraglide-Botschaften.
		//
		// +1 seit dem 2026-08-20: `ConfirmDialog.svelte` — der allgemeine
		// Bestätigungsdialog, herausgezogen aus `DeleteDialog.svelte` (UX
		// MEDIUM 13). Auch hier ist der Zuwachs ein Umzug und keine neue
		// Übersetzungsarbeit: Die Komponente trägt keinen eigenen Anzeigetext,
		// sondern bekommt Überschrift, Text und Beschriftungen als Props.
		expect(svelteFiles()).toHaveLength(89);
	});
});

/**
 * Die Übersprungen-Kategorien der Markup-Dateien, exakt so wie sie heute
 * stehen — erhoben mit `npm run i18n:extract`, Stand 2026-08-12.
 *
 * **`already-translated` steht bewusst nicht hier.** Diese Kategorie zählt die
 * bereits ersetzten Stellen und wächst mit jeder Welle; ein Zähler darauf wäre
 * bei jeder Übersetzung rot und träfe keine Aussage über offene Arbeit
 * (Protokoll, Korrektur vom 2026-08-12 zu Aufgabe 2.3a).
 *
 * Wer eine Welle der Handarbeit abarbeitet, ändert hier die betroffene Zahl —
 * und nur die. Sinkt eine Zahl, ohne dass die Welle sie gelöst hat, ist eine
 * Stelle verschwunden statt übersetzt worden.
 */
/**
 * `sentence-fragment`, `interpolation` und `plural-candidate` stehen bewusst
 * NICHT mehr hier — alle drei sind abgearbeitet (2026-08-13). Aus demselben
 * Grund, aus dem `already-translated` oben nie hier stand: `openSkipCounts()`
 * trägt nur Gründe ein, die tatsächlich auftreten; ein Eintrag mit `0` fände
 * im gemessenen Objekt nie eine Entsprechung. Taucht einer künftig wieder auf,
 * meldet der Test das von selbst (Soll-Objekt ohne den Schlüssel, Ist-Objekt
 * mit einem) — kein `0`-Eintrag nötig, um das abzusichern.
 *
 * **`plural-candidate` war dabei die Falle.** Der Grund heißt so, weil der
 * Extraktor Ziffern im Text findet; eine frühere Fassung dieses Ledgers hat
 * ihn als „falsch-positiv" abgehakt und damit wie erledigt behandelt. Kein
 * Plural — das stimmte. Aber die zehn Fundstellen waren durchweg **sichtbarer,
 * unübersetzter Anzeigetext** (vier Überschriften „Schritt N: …" in `FormHelp`,
 * die drei GPS-Format-Optionen in `LocationInput`, die Fußzeile, zwei
 * Erklärabsätze). „Kein Plural" heißt eben nicht „nichts zu tun" — die
 * Kategorie war eine Zurückstellung, keine Erledigung.
 */
const OPEN_SKIP_LEDGER: Readonly<Record<string, number>> = {
	/**
	 * Attributwert mit Ternary. Bleibt auch NACH der Übersetzung stehen, weil der
	 * Sammler nur ein reines `attr={m.key()}` als erledigt erkennt
	 * (`already-translated`); eine `ConditionalExpression` meldet er unabhängig
	 * von ihrem Inhalt weiter (`collectSvelte.test.ts`, „Gruppe 3", bewusst so
	 * gebaut — sonst wäre es ein Freibrief, jede Ternary in eine falsche
	 * Einzelbotschaft zu pressen).
	 *
	 * **Diese Zahl allein sagt daher NICHTS darüber, ob die Zweige übersetzt
	 * sind** — genau darauf ist eine frühere Fassung dieses Kommentars
	 * hereingefallen: Sie behauptete pauschal „beide Zweige übersetzt", während
	 * vier der sechs Stellen noch hartcodiertes Deutsch trugen (`OLMap`,
	 * `MapPanel`, `FormSteps`, `DropzoneEnhanced`). Der Schluss war von den zwei
	 * selbst angefassten Fällen auf alle sechs verallgemeinert. Seit dem
	 * 2026-08-13 sind alle sechs verifiziert übersetzt (Gegenprobe: kein roher
	 * String mehr in einem Zweig) — wer die Zahl prüft, prüft trotzdem die
	 * Zweige mit, nicht nur den Zähler.
	 *
	 * Die Zahl sinkt nur, wenn eine Ternary durch eine EINZELNE Botschaft
	 * ersetzt wird (Beispiel: `StepNavigation`s Fehler-Zähler-Ternary wurde ein
	 * ICU-Plural).
	 */
	'dynamic-attribute': 6,
	/**
	 * Reine Satzzeichen, Symbole, Zahlen — Struktur, wird nie übersetzt.
	 *
	 * 45 → 44 am 2026-10-20: Das „?" am Tastatur-Hilfe-Knopf der Karte
	 * (`SightingsMapView`) ist durch ein Icon ersetzt — axe-core 4.14 konnte es
	 * unter WCAG 2.5.3 nicht gegen den zugänglichen Namen prüfen. Entfernt, nicht
	 * übersetzt; es gab nichts zu übersetzen.
	 */
	'no-letter-group': 44,
	/**
	 * Attributwert ohne jeden statischen Text (`title={file.name}`) — nie
	 * Übersetzungsarbeit.
	 *
	 * +1 seit dem 2026-08-20 (24 → 25): `aria-label={closeLabel}` in
	 * `ConfirmDialog.svelte`. Die Stelle ist nicht neu, sie hat nur die
	 * Kategorie gewechselt: In `DeleteDialog.svelte` stand dort ein direktes
	 * `aria-label={m.…()}` und zählte als `already-translated`. Seit der
	 * Dialog-Konsolidierung reicht der allgemeine Dialog die Beschriftung als
	 * Prop durch, und ein durchgereichter Ausdruck ist für den Sammler
	 * definitionsgemäß kein statischer Text. Übersetzt wird sie unverändert —
	 * beim Löschen weiter über den `deletedialog`-Schlüssel, sonst über den
	 * Default `components_ui_dialog_confirmdialog_aria_label_dialog_schliessen`.
	 */
	'attribute-no-static-text': 25
};

describe('Bestandszähler der offenen Handarbeit', () => {
	function openSkipCounts(): Record<string, number> {
		const counts: Record<string, number> = {};
		for (const skip of sveltePlan().skipped) {
			if (!skip.file.endsWith('.svelte')) continue;
			if (!(skip.reason in OPEN_SKIP_LEDGER)) continue;
			counts[skip.reason] = (counts[skip.reason] ?? 0) + 1;
		}
		return counts;
	}

	it('zählt jede offene Kategorie genau so, wie sie im Protokoll steht', () => {
		expect(openSkipCounts(), REMEDIATION).toEqual(OPEN_SKIP_LEDGER);
	});
});

/**
 * Attribute, deren Wert nie Anzeigetext ist — sie stünden sonst dauerhaft im
 * Bestandszähler unten und machten ihn unlesbar.
 *
 * Bewusst kurz gehalten. Jeder weitere Eintrag nimmt dem Guard Fläche; ein
 * Attribut, das echten Text trägt, gehört in den Zähler und dann übersetzt,
 * nicht auf diese Liste.
 */
function isNonTextAttribute(name: string): boolean {
	// Tailwind-Klassenlisten (`class`, aber auch durchgereichte Props wie
	// `containerClass`) und Inline-Stile erfüllen „Leerzeichen und zwei
	// Buchstabengruppen" mühelos, sind aber nie Text.
	if (name === 'class' || name === 'style' || /[Cc]lass$/.test(name)) return true;
	// `rel="noopener noreferrer"` — HTML-Linkbeziehungen, ein festes Vokabular.
	return name === 'rel';
}

/** Eine Buchstabengruppe: mindestens zwei Buchstaben am Stück — wie in Schicht A/B. */
const LETTER_GROUP = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/gu;

/**
 * Trägt `value` Anzeigetext? Dieselbe Regel wie der Guard von Schicht A/B:
 * Leerzeichen und mindestens zwei Buchstabengruppen — **keine
 * Sprachheuristik**, damit auch ein versehentlich englischer Text auffällt.
 */
function looksLikeDisplayText(value: string): boolean {
	if (!/\s/.test(value)) return false;
	return (value.match(LETTER_GROUP)?.length ?? 0) >= 2;
}

/**
 * Statischer Anzeigetext in einem Attribut, das der Extraktor **nicht**
 * betrachtet.
 *
 * Eigene Traversierung statt `collectSvelteSites`: Der Zweck dieser
 * Zusicherung ist gerade, unabhängig von dessen Attributliste zu sein (siehe
 * Datei-Doc, Punkt 3). Geteilt wird nur der Parser.
 *
 * Exportiert, damit die Regel an konstruiertem Markup prüfbar ist — der
 * Guard soll nicht bloß über dem Bestand grün sein.
 */
export function findStaticTextAttributes(source: string): SourceHit[] {
	let ast: ReturnType<typeof parse>;
	try {
		ast = parse(source, { modern: true });
	} catch {
		// Nicht parsebares Markup übergeht der Extraktor ebenfalls, statt den
		// Lauf abzubrechen — svelte-check ist die Stelle, die das meldet.
		return [];
	}

	const hits: SourceHit[] = [];
	const extractorAttributes = new Set(['placeholder', 'title', 'aria-label', 'alt']);

	const visit = (node: unknown): void => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			node.forEach(visit);
			return;
		}

		const record = node as Record<string, unknown>;
		if (Array.isArray(record.attributes)) {
			for (const attribute of record.attributes as Array<Record<string, unknown>>) {
				if (attribute.type !== 'Attribute') continue;
				const name = String(attribute.name);
				if (extractorAttributes.has(name) || isNonTextAttribute(name)) continue;

				const value = attribute.value;
				if (!Array.isArray(value) || value.length !== 1) continue;
				const only = value[0] as Record<string, unknown>;
				if (only.type !== 'Text' || typeof only.data !== 'string') continue;
				if (!looksLikeDisplayText(only.data)) continue;

				const start = typeof attribute.start === 'number' ? attribute.start : 0;
				hits.push({
					line: source.slice(0, start).split('\n').length,
					text: `${name}="${only.data.replace(/\s+/g, ' ').trim()}"`
				});
			}
		}

		for (const [key, child] of Object.entries(record)) {
			if (key === 'parent') continue;
			if (child !== null && typeof child === 'object') visit(child);
		}
	};

	visit((ast as unknown as Record<string, unknown>).fragment);
	return hits.sort((a, b) => a.line - b.line);
}

/**
 * Statischer Anzeigetext in Attributen außerhalb der Extraktor-Liste, je Datei
 * — erhoben am 2026-08-12, zusammen mit diesem Guard.
 *
 * **SEO-Metadaten (Aufgabe 2.5, abgeschlossen am 2026-08-13).** Titel,
 * Beschreibung, Schlagwörter und og:/twitter:-Tags der vier lokalisierten
 * öffentlichen Seiten (`/`, `/map`, `/about`, `/bestimmungshilfe`) sind jetzt
 * Botschaften; `HreflangHead.svelte` liefert dazu `hreflang`- und
 * `og:locale`-Angaben je Route.
 *
 * **Befund A, Komponenten-Props (abgeschlossen am 2026-08-13).** `description`,
 * `label`, `coordinatesHint`, `actionLabel` — sieben echte Schicht-C-Fundstellen,
 * die der Extraktor nie gezählt hat, weil er diese Attributnamen nicht kennt.
 * Alle sieben sind jetzt Botschaften.
 *
 * Einzig verbliebener Eintrag: `src/routes/maintenance/+page.svelte` —
 * `content="noindex, nofollow"` ist eine robots-Direktive, kein Text, und die
 * Seite ist von der Lokalisierung ausgeschlossen (`languagePrefix.ts`). Bleibt
 * bewusst stehen statt auf einer Ausnahmeliste, aus demselben Grund wie die
 * `SCRIPT_TEXT_LEDGER`-Einträge oben.
 */
const ATTRIBUTE_LEDGER: Readonly<Record<string, number>> = {
	'src/routes/maintenance/+page.svelte': 1
};

describe('Attribute außerhalb der Extraktor-Liste', () => {
	function attributeCounts(): Record<string, number> {
		const counts: Record<string, number> = {};
		for (const file of svelteFiles()) {
			const hits = findStaticTextAttributes(file.before);
			if (hits.length > 0) counts[file.file] = hits.length;
		}
		return counts;
	}

	it('findet je Datei genau die verzeichneten Stellen', () => {
		expect(attributeCounts(), REMEDIATION).toEqual(ATTRIBUTE_LEDGER);
	});

	it('meldet ein deutsches Literal in einem Attribut, das der Extraktor nicht kennt', () => {
		const markup = '<Hinweis description="Für dieses Jahr liegen keine Meldungen vor." />';

		expect(findStaticTextAttributes(markup)).toEqual([
			{ line: 1, text: 'description="Für dieses Jahr liegen keine Meldungen vor."' }
		]);
	});

	it('meldet ein englisches Literal genauso — keine Sprachheuristik', () => {
		const markup = '<Hinweis description="No reports for this year." />';

		expect(findStaticTextAttributes(markup)).toHaveLength(1);
	});

	it.each([
		'<div class="flex items-center gap-2 border px-3" />',
		'<Map containerClass="relative min-h-0 w-full flex-1" />',
		'<div style="max-width: 40rem; margin: 0 auto" />',
		'<a rel="noopener noreferrer" href="/x">x</a>'
	])('lässt %s durch — Struktur, kein Anzeigetext', (markup) => {
		expect(findStaticTextAttributes(markup)).toEqual([]);
	});

	it('lässt die vier Attribute durch, die der Extraktor selbst prüft', () => {
		const markup = '<input placeholder="Bitte Tierart wählen" aria-label="Tierart auswählen" />';

		// Nicht etwa, weil sie unverdächtig wären — sondern weil Zusicherung 1
		// sie bereits meldet. Hier ein zweites Mal zu zählen ergäbe einen
		// Bestandszähler, der bei jeder Übersetzung an zwei Stellen zu pflegen
		// wäre.
		expect(findStaticTextAttributes(markup)).toEqual([]);
	});

	it('lässt einen Wert ohne zweite Buchstabengruppe durch', () => {
		// `h` ist ein einzelner Buchstabe und damit keine Gruppe — dieselbe
		// Zwei-Buchstaben-Regel wie in Schicht A/B, aus demselben Grund: Ein
		// Tastenkürzel oder eine Einheit ist kein Anzeigetext (Protokoll,
		// „LETTER_GROUP traf einen EINZELNEN Buchstaben").
		const markup = '<Feld einheit="km h" wert="12 %" />';

		expect(findStaticTextAttributes(markup)).toEqual([]);
	});

	it('lässt ein dynamisches Attribut durch — dort steht kein fester Text', () => {
		const markup = '<Hinweis description={fehlerText} />';

		expect(findStaticTextAttributes(markup)).toEqual([]);
	});
});

/**
 * Der `<script>`-Block einer `.svelte`-Datei, längentreu freigestellt: alles
 * außerhalb wird zu Leerzeichen, Zeilenumbrüche bleiben stehen.
 *
 * Längentreu, damit die gemeldete Zeilennummer auf die Originaldatei zeigt —
 * dieselbe Bauart wie `stripComments`.
 */
function scriptBlocksOnly(source: string): string {
	const blank = source.replace(/[^\n]/g, ' ').split('');

	// Zwei Schreibweisen, die HTML erlaubt und die dieses Muster zunächst beide
	// übersehen hat (CodeQL js/bad-tag-filter, PR #864):
	//   `i`-Flag  — Tags sind groß-/kleinschreibungsunabhängig, `<SCRIPT>` zählt.
	//   `\b[^>]*>`  — HTML schließt auch bei `</script >` und sogar
	//                 `</script foo>`; alles bis zur Klammer gehört zum Tag.
	// Beides ist derselbe Fehler: Ein Zähler, der eine gültige Schreibweise
	// nicht liest, meldet Null und beweist nichts — genau das Versagen, gegen
	// das er gebaut ist.
	for (const match of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)) {
		const body = match[1];
		if (body === undefined) continue;
		const start = (match.index ?? 0) + (match[0]?.indexOf(body) ?? 0);
		for (let i = 0; i < body.length; i += 1) blank[start + i] = body[i] ?? ' ';
	}

	return blank.join('');
}

/**
 * Ein Literal, das ausschließlich aus dem Alphabet von Tailwind-Klassenlisten
 * und CSS-Selektoren besteht (Kleinbuchstaben, Ziffern, `-:/[]%._()#`).
 *
 * `'alert alert-warning items-start'` und `'bg-base-200/95 rounded-box flex'`
 * erfüllen „Leerzeichen und zwei Buchstabengruppen" mühelos und machen 41 der
 * 158 Treffer aus. Ohne diesen Ausschluss wäre der Zähler unten bei jeder
 * Klassenänderung rot — und ein Guard, der bei fremder Arbeit rot wird, wird
 * abgeschaltet.
 *
 * Der Ausschluss ist eng: Ein Großbuchstabe genügt, damit ein Literal wieder
 * zählt. `'Alle Meldungen'` und `'Bitte wählen…'` fallen nicht darunter.
 */
const STRUCTURAL_LITERAL = /^[`'"][a-z0-9 :/[\]%._()#-]*[`'"]$/;

/**
 * Die Zeichenbereiche aller `logger.*(…)`/`console.*(…)`-Aufrufe in `code`.
 *
 * Logmeldungen sind Entwicklertext und werden nie übersetzt — sie machen 39 der
 * 158 Treffer aus. Der Ausschluss prüft **nicht** die Zeile, sondern den
 * Aufruf: `logger.warn('…', { … })` bricht regelmäßig über mehrere Zeilen um,
 * und eine zeilenweise Prüfung ließ vier Meldungen (darunter
 * `'User contact data saved with consent-based persistence'`) fälschlich als
 * Anzeigetext gelten.
 *
 * Klammerbilanz mit Überspringen von Zeichenketten — sonst beendete eine
 * schließende Klammer **innerhalb** eines Literals den Aufruf zu früh.
 */
function logCallRanges(code: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];

	for (const match of code.matchAll(/\b(?:logger|console)\s*\.\s*\w+\s*\(/g)) {
		let index = (match.index ?? 0) + match[0].length;
		let depth = 1;

		while (index < code.length && depth > 0) {
			const char = code[index];
			if (char === '"' || char === "'" || char === '`') {
				index += 1;
				while (index < code.length) {
					if (code[index] === '\\') {
						index += 2;
						continue;
					}
					if (code[index] === char) break;
					index += 1;
				}
				index += 1;
				continue;
			}
			if (char === '(') depth += 1;
			else if (char === ')') depth -= 1;
			index += 1;
		}

		ranges.push([match.index ?? 0, index]);
	}

	return ranges;
}

/**
 * Mehrwortige Literale im `<script>`-Block, ohne Klassenlisten und ohne
 * Logmeldungen — also die Kandidaten für hartcodierten Anzeigetext.
 *
 * Dieselbe Regel wie in Schicht A/B, geteilt über `multiWordLiterals` in
 * `sourceScan.testutil` — eine Regel, eine Stelle.
 *
 * Exportiert, damit sie an konstruiertem Quelltext prüfbar ist.
 */
export function findScriptDisplayText(source: string): SourceHit[] {
	const code = stripComments(scriptBlocksOnly(source));

	const lineOf = (index: number): number => code.slice(0, index).split('\n').length;
	const logLines = new Set<number>();
	for (const [start, end] of logCallRanges(code)) {
		for (let line = lineOf(start); line <= lineOf(end); line += 1) logLines.add(line);
	}

	return multiWordLiterals(code).filter(
		(hit) => !STRUCTURAL_LITERAL.test(hit.text) && !logLines.has(hit.line)
	);
}

/**
 * Was im `<script>`-Block an mehrwortigen Literalen übrig ist, je Datei.
 *
 * **Der Zähler ist abgearbeitet.** Er stand am 2026-08-12 bei 78 Stellen in 25
 * Dateien (Befund B); die 70 Anzeigetexte darunter sind übersetzt. Was hier
 * steht, sind die acht Stellen, die **kein** Anzeigetext sind — je mit
 * Begründung an ihrer Zeile: zwei Cookie-Zeichenketten, zwei erzeugte
 * Element-IDs, ein Cache-Schlüssel, zwei geworfene Entwicklerfehler (die den
 * Programmierer erreichen, nie den Melder) und eine Liste von
 * Dateiformat-Kürzeln.
 *
 * Sie stehen bewusst **hier** und nicht auf einer Ausnahmeliste. Eine Ausnahme
 * verschwindet aus dem Blick; ein Zähler mit Begründung wird bei jeder Änderung
 * an der Datei wieder gelesen. Wer eine dieser Stellen anfasst und dabei echten
 * Text hinzufügt, macht den Test rot.
 *
 * Die Regel bleibt eine **untere Schranke** für Anzeigetext, keine Definition:
 * Sie zählt nur, was Leerzeichen und zwei Buchstabengruppen hat. Einzelwörter
 * (`'Serverfehler'`, `'Tierart'`, `'Totfund'`) fielen nie darunter und wurden
 * in den Wellen trotzdem mitübersetzt — wer eine Datei anfasst, liest sie ganz.
 */
const SCRIPT_TEXT_LEDGER: Readonly<Record<string, number>> = {
	/** Cookie-Zeichenketten (`; domain=…`, `LOCALE=…; path=/; max-age=…`). */
	'src/lib/components/LanguageSwitcher.svelte': 2,
	/** Erzeugte Element-ID (`dropzone-${Math.random()…}`). */
	'src/lib/components/form/UnifiedDropzone.svelte': 1,
	/** Cache-Schlüssel aus Koordinaten und Zeit. */
	'src/lib/components/weather/WeatherDataFetcher.svelte': 1,
	/** Geworfener Entwicklerfehler: `<Form>` ohne `onSubmit`. Nie sichtbar. */
	'src/lib/report/components/form/Form.svelte': 1,
	/** Erzeugte Element-ID (`…-datalist`). */
	'src/lib/report/components/form/fields/BaseInput.svelte': 1,
	/** Geworfener Entwicklerfehler: `FormField` außerhalb von `<Form>`. */
	'src/lib/report/components/form/fields/FormField.svelte': 1,
	/** `'JPG, PNG, GIF, WEBP'` — Dateiformat-Kürzel, sprachneutral. */
	'src/lib/report/components/sections/Media.svelte': 1
};

describe('Anzeigetext im <script>-Block', () => {
	function scriptTextCounts(): Record<string, number> {
		const counts: Record<string, number> = {};
		for (const file of svelteFiles()) {
			const hits = findScriptDisplayText(file.before);
			if (hits.length > 0) counts[file.file] = hits.length;
		}
		return counts;
	}

	it('findet je Datei genau die verzeichneten Stellen', () => {
		expect(scriptTextCounts(), REMEDIATION).toEqual(SCRIPT_TEXT_LEDGER);
	});

	it('meldet einen deutschen Text aus dem Skriptblock', () => {
		const source = [
			'<script lang="ts">',
			"\tconst hint = 'Karte wird initialisiert';",
			'</script>'
		].join('\n');

		expect(findScriptDisplayText(source)).toEqual([
			{ line: 2, text: "'Karte wird initialisiert'" }
		]);
	});

	it('lässt eine Tailwind-Klassenliste durch', () => {
		const source = [
			'<script lang="ts">',
			"\tconst surface = 'bg-base-200/95 rounded-box border px-3 py-2';",
			'</script>'
		].join('\n');

		expect(findScriptDisplayText(source)).toEqual([]);
	});

	it('lässt eine über zwei Zeilen umbrechende Logmeldung durch', () => {
		const source = [
			'<script lang="ts">',
			"\tlogger.info('User contact data saved with consent', {",
			'\t\tconsent: true',
			'\t});',
			'</script>'
		].join('\n');

		expect(findScriptDisplayText(source)).toEqual([]);
	});

	it('lässt eine Logmeldung mit Klammer im Literal durch — Klammerbilanz, nicht Zeilenende', () => {
		const source = [
			'<script lang="ts">',
			"\tlogger.warn('Feld (unbekannt) fehlt in der Konfiguration');",
			"\tconst text = 'Bitte wählen Sie eine Tierart';",
			'</script>'
		].join('\n');

		expect(findScriptDisplayText(source)).toEqual([
			{ line: 3, text: "'Bitte wählen Sie eine Tierart'" }
		]);
	});

	it('findet den Text auch in einem gross geschriebenen <SCRIPT>-Block', () => {
		// CodeQL js/bad-tag-filter (PR #864): Das Muster hatte kein `i`-Flag und
		// war damit fuer `<SCRIPT>` blind. HTML-Tags sind
		// gross-/kleinschreibungsunabhaengig; ein Zaehler, der eine gueltige
		// Schreibweise nicht sieht, meldet Null und beweist nichts.
		const source = [
			'<SCRIPT LANG="ts">',
			"\tconst hint = 'Karte wird initialisiert';",
			'</SCRIPT>'
		].join('\n');

		expect(findScriptDisplayText(source)).toEqual([
			{ line: 2, text: "'Karte wird initialisiert'" }
		]);
	});

	it('findet den Text auch bei einem Schluss-Tag mit Beiwerk', () => {
		// HTML behandelt `</script foo>` als Schluss-Tag mit (ignorierten)
		// Attributen. CodeQL modelliert das; das Muster tut es jetzt auch.
		const source = [
			'<script lang="ts">',
			"\tconst hint = 'Karte wird initialisiert';",
			'</script foo>'
		].join('\n');

		expect(findScriptDisplayText(source)).toEqual([
			{ line: 2, text: "'Karte wird initialisiert'" }
		]);
	});

	it('findet den Text auch bei einem Schluss-Tag mit Leerzeichen', () => {
		// `</script >` ist gültiges HTML. Ohne `\s*` lief das Muster über das
		// Tag hinweg und der ganze Block fiel aus der Zählung.
		const source = [
			'<script lang="ts">',
			"\tconst hint = 'Karte wird initialisiert';",
			'</script >'
		].join('\n');

		expect(findScriptDisplayText(source)).toEqual([
			{ line: 2, text: "'Karte wird initialisiert'" }
		]);
	});

	it('sieht nur den Skriptblock, nicht das Markup', () => {
		// Sonst zählte jeder deutsche Textknoten hier ein zweites Mal — und die
		// 78 Satzfragmente machten diesen Zähler ab Tag eins rot.
		const source = [
			'<script lang="ts">',
			'\tconst n = 1;',
			'</script>',
			'',
			'<p>Ein deutscher Satz</p>'
		].join('\n');

		expect(findScriptDisplayText(source)).toEqual([]);
	});
});
