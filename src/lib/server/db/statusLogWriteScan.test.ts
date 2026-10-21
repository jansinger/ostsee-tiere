import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectHits, sourceFiles, stripComments } from '#lib/testing/sourceScan.testutil.ts';
import type { SourceHit } from '#lib/testing/sourceScan.testutil.ts';

/**
 * @fileoverview In `sichtung_status_log` schreibt nur der Verify-Endpunkt
 *
 * **Warum es diesen Test gibt.** Die Status-Historie ist nur so viel wert wie
 * ihre Vollständigkeit. Ein zweiter Schreibweg — ein Wartungsskript, ein
 * Bulk-Import, ein „schnell noch nachtragen" — erzeugt Einträge ohne die
 * Statusspalten oder Statusspalten ohne Eintrag, und beides ist von außen nicht
 * unterscheidbar: Die Zeitleiste sieht in jedem Fall vollständig aus. Dieselbe
 * Sorge trägt schon die Regel „ein Endpunkt schreibt den Prüfstatus"
 * (`.claude/rules/api.md`); dieser Scan zieht sie auf die Historie nach.
 *
 * Die Kontrolle „ein zweiter Schreibweg fällt beim Review auf" hat in diesem
 * Repo zweimal versagt — bei `freigegeben_am` (PR #701) und bei `geprueft`
 * (`verifiedReadScan.test.ts`). Deshalb hier von Anfang an ein Scan.
 *
 * **Was er prüft.** Jede `.ts`/`.js`-Datei unter `src/` wird nach einer
 * schreibenden Operation auf der Tabelle durchsucht — in Drizzle-Schreibweise
 * (`insert(sightingStatusLog)`, `update(…)`, `delete(…)`) wie in rohem SQL
 * (`INSERT INTO sichtung_status_log`). Lesende Zugriffe sind ausdrücklich
 * erlaubt: Eine zweite Anzeigestelle ist kein Problem, ein zweiter Autor schon.
 *
 * **Warum konstruierte Beispiele.** Ein Scan über einen konformen Bestand
 * belegt nichts über die Regel — er ist auch dann grün, wenn das Muster eine
 * Lücke hat. Unter „Mustererkennung" steht deshalb je Schreibweise ein
 * gebautes Beispiel, unter „Gegenproben", was **nicht** anschlagen darf. Vorbild
 * und Textaufbereitung: `approvalPredicateScan.test.ts`.
 *
 * Läuft im Node-Projekt (`npm run test:unit`, damit auch in `test:quick`).
 */

/** Was der Entwickler stattdessen tun soll — erscheint in jeder Fehlermeldung. */
const REMEDIATION = [
	'Die Status-Historie wird nicht neben dem Verify-Endpunkt geschrieben:',
	'  PATCH /api/sightings/[id]/verify  ({ verdict: "approve" | "reject" | "reset" })',
	'',
	'Dort entstehen Statusspalten und Historien-Eintrag in EINER Transaktion.',
	'Ein zweiter Schreibweg erzeugt Einträge ohne Spaltenänderung oder umgekehrt —',
	'eine Zeitleiste mit Lücke sieht vollständig aus und ist es nicht.',
	'',
	'Lesen ist erlaubt: select() auf sightingStatusLog darf überall stehen.'
].join('\n');

/** Die Tabelle in beiden Schreibweisen — Drizzle-Bezeichner und DB-Name. */
const TABLE = String.raw`(?:sightingStatusLog|sichtung_status_log)`;

/**
 * Drizzle: `insert(sightingStatusLog)`, `tx.update(sightingStatusLog)`, …
 *
 * Zwischen Operator und Tabelle darf nur Weißraum und ein Anführungszeichen
 * stehen — ein Komma oder Bezeichner beendet die Brücke, damit
 * `eq(sightingStatusLog.sightingId, …)` innerhalb eines `delete(other)` nicht
 * fälschlich anschlägt.
 */
const DRIZZLE_WRITE = new RegExp(String.raw`\b(?:insert|update|delete)\s*\(\s*["']?${TABLE}`, 'gi');

