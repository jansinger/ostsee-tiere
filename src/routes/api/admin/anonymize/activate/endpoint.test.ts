/**
 * `POST /api/admin/anonymize/activate` — die einmalige Freischaltung.
 *
 * Der erste Lauf leert die Kontaktdaten des ganzen Bestands und ist nicht
 * umkehrbar. Deshalb: nur Superadmin, nur per Session, bestätigt durch die
 * Eingabe der aktuellen Anzahl fälliger Meldungen, und erst, wenn die
 * Vorbedingungen erfüllt sind (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md,
 * „Freigabe des ersten Laufs", Schritte 1 und 5).
 */
import { error, isHttpError } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	anonymizeSightings,
	activateAnonymization,
	getAnonymizationStatus,
	logAuditEvent,
	requireUserRole
} = vi.hoisted(() => ({
	anonymizeSightings: vi.fn(),
	activateAnonymization: vi.fn(),
	getAnonymizationStatus: vi.fn(),
	logAuditEvent: vi.fn(),
	requireUserRole: vi.fn()
}));

vi.mock('#lib/server/privacy/anonymizeSightings.ts', () => ({ anonymizeSightings }));
vi.mock('#lib/server/privacy/anonymizationQueries.ts', () => ({
	createAnonymizationPorts: () => ({})
}));
vi.mock('#lib/server/privacy/anonymizationState.ts', () => ({ activateAnonymization }));
vi.mock('#lib/server/privacy/anonymizationStatus.ts', () => ({ getAnonymizationStatus }));
vi.mock('#lib/server/audit/auditService.ts', () => ({ logAuditEvent }));
vi.mock('#lib/server/auth/auth.ts', () => ({ requireUserRole }));

import { POST } from './+server';

const SUPERADMIN = { sub: 'auth0|chef', email: 'chef@example.invalid', roles: ['superadmin'] };

function event(body: unknown) {
	return {
		request: new Request('https://x/api/admin/anonymize/activate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		url: new URL('https://x/api/admin/anonymize/activate'),
		locals: { user: SUPERADMIN },
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('POST /api/admin/anonymize/activate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		anonymizeSightings.mockResolvedValue({
			keyConfigured: true,
			activatedAt: null,
			due: 19873,
			pendingHashes: 0
		});
		getAnonymizationStatus.mockResolvedValue({ unscoredSpam: 0 });
		activateAnonymization.mockResolvedValue({ activated: true });
	});

	it('verlangt die Rolle superadmin', async () => {
		requireUserRole.mockImplementationOnce(() => {
			throw error(403, 'Forbidden');
		});

		const thrown = await Promise.resolve()
			.then(() => POST(event({ confirmedDue: 19873 })))
			.catch((e: unknown) => e);

		expect(isHttpError(thrown) && thrown.status).toBe(403);
		expect(requireUserRole).toHaveBeenCalledWith(expect.any(URL), SUPERADMIN, ['superadmin']);
		expect(activateAnonymization).not.toHaveBeenCalled();
	});

	it('schaltet frei, wenn die bestätigte Anzahl der aktuellen entspricht', async () => {
		const response = await POST(event({ confirmedDue: 19873 }));

		expect(response.status).toBe(200);
		expect(activateAnonymization).toHaveBeenCalledWith(
			expect.objectContaining({ by: SUPERADMIN.email, confirmedDue: 19873 })
		);
		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'privacy.anonymize_activate',
				details: { confirmedDue: 19873, due: 19873 }
			})
		);
	});

	it('weist eine abweichende Anzahl ab und nennt die aktuelle', async () => {
		// Weicht die Zahl von der ab, die das Museum freigegeben hat, ist das der
		// Moment anzuhalten.
		const response = await POST(event({ confirmedDue: 19000 }));
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body).toMatchObject({ code: 'COUNT_MISMATCH', due: 19873 });
		expect(activateAnonymization).not.toHaveBeenCalled();
	});

	it('weist eine fehlende oder unlesbare Anzahl mit 400 ab', async () => {
		for (const body of [{}, { confirmedDue: 'viele' }, { confirmedDue: -1 }]) {
			const response = await POST(event(body));
			expect(response.status).toBe(400);
		}
		expect(activateAnonymization).not.toHaveBeenCalled();
	});

	it('schaltet ohne Schlüssel nicht frei', async () => {
		anonymizeSightings.mockResolvedValue({ keyConfigured: false, activatedAt: null, due: 5 });

		const response = await POST(event({ confirmedDue: 5 }));

		expect(response.status).toBe(503);
		expect(activateAnonymization).not.toHaveBeenCalled();
	});

	it('schaltet nicht frei, solange die Spam-Nachbewertung offen ist', async () => {
		getAnonymizationStatus.mockResolvedValue({ unscoredSpam: 12 });

		const response = await POST(event({ confirmedDue: 19873 }));
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body).toMatchObject({ code: 'SPAM_RESCORE_PENDING', unscoredSpam: 12 });
		expect(activateAnonymization).not.toHaveBeenCalled();
	});

	it('schaltet nicht frei, solange Adressen ohne Kennzeichen sind', async () => {
		anonymizeSightings.mockResolvedValue({
			keyConfigured: true,
			activatedAt: null,
			due: 19873,
			pendingHashes: 7
		});

		const response = await POST(event({ confirmedDue: 19873 }));

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: 'HASH_BACKFILL_PENDING',
			pendingHashes: 7
		});
		expect(activateAnonymization).not.toHaveBeenCalled();
	});

	it('meldet eine bestehende Freischaltung, statt sie zu überschreiben', async () => {
		anonymizeSightings.mockResolvedValue({
			keyConfigured: true,
			activatedAt: '2026-11-01T10:00:00.000Z',
			due: 0
		});

		const response = await POST(event({ confirmedDue: 0 }));

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ code: 'ALREADY_ACTIVATED' });
		expect(activateAnonymization).not.toHaveBeenCalled();
	});

	it('meldet einen parallel gewonnenen Wettlauf ebenfalls als bereits freigeschaltet', async () => {
		activateAnonymization.mockResolvedValue({ activated: false });

		const response = await POST(event({ confirmedDue: 19873 }));

		expect(response.status).toBe(409);
		expect(logAuditEvent).not.toHaveBeenCalled();
	});
});
