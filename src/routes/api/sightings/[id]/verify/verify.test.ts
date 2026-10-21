import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH, GET } from './+server';

const { mockWhere, mockSet, mockUpdate, mockLimit, mockOrderBy, mockLogValues, mockLogInsert } =
	vi.hoisted(() => {
		const mockWhere = vi.fn().mockResolvedValue(undefined);
		const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
		const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
		const mockLimit = vi
			.fn()
			.mockResolvedValue([{ id: 1, verified: 0, approvedAt: null, rejectedAt: null }]);
		// Historien-Abfrage des GET: select().from().where().orderBy()
		const mockOrderBy = vi.fn().mockResolvedValue([]);
		// Historien-Eintrag des PATCH: tx.insert().values()
		const mockLogValues = vi.fn().mockResolvedValue(undefined);
		const mockLogInsert = vi.fn().mockReturnValue({ values: mockLogValues });
		return { mockWhere, mockSet, mockUpdate, mockLimit, mockOrderBy, mockLogValues, mockLogInsert };
	});

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn()
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: mockLimit,
					orderBy: mockOrderBy
				})
			})
		}),
		update: mockUpdate,
		// Statusspalten und Historien-Eintrag gehören in eine Transaktion — der
		// Mock reicht dieselben Doubles durch, damit die bestehenden
		// Update-Erwartungen unverändert gelten.
		transaction: vi.fn((callback: (tx: unknown) => unknown) =>
			callback({ update: mockUpdate, insert: mockLogInsert })
		)
	}
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightings: {
		id: 'id',
		verified: 'verified',
		approvedAt: 'approvedAt',
		approvedBy: 'approvedBy',
		rejectedAt: 'rejectedAt',
		rejectedBy: 'rejectedBy'
	},
	sightingStatusLog: {
		id: 'id',
		sightingId: 'sightingId',
		verdict: 'verdict',
		editor: 'editor',
		recordedAt: 'recordedAt'
	}
}));

// `#lib/server/db/approvalFilter.js` wird bewusst NICHT gemockt: Ein nachgebautes
// `!!s.approvedAt` wäre genau das Inline-Prädikat, das
// `approvalPredicateScan.test.ts` im gesamten Quelltext verbietet — und ein
// abweichender Nachbau in der Testhilfe erzeugt die Divergenz, gegen die die
// Regel existiert. Das echte Modul ist rein und baut sein SQL erst beim Aufruf,
// deshalb genügt der Schema-Mock oben.

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a, b) => ({ a, b })),
	// Sortierung der Historie im GET
	asc: vi.fn((a) => ({ asc: a })),
	// von approvalFilter importiert; im Endpunkt-Test nie aufgerufen
	and: vi.fn((...args) => ({ and: args })),
	isNull: vi.fn((a) => ({ isNull: a })),
	isNotNull: vi.fn((a) => ({ isNotNull: a }))
}));

const createMockEvent = (
	id: string,
	body: Record<string, unknown>,
	options?: { userEmail?: string; ip?: string }
) => ({
	params: { id },
	locals: {
		user: { email: options?.userEmail ?? 'admin@test.com', roles: ['admin'] }
	},
	url: new URL(`http://localhost/api/sightings/${id}/verify`),
	getClientAddress: () => options?.ip ?? '127.0.0.1',
	request: {
		json: () => Promise.resolve(body),
		headers: {
			get: (name: string) => {
				if (name === 'x-forwarded-for' && options?.ip) return options.ip;
				return null;
			}
		}
	} as unknown as Request
});

