import { db } from '#lib/server/db/index.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { berlinCalendarDate } from '#lib/server/db/sqlTimeZone.ts';
import { mediaUploadCondition } from '#lib/server/db/mediaUploadFilter.ts';
import { balticSeaCondition } from '#lib/server/db/balticSeaFilter.ts';
import { deadFindingCondition } from '#lib/server/db/deadFindingFilter.ts';
import { searchCondition, normalizeSearchTerm } from '#lib/server/db/sightingSearchFilter.ts';
import { approvedOnly, openOnly, rejectedOnly } from '#lib/server/db/approvalFilter.ts';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { ServerConfigService } from '#lib/services/configService.ts';
import { isValidDateParam } from './dateParam';
import { SIGHTING_LIST_COLUMNS } from './listColumns';
import { resolveSort, type SortColumn } from './sortParams';
import { statusCondition } from './statusFilter';
import type { StatusCounts } from './statusTabs';

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const paginationConfig = await ServerConfigService.getPaginationConfig();
	const requestedPerPage = Math.max(
		1,
		Number(url.searchParams.get('perPage')) || paginationConfig.defaultPageSize
	);
	// Enforce the maximum configured per page limit
	const perPage = Math.min(requestedPerPage, paginationConfig.maxSightingsPerPage);
	const { column: sortBy, order: sortOrder } = resolveSort(url.searchParams);
	const fromDate = url.searchParams.get('fromDate');
	const toDate = url.searchParams.get('toDate');
	const verified = url.searchParams.get('verified');
	const entryChannel = url.searchParams.get('entryChannel');
	const mediaUpload = url.searchParams.get('mediaUpload');
	const balticSea = url.searchParams.get('balticSea');
	const deadFinding = url.searchParams.get('deadFinding');
	const q = url.searchParams.get('q');

	// Bedingungen für die SQL-Abfrage sammeln
	const conditions: SQL[] = [];

	// Datums-Filter (nur mit validiertem YYYY-MM-DD Format). Beide Grenzen sind
	// unabhängig voneinander optional: „alles ab dem 01.06." ist der erwartete
	// Fall, nicht die Ausnahme. Vorher griff der Filter nur, wenn beide Felder
	// gesetzt waren — wer eines ausfüllte, bekam kommentarlos die ungefilterte
	// Liste und hielt sie für gefiltert.
	//
	// Kalendertag in deutscher Ortszeit: `fromDate`/`toDate` kommen als lokales
	// "YYYY-MM-DD" aus der Admin-UI, `sichtungsdatum` hält seit der UTC-Migration
	// echte Zeitpunkte. Ohne Umrechnung fiele eine Sichtung vom 15.07. um 00:30
	// Ortszeit (= 14.07. 22:30 UTC) aus dem Filter.
	const sightingCalendarDate = berlinCalendarDate(sightings.sightingDate);
	if (isValidDateParam(fromDate) && isValidDateParam(toDate)) {
		conditions.push(sql`${sightingCalendarDate} BETWEEN ${fromDate} AND ${toDate}`);
	} else if (isValidDateParam(fromDate)) {
		conditions.push(sql`${sightingCalendarDate} >= ${fromDate}`);
	} else if (isValidDateParam(toDate)) {
		conditions.push(sql`${sightingCalendarDate} <= ${toDate}`);
	}

	// Statusfilter über dieselben Prädikate wie die öffentlichen Flächen —
	// Begründung und Alias-Mapping in `sightingStatusFilter.ts`/`statusFilter.ts`.
	const statusFilter = statusCondition(verified);
	if (statusFilter) {
		conditions.push(statusFilter);
	}

	// Eingangskanal-Filter
	if (entryChannel && entryChannel !== 'all') {
		const channelId = parseInt(entryChannel);
		if (!isNaN(channelId)) {
			conditions.push(eq(sightings.entryChannel, channelId));
		}
	}

	// Aufnahme-Filter (Media Upload) — inkl. „angekündigt, aber keine Datei
	// angehängt" (announced_missing), siehe mediaUploadFilter.ts.
	const mediaCondition = mediaUploadCondition(mediaUpload);
	if (mediaCondition) {
		conditions.push(mediaCondition);
	}

	// Ostsee-Status-Filter — dieselbe Fallunterscheidung wie die Anzeige in
	// getBalticSeaStatus(), siehe balticSeaFilter.ts.
	const balticSeaFilterCondition = balticSeaCondition(balticSea);
	if (balticSeaFilterCondition) {
		conditions.push(balticSeaFilterCondition);
	}

	// Meldeart-Filter (Totfund/Lebendsichtung) — dieselbe Boolean-Semantik wie
	// das Badge in der Tabelle, siehe deadFindingFilter.ts.
	const deadFindingFilterCondition = deadFindingCondition(deadFinding);
	if (deadFindingFilterCondition) {
		conditions.push(deadFindingFilterCondition);
	}

	// Freitext-Suche über Referenz-ID, E-Mail, Name und Fahrwasser — parametrisiert
	// via Drizzle, siehe sightingSearchFilter.ts (dort auch die Index-Entscheidung).
	const searchFilterCondition = searchCondition(q);
	if (searchFilterCondition) {
		conditions.push(searchFilterCondition);
	}

	// Kombinierte WHERE-Bedingung erstellen
	const kombiniere = (liste: SQL[]): SQL | undefined =>
		liste.length === 0 ? undefined : liste.length === 1 ? liste[0] : and(...liste);

	const whereCondition = kombiniere(conditions);

	// Grundmenge der Statusreiter: dieselben Filter **ohne** den Statusfilter
	// selbst. Zählte er mit, stünde auf jedem inaktiven Reiter eine 0 — die
	// Leiste soll aber gerade sagen, wie viel hinter den anderen Reitern liegt.
	// Herausgefiltert wird die Bedingung, statt sie in einer zweiten Liste
	// nachzubauen: So bleibt die Reihenfolge der übrigen Bedingungen dieselbe
	// wie in der Hauptabfrage.
	const statusCountsWhere = kombiniere(
		conditions.filter((condition) => condition !== statusFilter)
	);

	// Sortierungs-Mapping. Als `Record<SortColumn, …>` typisiert: Die Liste der
	// sortierbaren Spalten steht in `sortParams.ts` und speist auch die
	// Spaltenköpfe — ein Eintrag dort ohne Mapping hier bricht `type-check`.
	//
	// Vier davon fehlten bis 2026-08 (`behavior`, `seaState`, `wind`,
	// `visibility`): Ihr Kopf rendert seit jeher über `sortableTh`, also als
	// Knopf mit `aria-sort` — der Klick landete aber im `|| sightings.sightingDate`
	// darunter und sortierte still nach Sichtungsdatum. Solange kein Pfeil zu
	// sehen war, fiel das nicht auf; mit der Anzeige stünde die Behauptung
	// sichtbar in der Tabelle.
	const sortingMap = {
		sightingDate: sightings.sightingDate,
		created: sightings.created,
		email: sightings.email,
		species: sightings.species,
		totalCount: sightings.totalCount,
		distance: sightings.distance,
		juvenileCount: sightings.juvenileCount,
		distribution: sightings.distribution,
		behavior: sightings.behavior,
		seaState: sightings.seaState,
		// `windstaerke` ist varchar(2) — als Text sortiert stünde „10" vor „2".
		// NULLIF, weil neben 7.591 NULL-Zeilen auch 2.691 leere Strings im
		// Bestand stehen, die ein blankes CAST mit einem 22P02 quittieren würde.
		wind: sql`cast(nullif(${sightings.windForce}, '') as integer)`,
		visibility: sightings.visibility,
		spamScore: sightings.spamScore
	} satisfies Record<SortColumn, AnyPgColumn | SQL>;

	// Abfrage bauen. Explizite Spaltenauswahl statt `db.select()`: Begründung,
	// Umfang und Absicherung stehen in `listColumns.ts`.
	const baseQuery = db.select(SIGHTING_LIST_COLUMNS).from(sightings);

	// WHERE-Klausel hinzufügen, wenn Bedingungen vorhanden sind
	const query = whereCondition ? baseQuery.where(whereCondition) : baseQuery;

	// Sortierung hinzufügen. NULLS LAST explizit in beide Richtungen: Postgres
	// sortiert DESC per Default NULLS FIRST — bei der nullbaren Spam-Spalte
	// stünden sonst die 19.000+ unbewerteten Altzeilen VOR den Treffern. Für
	// NOT-NULL-Spalten ist der Zusatz wirkungslos.
	//
	// `id` als Tiebreaker in beiden Richtungen: Ohne eindeutiges Zweitkriterium
	// ist die Reihenfolge innerhalb eines Gleichstands undefiniert, und Postgres
	// darf sie je Abfrage anders wählen. Mit LIMIT/OFFSET über knapp 20.000
	// Zeilen heißt das, dass eine Zeile auf Seite 1 UND Seite 2 auftaucht,
	// während eine andere still ganz aus der Liste fällt. Latent war das immer;
	// scharf wird es mit den vier neu sortierbaren Spalten oben — `seaState`
	// kennt keine zehn verschiedenen Werte, die Sortierung besteht also aus
	// wenigen riesigen Blöcken. Dieselbe Entscheidung und dieselbe Begründung
	// wie `(created, id)` in `openQueueOrder.ts`.
	const sortField = sortingMap[sortBy];
	const sortedQuery =
		sortOrder === 'desc'
			? query.orderBy(sql`${sortField} desc nulls last, ${sightings.id} desc`)
			: query.orderBy(sql`${sortField} asc nulls last, ${sightings.id} asc`);

	// Paginierung hinzufügen
	const paginatedQuery = sortedQuery.limit(perPage).offset((page - 1) * perPage);

	// Count-Abfrage für Pagination
	const countBaseQuery = db.select({ count: sql<number>`count(*)` }).from(sightings);

	// WHERE-Klausel zur Count-Abfrage hinzufügen
	const countQuery = whereCondition ? countBaseQuery.where(whereCondition) : countBaseQuery;

	// Zähler der Statusreiter — eine Abfrage mit bedingten Aggregaten statt drei
	// Rundreisen. Die Prädikate kommen aus `approvalFilter.ts`, also aus
	// derselben Quelle wie `statusCondition()` oben: Reiterzahl und
	// Trefferliste können damit nicht auseinanderlaufen.
	const statusCountsBaseQuery = db
		.select({
			all: sql<number>`count(*)`,
			open: sql<number>`count(*) filter (where ${openOnly()})`,
			approved: sql<number>`count(*) filter (where ${approvedOnly()})`,
			rejected: sql<number>`count(*) filter (where ${rejectedOnly()})`
		})
		.from(sightings);

	const statusCountsQuery = statusCountsWhere
		? statusCountsBaseQuery.where(statusCountsWhere)
		: statusCountsBaseQuery;

	// Abfragen ausführen — voneinander unabhängig, deshalb parallel statt
	// sequenziell (zwei Round-Trips gleichzeitig statt hintereinander).
	//
	// Der dritte Zähler „Foto angekündigt, fehlt noch" ist mit dem zugehörigen
	// Knopf im Kopf entfallen (Begründung in `+page.svelte`): Er kostete auf
	// jedem Seitenaufruf dieser Tabelle eine eigene Abfrage über den gesamten
	// Bestand, für eine Zahl, die der Eingang ohnehin führt.
	const [data, countResult, statusCountsResult] = await Promise.all([
		paginatedQuery,
		countQuery,
		statusCountsQuery
	]);
	// `count(*)` ist bigint und kommt je nach PG-Treiber als String zurück. Der
	// Loader-Vertrag sagt `number`, also wird hier normalisiert und nicht in
	// jeder Aufrufstelle einzeln: `"1" === 1` ist falsch und ergab in der
	// Kopfzeile „1 Fotos ausstehend".
	const count = Number(countResult[0]?.count ?? 0);

	// Dieselbe bigint-Falle wie beim Pagination-Zähler: `count(*) filter (…)`
	// kommt je nach Treiber als String, und `'7' === 7` ist falsch. Der
	// Loader-Vertrag sagt `number`, also wird hier normalisiert.
	const statusCountsRow = statusCountsResult[0];
	const statusCounts: StatusCounts = {
		all: Number(statusCountsRow?.all ?? 0),
		open: Number(statusCountsRow?.open ?? 0),
		approved: Number(statusCountsRow?.approved ?? 0),
		rejected: Number(statusCountsRow?.rejected ?? 0)
	};

	// Wer eine ganze Referenz-ID einfügt (aus einer Bestätigungsmail, einer
	// Rückfrage), will die Sichtung sehen — nicht eine Trefferliste mit einer
	// Zeile. Dasselbe Verhalten wie /admin/ref/[refId], nur ohne zweite
	// Eingabemaske.
	//
	// Die Bedingung ist bewusst der tatsächliche Treffer und keine Formatheuristik:
	// Ein Muster für „sieht aus wie eine CUID2" träfe auch Nachnamen, und eine
	// zusätzliche Exact-Match-Abfrage kostete einen Round-Trip bei jeder Suche.
	// Nur auf Seite 1, sonst stünde die Bedingung mit einer leeren Seite nie an.
	const searchTerm = normalizeSearchTerm(q);
	const einzigerTreffer = data.length === 1 ? data[0] : undefined;
	if (
		searchTerm &&
		page === 1 &&
		count === 1 &&
		einzigerTreffer?.referenceId?.toLowerCase() === searchTerm.toLowerCase()
	) {
		// Die übrigen Filter reisen mit, **`q` bewusst nicht**: `tableReturnUrl.ts`
		// nimmt `q` in den Rückweg auf, und dieser Rückweg liefe damit erneut in
		// genau diese Weiterleitung — „Zurück zur Tabelle" landete wieder auf der
		// Detailseite, die Trefferliste wäre nur noch über die Adresszeile
		// erreichbar. Ohne `q` führt der Rückweg auf die Tabelle, die der
		// Bearbeiter vor der Suche vor sich hatte; die einzeilige Trefferliste
		// dieser Referenz-ID ist ohnehin kein Ziel, zu dem man zurückwill.
		const zielParameter = new URLSearchParams(url.searchParams);
		zielParameter.delete('q');
		const anhang = zielParameter.toString();
		redirect(
			302,
			anhang ? `/admin/${einzigerTreffer.id}?${anhang}` : `/admin/${einzigerTreffer.id}`
		);
	}

	return {
		sightings: data,
		statusCounts,
		pagination: {
			page,
			perPage,
			totalPages: Math.ceil(count / perPage),
			total: count,
			maxPerPage: paginationConfig.maxSightingsPerPage
		}
	};
};
