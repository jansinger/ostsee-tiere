import * as m from '#lib/paraglide/messages.js';
/**
 * Konsolidierte "Kontaktdaten löschen"-Logik.
 *
 * Vorher gab es diese Aktion zweimal (FormActions.svelte + Step4Contact.svelte)
 * mit unterschiedlichem Bestätigungstext und unterschiedlichem Feedback
 * (Toast vs. nur Logger). Diese Datei bündelt beides zu einer Implementierung
 * mit einem Text und einem Feedback-Weg (Toast).
 */
import { USER_CONTACT_FIELDS } from '#lib/report/formConfig.ts';
import { clearUserContactData } from '#lib/storage/localStorage.ts';
import { createToast } from '#lib/stores/toastState.svelte.ts';
import type { SightingFormData } from '#lib/types/Form.ts';

/**
 * Signatur von `updateField` aus dem Form-Context (`FormApi<SightingFormData>`).
 * Bewusst gegen `SightingFormData` getippt (statt generisch), da `updateField`
 * nur echte Feldnamen des Sichtungsformulars akzeptiert — `formValues` bleibt
 * dagegen locker typisiert, damit die Funktion auch mit einfachen Test-Objekten
 * aufgerufen werden kann.
 */
type UpdateContactField = (field: keyof SightingFormData, value: unknown) => void;

// Funktionen statt Konstanten: siehe formConfig.ts.
export const clearContactDataConfirmMessage = (): string =>
	m.report_clearcontactdata_text_moechten_sie_wirklich_alle_gespeicherten();

export const clearContactDataSuccessMessage = (): string =>
	m.report_clearcontactdata_text_gespeicherte_kontaktdaten_wurden_geloesc();

/**
 * Setzt die Kontaktfelder im Formular-State auf ihren jeweiligen Default zurück
 * (leerer String bzw. `false` bei Boolean-Feldern) und löscht die im Local-/
 * Session-Storage gespeicherten Kontaktdaten.
 *
 * Reine Datenoperation ohne Confirm-Dialog oder Toast, damit sie isoliert
 * testbar ist und unabhängig von `window.confirm` verwendet werden kann.
 */
export function resetSavedContactData(
	formValues: Record<string, unknown>,
	updateField: UpdateContactField
): void {
	clearUserContactData();

	for (const field of USER_CONTACT_FIELDS) {
		const defaultValue = typeof formValues[field] === 'boolean' ? false : '';
		updateField(field, defaultValue);
	}
}

/**
 * Löscht die gespeicherten Kontaktdaten inklusive der zugehörigen
 * Formularfelder und meldet das mit einem Erfolgs-Toast.
 *
 * **Die Rückfrage steht bewusst nicht mehr hier.** Bis zur
 * Dialog-Konsolidierung (UX MEDIUM 13) hieß diese Funktion
 * `confirmAndClearContactData` und rief `window.confirm`; ihr Rückgabewert sagte
 * dem Aufrufer, ob der Nutzer bestätigt hat. Ein `ConfirmDialog` beantwortet
 * seine Frage aber nicht synchron im Funktionsaufruf, sondern über einen
 * Callback — die Rückfrage gehört damit dorthin, wo der Dialog steht
 * (`Step4Contact.svelte`), und hier bleibt die Wirkung. Deshalb auch kein
 * Rückgabewert mehr: Wer diese Funktion ruft, hat die Bestätigung bereits.
 */
export function clearContactDataWithFeedback(
	formValues: Record<string, unknown>,
	updateField: UpdateContactField
): void {
	resetSavedContactData(formValues, updateField);
	createToast('success', clearContactDataSuccessMessage());
}