describe('/api/sightings/[id]/verify PATCH endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWhere.mockResolvedValue(undefined);
		mockSet.mockReturnValue({ where: mockWhere });
		mockUpdate.mockReturnValue({ set: mockSet });
		mockLimit.mockResolvedValue([{ id: 1, verified: 0, approvedAt: null, rejectedAt: null }]);
	});

	it('gibt erfolgreiche Antwort zurück bei verified=1', async () => {
		const event = createMockEvent('1', { verified: 1 });
		const response = await PATCH(event as Parameters<typeof PATCH>[0]);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.verified).toBe(1);
	});

	it('gibt erfolgreiche Antwort zurück bei verified=0', async () => {
		const event = createMockEvent('1', { verified: 0 });
		const response = await PATCH(event as Parameters<typeof PATCH>[0]);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.success).toBe(true);
		expect(body.verified).toBe(0);
	});

	it('lehnt ungültigen verified-Wert ab', async () => {
		const event = createMockEvent('1', { verified: 2 });
		try {
			await PATCH(event as Parameters<typeof PATCH>[0]);
			expect.fail('Sollte einen Fehler werfen');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('wirft 404 wenn Sichtung nicht existiert', async () => {
		mockLimit.mockResolvedValueOnce([]);
		const event = createMockEvent('99', { verified: 1 });

		try {
			await PATCH(event as Parameters<typeof PATCH>[0]);
			expect.fail('Sollte 404 werfen');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(404);
		}
	});

	it('ruft logAuditEvent mit action sighting.verify und resourceType sighting auf', async () => {
		const { logAuditEvent } = await import('#lib/server/audit/auditService.ts');
		const event = createMockEvent('42', { verified: 1 });

		await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(logAuditEvent).toHaveBeenCalledOnce();
		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'sighting.verify',
				resourceType: 'sighting',
				resourceId: '42'
			})
		);
	});

	it('übergibt userEmail an logAuditEvent wenn vorhanden', async () => {
		const { logAuditEvent } = await import('#lib/server/audit/auditService.ts');
		const event = createMockEvent('5', { verified: 1 }, { userEmail: 'pruefer@test.com' });

		await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				userEmail: 'pruefer@test.com'
			})
		);
	});

	it('übergibt ipAddress an logAuditEvent wenn x-forwarded-for vorhanden', async () => {
		const { logAuditEvent } = await import('#lib/server/audit/auditService.ts');
		const event = createMockEvent('7', { verified: 0 }, { ip: '10.0.0.1' });

		await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				ipAddress: '10.0.0.1'
			})
		);
	});

	it('übergibt verified-Wert in details an logAuditEvent', async () => {
		const { logAuditEvent } = await import('#lib/server/audit/auditService.ts');
		const event = createMockEvent('3', { verified: 1 });

		await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				details: expect.objectContaining({ verified: 1 })
			})
		);
	});
});