/** Rohes SQL: `INSERT INTO sichtung_status_log`, `DELETE FROM …`, `UPDATE …`. */
const SQL_WRITE = new RegExp(
	String.raw`\b(?:insert\s+into|delete\s+from|update)\s+["']?${TABLE}`,
	'gi'
);

const PATTERNS = [DRIZZLE_WRITE, SQL_WRITE] as const;

/**
 * Meldet jeden Schreibzugriff auf die Historien-Tabelle in `source`.
 *
 * @returns Fundstellen (leer = konform), aufsteigend nach Zeile.
 */
export function findStatusLogWrites(source: string): SourceHit[] {
	return collectHits(stripComments(source), PATTERNS);
}

/**
 * Dateien, in denen geschrieben werden darf — je mit Begründung.
 *
 * Namentlich und kurz. Ein pauschales `**\/*.test.ts` wäre bequem und würde die
 * Regel aushöhlen: Eine Testhilfe, die Historie an der Transaktion vorbei
 * anlegt, erzeugt genau die Lücke, gegen die die Regel existiert.
 */
const ALLOWED_FILES: ReadonlyMap<string, string> = new Map([
	[
		'src/routes/api/sightings/[id]/verify/+server.ts',
		'Der einzige Schreibweg. Legt Statusspalten und Historien-Eintrag in einer Transaktion an.'
	],
	[
		'src/lib/server/db/statusLogWriteScan.test.ts',
		'Diese Datei. Die konstruierten Beispiele unter „Mustererkennung" sind Verstöße — das ist ihr Zweck.'
	]
]);

const SOURCE_ROOT = 'src';

describe('Mustererkennung — jede Schreibweise wird gefunden', () => {
	it.each([
		['Drizzle insert', 'await db.insert(sightingStatusLog).values({ verdict: "approve" });'],
		['Drizzle update über tx', 'await tx.update(sightingStatusLog).set({ verdict: "reset" });'],
		['Drizzle delete', 'await db.delete(sightingStatusLog).where(eq(x, y));'],
		['SQL INSERT', 'sql`INSERT INTO sichtung_status_log (verdict) VALUES (${v})`'],
		['SQL DELETE mit DB-Namen', 'sql`DELETE FROM "sichtung_status_log" WHERE sichtung_id = 1`'],
		['SQL UPDATE', 'sql`UPDATE sichtung_status_log SET bearbeiter = NULL`']
	])('%s', (_name, code) => {
		expect(findStatusLogWrites(code)).not.toHaveLength(0);
	});
});

describe('Gegenproben — was nicht anschlagen darf', () => {
	it.each([
		['Lesen per select', 'await db.select().from(sightingStatusLog).where(eq(a, b));'],
		['Spaltenzugriff', 'orderBy(asc(sightingStatusLog.recordedAt))'],
		['Schema-Definition', "export const sightingStatusLog = pgTable('sichtung_status_log', {"],
		['Schreiben auf eine andere Tabelle', 'await db.insert(sightings).values(data);'],
		[
			'Spalte als Argument in fremdem Delete',
			'await db.delete(other).where(eq(sightingStatusLog.sightingId, id));'
		],
		['auskommentiert', '// await db.insert(sightingStatusLog).values({});']
	])('%s', (_name, code) => {
		expect(findStatusLogWrites(code)).toHaveLength(0);
	});
});

describe('Bestand — nur der Verify-Endpunkt schreibt Historie', () => {
	it('findet außerhalb der erlaubten Dateien keinen Schreibzugriff', () => {
		const verstoesse = sourceFiles(SOURCE_ROOT, /\.(ts|js)$/)
			.filter((datei) => !ALLOWED_FILES.has(datei))
			.flatMap((datei) =>
				findStatusLogWrites(readFileSync(datei, 'utf8')).map(
					(hit) => `${datei}:${hit.line} — ${hit.text}`
				)
			);

		expect(verstoesse, `\n${REMEDIATION}\n`).toEqual([]);
	});

	it('führt jede erlaubte Datei mit Begründung', () => {
		for (const [datei, begruendung] of ALLOWED_FILES) {
			expect(begruendung.length, `${datei} braucht eine Begründung`).toBeGreaterThan(30);
		}
	});
});
