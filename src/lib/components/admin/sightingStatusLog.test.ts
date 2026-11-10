import { describe, expect, it } from 'vitest';
import { SIGHTING_STATUS_PRESENTATION, verdictToStatus } from './sightingStatus';
import { buildSightingHistory, VERDICT_LOG_LABEL } from './sightingStatusLog';
import type { SightingStatusLogEntry } from './sightingStatusLog';

/**
 * @fileoverview Der Wortlaut der Historie darf nicht vom Statuswort abdriften.
 *
 * `VERDICT_LOG_LABEL` führt eigene Literale, und der Docblock dort begründet
 * genau **eine** Abweichung: `reset` heißt „Zurückgesetzt" statt „Offen", weil
 * ein Eintrag ein Ereignis beschreibt und keinen Zustand. Für `approve` und
 * `reject` fallen Ereignis und Zustand zusammen — dass sie das auch bleiben,
 * prüft dieser Test. Ohne ihn wäre eine Umbenennung in
 * `SIGHTING_STATUS_PRESENTATION` an einer Stelle sichtbar und an der anderen
 * nicht, und niemandem fiele auf, welche der beiden die richtige ist.
 */
describe('VERDICT_LOG_LABEL', () => {
	it.each(['approve', 'reject'] as const)('sagt bei %s dasselbe wie das Statuswort', (verdict) => {
		expect(VERDICT_LOG_LABEL[verdict]).toBe(
			SIGHTING_STATUS_PRESENTATION[verdictToStatus(verdict)].label
		);
	});

	it('weicht bei reset bewusst ab — Ereignis statt Zustand', () => {
		expect(VERDICT_LOG_LABEL.reset).toBe('Zurückgesetzt');
		expect(SIGHTING_STATUS_PRESENTATION[verdictToStatus('reset')].label).toBe('Offen');
	});
});

/**
 * Die Anonymisierung steht in der Historie, ohne in `sichtung_status_log` zu
 * stehen: Den Zeitpunkt trägt die Zeile selbst (`anonymisiert_am`), und die
 * Tabelle schreibt nur der Verify-Endpunkt (`statusLogWriteScan.test.ts`).
 */
describe('buildSightingHistory', () => {
	const eintrag = (id: number, recordedAt: string): SightingStatusLogEntry => ({
		id,
		verdict: 'approve',
		editor: null,
		recordedAt
	});

	it('übernimmt die Entscheidungen unverändert, wenn nicht anonymisiert wurde', () => {
		const entries = [eintrag(1, '2026-08-01T10:00:00Z'), eintrag(2, '2026-08-02T10:00:00Z')];

		expect(buildSightingHistory(entries, null)).toEqual([
			{ kind: 'verdict', key: 'verdict-1', at: '2026-08-01T10:00:00Z', entry: entries[0] },
			{ kind: 'verdict', key: 'verdict-2', at: '2026-08-02T10:00:00Z', entry: entries[1] }
		]);
	});

	it('sortiert die Anonymisierung zeitlich zwischen die Entscheidungen ein', () => {
		const history = buildSightingHistory(
			[eintrag(1, '2026-08-01T10:00:00Z'), eintrag(2, '2026-12-01T10:00:00Z')],
			new Date('2026-11-09T03:15:00Z')
		);

		expect(history.map((item) => item.kind)).toEqual(['verdict', 'anonymized', 'verdict']);
		expect(history[1]).toEqual({
			kind: 'anonymized',
			key: 'anonymized',
			at: '2026-11-09T03:15:00.000Z'
		});
	});

	it('nimmt den Zeitpunkt auch als String, wie er durch JSON kommt', () => {
		expect(buildSightingHistory([], '2026-11-09T03:15:00.000Z')).toEqual([
			{ kind: 'anonymized', key: 'anonymized', at: '2026-11-09T03:15:00.000Z' }
		]);
	});

	it('übergeht einen unlesbaren Zeitpunkt, statt „Invalid Date" zu zeigen', () => {
		expect(buildSightingHistory([], 'kein Datum')).toEqual([]);
	});
});
