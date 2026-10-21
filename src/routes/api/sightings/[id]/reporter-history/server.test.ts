/**
 * @fileoverview Melder-Historie einer Sichtung (Admin).
 *
 * `history: null` ist der Punkt, um den es hier geht: Es heißt „nicht
 * ermittelbar" und nicht „keine Vorgeschichte". Die Oberfläche zeigt dafür kein
 * Badge — dieselbe Unterscheidung wie bei `spam_score IS NULL`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './+server';

const requireUserRole = vi.fn();
const findReporterHistory = vi.fn();
const limit = vi.fn();

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: (...args: unknown[]) => requireUserRole(...args)
}));

vi.mock('#lib/server/db/reporterHistory.ts', () => ({
	findReporterHistory: (...args: unknown[]) => findReporterHistory(...args)
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ limit }) }) }) }
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }))
}));

function aufruf(id: string) {
	return GET({
		params: { id },
		locals: { user: { roles: ['admin'] } },
		url: new URL(`https://example.org/api/sightings/${id}/reporter-history`)
	} as never);
}

describe('GET /api/sightings/[id]/reporter-history', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		limit.mockResolvedValue([
			{ id: 42, email: 'melder@example.org', approvedAt: null, rejectedAt: null }
		]);
		findReporterHistory.mockResolvedValue({
			42: { approved: 12, rejected: 0, open: 1, since: '2019-03-04T08:00:00Z' }
		});
	});

	it('verlangt eine Admin-Rolle', async () => {
		await aufruf('42');
		expect(requireUserRole).toHaveBeenCalledWith(expect.anything(), expect.anything(), [
			'admin',
			'superadmin'
		]);
	});

	it('liefert die Historie der Sichtung', async () => {
		const response = await aufruf('42');

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			history: { approved: 12, rejected: 0, open: 1, since: '2019-03-04T08:00:00Z' }
		});
	});

	it('weist eine unbrauchbare ID mit 400 ab', async () => {
		await expect(aufruf('abc')).rejects.toMatchObject({ status: 400 });
	});

	it('meldet eine unbekannte Sichtung mit 404', async () => {
		limit.mockResolvedValue([]);
		await expect(aufruf('999')).rejects.toMatchObject({ status: 404 });
	});

	/* Fail-open des Aggregats: `findReporterHistory` liefert dann `{}`. Die
	   Antwort muss `null` sein und nicht ein Nullaggregat — sonst behauptete sie
	   „keine Vorgeschichte", wo nichts ermittelt wurde. */
	it('antwortet mit null, wenn nichts ermittelt werden konnte', async () => {
		findReporterHistory.mockResolvedValue({});

		const response = await aufruf('42');

		await expect(response.json()).resolves.toEqual({ history: null });
	});

	/* Die Gegenprobe zum Test oben: Ein **echtes** Nullaggregat — ein Melder mit
	   Adresse, aber ohne weitere Meldungen — muss als Objekt durchgereicht
	   werden und nicht mit dem Fail-open-Fall zu `null` kollabieren. Das ist die
	   Testseite der zentralen Aussage des Endpunkts (`byId[row.id] ?? null`). */
	it('unterscheidet ein echtes Nullaggregat von nicht ermittelt', async () => {
		findReporterHistory.mockResolvedValue({
			42: { approved: 0, rejected: 0, open: 0, since: '2026-08-10T08:00:00Z' }
		});

		const response = await aufruf('42');

		await expect(response.json()).resolves.toEqual({
			history: { approved: 0, rejected: 0, open: 0, since: '2026-08-10T08:00:00Z' }
		});
	});
});