describe('PATCH mit verdict', () => {
	const patchEvent = (id: string, body: Record<string, unknown>) =>
		createMockEvent(id, body, { userEmail: 'admin@example.com' }) as Parameters<typeof PATCH>[0];

	beforeEach(() => {
		vi.clearAllMocks();
		mockWhere.mockResolvedValue(undefined);
		mockSet.mockReturnValue({ where: mockWhere });
		mockUpdate.mockReturnValue({ set: mockSet });
		mockLimit.mockResolvedValue([{ id: 1, verified: 0, approvedAt: null, rejectedAt: null }]);
	});

	it('approve markiert die Sichtung als geprüft, setzt freigegeben_am/_von und löscht die Ablehnung', async () => {
		await PATCH(patchEvent('1', { verdict: 'approve' }));
		expect(mockSet).toHaveBeenCalledWith({
			verified: 1,
			approvedAt: expect.any(Date),
			approvedBy: 'admin@example.com',
			rejectedAt: null,
			rejectedBy: null
		});
	});

	// Symmetrie zur Ablehnung: Ohne angemeldete Identität bleibt die Spalte
	// NULL statt einen Platzhalter zu behaupten — genau wie beim Altbestand.
	it('approve ohne Benutzer-E-Mail lässt freigegeben_von auf null', async () => {
		const event = createMockEvent('1', { verdict: 'approve' });
		event.locals.user = { email: undefined as unknown as string, roles: ['admin'] };
		await PATCH(event as Parameters<typeof PATCH>[0]);
		expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ approvedBy: null }));
	});

	it('reject setzt abgelehnt_am/_von und zieht die Freigabe zurück', async () => {
		await PATCH(patchEvent('1', { verdict: 'reject' }));
		expect(mockSet).toHaveBeenCalledWith({
			verified: 0,
			approvedAt: null,
			approvedBy: null,
			rejectedAt: expect.any(Date),
			rejectedBy: 'admin@example.com'
		});
	});

	it('reset nullt alle Status-Spalten inklusive beider _von-Spalten', async () => {
		await PATCH(patchEvent('1', { verdict: 'reset' }));
		expect(mockSet).toHaveBeenCalledWith({
			verified: 0,
			approvedAt: null,
			approvedBy: null,
			rejectedAt: null,
			rejectedBy: null
		});
	});

	it('unbekanntes verdict → 400', async () => {
		await expect(PATCH(patchEvent('1', { verdict: 'maybe' }))).rejects.toMatchObject({
			status: 400
		});
	});

	it('Alias-Body: verified=1 wirkt wie approve, verified=0 wie reset', async () => {
		await PATCH(patchEvent('1', { verified: 1 }));
		expect(mockSet).toHaveBeenLastCalledWith(
			expect.objectContaining({ verified: 1, rejectedAt: null })
		);
		await PATCH(patchEvent('1', { verified: 0 }));
		expect(mockSet).toHaveBeenLastCalledWith(
			expect.objectContaining({ verified: 0, approvedAt: null, rejectedAt: null })
		);
	});

	it('meldet verdict und rejectedAt in der Response zurück', async () => {
		const response = await PATCH(patchEvent('1', { verdict: 'reject' }));
		const body = await response.json();

		expect(body.verdict).toBe('reject');
		expect(body.verified).toBe(0);
		expect(body.approvedAt).toBeNull();
		expect(body.rejectedAt).toEqual(expect.any(String));
	});

	it('hält den Vorzustand previouslyRejected im Audit fest', async () => {
		const { logAuditEvent } = await import('#lib/server/audit/auditService.ts');
		mockLimit.mockResolvedValueOnce([
			{ id: 1, verified: 0, approvedAt: null, rejectedAt: new Date('2026-01-01') }
		]);

		await PATCH(patchEvent('1', { verdict: 'approve' }));

		expect(logAuditEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				details: expect.objectContaining({ verdict: 'approve', previouslyRejected: true })
			})
		);
	});
});

describe('/api/sightings/[id]/verify GET endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLimit.mockResolvedValue([{ id: 1, verified: 1, approvedAt: null, rejectedAt: null }]);
	});

	it('gibt Verifizierungsstatus zurück', async () => {
		const event = createMockEvent('1', {});
		const response = await GET(event as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.id).toBe(1);
		expect(body.verified).toBe(1);
	});

	it('gibt rejectedAt mit zurück', async () => {
		mockLimit.mockResolvedValueOnce([
			{ id: 1, verified: 0, approvedAt: null, rejectedAt: new Date('2026-01-01T00:00:00.000Z') }
		]);
		const event = createMockEvent('1', {});
		const response = await GET(event as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(body.rejectedAt).toBe('2026-01-01T00:00:00.000Z');
	});

	it('wirft 404 wenn Sichtung nicht existiert', async () => {
		mockLimit.mockResolvedValueOnce([]);
		const event = createMockEvent('99', {});

		try {
			await GET(event as Parameters<typeof GET>[0]);
			expect.fail('Sollte 404 werfen');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(404);
		}
	});
});

/**
 * Status-Historie (Spec B3).
 *
 * Der Verify-Endpunkt ist laut `.claude/rules/api.md` der einzige Schreibweg
 * für Statusänderungen — die Historie hängt deshalb hier und nirgends sonst.
 * Geprüft wird beides: dass jeder Verdict genau einen Eintrag erzeugt, und
 * dass Spaltenschreibung und Eintrag in **einer** Transaktion laufen. Ohne die
 * Transaktion könnte die Historie eine Änderung verschweigen, die stattgefunden
 * hat — und eine lückenhafte Historie ist schlimmer als keine, weil sie so
 * aussieht, als wäre sie vollständig.
 */
