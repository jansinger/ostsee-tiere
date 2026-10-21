/**
 * Sichtungs-Aktionen des Admin-Bereichs, geteilt zwischen Tabelle (`/admin/sichtungen`) und
 * Detailansicht (`/admin/[id]`).
 *
 * Beide Funktionen erledigen Toast und Logging selbst — was danach passiert, ist
 * dagegen von der Aufrufstelle abhängig: Die Tabelle lädt ihre Daten neu, die
 * Detailansicht muss die gelöschte Sichtung verlassen. Sie navigieren deshalb
 * nicht, sondern geben den Ausgang zurück.
 *
 * **Warum der Ausgang die Meldung mitführt** (seit 2026-08-14): Ein Toast ist
 * nach fünf Sekunden weg und trägt keine Wiederholung — für den Fehlschlag einer
 * Aktion, die der Nutzer gerade ausgelöst hat, ist das die falsche Form
 * (`docs/DESIGN_SYSTEM.md`, „Fehlende Zustände"). Die Tabelle zeigt stattdessen
 * eine stehende Fläche mit „Erneut versuchen" und braucht dafür den Text, den
 * bisher nur der Toast sah. `silent` schaltet die Einblendung ab, ohne am
 * Rückgabewert oder am Logeintrag etwas zu ändern — dieselbe Konstruktion und
 * dieselbe Begründung wie bei `submitVerdict` (`sightingVerdict.ts`).
 */
import { createLogger } from '#lib/logger.ts';
import { toast } from '#lib/stores/toastState.svelte.ts';

const logger = createLogger('adminSightingActions');

/**
 * Ausgang einer Aktion. Im Fehlerfall mit dem Text, der dem Nutzer zusteht —
 * die Server-Meldung, wo es eine gibt, sonst die Einordnung des Fehlers.
 */
export type SightingActionOutcome = { ok: true } | { ok: false; message: string };

export interface SightingActionOptions {
	/**
	 * Unterdrückt den **Fehler**-Toast. Rückgabewert und Logeintrag bleiben
	 * unverändert; Lade- und Erfolgsmeldung ebenfalls — sie sind flüchtige
	 * Rückmeldungen zu einem abgeschlossenen Vorgang und in der Form richtig.
	 * Gleiche Bedeutung wie bei `submitVerdict`.
	 */
	silent?: boolean;
}

/**
 * Tooltip der Mail-Aktion — an einer Stelle, weil er an drei Bedienelementen
 * hängt (Tabelle, Karten-Layout, Detailansicht).
 *
 * Er nennt den Empfänger ausdrücklich: Die frühere Beschriftung „Interne
 * Benachrichtigung testweise senden" ließ offen, wer die Mail bekommt, und
 * genau diese Lücke war der Anlass für #621 — die Erfolgsmeldung las sich, als
 * wäre die meldende Person angeschrieben worden.
 */
export const TEST_EMAIL_HINT =
	'Verschickt die interne Benachrichtigung zu dieser Sichtung erneut an die konfigurierte Empfänger-Adresse des Teams — nicht an die meldende Person.';

/**
 * Schickt die interne Benachrichtigung zu einer Sichtung testweise an die
 * konfigurierte Empfänger-Adresse — nicht an die meldende Person (#621).
 */
export async function sendTestEmail(
	sightingId: number,
	{ silent = false }: SightingActionOptions = {}
): Promise<SightingActionOutcome> {
	const loadingToastId = toast.info('E-Mail wird gesendet...', { duration: 0 });

	try {
		const response = await fetch('/api/admin/test-email', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				sightingId,
				testType: 'sighting'
			})
		});

		const result = await response.json();

		if (result.success) {
			toast.success(result.message || 'Test-E-Mail wurde erfolgreich gesendet', {
				title: 'E-Mail gesendet',
				duration: 5000
			});
			return { ok: true };
		}

		const message = result.error || 'Fehler beim Senden der Test-E-Mail';
		logger.error({ sightingId, message }, 'Test-E-Mail fehlgeschlagen');
		if (!silent) {
			toast.error(message, {
				title: 'Fehler',
				dismissible: true
			});
		}
		return { ok: false, message };
	} catch (error) {
		logger.error({ error, sightingId }, 'Error sending test email');
		const message = 'Netzwerkfehler beim Senden der Test-E-Mail';
		if (!silent) {
			toast.error(message, {
				title: 'Verbindungsfehler',
				dismissible: true
			});
		}
		return { ok: false, message };
	} finally {
		// Auch im Fehlerfall: sonst bleibt der Lade-Toast wegen duration 0 stehen.
		toast.remove(loadingToastId);
	}
}

/** Löscht eine Sichtung. Gibt zurück, ob der Server sie tatsächlich gelöscht hat. */
export async function deleteSighting(
	id: number,
	{ silent = false }: SightingActionOptions = {}
): Promise<SightingActionOutcome> {
	try {
		const response = await fetch(`/api/sightings/${id}`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (response.ok) {
			const result = await response.json();
			logger.info({ id, result }, 'Sichtung erfolgreich gelöscht');
			toast.success('Sichtung wurde gelöscht', { duration: 5000 });
			return { ok: true };
		}

		const error = await response.json();
		logger.error({ id, error }, 'Fehler beim Löschen der Sichtung');
		const message = error.error || 'Sichtung konnte nicht gelöscht werden';
		if (!silent) {
			toast.error(message, {
				title: 'Fehler',
				dismissible: true
			});
		}
		return { ok: false, message };
	} catch (error) {
		logger.error({ id, error }, 'Netzwerkfehler beim Löschen');
		const message = 'Netzwerkfehler beim Löschen der Sichtung';
		if (!silent) {
			toast.error(message, {
				title: 'Verbindungsfehler',
				dismissible: true
			});
		}
		return { ok: false, message };
	}
}
