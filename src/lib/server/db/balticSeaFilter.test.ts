/**
 * @fileoverview `balticSeaCondition` — SQL-Übersetzung von `getBalticSeaStatus()`
 *
 * `getBalticSeaStatus()` (`#lib/utils/geo/balticSeaStatus.ts`) ist die einzige
 * Stelle, an der der Ostsee-Status einer Sichtung fachlich entsteht.
 * `balticSeaCondition()` baut dieselbe Fallunterscheidung als SQL-Prädikat für
 * den Admin-Filter und den Export nach. Zwei Implementierungen derselben Regel
 * laufen erfahrungsgemäß auseinander — genau daran ist in diesem Projekt schon
 * die Benachrichtigungs-Mail von der Admin-Anzeige abgewichen (Fehler 4,
 * `docs/OSTSEE_FLAGS.md`): Ein `{{#if sighting.inBalticSeaGeo}}` in einer
 * Handlebars-Vorlage konnte den Altsystem-Wert `2` nicht von `0` unterscheiden.
 *
 * Testansatz — bewusst anders als `mediaUploadFilter.test.ts` und
 * `statisticsApprovalScope.test.ts`: Jene Tests prüfen nur, ob die von
 * `PgDialect` kompilierte SQL-Zeichenkette einen erwarteten Teilstring enthält.
 * Das würde hier nicht ausreichen — die eigentliche Gefahr ist eine SQL-
 * Bedingung, die *scheinbar* richtig aussieht, aber für einzelne Wertekombinationen
 * (allen voran `ostsee_geo = 2`) die falsche Zeile trifft oder verfehlt.
 *
 * Deshalb wird die kompilierte SQL hier tatsächlich **ausgeführt**: Die von
 * `PgDialect.sqlToQuery()` erzeugte Bedingung (Postgres-Parameter `$1, $2, …`)
 * wird 1:1 (nur `$n` → `?n`) gegen eine In-Memory-`node:sqlite`-Datenbank
 * (Node-Bordmittel seit 22.5, in CI durchgängig Node 24, siehe `ci.yml`)
 * gestellt und für jede Zeile eines Kreuzprodukts ausgewertet. Das ist eine
 * echte SQL-Engine mit derselben dreiwertigen NULL-Logik wie Postgres — kein
 * Nachbau der Fachregel in einer dritten Sprache.
 *
 * Kreuzprodukt: `inBalticSea` ∈ {null, 0, 1} × `inBalticSeaGeo` ∈ {0, 1, 2} ×
 * Koordinaten ∈ {beide vorhanden, nur Breite, nur Länge, beide fehlend} = 36
 * Zeilen. Für jede Zeile wird geprüft, dass genau eine der vier
 * `balticSeaCondition(status)`-Bedingungen zutrifft — und zwar die, die
 * `getBalticSeaStatus()` für dieselben Rohwerte auch liefert.
 *
 * **Was dieser Test nicht abdeckt:** Die hier genutzte Bedingung besteht
 * ausschließlich aus `IS [NOT] NULL`, `>`, `<=`, `AND`, `OR` — Operatoren, die
 * SQLite und Postgres identisch auswerten. Eine Postgres-spezifische
 * Typkonvertierung (z. B. `numeric`-Rundung) wird dadurch nicht geprüft, ist
 * aber für diese Bedingung auch nicht relevant: Die Koordinatenspalten werden
 * nur auf `NULL` geprüft, ihr Zahlenwert fließt nicht in die Bedingung ein —
 * und genau deshalb deckt dieses Kreuzprodukt auch den `NaN`-Randfall nicht ab:
 * `numeric`-Spalten können in Postgres `NaN` halten, das ist weder `NULL` noch
 * per SQLite-`REAL` nachbaubar. `getBalticSeaStatus()` ordnet eine `NaN`-Koordinate
 * über `Number.isFinite()` als `noPosition` ein, dieses Prädikat würde sie über
 * `IS NULL` nicht finden — siehe Kopfkommentar von `balticSeaFilter.ts`.
 */
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	BALTIC_SEA_STATUS_PRESENTATION,
	getBalticSeaStatus,
	type BalticSeaStatus
} from '#lib/utils/geo/balticSeaStatus.ts';
import { balticSeaCondition } from './balticSeaFilter';

