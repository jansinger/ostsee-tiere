import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({
	info: vi.fn(() => 'toast-id'),
	success: vi.fn(),
	error: vi.fn(),
	remove: vi.fn()
}));

vi.mock('#lib/stores/toastState.svelte.ts', () => ({ toast: toastMock }));
vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

import { deleteSighting, sendTestEmail } from './sightingActions';

function antwort(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('sightingActions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('deleteSighting', () => {
		it('meldet den Erfolg zurück und als Toast', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(antwort(200, { success: true })));

			await expect(deleteSighting(1)).resolves.toEqual({ ok: true });
			expect(toastMock.success).toHaveBeenCalled();
		});

		it('gibt die Servermeldung im Fehlerfall an die Aufrufstelle zurück', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(antwort(409, { error: 'Sichtung ist gesperrt' }))
			);

			await expect(deleteSighting(1)).resolves.toEqual({
				ok: false,
				message: 'Sichtung ist gesperrt'
			});
		});

		it('meldet auch einen Netzwerkfehler als Ergebnis, nicht nur als Toast', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

			const ergebnis = await deleteSighting(1);

			expect(ergebnis.ok).toBe(false);
			expect(ergebnis.ok === false && ergebnis.message).toBeTruthy();
		});

		it('schweigt mit `silent`, liefert den Ausgang aber unverändert', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(antwort(500, { error: 'Serverfehler' })));

			await expect(deleteSighting(1, { silent: true })).resolves.toEqual({
				ok: false,
				message: 'Serverfehler'
			});
			expect(toastMock.error).not.toHaveBeenCalled();
		});

		it('`silent` betrifft nur den Fehlerfall — der Erfolg bleibt sichtbar', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(antwort(200, { success: true })));

			await expect(deleteSighting(1, { silent: true })).resolves.toEqual({ ok: true });
			expect(toastMock.success).toHaveBeenCalled();
		});
	});

	describe('sendTestEmail', () => {
		it('gibt den Fehlschlag zurück, den der Server meldet', async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(antwort(200, { success: false, error: 'SMTP nicht erreichbar' }))
			);

			await expect(sendTestEmail(1)).resolves.toEqual({
				ok: false,
				message: 'SMTP nicht erreichbar'
			});
		});

		it('räumt den Lade-Toast auch mit `silent` und nach einem Fehler ab', async () => {
			vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

			const ergebnis = await sendTestEmail(1, { silent: true });

			expect(ergebnis.ok).toBe(false);
			expect(toastMock.error).not.toHaveBeenCalled();
			/* Der Lade-Toast läuft mit `duration: 0` — bliebe er stehen, hinge eine
			   Einblendung „E-Mail wird gesendet…" dauerhaft auf der Seite. */
			expect(toastMock.remove).toHaveBeenCalledWith('toast-id');
		});

		it('meldet den Erfolg zurück', async () => {
			vi.stubGlobal('fetch', vi.fn().mockResolvedValue(antwort(200, { success: true })));

			await expect(sendTestEmail(1)).resolves.toEqual({ ok: true });
		});
	});
});
