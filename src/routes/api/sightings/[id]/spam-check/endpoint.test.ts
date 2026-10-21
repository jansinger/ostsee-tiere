import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSighting = {
	id: 123,
	latitude: '54.5',
	longitude: '12.0',
	sightingDate: new Date('2024-01-15'),
	species: 0,
	totalCount: 1,
	firstName: 'Max',
	lastName: 'Muster',
	email: 'max@example.com',
	juvenileCount: 0,
	waterway: null,
	seaMark: null,
	notes: null,
	isDead: null,
	distribution: 0,
	spamScore: 2,
	spamIndicators: ['Formular verdächtig schnell abgeschickt']
};

// Mutable so individual tests can override the result
let mockDbResult: unknown[] = [mockSighting];

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: () => Promise.resolve(mockDbResult)
				})
			})
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightings: { id: 'id' }
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a, b) => ({ a, b }))
}));

vi.mock('#lib/logger.server.ts', () => ({
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

vi.mock('#lib/server/spam/spamDetector.ts', () => ({
	detectSpamIndicators: vi.fn().mockResolvedValue({
		score: 0,
		isHighRisk: false,
		indicators: []
	})
}));

import { GET } from './+server';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { detectSpamIndicators } from '#lib/server/spam/spamDetector.ts';

const mockRequireUserRole = vi.mocked(requireUserRole);
const mockDetectSpamIndicators = vi.mocked(detectSpamIndicators);

const createEvent = (
	id: string,
	user: { email: string; roles: string[] } | null = { email: 'admin@test.com', roles: ['admin'] }
) =>
	({
		params: { id },
		locals: { user },
		url: new URL(`https://localhost/api/sightings/${id}/spam-check`)
	}) as Parameters<typeof GET>[0];

describe('GET /api/sightings/[id]/spam-check', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDbResult = [mockSighting];
		mockDetectSpamIndicators.mockResolvedValue({
			score: 0,
			isHighRisk: false,
			indicators: []
		});
	});

	it('gibt 400 zurück bei ungültiger ID', async () => {
		try {
			await GET(createEvent('abc'));
			expect.fail('Sollte einen Fehler werfen');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('gibt 400 zurück bei fehlender ID', async () => {
		try {
			await GET(createEvent(''));
			expect.fail('Sollte einen Fehler werfen');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(400);
		}
	});

	it('stellt den persistierten Befund der Neuberechnung gegenüber', async () => {
		// Der Kern des Endpunkts: Die Neuberechnung kennt die Signale des
		// Meldezeitpunkts nicht (Formular-Token, Absendedauer, Duplikate) und
		// kommt deshalb regelmäßig tiefer heraus als der gespeicherte Score.
		// Nur die Neuberechnung auszuliefern hieß, den Erstbefund der Tabelle zu
		// widersprechen, ohne den Unterschied benennen zu können.
		mockDetectSpamIndicators.mockResolvedValue({ score: 0, isHighRisk: false, indicators: [] });

		const response = await GET(createEvent('123'));
		expect(response.status).toBe(200);
		const body = await response.json();

		expect(body.stored).toEqual({
			score: 2,
			indicators: ['Formular verdächtig schnell abgeschickt']
		});
		expect(body.recomputed).toMatchObject({ score: 0, isHighRisk: false, indicators: [] });
	});

	it('liefert `stored: null` für nie bewerteten Altbestand', async () => {
		// NULL ist nicht 0 (`docs/SPAM_DETECTION.md`). Ein `{ score: 0 }` hier
		// läse sich als „damals geprüft, sauber" — das Gegenteil der Aussage.
		mockDbResult = [{ ...mockSighting, spamScore: null, spamIndicators: null }];
		const body = await (await GET(createEvent('123'))).json();
		expect(body.stored).toBeNull();
	});

	it('lässt einen unbrauchbaren `spam_indicators`-Wert nicht durchschlagen', async () => {
		// Die Spalte ist untypisiertes `jsonb`. Ein Nicht-Array dort darf den
		// Befund nicht mitreißen — der Score ist auch ohne Indikatorliste gültig.
		mockDbResult = [{ ...mockSighting, spamScore: 3, spamIndicators: { kaputt: true } }];
		const body = await (await GET(createEvent('123'))).json();
		expect(body.stored).toEqual({ score: 3, indicators: [] });
	});

	it('liefert nur Strings als Indikatoren aus', async () => {
		/* `Array.isArray` prüft den Container, nicht die Elemente. Ein Array mit
		   Zahlen oder Objekten kam vorher unverändert durch und verletzte damit
		   die Zusage des eigenen Schemas (`items: { type: string }`) — der
		   `as string[]` dahinter war eine Behauptung, die niemand prüft. */
		mockDbResult = [
			{ ...mockSighting, spamScore: 3, spamIndicators: ['echt', 42, null, { text: 'x' }] }
		];
		const body = await (await GET(createEvent('123'))).json();
		expect(body.stored).toEqual({ score: 3, indicators: ['echt'] });
	});

	it('setzt Cache-Control: no-store Header', async () => {
		const response = await GET(createEvent('123'));
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('gibt 404 zurück wenn Sichtung nicht gefunden', async () => {
		mockDbResult = [];
		try {
			await GET(createEvent('999'));
			expect.fail('Sollte einen Fehler werfen');
		} catch (e: unknown) {
			expect((e as { status: number }).status).toBe(404);
		}
	});

	it('übergibt geparste Koordinaten wenn vorhanden', async () => {
		await GET(createEvent('123'));
		const callArg = mockDetectSpamIndicators.mock.calls[0]?.[0];
		expect(callArg?.latitude).toBe(54.5);
		expect(callArg?.longitude).toBe(12.0);
	});

	it('übergibt null für fehlende Koordinaten statt 0', async () => {
		mockDbResult = [{ ...mockSighting, latitude: null, longitude: null }];
		await GET(createEvent('123'));
		const callArg = mockDetectSpamIndicators.mock.calls[0]?.[0];
		expect(callArg?.latitude).toBeNull();
		expect(callArg?.longitude).toBeNull();
	});

	it('ruft requireUserRole mit admin/superadmin auf', async () => {
		await GET(createEvent('123'));
		expect(mockRequireUserRole).toHaveBeenCalledWith(expect.anything(), expect.anything(), [
			'admin',
			'superadmin'
		]);
	});
});
