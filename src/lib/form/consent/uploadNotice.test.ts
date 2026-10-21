/**
 * Der Hinweis an der Dropzone ist die Gegenleistung dafür, dass die Datei schon
 * vor der Einwilligung übertragen werden darf: Er muss sagen, dass übertragen
 * wird, wie lange eine nicht abgeschickte Datei bleibt und dass über die
 * Veröffentlichung getrennt entschieden wird.
 *
 * Siehe docs/archive/MEDIENEINWILLIGUNG_ANALYSE_2026-07-28.md, Abschnitt 9.4.
 */
import { ORPHAN_RETENTION_HOURS } from '#lib/constants/uploadRetention.ts';
import { describe, expect, it } from 'vitest';
import { uploadNotice } from './uploadNotice';

describe('uploadNotice()', () => {
	it('sagt, dass die Aufnahme übertragen wird', () => {
		expect(uploadNotice().toLowerCase()).toMatch(/übertragen/);
	});

	it('nennt den Zweck: Prüfung der Meldung', () => {
		expect(uploadNotice().toLowerCase()).toMatch(/prüfung|prüfen/);
	});

	it('kündigt die Löschung nicht abgeschickter Aufnahmen an', () => {
		expect(uploadNotice().toLowerCase()).toMatch(/lösch/);
	});

	it('nennt genau die Frist, die der Aufräum-Lauf tatsächlich anwendet', () => {
		// Verhindert, dass Text und Code auseinanderlaufen: Steht im Hinweis
		// eine andere Zahl als in ORPHAN_RETENTION_HOURS, ist die Zusage falsch.
		const numbers = uploadNotice().match(/\d+/g) ?? [];
		expect(numbers).toContain(String(ORPHAN_RETENTION_HOURS));
	});

	it('verweist die Entscheidung über eine Veröffentlichung an den Melder', () => {
		expect(uploadNotice().toLowerCase()).toMatch(/veröffentlichung/);
	});
});
