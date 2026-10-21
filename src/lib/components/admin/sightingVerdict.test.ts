import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitVerdict } from './sightingVerdict';
import { toast } from '#lib/stores/toastState.svelte.ts';

vi.mock('#lib/stores/toastState.svelte.ts', () => ({
	toast: { error: vi.fn(), success: vi.fn() }
}));
vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

describe('submitVerdict', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		/* `restoreAllMocks` fasst die `vi.fn()` aus der Modul-Factory oben nicht an
		   — ohne dieses Leeren sähe ein späterer Test die Toasts der früheren. */
		vi.mocked(toast.error).mockClear();
	});

	it('sendet PATCH mit verdict im Body und meldet Erfolg', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
		const ok = await submitVerdict(42, 'approve');
		expect(ok).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/sightings/42/verify',
			expect.objectContaining({
				method: 'PATCH',
				body: JSON.stringify({ verdict: 'approve' })
			})
		);
	});

	it("schickt 'reset' unverändert durch — die Tabelle hebt damit eine Ablehnung auf", async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

		expect(await submitVerdict(42, 'reset')).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/sightings/42/verify',
			expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ verdict: 'reset' }) })
		);
	});

	it('meldet false bei HTTP-Fehler und bei Netzwerkfehler', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ message: 'kaputt' }), { status: 500 })
		);
		expect(await submitVerdict(42, 'reject')).toBe(false);

		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
		expect(await submitVerdict(42, 'reject')).toBe(false);
	});

	/* Für die Bulk-Aktion der Tabelle: Dort werden bis zu 100 Zeilen nacheinander
	   geschickt, und ein Fehler-Toast pro Zeile wäre eine Wand statt einer
	   Rückmeldung. Die Zusammenfassung übernimmt der Aufrufer. */
	it('unterdrückt im stillen Modus den Fehler-Toast, meldet aber weiterhin false', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ message: 'kaputt' }), { status: 500 })
		);

		expect(await submitVerdict(42, 'approve', { silent: true })).toBe(false);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('unterdrückt im stillen Modus auch den Netzwerkfehler-Toast', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

		expect(await submitVerdict(42, 'approve', { silent: true })).toBe(false);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('meldet ohne stillen Modus weiterhin per Toast', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ message: 'kaputt' }), { status: 500 })
		);

		await submitVerdict(42, 'approve');
		expect(toast.error).toHaveBeenCalled();
	});
});
