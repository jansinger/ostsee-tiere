/**
 * @fileoverview Admin-Dashboard: Arbeitsliste „Foto angekündigt, fehlt noch".
 *
 * Der neu gebaute iOS-Client setzt `aufnahmeHochladen`, kann aber kein Foto
 * hochladen — es kommt per E-Mail nach (`#lib/utils/media/photoAnnouncement.ts`).
 * `load()` muss dafür eines leisten: Der Filterwert
 * `mediaUpload=announced_missing` muss dieselbe Bedingung erzeugen wie
 * `mediaUploadCondition()` — sonst driftet die Admin-Liste vom zentral
 * getesteten Filter auseinander.
 *
 * Den globalen Zähler `pendingPhotoAnnouncements` gab es hier bis 2026-08-09
 * zusätzlich. Er ist mit dem Knopf im Tabellenkopf entfallen: Der Eingang
 * (`/admin`) führt dieselbe Zahl, und die Tabelle erreicht die Arbeitsliste
 * über den Aufnahme-Filter.
 *
 * Testansatz wie `statisticsApprovalScope.test.ts`: ein aufzeichnender
 * `db.select`-Mock, das WHERE-Prädikat wird über den echten `PgDialect` zu SQL
 * kompiliert.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { and, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { isRedirect, type Redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchCondition } from '#lib/server/db/sightingSearchFilter.ts';
import {
	MEDIA_UPLOAD_ANNOUNCED_MISSING,
	mediaUploadCondition
} from '#lib/server/db/mediaUploadFilter.ts';
import { balticSeaCondition } from '#lib/server/db/balticSeaFilter.ts';
import { deadFindingCondition } from '#lib/server/db/deadFindingFilter.ts';
import { approvedOnly, openOnly, rejectedOnly } from '#lib/server/db/approvalFilter.ts';
import { berlinCalendarDate } from '#lib/server/db/sqlTimeZone.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { SIGHTING_LIST_FIELDS } from './listColumns';

const dialect = new PgDialect();
const toSqlText = (condition: SQLWrapper): string => dialect.sqlToQuery(condition.getSQL()).sql;

/** Ein `db.select(...)`-Aufruf, wie ihn `load()` erzeugt. */
type RecordedSelect = {
	columns: Record<string, unknown> | undefined;
	whereSql?: string;
	orderBySql?: string;
};

let recordedSelects: RecordedSelect[] = [];
/** Rückgabewerte in Aufrufreihenfolge — `load()` ruft `db.select` dreimal auf. */
let resolvedRows: unknown[][] = [];

function createRecordingBuilder(record: RecordedSelect) {
	const builder = {
		from: () => builder,
		where: (predicate?: SQL) => {
			if (predicate) record.whereSql = toSqlText(predicate);
			return builder;
		},
		orderBy: (expression?: SQLWrapper) => {
			if (expression) record.orderBySql = toSqlText(expression);
			return builder;
		},
		limit: () => builder,
		offset: () => builder,
		then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
			Promise.resolve(resolvedRows[recordedSelects.indexOf(record)] ?? []).then(resolve, reject)
	};
	return builder;
}

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: (columns?: Record<string, unknown>) => {
			const record: RecordedSelect = { columns };
			recordedSelects.push(record);
			return createRecordingBuilder(record);
		}
	}
}));

vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		getPaginationConfig: vi
			.fn()
			.mockResolvedValue({ defaultPageSize: 20, maxSightingsPerPage: 100 })
	}
}));

function makeUrl(params: Record<string, string> = {}): URL {
	const url = new URL('https://example.com/admin');
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return url;
}

const { load } = await import('./+page.server');