const dialect = new PgDialect();
// Aus BALTIC_SEA_STATUS_PRESENTATION abgeleitet statt handgepflegt — derselbe
// Grund wie bei `isBalticSeaStatus()`: Ein fünfter Status würde sonst hier
// unbemerkt fehlen und das Kreuzprodukt unten stillschweigend unvollständig
// prüfen.
const ALL_STATUSES = Object.keys(BALTIC_SEA_STATUS_PRESENTATION) as BalticSeaStatus[];

/** Kompiliert ein Drizzle-Prädikat zu SQL, das `node:sqlite` ausführen kann. */
function toSqliteSql(condition: SQL): { sql: string; params: unknown[] } {
	const { sql, params } = dialect.sqlToQuery(condition);
	// Postgres-Parameter ($1, $2, …) und SQLite-Parameter (?1, ?2, …) sind
	// syntaktisch identisch bis auf das Zeichen davor.
	return { sql: sql.replace(/\$(\d+)/g, '?$1'), params };
}

type Row = {
	label: string;
	latitude: number | null;
	longitude: number | null;
	inBalticSea: number | null;
	inBalticSeaGeo: number | null;
};

const COORDINATE_CASES: Array<Pick<Row, 'label' | 'latitude' | 'longitude'>> = [
	{ label: 'beide Koordinaten vorhanden', latitude: 54.3, longitude: 12.1 },
	{ label: 'nur Breite vorhanden', latitude: 54.3, longitude: null },
	{ label: 'nur Länge vorhanden', latitude: null, longitude: 12.1 },
	{ label: 'beide Koordinaten fehlen', latitude: null, longitude: null }
];

const IN_BALTIC_SEA_CASES: Array<{ label: string; value: number | null }> = [
	{ label: 'ostsee = null', value: null },
	{ label: 'ostsee = 0', value: 0 },
	{ label: 'ostsee = 1', value: 1 }
];

// `ostsee_geo` ist in der DB `NOT NULL` (Default 0), der Typ lässt `null`
// trotzdem zu (Altbestand-Asymmetrie, siehe balticSeaStatus.ts) — deshalb auch
// hier mitgetestet. Der Wert 2 ist der Kern dieses Tests: Altsystem-Daten
// (15.208 Zeilen) tragen ihn mit derselben Bedeutung wie 1.
const IN_BALTIC_SEA_GEO_CASES: Array<{ label: string; value: number | null }> = [
	{ label: 'ostsee_geo = 0', value: 0 },
	{ label: 'ostsee_geo = 1', value: 1 },
	{ label: 'ostsee_geo = 2 (Altsystem)', value: 2 }
];

const ROWS: Row[] = COORDINATE_CASES.flatMap((coords) =>
	IN_BALTIC_SEA_CASES.flatMap((ostsee) =>
		IN_BALTIC_SEA_GEO_CASES.map((ostseeGeo) => ({
			label: `${coords.label}, ${ostsee.label}, ${ostseeGeo.label}`,
			latitude: coords.latitude,
			longitude: coords.longitude,
			inBalticSea: ostsee.value,
			inBalticSeaGeo: ostseeGeo.value
		}))
	)
);

let db: DatabaseSync;

beforeAll(() => {
	db = new DatabaseSync(':memory:');
	// Spaltennamen exakt wie in schema.ts, damit die von Drizzle qualifiziert
	// erzeugten Bezeichner (`"sichtungen"."gps_breite"`, …) auflösen.
	db.exec(
		'CREATE TABLE sichtungen (gps_breite REAL, gps_laenge REAL, ostsee INTEGER, ostsee_geo INTEGER)'
	);
});

afterAll(() => {
	db.close();
});

/** Trägt genau eine Zeile ein und prüft, ob `condition` sie auswählt. */
function matchesRow(condition: SQL, row: Row): boolean {
	db.exec('DELETE FROM sichtungen');
	db.prepare(
		'INSERT INTO sichtungen (gps_breite, gps_laenge, ostsee, ostsee_geo) VALUES (?, ?, ?, ?)'
	).run(row.latitude, row.longitude, row.inBalticSea, row.inBalticSeaGeo);

	const { sql, params } = toSqliteSql(condition);
	const result = db
		.prepare(`SELECT (${sql}) AS matches FROM sichtungen`)
		.get(...(params as never[])) as {
		matches: number | null;
	};
	return result.matches === 1;
}

