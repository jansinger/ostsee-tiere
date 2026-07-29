import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeSubmitFailure, submitSightingForm } from './submitSightingForm';

// Mock clearStorage — die Funktion darf ihn nicht mehr aufrufen (siehe unten).
vi.mock('$lib/storage/localStorage', () => ({
	clearStorage: vi.fn()
}));

import { clearStorage } from '$lib/storage/localStorage';

// Minimal valid form values for testing
const validFormValues = {
	sightingDate: '2024-06-15',
	sightingTime: '14:30',
	species: 0,
	totalCount: 2,
	email: 'test@example.com',
	privacyConsent: true,
	latitude: 54.5,
	longitude: 10.5
} as Parameters<typeof submitSightingForm>[0];

/** Baut eine Antwort-Attrappe inklusive Headers und optional kaputtem Körper. */
function mockResponse(options: {
	status: number;
	body?: object;
	unparseable?: boolean;
	headers?: Record<string, string>;
}): void {
	const { status, body, unparseable, headers = {} } = options;

	global.fetch = vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		headers: {
			get: (name: string) => headers[name] ?? null
		},
		json: () =>
			unparseable
				? Promise.reject(
						new SyntaxError('Unexpected token \'<\', "<html><bo"... is not valid JSON')
					)
				: Promise.resolve(body ?? {})
	});
}

