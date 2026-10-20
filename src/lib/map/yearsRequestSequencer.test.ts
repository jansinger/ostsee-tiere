import { describe, expect, it } from 'vitest';
import {
	createYearsRequestSequencer,
	resolveYearsUpdate,
	type YearsFetchResult
} from './yearsRequestSequencer';
import type { YearWithCount } from '#lib/utils/date/defaultYear.ts';

/**
 * Review-Befund 1/T7.2: `loadAvailableYears` (SightingsMapView.svelte) hatte
 * keinen Renn- oder Fehler-Guard. Diese Tests decken die lockstep-Kopplung
 * zwischen Statuswechsel und Jahres-Reload rein über die extrahierte
 * Sequencer-Logik ab — ohne DOM/fetch, siehe Docblock in
 * yearsRequestSequencer.ts für die Begründung der Extraktion.
 */

const YEARS_A: YearWithCount[] = [{ year: 2024, count: 3 }];
const YEARS_B: YearWithCount[] = [{ year: 2025, count: 7 }];

describe('createYearsRequestSequencer', () => {
	it('hält nur die zuletzt gestartete Anfrage für aktuell', () => {
		const sequencer = createYearsRequestSequencer();
		const first = sequencer.begin();
		const second = sequencer.begin();

		expect(sequencer.isCurrent(first)).toBe(false);
		expect(sequencer.isCurrent(second)).toBe(true);
	});
});

describe('resolveYearsUpdate', () => {
	it('übernimmt eine erfolgreiche, aktuelle Antwort', () => {
		const result: YearsFetchResult = { ok: true, years: YEARS_B };
		expect(resolveYearsUpdate(true, result)).toBe(YEARS_B);
	});

	it('verwirft eine erfolgreiche, aber überholte Antwort', () => {
		const result: YearsFetchResult = { ok: true, years: YEARS_A };
		expect(resolveYearsUpdate(false, result)).toBeNull();
	});

	it('verwirft eine fehlgeschlagene aktuelle Antwort — vorherige Liste bleibt', () => {
		const result: YearsFetchResult = { ok: false };
		expect(resolveYearsUpdate(true, result)).toBeNull();
	});

	it('verwirft eine fehlgeschlagene UND überholte Antwort', () => {
		const result: YearsFetchResult = { ok: false };
		expect(resolveYearsUpdate(false, result)).toBeNull();
	});

	// (a) zwei Status-Toggles in schneller Folge: die Jahres-Zahlen müssen der
	// LETZTEN Auswahl entsprechen, auch wenn die ältere Anfrage zuletzt antwortet.
	it('lässt bei zwei schnell aufeinanderfolgenden Toggles die zuletzt gestartete Anfrage gewinnen', () => {
		const sequencer = createYearsRequestSequencer();

		// Toggle 1: "Offen" — Anfrage startet
		const requestOpen = sequencer.begin();
		// Toggle 2: "Abgelehnt" — zweite Anfrage startet, bevor die erste zurück ist
		const requestRejected = sequencer.begin();

		let availableYearsData: YearWithCount[] = [];

		// Die ÄLTERE Anfrage (Offen) antwortet zuerst und erfolgreich.
		const openUpdate = resolveYearsUpdate(sequencer.isCurrent(requestOpen), {
			ok: true,
			years: YEARS_A
		});
		if (openUpdate !== null) availableYearsData = openUpdate;

		// Die veraltete Antwort darf die Liste NICHT geschrieben haben.
		expect(availableYearsData).toEqual([]);

		// Die aktuelle Anfrage (Abgelehnt) antwortet danach.
		const rejectedUpdate = resolveYearsUpdate(sequencer.isCurrent(requestRejected), {
			ok: true,
			years: YEARS_B
		});
		if (rejectedUpdate !== null) availableYearsData = rejectedUpdate;

		expect(availableYearsData).toEqual(YEARS_B);
	});

	// (b) ein fehlschlagender /years-Aufruf lässt die vorher geladene Liste unangetastet.
	it('behält die vorherige Jahresliste, wenn die aktuelle Anfrage fehlschlägt', () => {
		const sequencer = createYearsRequestSequencer();

		const firstRequest = sequencer.begin();
		let availableYearsData: YearWithCount[] = [];
		const firstUpdate = resolveYearsUpdate(sequencer.isCurrent(firstRequest), {
			ok: true,
			years: YEARS_A
		});
		if (firstUpdate !== null) availableYearsData = firstUpdate;
		expect(availableYearsData).toEqual(YEARS_A);

		// Zweiter Statuswechsel — der /years-Aufruf schlägt fehl (403/500/Netzwerk).
		const secondRequest = sequencer.begin();
		const secondUpdate = resolveYearsUpdate(sequencer.isCurrent(secondRequest), {
			ok: false
		});
		if (secondUpdate !== null) availableYearsData = secondUpdate;

		// Die Liste aus dem ersten, erfolgreichen Aufruf bleibt erhalten.
		expect(availableYearsData).toEqual(YEARS_A);
	});
});
