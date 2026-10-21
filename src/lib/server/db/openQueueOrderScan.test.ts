/**
 * @fileoverview Wächter: Eingangsliste, Queue-Endpunkt und der universelle
 * Loader der Detailansicht sortieren/werten gleich aus.
 *
 * Die drei Stellen müssen dieselbe Reihenfolge liefern, sonst überspringt der
 * Auto-Advance still eine Meldung. Ein Review bemerkt das nicht — die Zeilen
 * stehen in verschiedenen Dateien und sehen einzeln jeweils richtig aus.
 *
 * Der Test prüft deshalb **den Import**, nicht das Ergebnis: Wer künftig eine
 * eigene Sortierung auf `created` schreibt, fällt hier auf. Bewusst über den
 * Quelltext und nicht über einen Laufzeitvergleich — ein Vergleich zweier
 * kompilierter SQL-Strings wäre grün, solange beide zufällig gleich sind, und
 * würde die eigentliche Regel (eine Quelle) nicht ausdrücken.
 *
 * **Warum nicht `orderBy\(\s*(asc|desc)\(`.** Vor der Zentralisierung stand in
 * beiden Dateien `.orderBy(order === 'desc' ? desc(sightings.created) :
 * asc(sightings.created))` — die Ternär-Form steht nicht unmittelbar hinter
 * `orderBy(`. Ein Rückfall, der die Vorgängerzeile aus der Historie holt oder
 * den Refactor teilweise revertiert, liefe an einem `orderBy(`-Anker vorbei.
 * Das Muster unten lässt den Anker fallen und prüft `(asc|desc)(sightings.created`
 * irgendwo in der Datei — das deckt Ternär, Array-Form und die Zuweisung an eine
 * Zwischenvariable gleichermaßen ab.
 *
 * **Warum zusätzlich ein `sql`-Template-Muster.** `orderBy(sql\`…created
 * desc…\`)` ist im Projekt der idiomatische Stil für Sortierungen, nicht die
 * Ausnahme — so sortieren `admin/sichtungen/+page.server.ts`,
 * `admin/statistics/+page.server.ts`, `showreports.json/+server.ts` und
 * `api/map/sightings/years/+server.ts`. Wer die Eingangsliste neben ihrer
 * Schwesterroute anfasst, schreibt mit hoher Wahrscheinlichkeit genau diese
 * Form. Ohne dieses zweite Muster liefe der Guard an der wahrscheinlichsten
 * Fehlfassung vorbei.
 *
 * **Warum `stripComments`/`collectHits` statt eigenem Textverfahren.** Rohtext
 * hat zwei Schwächen: Ein Kommentar wie „früher: orderBy(desc(sightings.created))“
 * würde den Guard fälschlich rot färben, und eine bloße Kommentar-Erwähnung von
 * `openQueueOrder` hielte den Import-Test grün, obwohl der Import fehlt.
 * `#lib/testing/sourceScan.testutil.js` blendet Kommentare aus — dieselbe Begründung
 * wie in `approvalPredicateScan.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectHits, stripComments } from '#lib/testing/sourceScan.testutil.ts';

/**
 * `(asc|desc)(sightings.created` irgendwo in der Datei — bewusst ohne
 * `orderBy(`-Anker. Deckt die Ternär-Form aus der Vorgeschichte, die Array-Form
 * (`[asc(sightings.created), asc(sightings.id)]`) und eine Zuweisung an eine
 * Zwischenvariable gleichermaßen ab.
 */