describe('submitSightingForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("status 'ok'", () => {
		it('gibt die Sichtungs-ID zurück', async () => {
			mockResponse({ status: 201, body: { success: true, id: 42, referenceId: 'clx8k2p9a' } });

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'ok',
				id: 42
			});
		});

		it('sendet POST an /api/sightings mit JSON Content-Type', async () => {
			mockResponse({ status: 201, body: { success: true, id: 1 } });

			await submitSightingForm(validFormValues);

			expect(global.fetch).toHaveBeenCalledWith('/api/sightings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validFormValues)
			});
		});

		/**
		 * Der Speicher wird bewusst NICHT hier geräumt, sondern in
		 * `ModernReportForm.svelte` nach dem `onSubmit`-Callback. Zwei Gründe:
		 *
		 * 1. Diese Funktion ist Transport — der Lebenszyklus des Formularspeichers
		 *    gehört der Komponente, die das Formular hält.
		 * 2. Der frühere Aufruf hier lief, bevor `onSubmit` durch war. Scheiterte
		 *    dieser Callback, war der Speicher schon leer und die Eingaben weg —
		 *    im Widerspruch zum Kommentar an der Aufrufstelle („Fehler in onSubmit
		 *    soll Formular erhalten"). Die Komponente räumt mit
		 *    `clearFormDataOnly()` + `CURRENT_STEP = 0` denselben Umfang.
		 */
		it('räumt den Speicher nicht selbst auf — dafür ist die Aufrufstelle zuständig', async () => {
			mockResponse({ status: 201, body: { success: true, id: 42 } });

			await submitSightingForm(validFormValues);

			expect(clearStorage).not.toHaveBeenCalled();
		});
	});

	describe("status 'offline'", () => {
		it('erkennt den TypeError von fetch als fehlende Verbindung', async () => {
			global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({ status: 'offline' });
		});

		/**
		 * WLAN an Bord ohne Uplink: `navigator.onLine` meldet `true`, `fetch`
		 * scheitert trotzdem. Für dieses Projekt der Regelfall — der TypeError
		 * allein muss deshalb genügen.
		 */
		it('erkennt Offline auch, wenn navigator.onLine true meldet', async () => {
			vi.stubGlobal('navigator', { onLine: true });
			global.fetch = vi.fn().mockRejectedValue(new TypeError('Load failed'));

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({ status: 'offline' });
		});

		it('wertet navigator.onLine === false als zusätzliches Signal', async () => {
			vi.stubGlobal('navigator', { onLine: false });
			global.fetch = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({ status: 'offline' });
		});

		it('verschluckt Fehler nicht, die keine Netzwerkfehler sind', async () => {
			vi.stubGlobal('navigator', { onLine: true });
			global.fetch = vi.fn().mockRejectedValue(new RangeError('Ungültiger Header'));

			await expect(submitSightingForm(validFormValues)).rejects.toThrow('Ungültiger Header');
		});
	});

	describe("status 'server'", () => {
		it('meldet einen 500 mit dem HTTP-Status', async () => {
			mockResponse({
				status: 500,
				body: { success: false, code: 'SERVER_ERROR', message: 'Ein unbekannter Fehler' }
			});

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'server',
				httpStatus: 500
			});
		});

		/**
		 * Regression: `response.json()` lief vor der `response.ok`-Prüfung. Ein 502
		 * mit HTML-Fehlerseite warf einen JSON-Parse-Fehler, dessen Rohtext beim
		 * Nutzer landete.
		 */
		it('meldet einen 502 mit HTML-Body als Serverfehler statt als Parse-Fehler', async () => {
			mockResponse({ status: 502, unparseable: true });

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'server',
				httpStatus: 502
			});
		});

		it('behandelt eine unlesbare 200-Antwort als Serverfehler', async () => {
			mockResponse({ status: 200, unparseable: true });

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'server',
				httpStatus: 200
			});
		});

		it('behandelt eine 201 ohne ID als Serverfehler', async () => {
			mockResponse({ status: 201, body: { success: true } });

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'server',
				httpStatus: 201
			});
		});
	});

	describe("status 'rejected'", () => {
		it('reicht die Validierungsmeldung eines 400 durch', async () => {
			mockResponse({
				status: 400,
				body: {
					success: false,
					code: 'VALIDATION_ERROR',
					message: 'Validierungsfehler bei der Eingabe'
				}
			});

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'rejected',
				message: 'Validierungsfehler bei der Eingabe'
			});
		});

		it('behandelt einen 422 (Datenbank-Integrität) als Ablehnung', async () => {
			mockResponse({
				status: 422,
				body: { success: false, code: 'DATABASE_ERROR', message: 'Die Daten konnten nicht …' }
			});

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'rejected',
				message: 'Die Daten konnten nicht …'
			});
		});

		it('behandelt eine 200 mit success: false als Ablehnung', async () => {
			mockResponse({ status: 200, body: { success: false, message: 'Doppelte Meldung' } });

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'rejected',
				message: 'Doppelte Meldung'
			});
		});

		it('fällt bei einem 400 ohne Meldung auf Serverfehler zurück', async () => {
			mockResponse({ status: 400, body: { success: false } });

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'server',
				httpStatus: 400
			});
		});
	});

	describe("status 'ratelimited'", () => {
		/**
		 * `enforceRateLimit()` wirft `error(429, '… (45s)')`. SvelteKit liefert das
		 * als `{ message }` ohne `Retry-After`-Header aus — die Sekunden stehen
		 * ausschließlich im Text.
		 */
		it('liest die Wartezeit aus der Meldung der Middleware', async () => {
			mockResponse({
				status: 429,
				body: { message: 'Rate limit exceeded. Try again after 14:23:11 (45s)' }
			});

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'ratelimited',
				retryAfter: 45
			});
		});

		it('bevorzugt einen Retry-After-Header, falls ein Proxy ihn setzt', async () => {
			mockResponse({
				status: 429,
				body: { message: 'Rate limit exceeded. Try again after 14:23:11 (45s)' },
				headers: { 'Retry-After': '120' }
			});

			await expect(submitSightingForm(validFormValues)).resolves.toEqual({
				status: 'ratelimited',
				retryAfter: 120
			});
		});

		it('kommt ohne Wartezeit aus, wenn keine ermittelbar ist', async () => {
			mockResponse({ status: 429, unparseable: true });

			await expect(submitSightingForm(validFormValues)).resolves.toStrictEqual({
				status: 'ratelimited'
			});
		});
	});

	describe('describeSubmitFailure', () => {
		it('nennt bei offline das Schicksal der Daten', () => {
			expect(describeSubmitFailure({ status: 'offline' })).toContain(
				'Eingaben bleiben vollständig gespeichert'
			);
		});

		it('nennt bei einem Rate Limit die Wartezeit', () => {
			expect(describeSubmitFailure({ status: 'ratelimited', retryAfter: 45 })).toContain(
				'45 Sekunden'
			);
		});

		it('reicht die Ablehnungsmeldung unverändert durch', () => {
			expect(describeSubmitFailure({ status: 'rejected', message: 'Feld X fehlt' })).toBe(
				'Feld X fehlt'
			);
		});

		it('zeigt bei einem Serverfehler keinen technischen Rohtext', () => {
			const message = describeSubmitFailure({ status: 'server', httpStatus: 502 });

			expect(message).toBe('Die Sichtung konnte nicht gespeichert werden');
			expect(message).not.toMatch(/502|Unexpected token/);
		});
	});
});