describe('admin/+page.server load() — Foto-Ankündigungs-Arbeitsliste', () => {
	beforeEach(() => {
		recordedSelects = [];
		resolvedRows = [[{ id: 1 }], [{ count: 5 }], [{ count: 2 }]];
	});

	/*
	 * Befund 20: Die Hauptliste lief als `db.select()` über die ganze Zeile und
	 * lieferte bis zu 100 vollständige Datensätze ins HTML — Telefonnummer,
	 * Klarname und alle Einwilligungs-Nachweisspalten inklusive. Die Auswahl
	 * steht jetzt in `listColumns.ts`; hier wird geprüft, dass `load()` sie auch
	 * tatsächlich übergibt. Ein zurückgedrehtes `db.select()` ohne Argument
	 * erzeugt `columns === undefined` und fällt damit hier auf — der Test in
	 * `listColumns.test.ts` allein sähe das nicht, er kennt nur die Konstante.
	 */
	it('liest nur die Spalten aus listColumns, nicht die ganze Zeile', async () => {
		await load({ url: makeUrl() } as unknown as Parameters<typeof load>[0]);

		const hauptliste = recordedSelects[0];
		expect(Object.keys(hauptliste?.columns ?? {}).sort()).toEqual([...SIGHTING_LIST_FIELDS].sort());
	});

	it('sortiert die Spam-Spalte absteigend mit NULLS LAST (sonst stünde Altbestand oben)', async () => {
		await load({
			url: makeUrl({ sort: 'spamScore', order: 'desc' })
		} as unknown as Parameters<typeof load>[0]);

		// Erstes select() ist die Hauptliste. Postgres sortiert DESC per Default
		// NULLS FIRST — die 19.000+ unbewerteten Zeilen lägen vor den Treffern.
		expect(recordedSelects[0]?.orderBySql).toMatch(/nulls last/i);
	});

	it('hängt an jede Sortierung einen eindeutigen Tiebreaker', async () => {
		// Ohne zweites Kriterium ist die Reihenfolge innerhalb eines
		// Gleichstands undefiniert — Postgres darf sie je Abfrage anders
		// wählen. Bei LIMIT/OFFSET über 19.953 Zeilen heißt das: Eine Zeile
		// erscheint auf Seite 1 UND Seite 2, eine andere fällt still ganz aus
		// der Liste. `seaState` kennt keine 10 verschiedene Werte, besteht also
		// aus wenigen riesigen Blöcken. Dieselbe Fehlerklasse wie in
		// `openQueueOrder.ts`, wo `(created, id)` aus genau diesem Grund
		// festgeschrieben ist.
		await load({
			url: makeUrl({ sort: 'seaState', order: 'asc' })
		} as unknown as Parameters<typeof load>[0]);

		expect(recordedSelects[0]?.orderBySql).toMatch(/"id"/);
	});

	it('sortiert auch aufsteigend explizit mit NULLS LAST', async () => {
		await load({
			url: makeUrl({ sort: 'spamScore', order: 'asc' })
		} as unknown as Parameters<typeof load>[0]);

		expect(recordedSelects[0]?.orderBySql).toMatch(/nulls last/i);
	});

	it('?mediaUpload=announced_missing filtert die Hauptliste mit derselben Bedingung', async () => {
		await load({
			url: makeUrl({ mediaUpload: MEDIA_UPLOAD_ANNOUNCED_MISSING })
		} as unknown as Parameters<typeof load>[0]);

		const expected = toSqlText(
			mediaUploadCondition(MEDIA_UPLOAD_ANNOUNCED_MISSING) as unknown as SQLWrapper
		);
		// Erster Select = Hauptliste, zweiter = Pagination-Count — beide müssen
		// dieselbe Bedingung tragen wie `mediaUploadCondition`.
		expect(recordedSelects[0]?.whereSql).toBe(expected);
		expect(recordedSelects[1]?.whereSql).toBe(expected);
	});

	// Der Filter selbst ist in `balticSeaFilter.test.ts` gegen `getBalticSeaStatus()`
	// abgesichert. Hier geht es nur um die Verdrahtung: dass `?balticSea=…`
	// überhaupt bis in die WHERE-Klausel durchschlägt. Alle vier Werte, damit ein
	// vergessener `switch`-Zweig nicht durchrutscht.
	it.each(['baltic', 'edge', 'outside', 'noPosition'] as const)(
		'?balticSea=%s filtert die Hauptliste mit derselben Bedingung',
		async (status) => {
			await load({
				url: makeUrl({ balticSea: status })
			} as unknown as Parameters<typeof load>[0]);

			const expected = toSqlText(balticSeaCondition(status) as unknown as SQLWrapper);
			expect(recordedSelects[0]?.whereSql).toBe(expected);
			expect(recordedSelects[1]?.whereSql).toBe(expected);
		}
	);

	// Wie beim Ostsee-Status: Die Bedingung selbst ist in `deadFindingFilter.test.ts`
	// abgesichert, hier zählt nur die Verdrahtung von `?deadFinding=…` in die WHERE-Klausel.
	it.each(['1', '0'] as const)(
		'?deadFinding=%s filtert die Hauptliste mit derselben Bedingung',
		async (value) => {
			await load({
				url: makeUrl({ deadFinding: value })
			} as unknown as Parameters<typeof load>[0]);

			const expected = toSqlText(deadFindingCondition(value) as unknown as SQLWrapper);
			expect(recordedSelects[0]?.whereSql).toBe(expected);
			expect(recordedSelects[1]?.whereSql).toBe(expected);
		}
	);

	it('ein unbekannter deadFinding-Wert filtert die Hauptliste gar nicht', async () => {
		await load({
			url: makeUrl({ deadFinding: 'quatsch' })
		} as unknown as Parameters<typeof load>[0]);

		expect(recordedSelects[0]?.whereSql).toBeUndefined();
	});

	it('ein unbekannter balticSea-Wert filtert die Hauptliste gar nicht', async () => {
		await load({
			url: makeUrl({ balticSea: 'quatsch' })
		} as unknown as Parameters<typeof load>[0]);

		expect(recordedSelects[0]?.whereSql).toBeUndefined();
	});

	// verified=rejected ist die Triage-Sicht auf abgelehnte Sichtungen und muss
	// exakt die Bedingung von rejectedOnly() tragen. Seit der Umstellung auf
	// statusCondition() (statusFilter.ts) laufen auch verified=0/1 über
	// dieselben Prädikate (openOnly()/approvedOnly()) statt über die Spalte
	// `geprueft` — siehe sightingStatusFilter.test.ts und statusFilter.test.ts.
	it('verified=rejected filtert über rejectedOnly()', async () => {
		await load({
			url: makeUrl({ verified: 'rejected' })
		} as unknown as Parameters<typeof load>[0]);

		const expected = toSqlText(rejectedOnly());
		expect(recordedSelects[0]?.whereSql).toBe(expected);
		expect(recordedSelects[1]?.whereSql).toBe(expected);
	});
});

