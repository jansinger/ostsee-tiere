/**
 * Ampel der Anonymisierung (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md,
 * „Überwachung"): Ein Cron, der still ausfällt, verletzt die Frist, ohne dass
 * es jemand merkt. Rot heißt: Meldungen liegen über der Frist, oder der letzte
 * Lauf ist älter als 48 Stunden.
 */
import { describe, expect, it } from 'vitest';
import {
	ANONYMIZATION_STALE_RUN_HOURS,
	contactDeadline,
	evaluateAnonymizationHealth
} from './anonymizationHealth';

const NOW = new Date('2026-11-20T10:00:00Z');
const hoursAgo = (hours: number): string =>
	new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();

describe('evaluateAnonymizationHealth', () => {
	it('ist vor der Freischaltung inaktiv, nicht rot', () => {
		// Vor der Freigabe liegt praktisch der ganze Bestand über der Frist —
		// das ist der erwartete Ausgangszustand, kein Alarm.
		expect(
			evaluateAnonymizationHealth({ activatedAt: null, lastRunAt: null, overdue: 19873 }, NOW)
		).toEqual({ level: 'inactive', reasons: [] });
	});

	it('ist grün nach einem frischen Lauf ohne Überfällige', () => {
		expect(
			evaluateAnonymizationHealth(
				{ activatedAt: hoursAgo(100), lastRunAt: hoursAgo(5), overdue: 0 },
				NOW
			)
		).toEqual({ level: 'ok', reasons: [] });
	});

	it('ist rot, sobald eine Meldung über der Frist liegt', () => {
		expect(
			evaluateAnonymizationHealth(
				{ activatedAt: hoursAgo(100), lastRunAt: hoursAgo(5), overdue: 1 },
				NOW
			)
		).toEqual({ level: 'alert', reasons: ['overdue'] });
	});

	it(`ist rot, wenn der letzte Lauf älter als ${ANONYMIZATION_STALE_RUN_HOURS} Stunden ist`, () => {
		expect(
			evaluateAnonymizationHealth(
				{
					activatedAt: hoursAgo(500),
					lastRunAt: hoursAgo(ANONYMIZATION_STALE_RUN_HOURS + 1),
					overdue: 0
				},
				NOW
			)
		).toEqual({ level: 'alert', reasons: ['stale_run'] });
	});

	it('bleibt genau an der 48-Stunden-Grenze grün', () => {
		expect(
			evaluateAnonymizationHealth(
				{
					activatedAt: hoursAgo(500),
					lastRunAt: hoursAgo(ANONYMIZATION_STALE_RUN_HOURS),
					overdue: 0
				},
				NOW
			).level
		).toBe('ok');
	});

	it('ist rot, wenn seit der Freischaltung nie ein Lauf kam — aber erst nach 48 Stunden', () => {
		expect(
			evaluateAnonymizationHealth({ activatedAt: hoursAgo(10), lastRunAt: null, overdue: 0 }, NOW)
				.level
		).toBe('ok');
		expect(
			evaluateAnonymizationHealth({ activatedAt: hoursAgo(49), lastRunAt: null, overdue: 0 }, NOW)
		).toEqual({ level: 'alert', reasons: ['stale_run'] });
	});

	it('nennt beide Gründe zugleich', () => {
		expect(
			evaluateAnonymizationHealth(
				{ activatedAt: hoursAgo(500), lastRunAt: hoursAgo(72), overdue: 3 },
				NOW
			).reasons
		).toEqual(['overdue', 'stale_run']);
	});
});

describe('contactDeadline', () => {
	const created = new Date('2026-08-25T09:00:00Z'); // fällig ab 2026-11-24T09:00Z

	it('meldet nichts, solange mehr als 14 Tage Zeit sind', () => {
		expect(contactDeadline(created, new Date('2026-11-09T08:59:00Z'))).toBeNull();
	});

	it('nennt die Frist ab 14 Tagen vorher', () => {
		expect(contactDeadline(created, new Date('2026-11-10T09:00:00Z'))).toEqual({
			kind: 'soon',
			dueAt: new Date('2026-11-24T09:00:00Z')
		});
	});

	it('meldet „abgelaufen", sobald die Meldung fällig ist', () => {
		expect(contactDeadline(created, new Date('2026-11-24T09:00:00Z'))).toEqual({
			kind: 'expired',
			dueAt: new Date('2026-11-24T09:00:00Z')
		});
	});
});