const EIGENE_SORTIERUNG = /\b(?:asc|desc)\(\s*sightings\.created\b/g;

/**
 * `sql\`…created… (asc|desc)…\`` — die im Projekt gelebte Sortier-Schreibweise.
 * Zwei Lookaheads statt einer festen Reihenfolge, weil `created` in den
 * bestehenden Belegen mal vor, mal (über eine Hilfsfunktion) nach dem
 * Richtungswort steht. Die Lookaheads selbst sind mit `[^\`]*` auf den
 * Template-Inhalt begrenzt — `[\s\S]*?` ignoriert innerhalb eines Lookaheads
 * die lazy-Begrenzung des konsumierenden Teils und läse bis zum Dateiende
 * weiter; ein beliebiges `sql\`…\`` ohne Generic, gefolgt (irgendwo in der
 * Datei) von `created` und `asc`/`desc`, wäre dann fälschlich ein Treffer.
 */
const SQL_TEMPLATE_SORTIERUNG = /sql`(?=[^`]*\bcreated\b)(?=[^`]*\b(?:asc|desc)\b)[^`]*`/gi;

/**
 * `=== 'asc' ? 'asc' : 'desc'` — der Ternary-Körper von `resolveQueueOrder`
 * selbst (`#lib/components/admin/queueOrder.ts`), lokal nachgebaut statt
 * importiert. Nur für den universellen Loader relevant (siehe unten): Der
 * baut keine SQL, sein Regressionsrisiko ist eine eigene Auswertung des
 * `order`-Parameters statt eines Aufrufs von `resolveQueueOrder`.
 */
const EIGENE_ORDER_TERNARY = /===\s*['"]asc['"]\s*\?\s*['"]asc['"]\s*:\s*['"]desc['"]/g;

const EIGENBAU_MUSTER_SQL = [EIGENE_SORTIERUNG, SQL_TEMPLATE_SORTIERUNG] as const;
const EIGENBAU_MUSTER_ORDER_PARAM = [EIGENE_ORDER_TERNARY] as const;

/**
 * Die drei Stellen, die dieselbe Ordnung teilen müssen — Pfad relativ zu
 * dieser Datei, damit die Auflösung unabhängig vom Arbeitsverzeichnis ist.
 * Zwei bauen die `created`-Sortierung tatsächlich in SQL, die dritte reicht
 * nur den ausgewerteten `order`-Parameter weiter — deshalb unterscheiden sich
 * sowohl der erwartete Importpfad als auch das gesuchte Eigenbau-Muster
 * (Docblock in `#lib/components/admin/queueOrder.ts` begründet, warum der
 * universelle Loader nicht `#lib/server/db/openQueueOrder.js` importieren darf:
 * das Modul zieht das DB-Schema mit, der Loader läuft auch im Browser).
 */
const QUELLEN = [
	{
		name: 'src/routes/admin/+page.server.ts',
		path: '../../../routes/admin/+page.server.ts',
		importPattern: /from ['"][$#]lib\/server\/db\/openQueueOrder(?:\.(?:js|ts))?['"]/,
		eigenbauMuster: EIGENBAU_MUSTER_SQL
	},
	{
		name: 'src/routes/api/sightings/[id]/queue/+server.ts',
		path: '../../../routes/api/sightings/[id]/queue/+server.ts',
		importPattern: /from ['"][$#]lib\/server\/db\/openQueueOrder(?:\.(?:js|ts))?['"]/,
		eigenbauMuster: EIGENBAU_MUSTER_SQL
	},
	/* Dritte Stelle, die dieselbe Ordnung kennen muss: `resolveQueueOrder` in
	   `[id]/+page.ts` bestimmt, in welcher Richtung die Detailansicht ihre
	   Nachbarn abfragt (`?order=…` an den Queue-Endpunkt). Eine dort wieder
	   eingesetzte Inline-Ternary bliebe vom Guard unbemerkt, solange nur die
	   beiden anderen Quellen geprüft werden — der Guard wäre dann selbst die
	   Lücke, die er verhindern soll. */
	{
		name: 'src/routes/admin/[id]/+page.ts',
		path: '../../../routes/admin/[id]/+page.ts',
		importPattern: /from ['"][$#]lib\/components\/admin\/queueOrder(?:\.(?:js|ts))?['"]/,
		eigenbauMuster: EIGENBAU_MUSTER_ORDER_PARAM
	}
] as const;

/** Liest die Route und meldet einen verschobenen Pfad als solchen. */
function leseQuelle(name: string, path: string): string {
	const absolut = fileURLToPath(new URL(path, import.meta.url));
	try {
		return readFileSync(absolut, 'utf8');
	} catch {
		throw new Error(
			`Quelltext von ${name} nicht lesbar (${absolut}). Wurde die Route verschoben? ` +
				'Dann den Pfad in QUELLEN mitziehen — nicht den Eintrag entfernen.'
		);
	}
}

describe('Ordnung des offenen Stapels', () => {
	for (const { name, path, importPattern, eigenbauMuster } of QUELLEN) {
		describe(name, () => {
			const quelltext = leseQuelle(name, path);
			const bereinigt = stripComments(quelltext);

			it('importiert die gemeinsame Ordnung', () => {
				// Prüft den Importpfad, nicht nur den Bezeichner: Eine lokal
				// definierte Funktion namens `openQueueOrderBy`/`resolveQueueOrder`
				// hielte `toContain('openQueueOrder')` grün, ohne dass der Import
				// existiert.
				expect(bereinigt).toMatch(importPattern);
			});

			it('baut keine eigene Sortierung/Auswertung', () => {
				const treffer = collectHits(bereinigt, eigenbauMuster);

				expect(
					treffer,
					`${name} wertet die Ordnung selbst aus, statt die gemeinsame Regel zu ` +
						'nutzen — sonst laufen Eingangsliste, Warteschlange und Detailansicht ' +
						'auseinander, und der Auto-Advance überspringt eine Meldung.\n\n' +
						treffer.map((hit) => `  Zeile ${hit.line}: ${hit.text}`).join('\n')
				).toEqual([]);
			});
		});
	}
});