/**
 * Der Datumsfilter der Tabelle hat zwei unabhängige Felder — „Von" und „Bis".
 * Bis 2026-08 griff er nur, wenn **beide** gültig gesetzt waren: Wer nur eine
 * Grenze eintrug, bekam kommentarlos die ungefilterte Liste zurück und hielt
 * das Ergebnis für gefiltert. Offene Grenzen sind der erwartete Fall („alles
 * ab dem 01.06."), nicht die Ausnahme.
 */
describe('admin/sichtungen/+page.server load() — Datumsfilter mit offenen Grenzen', () => {
	/** Kalendertag-Ausdruck der Abfrage — derselbe wie in `load()`. */
	const kalendertag = berlinCalendarDate(sightings.sightingDate);

	beforeEach(() => {
		recordedSelects = [];
		resolvedRows = [[{ id: 1 }], [{ count: 5 }], [{ count: 2 }]];
	});

	it('filtert mit beiden Grenzen weiterhin über BETWEEN', async () => {
		await load({
			url: makeUrl({ fromDate: '2024-06-01', toDate: '2024-06-30' })
		} as unknown as Parameters<typeof load>[0]);

		const expected = toSqlText(
			sql`${kalendertag} BETWEEN ${'2024-06-01'} AND ${'2024-06-30'}` as unknown as SQLWrapper
		);
		expect(recordedSelects[0]?.whereSql).toBe(expected);
		expect(recordedSelects[1]?.whereSql).toBe(expected);
	});

	it('filtert mit nur „Von" ab diesem Kalendertag', async () => {
		await load({
			url: makeUrl({ fromDate: '2024-06-01' })
		} as unknown as Parameters<typeof load>[0]);

		const expected = toSqlText(sql`${kalendertag} >= ${'2024-06-01'}` as unknown as SQLWrapper);
		expect(recordedSelects[0]?.whereSql).toBe(expected);
		expect(recordedSelects[1]?.whereSql).toBe(expected);
	});

	it('filtert mit nur „Bis" bis zu diesem Kalendertag', async () => {
		await load({
			url: makeUrl({ toDate: '2024-06-30' })
		} as unknown as Parameters<typeof load>[0]);

		const expected = toSqlText(sql`${kalendertag} <= ${'2024-06-30'}` as unknown as SQLWrapper);
		expect(recordedSelects[0]?.whereSql).toBe(expected);
		expect(recordedSelects[1]?.whereSql).toBe(expected);
	});

	it('ignoriert eine ungültige Grenze, statt sie in die Abfrage zu tragen', async () => {
		await load({
			url: makeUrl({ fromDate: 'quatsch', toDate: '2024-06-30' })
		} as unknown as Parameters<typeof load>[0]);

		const expected = toSqlText(sql`${kalendertag} <= ${'2024-06-30'}` as unknown as SQLWrapper);
		expect(recordedSelects[0]?.whereSql).toBe(expected);
	});

	it('filtert ohne gültige Grenze gar nicht', async () => {
		await load({
			url: makeUrl({ fromDate: 'quatsch', toDate: '2024-13-99' })
		} as unknown as Parameters<typeof load>[0]);

		expect(recordedSelects[0]?.whereSql).toBeUndefined();
	});
});

