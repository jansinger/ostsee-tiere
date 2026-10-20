import { db } from '#lib/server/db/index.ts';
import { openOnly } from '#lib/server/db/approvalFilter.ts';
import { findDuplicateCandidates } from '#lib/server/db/duplicateCandidates.ts';
import { INBOX_COLUMNS } from '#lib/server/db/inboxColumns.ts';
import {
	MEDIA_UPLOAD_ANNOUNCED_MISSING,
	mediaUploadCondition
} from '#lib/server/db/mediaUploadFilter.ts';
import { openQueueOrderBy, resolveQueueOrder } from '#lib/server/db/openQueueOrder.ts';
import { findReporterHistory } from '#lib/server/db/reporterHistory.ts';
import { sightingFiles, sightings } from '#lib/server/db/schema.ts';
import { redirect } from '@sveltejs/kit';
import { and, inArray, like, sql } from 'drizzle-orm';
import { istTabellenUrl } from './tableRedirect';
import type { PageServerLoad } from './$types';

/**
 * Obergrenze der Eingangsseite. Eine Task-Liste ist kein Archiv: Wer mehr als
 * 50 offene Meldungen hat, arbeitet sie von oben ab — der Zähler nennt die
 * Gesamtzahl, nachladen ist unnötig (die Liste schrumpft beim Abarbeiten).
 */
const INBOX_LIMIT = 50;

export const load: PageServerLoad = async ({ url }) => {
	// Bookmarks der früheren Tabellen-URL (/admin?page=…) weiterleiten.
	if (istTabellenUrl(url)) {
		throw redirect(301, `/admin/sichtungen?${url.searchParams.toString()}`);
	}

	// Sortierrichtung nach Meldedatum. Default neueste zuerst (Entscheidung
	// Jan, 2026-08-08): der Altbestand ab 2013 macht FIFO als Default
	// unbrauchbar — ~650 offene Meldungen, ein Bearbeiter sähe sonst zuerst
	// 13 Jahre alte Fälle. `?order=asc` bleibt als bewusste Wahl erhalten,
	// gehalten in der URL.
	const order = resolveQueueOrder(url.searchParams.get('order'));

	// Explizite Spaltenauswahl statt `db.select()`: Begründung, Umfang und die
	// Typ-Absicherung über `InboxSighting` stehen in `inboxColumns.ts`.
	const openQuery = db
		.select(INBOX_COLUMNS)
		.from(sightings)
		.where(openOnly())
		.orderBy(...openQueueOrderBy(order))
		.limit(INBOX_LIMIT);

	const openCountQuery = db
		.select({ count: sql<number>`count(*)` })
		.from(sightings)
		.where(openOnly());

	// Nur **offene** Meldungen: Der Hinweis steht über einer Arbeitsliste und
	// benennt damit ausstehende Arbeit. Aus dem alten Tabellen-Dashboard
	// übernommen zählte er über den gesamten Bestand — auf der lokalen DB
	// nannte er vier Meldungen, von denen zwei längst freigegeben waren.
	const pendingPhotoQuery = db
		.select({ count: sql<number>`count(*)` })
		.from(sightings)
		.where(and(mediaUploadCondition(MEDIA_UPLOAD_ANNOUNCED_MISSING), openOnly()));

	// Baseline für den Hinweis auf neu eingegangene Meldungen (`/api/admin/inbox-status`
	// vergleicht dagegen). Bewusst ein eigener Query und nicht `max(id)` über
	// `open`: Jene Liste ist auf INBOX_LIMIT begrenzt und nach `order` sortiert
	// — bei `?order=asc` enthält sie die 50 ältesten offenen Meldungen, die
	// höchste ID im Bestand fehlt darin. Der Hinweis ginge dann sofort nach
	// jedem Laden an.
	const maxOpenIdQuery = db
		.select({ max: sql<number | null>`max(${sightings.id})` })
		.from(sightings)
		.where(openOnly());

	// Bild-Vorschauen für genau die gelisteten Sichtungen — ein Query, in JS
	// gruppiert. Nur Bilder: Videos brauchen einen Player, das leistet die
	// Detailansicht. Per `.then()` an die Liste gekettet statt danach awaited:
	// so überlappt der Bild-Query mit den beiden Count-Queries, statt auf sie
	// zu warten (er hängt nur von der Liste ab).
	const openWithImagesQuery = openQuery.then(async (open) => {
		const ids = open.map((s) => s.id);
		/* Duplikat-Hinweis (Spec B2): ein Zusatz-Query für alle gelisteten IDs
		   gemeinsam, parallel zur Bild-Abfrage. Beide hängen nur an der Liste; den
		   Leerfall fängt `findDuplicateCandidates` selbst ab. */
		const duplicatesPromise = findDuplicateCandidates(ids);
		/* Melder-Historie (ein Query für alle Karten, wie der Duplikat-Hinweis).
		   `approvedAt`/`rejectedAt` sind hier konstant `null` — das ist zulässig,
		   *weil* diese Liste über `openOnly()` gefiltert ist: Jede gelistete
		   Sichtung ist per Definition weder freigegeben noch abgelehnt, `null` ist
		   also der korrekte Wert und keine Verkürzung. `findReporterHistory` zieht
		   daran die eigene Zeile aus dem Topf ab, in dem sie steckt (approved/
		   rejected/open) — würde der Filter je gelockert (z. B. `openOnly()` durch
		   eine schwächere Bedingung ersetzt), müssten hier die echten Spalten
		   mitgelesen werden, sonst zöge eine bereits entschiedene Sichtung ihre
		   eigene Zeile aus dem falschen Topf ab. */
		const reporterHistoryPromise = findReporterHistory(
			open.map((s) => ({ id: s.id, email: s.email, approvedAt: null, rejectedAt: null }))
		);
		const imageRows = ids.length
			? await db
					.select({
						id: sightingFiles.id,
						sightingId: sightingFiles.sightingId,
						filePath: sightingFiles.filePath,
						originalName: sightingFiles.originalName
					})
					.from(sightingFiles)
					.where(
						and(inArray(sightingFiles.sightingId, ids), like(sightingFiles.mimeType, 'image/%'))
					)
			: [];
		return {
			open,
			imageRows,
			duplicatesBySighting: await duplicatesPromise,
			reporterHistoryBySighting: await reporterHistoryPromise
		};
	});

	const [
		{ open, imageRows, duplicatesBySighting, reporterHistoryBySighting },
		openCountResult,
		pendingPhotoResult,
		maxOpenIdResult
	] = await Promise.all([openWithImagesQuery, openCountQuery, pendingPhotoQuery, maxOpenIdQuery]);

	const imagesBySighting: Record<number, { id: number; filePath: string; originalName: string }[]> =
		{};
	for (const row of imageRows) {
		if (row.sightingId == null) continue;
		(imagesBySighting[row.sightingId] ??= []).push({
			id: row.id,
			filePath: row.filePath,
			originalName: row.originalName
		});
	}

	// `count(*)` ist bigint und kommt je nach PG-Treiber als String zurück. Der
	// Loader-Vertrag sagt `number`, also wird hier normalisiert und nicht in
	// jeder Aufrufstelle einzeln: `>` verglich sonst lexikografisch ("9" > "50")
	// und `=== 1` traf nie.
	return {
		open,
		openTotal: Number(openCountResult[0]?.count ?? 0),
		order,
		imagesBySighting,
		pendingPhotoAnnouncements: Number(pendingPhotoResult[0]?.count ?? 0),
		maxOpenId: Number(maxOpenIdResult[0]?.max ?? 0),
		duplicatesBySighting,
		reporterHistoryBySighting
	};
};
