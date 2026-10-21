import { TEST_TIME_ZONES, withTimeZone } from '#lib/server/datetime/withTimeZone.testutil.ts';
import { describe, expect, it } from 'vitest';
import { TIMESTAMP_AS_TEXT, TIMESTAMP_OID } from './postgresTypes';
import { sightings } from './schema';

/**
 * Die Zeitstempel-Spalten halten echte UTC-Zeitpunkte — unabhängig davon, in
 * welcher Zeitzone der Prozess läuft.
 *
 * Diese Zusicherung stand bis 2026-08-02 nur in `docs/ENVIRONMENT.md` („Drizzle
 * pins both directions explicitly"). Für den Schreibweg stimmte sie
 * (`toISOString()` trägt ein `Z`, das Postgres beim Einfügen in eine Spalte ohne
 * Zeitzone verwirft), für den Lesweg nicht: Drizzle hängt sein `+0000` nur an,
 * wenn der Treiber einen **String** liefert — `postgres.js` liefert für
 * `timestamp without time zone` aber ein bereits geparstes `Date`, ausgelegt in
 * der Zeitzone des Prozesses. Gehalten hat die Zusicherung damit allein das
 * gepinnte `TZ=UTC`.
 *
 * **Kein beobachteter Fehler, sondern eine entfernte Abhängigkeit.** Die
 * laufende Anwendung liest auch ohne diesen Override korrekt, weil ihr Prozess
 * in UTC läuft (nachgemessen für Sommer- und Winterzeitpunkte). Der Test hält
 * fest, dass das Ergebnis nicht mehr davon abhängt.
 *
 * Geprüft wird hier die Naht selbst — Parser-Override und Drizzle-Mapping —,
 * weil sie ohne Datenbank vollständig bestimmt ist. Den Weg durch echte
 * Postgres-Verbindung, Formular und zurück deckt
 * `e2e/admin-edit-preserves-record.spec.ts` ab.
 */

/** Was Postgres für `timestamp without time zone` auf der Leitung schickt. */
const WIRE_VALUE = '2024-06-01 08:30:00';
const EXPECTED_INSTANT = '2024-06-01T08:30:00.000Z';

describe('Zeitstempel-Parsing', () => {
	it('deckt genau die Spalten ohne Zeitzone ab', () => {
		// 1114 = timestamp without time zone. Die Session-Spalten sind
		// `timestamptz` (1184) und werden von postgres.js korrekt mit Offset
		// geparst — sie bleiben deshalb bewusst außen vor.
		expect(TIMESTAMP_OID).toBe(1114);
		expect(TIMESTAMP_AS_TEXT.from).toEqual([TIMESTAMP_OID]);
	});

	it('reicht den Rohwert unverändert an Drizzle weiter', () => {
		expect(TIMESTAMP_AS_TEXT.parse(WIRE_VALUE)).toBe(WIRE_VALUE);
	});

	for (const timeZone of TEST_TIME_ZONES) {
		it(`liest denselben UTC-Zeitpunkt unter ${timeZone}`, () => {
			const instant = withTimeZone(timeZone, () => {
				const raw = TIMESTAMP_AS_TEXT.parse(WIRE_VALUE);
				return sightings.sightingDate.mapFromDriverValue(raw) as Date;
			});

			expect(instant.toISOString()).toBe(EXPECTED_INSTANT);
		});
	}

	it('belegt, dass die Voreinstellung des Treibers das nicht leistet', () => {
		// Gegenprobe zur Begründung oben: Ohne den Override parst postgres.js den
		// Wert selbst, und Drizzle reicht ein fertiges Date unverändert durch.
		const driverDefault = withTimeZone('Europe/Berlin', () => new Date(WIRE_VALUE));

		expect(driverDefault.toISOString()).not.toBe(EXPECTED_INSTANT);
	});
});