describe('PATCH schreibt die Status-Historie', () => {
	const patchEvent = (id: string, body: Record<string, unknown>, userEmail?: string) =>
		createMockEvent(id, body, userEmail ? { userEmail } : undefined) as Parameters<typeof PATCH>[0];

	beforeEach(() => {
		vi.clearAllMocks();
		mockWhere.mockResolvedValue(undefined);
		mockSet.mockReturnValue({ where: mockWhere });
		mockUpdate.mockReturnValue({ set: mockSet });
		mockLogInsert.mockReturnValue({ values: mockLogValues });
		mockLogValues.mockResolvedValue(undefined);
		mockLimit.mockResolvedValue([{ id: 1, verified: 0, approvedAt: null, rejectedAt: null }]);
	});

	it.each([
		['approve', { verdict: 'approve' }],
		['reject', { verdict: 'reject' }],
		['reset', { verdict: 'reset' }]
	])('legt für %s genau einen Eintrag an', async (verdict, body) => {
		await PATCH(patchEvent('42', body, 'pruefer@example.com'));

		expect(mockLogValues).toHaveBeenCalledOnce();
		expect(mockLogValues).toHaveBeenCalledWith(
			expect.objectContaining({
				sightingId: 42,
				verdict,
				editor: 'pruefer@example.com'
			})
		);
	});

	it('hält den Alias { verified: 1 } als approve fest', async () => {
		await PATCH(patchEvent('7', { verified: 1 }));

		expect(mockLogValues).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'approve' }));
	});

	it('schreibt Spalten und Historie in derselben Transaktion', async () => {
		const { db } = await import('#lib/server/db/index.ts');
		await PATCH(patchEvent('1', { verdict: 'approve' }));

		expect(db.transaction).toHaveBeenCalledOnce();
		expect(mockSet).toHaveBeenCalledOnce();
		expect(mockLogValues).toHaveBeenCalledOnce();
	});

	it('speichert ohne angemeldete Identität kein Bearbeiter-Kennzeichen', async () => {
		// Kein Platzhalter, sondern NULL — dieselbe Regel wie bei
		// `freigegeben_von`/`abgelehnt_von`: ein erfundener Name behauptete eine
		// Person, die es nie gab.
		const event = createMockEvent('1', { verdict: 'reject' });
		(event.locals as { user?: unknown }).user = undefined;

		await PATCH(event as Parameters<typeof PATCH>[0]);

		expect(mockLogValues).toHaveBeenCalledWith(expect.objectContaining({ editor: null }));
	});
});

describe('GET liefert die Status-Historie', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLimit.mockResolvedValue([{ id: 1, verified: 1, approvedAt: new Date(), rejectedAt: null }]);
		mockOrderBy.mockResolvedValue([]);
	});

	it('gibt die Einträge aufsteigend nach Zeitpunkt zurück', async () => {
		const erster = new Date('2026-08-01T10:00:00Z');
		const zweiter = new Date('2026-08-02T10:00:00Z');
		mockOrderBy.mockResolvedValueOnce([
			{ id: 1, verdict: 'reject', editor: 'a@example.com', recordedAt: erster },
			{ id: 2, verdict: 'approve', editor: 'b@example.com', recordedAt: zweiter }
		]);

		const event = createMockEvent('1', {});
		const response = await GET(event as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(body.history).toHaveLength(2);
		expect(body.history[0]).toMatchObject({ verdict: 'reject', editor: 'a@example.com' });
		expect(body.history[1]).toMatchObject({ verdict: 'approve', editor: 'b@example.com' });
	});

	it('gibt für den Altbestand eine leere Historie zurück, keinen Fehler', async () => {
		const event = createMockEvent('1', {});
		const response = await GET(event as Parameters<typeof GET>[0]);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.history).toEqual([]);
	});
});
