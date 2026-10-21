/**
 * @fileoverview Zustand des Admin-Eingangs für den Hinweis auf neue Meldungen.
 *
 * Die Seite `/admin` merkt sich beim Laden `maxOpenId` und fragt hier minütlich
 * nach, ob es inzwischen eine höhere gibt. Bewusst **nur** diese eine Zahl:
 * weder Anzahl noch Liste, weil beides an der Handlung nichts ändert und je
 * einen weiteren Query kostete.
 *
 * Zugang über `isAdminUser` und nicht über `requireUserRole`: Letzteres wirft
 * `redirect(302)` auf die Anmeldeseite. Ein `fetch` folgt der Weiterleitung,
 * erhält Login-HTML mit Status 200 und hielte das für eine gültige Antwort —
 * der Poller merkte vom Sitzungsende nichts. Dieselbe Begründung wie bei
 * `/api/admin/spam-rescore` und `/api/admin/cleanup-orphans`.
 */
import { isAdminUser } from '#lib/server/auth/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { openOnly } from '#lib/server/db/approvalFilter.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	// Jede Antwort hängt vom Session-Cookie ab (401 ohne Admin-Anmeldung, sonst der
	// aktuelle Eingangsstand); ohne den Header könnte ein zwischengeschalteter Cache
	// einen einmal gesehenen Stand festhalten. Der Fehlermodus wäre ein Banner, das
	// nie erscheint — Muster übernommen aus /api/map/sightings/+server.ts.
	setHeaders({ 'Cache-Control': 'private, no-store' });

	if (!isAdminUser(locals.user)) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const rows = await db
		.select({ max: sql<number | null>`max(${sightings.id})` })
		.from(sightings)
		.where(openOnly());

	// `max()` über eine leere Menge ist NULL; je nach Treiber kommt die Zahl
	// zudem als String. Beides hier normalisieren statt beim Aufrufer.
	return json({ maxOpenId: Number(rows[0]?.max ?? 0) });
};
