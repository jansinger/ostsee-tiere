/**
 * Verdict-Aufruf der Eingangsseite (`/admin`) — Freigeben, Ablehnen, Undo.
 *
 * Toast nur im Fehlerfall: Der Erfolg ist auf der Eingangsseite sichtbar
 * (die Karte verschwindet), ein Erfolgs-Toast pro abgearbeiteter Meldung
 * wäre bei einer Task-Liste Dauerrauschen.
 */
import { createLogger } from '#lib/logger.ts';
import { toast } from '#lib/stores/toastState.svelte.ts';

const logger = createLogger('adminInboxVerdict');

export type SightingVerdict = 'approve' | 'reject' | 'reset';

export interface SubmitVerdictOptions {
	/**
	 * Unterdrückt den Fehler-Toast — für die Bulk-Aktion der Tabelle
	 * (`bulkVerdict.ts`), die bis zu 100 Zeilen nacheinander schickt und am Ende
	 * **eine** Zusammenfassung zeigt. Der Rückgabewert bleibt unverändert, der
	 * Logeintrag ebenfalls: Still ist nur die Oberfläche, nicht die Diagnose.
	 */
	silent?: boolean;
}

export async function submitVerdict(
	id: number,
	verdict: SightingVerdict,
	{ silent = false }: SubmitVerdictOptions = {}
): Promise<boolean> {
	try {
		const response = await fetch(`/api/sightings/${id}/verify`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ verdict })
		});
		if (response.ok) {
			logger.info({ id, verdict }, 'Verdict gespeichert');
			return true;
		}
		const body: { message?: string } | null = await response.json().catch(() => null);
		logger.error({ id, verdict, status: response.status, body }, 'Verdict fehlgeschlagen');
		if (!silent) {
			toast.error(body?.message || 'Status konnte nicht gespeichert werden', {
				title: 'Fehler',
				dismissible: true
			});
		}
		return false;
	} catch (error) {
		logger.error({ id, verdict, error }, 'Netzwerkfehler beim Verdict');
		if (!silent) {
			toast.error('Netzwerkfehler beim Speichern des Status', {
				title: 'Verbindungsfehler',
				dismissible: true
			});
		}
		return false;
	}
}
