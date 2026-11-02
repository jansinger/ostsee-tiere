/**
 * @fileoverview Was in der Statistik als „beantwortetes Zusatzfeld" zählt
 *
 * Bug (2026-11): Die Hilfe unter dem Formular zeigte zwei verschiedene
 * Prozentzahlen mit fast gleichem Text (56 % und 67 %). Beide beruhten auf
 * einer Zählung, die nur `IS NOT NULL` prüfte. Fünf der zwölf Spalten sind
 * aber `NOT NULL` — `sichtungsdatum` ist Pflicht, `seegang`, `sichtweite`,
 * `verhalten` und `verteilung` stehen per Default auf `0` („Keine Angabe" bzw.
 * die Altlast „Sonstige"). Jede Sichtung brachte damit fünf „ausgefüllte"
 * Felder mit, ohne dass jemand etwas angegeben hatte; leere Texte zählten
 * ebenfalls.
 *
 * Die Tests kompilieren den Ausdruck über den echten `PgDialect` und prüfen das
 * erzeugte SQL — dieselbe Technik wie `statisticsApprovalScope.test.ts`.
 */

import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
	answeredOptionalFieldCount,
	hasAnsweredOptionalField,
	isBehaviorAnswered,
	OPTIONAL_FIELD_COUNT
} from './optionalFields';

const dialect = new PgDialect();
const countSql = dialect.sqlToQuery(answeredOptionalFieldCount()).sql;

/** Die Summanden des Ausdrucks, je einer pro Feld. */
const summands = countSql.split(' + ');

describe('answeredOptionalFieldCount', () => {
	it('zählt genau OPTIONAL_FIELD_COUNT Felder', () => {
		expect(summands).toHaveLength(OPTIONAL_FIELD_COUNT);
		expect(OPTIONAL_FIELD_COUNT).toBe(11);
	});

	it('enthält das Sichtungsdatum nicht — es ist Pflichtfeld', () => {
		expect(countSql).not.toContain('"sichtungsdatum"');
	});

	it.each(['seegang', 'sichtweite'])('wertet %s = 0 („Keine Angabe") nicht als Antwort', (col) => {
		const summand = summands.find((s) => s.includes(`"${col}"`));
		expect(summand).toContain(`"sichtungen"."${col}" > 0`);
	});

	it.each([
		['verhalten', 'verhalten_text'],
		['verteilung', 'verteilung_text']
	])(
		'wertet %s nur als Antwort, wenn es nicht „Keine Angabe" oder unkommentiert „Sonstige" ist',
		(col, textCol) => {
			const summand = summands.find((s) => s.includes(`"${col}" not in`));
			expect(summand).toBeDefined();
			expect(summand).toContain(`"sichtungen"."${col}" not in (0, 4)`);
			// „Sonstige" (0) zählt nur mit Freitext — siehe unspecifiedDefaults.test.ts
			expect(summand).toContain(`coalesce("sichtungen"."${textCol}" ~ '[^[:space:]]', false)`);
		}
	);

	it.each(['windrichtung', 'windstaerke', 'reaktion', 'schiffsname', 'bootstyp', 'bemerkungen'])(
		'wertet einen leeren oder nur aus Leerraum bestehenden Text in %s nicht als Antwort',
		(col) => {
			// Nicht `btrim`: Das entfernt nur Leerzeichen, ein Tab oder Zeilenumbruch
			// zählte dann als Angabe (Review PR #994). `coalesce`, weil `NULL ~ …`
			// NULL ergibt und die Summe sonst insgesamt NULL würde.
			expect(countSql).toContain(`coalesce("sichtungen"."${col}" ~ '[^[:space:]]', false)`);
			expect(countSql).not.toContain('btrim');
		}
	);

	it('wertet anzahl_schiffe = 0 als Antwort — das Feld hat keinen Default', () => {
		expect(countSql).toContain('"sichtungen"."anzahl_schiffe" is not null');
	});
});

describe('hasAnsweredOptionalField', () => {
	it('verlangt mindestens ein beantwortetes Feld', () => {
		const text = dialect.sqlToQuery(hasAnsweredOptionalField()).sql;
		expect(text).toMatch(/\) > 0$/);
		expect(text).toContain(countSql);
	});
});

describe('isBehaviorAnswered', () => {
	it('ist dieselbe Bedingung wie der Verhaltens-Summand der Zählung', () => {
		// Die Admin-Statistik weist „Verhalten angegeben" eigens aus und nutzt dafür
		// diese Funktion — vorher zählte sie `verhalten != 0` und damit
		// „Keine Angabe" (4) als Antwort, „Sonstige" mit Freitext dagegen nicht.
		const text = dialect.sqlToQuery(isBehaviorAnswered()).sql;
		expect(summands).toContain(`${text}::int`);
		expect(text).toContain('"sichtungen"."verhalten" not in (0, 4)');
	});
});
