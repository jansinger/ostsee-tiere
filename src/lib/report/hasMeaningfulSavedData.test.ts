/**
 * UX-Review (2026-08-07, Befund 6): Der Wiederherstellungs-Toast in
 * `ModernReportForm.svelte` feuerte bislang schon dann, wenn `sessionStorage`
 * den Schlüssel `FORM_DATA` überhaupt enthielt — und das Formular schreibt
 * diesen Schlüssel schon beim bloßen Öffnen (`$effect`, `saveToStorage`).
 * Auswahlseite → Formular → „Ändern" → Formular, ohne je etwas einzutippen,
 * zeigte damit trotzdem „Ihre vorherigen Eingaben wurden wiederhergestellt.".
 *
 * `hasMeaningfulSavedData` ist die pure Vergleichsfunktion dahinter: Der Toast
 * darf nur erscheinen, wenn sich die aus dem Storage geladenen Daten
 * TATSÄCHLICH vom Initialzustand unterscheiden.
 */
import { describe, expect, it } from 'vitest';
import { hasMeaningfulSavedData } from './hasMeaningfulSavedData';
import { initialFormState } from './formConfig';
import type { SightingFormData } from '#lib/types/index.ts';

describe('hasMeaningfulSavedData', () => {
	it('meldet keine Änderung, wenn die gespeicherten Daten den Defaults entsprechen', () => {
		const saved: SightingFormData = { ...initialFormState };
		const initial: SightingFormData = { ...initialFormState };

		expect(hasMeaningfulSavedData(saved, initial)).toBe(false);
	});

	it('ignoriert eine abweichende referenceId — jede Sitzung erzeugt eine neue', () => {
		const saved: SightingFormData = { ...initialFormState, referenceId: 'alte-sitzung' };
		const initial: SightingFormData = { ...initialFormState, referenceId: 'neue-sitzung' };

		expect(hasMeaningfulSavedData(saved, initial)).toBe(false);
	});

	it('ignoriert eine abweichende isDead — der Zweig kommt von der Einstiegsseite, nicht vom Nutzer', () => {
		const saved: SightingFormData = { ...initialFormState, isDead: true };
		const initial: SightingFormData = { ...initialFormState, isDead: false };

		expect(hasMeaningfulSavedData(saved, initial)).toBe(false);
	});

	it('meldet keine Änderung, wenn die Kontaktdaten mit den persistierten übereinstimmen', () => {
		// `initialFormData` in ModernReportForm.svelte trägt bereits
		// `savedUserContactData` — dieselben Werte stehen deshalb auch in
		// `savedFormData` (aus einer früheren Sitzung mit demselben
		// wiederkehrenden Melder). Kein Unterschied, also kein Toast.
		const initial: SightingFormData = {
			...initialFormState,
			firstName: 'Max',
			lastName: 'Mustermann',
			email: 'max@example.com',
			phone: '0170123456'
		};
		const saved: SightingFormData = { ...initial, referenceId: 'andere-referenz' };

		expect(hasMeaningfulSavedData(saved, initial)).toBe(false);
	});

	it('meldet eine Änderung, wenn ein Fahrwasser eingetippt wurde', () => {
		const saved: SightingFormData = { ...initialFormState, waterway: 'Kieler Förde' };
		const initial: SightingFormData = { ...initialFormState };

		expect(hasMeaningfulSavedData(saved, initial)).toBe(true);
	});

	it('meldet eine Änderung, wenn bereits Dateien hochgeladen wurden', () => {
		const saved: SightingFormData = {
			...initialFormState,
			uploadedFiles: [
				{
					uid: 'abc',
					filePath: '/uploads/abc.jpg',
					originalName: 'abc.jpg',
					mimeType: 'image/jpeg',
					size: 1234
				}
			]
		};
		const initial: SightingFormData = { ...initialFormState };

		expect(hasMeaningfulSavedData(saved, initial)).toBe(true);
	});
});