describe('balticSeaCondition', () => {
	it('liefert kein Prädikat für einen unbekannten oder fehlenden Wert', () => {
		expect(balticSeaCondition(null)).toBeUndefined();
		expect(balticSeaCondition(undefined)).toBeUndefined();
		expect(balticSeaCondition('all')).toBeUndefined();
		expect(balticSeaCondition('')).toBeUndefined();
		expect(balticSeaCondition('ostsee')).toBeUndefined();
	});

	describe('Kreuzprodukt: wählt exakt die Zeilenmenge von getBalticSeaStatus()', () => {
		for (const row of ROWS) {
			const expectedStatus = getBalticSeaStatus({
				inBalticSea: row.inBalticSea,
				inBalticSeaGeo: row.inBalticSeaGeo,
				latitude: row.latitude === null ? null : String(row.latitude),
				longitude: row.longitude === null ? null : String(row.longitude)
			});

			it(`${row.label} → getBalticSeaStatus() = '${expectedStatus}'`, () => {
				for (const status of ALL_STATUSES) {
					const condition = balticSeaCondition(status);
					expect(
						condition,
						`balticSeaCondition('${status}') sollte ein Prädikat liefern`
					).toBeDefined();

					const matched = matchesRow(condition as SQL, row);
					if (status === expectedStatus) {
						expect(matched, `Zeile (${row.label}) sollte von '${status}' erfasst werden`).toBe(
							true
						);
					} else {
						expect(
							matched,
							`Zeile (${row.label}) sollte NICHT von '${status}' erfasst werden`
						).toBe(false);
					}
				}
			});
		}
	});

	describe('ostsee_geo = 2 verhält sich wie ostsee_geo = 1 (Kernfall)', () => {
		it('zählt als "baltic", wenn Position und ostsee gesetzt sind', () => {
			const row: Row = {
				label: 'geo=2',
				latitude: 54.3,
				longitude: 12.1,
				inBalticSea: 1,
				inBalticSeaGeo: 2
			};
			expect(matchesRow(balticSeaCondition('baltic') as SQL, row)).toBe(true);
			expect(matchesRow(balticSeaCondition('edge') as SQL, row)).toBe(false);
		});

		it('ein `= 1`-Vergleich würde diesen Fall verfehlen — die Bedingung darf ihn nicht nachbauen', () => {
			const condition = balticSeaCondition('baltic') as SQL;
			const { sql } = toSqliteSql(condition);
			expect(sql).not.toMatch(/"ostsee_geo"\s*=\s*\?/);
			expect(sql).not.toMatch(/"ostsee"\s*=\s*\?/);
		});
	});

	describe('Eigenständigkeit der vier Bedingungen', () => {
		it('deckt für jede Zeile im Kreuzprodukt genau einen Status ab', () => {
			for (const row of ROWS) {
				const matchingStatuses = ALL_STATUSES.filter((status) =>
					matchesRow(balticSeaCondition(status) as SQL, row)
				);
				expect(matchingStatuses, `Zeile (${row.label})`).toHaveLength(1);
			}
		});
	});
});

// Kontrolle über die reine SQL-Zeichenkette (wie in mediaUploadFilter.test.ts) —
// zusätzlich zur Zeilenauswahl oben, damit ein Refactoring, das versehentlich auf
// `= 1`/`= 2` statt `> 0` umstellt, hier zusätzlich als Textänderung auffällt.
describe('balticSeaCondition — erzeugtes SQL', () => {
	it('prüft beide Flag-Spalten mit ">" und nie mit "="', () => {
		for (const status of ['baltic', 'edge', 'outside'] as const) {
			const { sql } = toSqliteSql(balticSeaCondition(status) as SQL);
			for (const column of ['"ostsee"', '"ostsee_geo"']) {
				if (sql.includes(column)) {
					expect(sql, `${status}: ${column}`).not.toMatch(new RegExp(`${column}\\s*=\\s*\\?`));
				}
			}
		}
	});
});
