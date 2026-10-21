/**
 * Der Eingangs-Status wird vom Poller der Seite `/admin` minütlich abgefragt.
 * Festgeschrieben ist hier vor allem der **Fehlerweg**: Bei fehlender
 * Admin-Session muss echte 401 kommen und ausdrücklich keine Weiterleitung.
 * `requireUserRole` wirft `redirect(302)`; `fetch` folgte der und meldete dem
 * Poller mit Login-HTML einen Erfolg — derselbe Grund, aus dem
 * `/api/admin/spam-rescore` auf `isAdminUser` setzt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({ db: { select: selectMock } }));

import { GET } from './+server';

const ADMIN = { sub: 'u1', email: 'admin@example.com', roles: ['admin'] };

function event(user?: unknown) {
	const headers: Record<string, string> = {};
	return {
		locals: { user },
		setHeaders: (neu: Record<string, string>) => Object.assign(headers, neu),
		_headers: headers
	} as never;
}

/** Ein `db.select(...).from(...).where(...)`, das `rows` liefert. */
function dbLiefert(rows: unknown[]): void {
	const builder = {
		from: () => builder,
		where: () => Promise.resolve(rows)
	};
	selectMock.mockReturnValue(builder);
}

describe('GET /api/admin/inbox-status', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbLiefert([{ max: 20431 }]);
	});

	it('weist Aufrufe ohne Session mit 401 ab und leitet nicht weiter', async () => {
		const response = await GET(event());

		expect(response.status).toBe(401);
		expect(response.headers.get('location')).toBeNull();
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('weist einen Nutzer ohne Admin-Rolle mit 401 ab', async () => {
		const response = await GET(event({ sub: 'u2', roles: ['user'] }));

		expect(response.status).toBe(401);
		expect(selectMock).not.toHaveBeenCalled();
	});

	it('liefert der Admin-Session die höchste offene ID', async () => {
		const response = await GET(event(ADMIN));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ maxOpenId: 20431 });
	});

	it('meldet 0, wenn keine Sichtung offen ist', async () => {
		// max() über eine leere Menge ist NULL, nicht 0.
		dbLiefert([{ max: null }]);

		const response = await GET(event(ADMIN));

		expect(await response.json()).toEqual({ maxOpenId: 0 });
	});

	it('setzt Cache-Control: private, no-store — ohne Last-Modified/ETag cachte ein Proxy sonst den Poll-Stand', async () => {
		// Fehlermodus ohne den Header: der Banner erscheint nie, still — genau wie
		// bei /api/map/sightings (Muster dort übernommen).
		const ev = event(ADMIN);

		await GET(ev);

		expect((ev as unknown as { _headers: Record<string, string> })._headers['Cache-Control']).toBe(
			'private, no-store'
		);
	});
});