/**
 * Freitext-Suche (`?q=`). Die Bedingung selbst ist in `sightingSearchFilter.test.ts`
 * abgesichert; hier zählt die Verdrahtung — dass der Parameter bis in die
 * WHERE-Klausel durchschlägt — und der Sonderfall Referenz-ID.
 */
describe('admin/sichtungen/+page.server load() — Freitext-Suche', () => {
	beforeEach(() => {
		recordedSelects = [];
		resolvedRows = [[{ id: 1 }], [{ count: 5 }], [{ count: 2 }]];
	});

	it('?q=… filtert Liste und Zähler mit derselben Bedingung', async () => {
		await load({
			url: makeUrl({ q: 'müller' })
		} as unknown as Parameters<typeof load>[0]);

		const expected = toSqlText(searchCondition('müller') as unknown as SQLWrapper);
		expect(recordedSelects[0]?.whereSql).toBe(expected);
		expect(recordedSelects[1]?.whereSql).toBe(expected);
	});

	it('ein leerer Suchbegriff filtert gar nicht', async () => {
		await load({
			url: makeUrl({ q: '   ' })
		} as unknown as Parameters<typeof load>[0]);

		expect(recordedSelects[0]?.whereSql).toBeUndefined();
	});

	it('kombiniert die Suche mit einem aktiven Statusfilter', async () => {
		await load({
			url: makeUrl({ q: 'müller', verified: 'rejected' })
		} as unknown as Parameters<typeof load>[0]);

		const expected = toSqlText(
			and(rejectedOnly(), searchCondition('müller')) as unknown as SQLWrapper
		);
		expect(recordedSelects[0]?.whereSql).toBe(expected);
	});

	it('leitet bei genau einem exakten Referenz-ID-Treffer auf die Detailseite', async () => {
		// Verhalten wie /admin/ref/[refId]: Wer eine Referenz-ID einfügt, will die
		// Sichtung sehen, nicht eine einzeilige Trefferliste.
		resolvedRows = [[{ id: 4711, referenceId: 'abc123xyz' }], [{ count: 1 }], [{ count: 0 }]];

		let fehler: unknown;
		try {
			await load({ url: makeUrl({ q: 'ABC123XYZ' }) } as unknown as Parameters<typeof load>[0]);
		} catch (err) {
			fehler = err;
		}

		expect(isRedirect(fehler)).toBe(true);
		expect((fehler as Redirect).location).toBe('/admin/4711');
	});

	it('gibt den Suchbegriff beim Weiterleiten NICHT mit', async () => {
		// Sonst führt der Rückweg aus der Detailansicht (tableReturnUrl.ts nimmt
		// `q` mit) direkt wieder in dieselbe Weiterleitung: „Zurück zur Tabelle"
		// landete erneut auf der Detailseite, und die Liste wäre ohne Handarbeit
		// an der URL nicht mehr erreichbar.
		resolvedRows = [[{ id: 4711, referenceId: 'abc123xyz' }], [{ count: 1 }], [{ count: 0 }]];

		let fehler: unknown;
		try {
			await load({
				url: makeUrl({ q: 'abc123xyz', verified: 'open' })
			} as unknown as Parameters<typeof load>[0]);
		} catch (err) {
			fehler = err;
		}

		const ziel = new URL((fehler as Redirect).location, 'https://example.com');
		expect(ziel.searchParams.has('q')).toBe(false);
		// Die übrigen Filter bleiben erhalten — der Rückweg führt damit auf die
		// Tabelle, die der Bearbeiter vor der Suche vor sich hatte.
		expect(ziel.searchParams.get('verified')).toBe('open');
	});

	it('leitet nicht weiter, wenn der Begriff nur Teil der Referenz-ID ist', async () => {
		resolvedRows = [[{ id: 4711, referenceId: 'abc123xyz' }], [{ count: 1 }], [{ count: 0 }]];

		const result = await load({
			url: makeUrl({ q: 'abc123' })
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toBeDefined();
	});

	it('leitet nicht weiter, wenn die Suche mehrere Treffer hat', async () => {
		resolvedRows = [
			[
				{ id: 4711, referenceId: 'abc123xyz' },
				{ id: 4712, referenceId: 'anderes' }
			],
			[{ count: 2 }],
			[{ count: 0 }]
		];

		const result = await load({
			url: makeUrl({ q: 'abc123xyz' })
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toBeDefined();
	});
});

/**
 * Statusreiter über der Tabelle (WP2): `statusCounts` trägt die Trefferzahlen
 * für „Alle | Offen | Freigegeben | Abgelehnt".
 *
 * Der Punkt, an dem eine naive Umsetzung scheitert: Gezählt wird über die
 * aktuell gefilterte Menge **ohne den Statusfilter selbst**. Zählte sie mit,
 * stünde auf jedem inaktiven Reiter eine 0 — und die Leiste wäre als
 * Übersicht wertlos, gerade wenn ein Filter aktiv ist.
 */
describe('admin/sichtungen/+page.server load() — Statusreiter-Zähler', () => {
	/** Dritter `db.select()`-Aufruf: Liste (0), Pagination-Count (1), Statuszähler (2). */
	const ZAEHLER = 2;

	beforeEach(() => {
		recordedSelects = [];
		resolvedRows = [[{ id: 1 }], [{ count: 5 }], [{ all: 12, open: 7, approved: 4, rejected: 1 }]];
	});

	it('zählt die drei Zustände über dieselben Prädikate wie der Filter', async () => {
		await load({ url: makeUrl() } as unknown as Parameters<typeof load>[0]);

		const spalten = (recordedSelects[ZAEHLER]?.columns ?? {}) as Record<string, SQLWrapper>;
		const spaltenSql = (name: string): string => toSqlText(spalten[name] as SQLWrapper);

		expect(spaltenSql('open')).toContain(toSqlText(openOnly()));
		expect(spaltenSql('approved')).toContain(toSqlText(approvedOnly()));
		expect(spaltenSql('rejected')).toContain(toSqlText(rejectedOnly()));
	});

	it('lässt den Statusfilter aus der Zähler-Grundmenge heraus', async () => {
		await load({
			url: makeUrl({ verified: 'approved' })
		} as unknown as Parameters<typeof load>[0]);

		// Die Liste filtert, die Zähler nicht — sonst stünde auf „Offen" und
		// „Abgelehnt" jeweils 0, sobald „Freigegeben" gewählt ist.
		expect(recordedSelects[0]?.whereSql).toBe(toSqlText(approvedOnly()));
		/* Erst die Existenz, dann die Abwesenheit der WHERE-Klausel: Ohne die
		   erste Zusicherung wäre der Test auch dann grün, wenn es die
		   Zähler-Abfrage gar nicht gibt. */
		expect(recordedSelects).toHaveLength(3);
		expect(recordedSelects[ZAEHLER]?.whereSql).toBeUndefined();
	});

	it('nimmt die übrigen Filter dagegen mit', async () => {
		await load({
			url: makeUrl({ verified: 'approved', deadFinding: '1' })
		} as unknown as Parameters<typeof load>[0]);

		const totfund = toSqlText(deadFindingCondition('1') as unknown as SQLWrapper);
		expect(recordedSelects[0]?.whereSql).toBe(
			toSqlText(and(approvedOnly(), deadFindingCondition('1')) as unknown as SQLWrapper)
		);
		expect(recordedSelects[ZAEHLER]?.whereSql).toBe(totfund);
	});

	it('liefert die Zahlen als Zahlen, auch wenn der Treiber Strings liefert', async () => {
		resolvedRows[ZAEHLER] = [{ all: '12', open: '7', approved: '4', rejected: '1' }];

		const result = (await load({ url: makeUrl() } as unknown as Parameters<typeof load>[0])) as {
			statusCounts: { all: number; open: number; approved: number; rejected: number };
		};

		expect(result.statusCounts).toEqual({ all: 12, open: 7, approved: 4, rejected: 1 });
	});

	it('liefert bei fehlender Zeile überall 0 statt NaN', async () => {
		resolvedRows[ZAEHLER] = [];

		const result = (await load({ url: makeUrl() } as unknown as Parameters<typeof load>[0])) as {
			statusCounts: { all: number; open: number; approved: number; rejected: number };
		};

		expect(result.statusCounts).toEqual({ all: 0, open: 0, approved: 0, rejected: 0 });
	});
});

/**
 * `count(*)` kommt je nach PG-Treiber als **String** zurück (bigint). Aufgefallen
 * ist das am Zähler „1 Fotos ausstehend" (`'1' === 1` ist falsch); der Knopf ist
 * seit 2026-08-09 weg, die Falle bleibt für `pagination.total` dieselbe. Die
 * Normalisierung gehört in den Loader, nicht in jede Aufrufstelle: Ein
 * Loader-Vertrag mit `number` gilt für alle.
 */
describe('admin/sichtungen/+page.server load() — Zähler sind Zahlen, keine Strings', () => {
	beforeEach(() => {
		recordedSelects = [];
		resolvedRows = [[{ id: 1 }], [{ count: '42' }], [{ count: '1' }]];
	});

	it('liefert pagination.total als Zahl und rechnet totalPages daraus', async () => {
		const result = (await load({
			url: makeUrl({ perPage: '20' })
		} as unknown as Parameters<typeof load>[0])) as {
			pagination: { total: number; totalPages: number };
		};

		expect(result.pagination.total).toBe(42);
		expect(typeof result.pagination.total).toBe('number');
		expect(result.pagination.totalPages).toBe(3);
	});
});
