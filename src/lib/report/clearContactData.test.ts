import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clearUserContactData } = vi.hoisted(() => ({ clearUserContactData: vi.fn() }));
vi.mock('#lib/storage/localStorage.ts', () => ({ clearUserContactData }));

const { createToast } = vi.hoisted(() => ({ createToast: vi.fn() }));
vi.mock('#lib/stores/toastState.svelte.ts', () => ({ createToast }));

import { USER_CONTACT_FIELDS } from '#lib/report/formConfig.ts';
import {
	clearContactDataSuccessMessage,
	clearContactDataWithFeedback,
	resetSavedContactData
} from './clearContactData';

describe('resetSavedContactData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('löscht die gespeicherten Kontaktdaten im Storage', () => {
		const updateField = vi.fn();

		resetSavedContactData({}, updateField);

		expect(clearUserContactData).toHaveBeenCalledOnce();
	});

	it('setzt alle Kontaktfelder auf ihren jeweiligen Default zurück', () => {
		const updateField = vi.fn();
		const formValues: Record<string, unknown> = {
			firstName: 'Max',
			email: 'max@example.com',
			nameConsent: true,
			shipNameConsent: false
		};

		resetSavedContactData(formValues, updateField);

		expect(updateField).toHaveBeenCalledTimes(USER_CONTACT_FIELDS.length);
		expect(updateField).toHaveBeenCalledWith('firstName', '');
		expect(updateField).toHaveBeenCalledWith('email', '');
		expect(updateField).toHaveBeenCalledWith('nameConsent', false);
		expect(updateField).toHaveBeenCalledWith('shipNameConsent', false);
	});
});

/**
 * Die Rückfrage ist aus dieser Datei verschwunden: Sie lief über
 * `window.confirm`, und der native Dialog ist auf dem Telefon nicht
 * gestaltbar, nennt die App als Absender („localhost sagt …") und darf im
 * iframe auf meeresmuseum.de ganz unterdrückt werden — dann liefe das Löschen
 * entweder ungefragt oder gar nicht. Gefragt wird jetzt eine Ebene höher über
 * `ConfirmDialog` (`Step4Contact.svelte`); hier bleibt die Ausführung.
 */
describe('clearContactDataWithFeedback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('löscht die gespeicherten Kontaktdaten und setzt die Felder zurück', () => {
		const updateField = vi.fn();

		clearContactDataWithFeedback({ firstName: 'Max' }, updateField);

		expect(clearUserContactData).toHaveBeenCalledOnce();
		expect(updateField).toHaveBeenCalledWith('firstName', '');
	});

	it('zeigt einen Erfolgs-Toast', () => {
		clearContactDataWithFeedback({}, vi.fn());

		expect(createToast).toHaveBeenCalledWith('success', clearContactDataSuccessMessage());
	});

	it('fragt nicht mehr über window.confirm nach', () => {
		const confirmSpy = vi.fn().mockReturnValue(true);
		vi.stubGlobal('confirm', confirmSpy);

		clearContactDataWithFeedback({}, vi.fn());

		expect(confirmSpy).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});
