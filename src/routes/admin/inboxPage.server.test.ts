/**
 * @fileoverview Eingangsseite `/admin`: Load-Verhalten der Task-Liste.
 *
 * Die Seite ist keine Tabelle mehr, sondern eine Arbeitsliste offener
 * Sichtungen. Vier Dinge muss `load()` leisten, und jedes davon ist schon
 * einmal falsch gewesen oder kann es leicht werden:
 *
 * 1. Gemerkte Tabellen-URLs (`/admin?page=…`) landen per 301 auf
 *    `/admin/sichtungen` — mitsamt Query, sonst verlieren geteilte Filter-Links
 *    ihren Inhalt.
 * 2. Default-Sortierung ist `created` **absteigend** (neueste zuerst):
 *    Entscheidung Jan, 2026-08-08 — der Altbestand ab 2013 macht FIFO als
 *    Default unbrauchbar, ein Bearbeiter sähe sonst zuerst 13 Jahre alte
 *    Meldungen. `?order=asc` bleibt als bewusste Wahl erhalten.
 * 3. `?order=` kennt genau zwei gültige Werte; alles andere fällt auf `desc`
 *    zurück statt in die SQL zu wandern.
 * 4. Bildvorschauen kommen aus **einem** Query und werden in JS nach
 *    Sichtungs-ID gruppiert.
 *
 * Mock-Harnisch wie `src/routes/admin/sichtungen/page.server.test.ts`: ein
 * aufzeichnender `db.select`-Mock, dessen WHERE/ORDER-BY-Ausdrücke über den
 * echten `PgDialect` zu SQL kompiliert werden.
 */
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openOnly } from '#lib/server/db/approvalFilter.ts';
import { INBOX_FIELDS } from '#lib/server/db/inboxColumns.ts';

const dialect = new PgDialect();
const toSqlText = (condition: SQLWrapper): string => dialect.sqlToQuery(condition.getSQL()).sql;

/** Ein `db.select(...)`-Aufruf, wie ihn `load()` erzeugt. */
type RecordedSelect = {
	columns: Record<string, unknown> | undefined;
	whereSql?: string;
	orderBySql?: string;
	limit?: number;
};

let recordedSelects: RecordedSelect[] = [];
/** Rückgabewerte in Aufrufreihenfolge: Liste, Zähler, Foto-Zähler, maxOpenId, Bilddateien. */
let resolvedRows: unknown[][] = [];

function createRecordingBuilder(record: RecordedSelect) {
	const builder = {
		from: () => builder,
		where: (predicate?: SQL) => {
			if (predicate) record.whereSql = toSqlText(predicate);
			return builder;
		},
		orderBy: (...expressions: SQLWrapper[]) => {
			if (expressions.length) record.orderBySql = expressions.map(toSqlText).join(', ');
			return builder;
		},
		limit: (value: number) => {
			record.limit = value;
			return builder;
		},
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

/* Der Duplikat-Hinweis (Spec B2) hat seine eigenen Tests in
   `src/lib/server/db/duplicateCandidates.test.ts`. Hier zählt nur die
   Verdrahtung: Der Loader reicht **alle** gelisteten IDs in **einem** Aufruf
   hinein und gibt das Ergebnis unverändert an die Seite weiter. */
const findDuplicateCandidates = vi
	.fn<(ids: number[]) => Promise<Record<number, unknown[]>>>()
	.mockResolvedValue({});
vi.mock('#lib/server/db/duplicateCandidates.ts', () => ({
	findDuplicateCandidates: (ids: number[]) => findDuplicateCandidates(ids)
}));

/* Die Melder-Historie hat ihre eigenen Tests in
   `src/lib/server/db/reporterHistory.test.ts`. Ohne diesen Mock ruft der Loader
   die echte `findReporterHistory` auf, die `db.execute` braucht — das kennt der
   Select-Mock oben nicht, der Fail-open-`catch` im Modul schluckt den daraus
   entstehenden `TypeError`, und der Loader liefert lautlos `{}`. Ein Test ohne
   diesen Mock bliebe grün, selbst wenn die Verdrahtung ganz entfernt würde. */
const findReporterHistory = vi
	.fn<
		(
			rows: { id: number; email: string | null }[]
		) => Promise<
			Record<number, { approved: number; rejected: number; open: number; since: string | null }>
		>
	>()
	.mockResolvedValue({});
vi.mock('#lib/server/db/reporterHistory.ts', () => ({
	findReporterHistory: (rows: { id: number; email: string | null }[]) => findReporterHistory(rows)
}));

function makeUrl(params: Record<string, string> = {}): URL {
	const url = new URL('https://example.com/admin');
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return url;
}

/** Die Load-Daten der Eingangsseite. */
type InboxData = {
	open: { id: number }[];
	openTotal: number;
	order: 'asc' | 'desc';
	imagesBySighting: Record<number, { id: number; filePath: string; originalName: string }[]>;
	pendingPhotoAnnouncements: number;
	maxOpenId: number;
	duplicatesBySighting: Record<number, unknown[]>;
	reporterHistoryBySighting: Record<
		number,
		{ approved: number; rejected: number; open: number; since: string | null }
	>;
};

const { load } = await import('./+page.server');

/**
 * `PageServerLoad` erlaubt generisch auch `void` (Redirects o. ä.); für diese
 * Tests ist die tatsächliche Rückgabe bekannt, deshalb der Cast.
 */
const runLoad = async (url: URL): Promise<InboxData> =>
	(await load({ url } as unknown as Parameters<typeof load>[0])) as unknown as InboxData;

describe('Eingangs-Load', () => {
	beforeEach(() => {
		recordedSelects = [];
		resolvedRows = [
			[
				{ id: 1, email: 'melder-eins@example.com' },
				{ id: 2, email: 'melder-zwei@example.com' }
			],
			[{ count: 7 }],
			[{ count: 3 }],
			// Neu an Position 3: max(id) der offenen Sichtungen. Der Bild-Query
			// läuft erst im `.then()` der Liste und rückt damit auf 4.
			[{ max: 42 }],
			[]
		];
		findDuplicateCandidates.mockClear();
		findDuplicateCandidates.mockResolvedValue({});
		findReporterHistory.mockClear();
		findReporterHistory.mockResolvedValue({});
	});

	/*
	 * Befund 20, Eingangs-Hälfte: Die Liste lief als `db.select()` über die
	 * ganze Zeile — 50 vollständige Datensätze pro Aufruf, mitsamt Anschrift,
	 * Telefonnummer und allen acht Einwilligungs-Nachweisspalten. Dass die Karte
	 * kein Feld liest, das hier fehlt, sichert der Typ `InboxSighting`; dass
	 * `load()` die Auswahl auch übergibt, sichert dieser Test. Ein
	 * zurückgedrehtes `db.select()` erzeugt `columns === undefined`.
	 */
	it('liest nur die Spalten aus inboxColumns, nicht die ganze Zeile', async () => {
		await load({ url: makeUrl() } as unknown as Parameters<typeof load>[0]);

		expect(Object.keys(recordedSelects[0]?.columns ?? {}).sort()).toEqual([...INBOX_FIELDS].sort());
	});

	it('liefert keine Spalte aus, die die Eingangskarte nicht zeigt', () => {
		// Aufzählung statt Namens-Heuristik: „alles mit Consent im Namen" sähe
		// nach einer Regel aus, ließe aber `phone` und `internalComment` durch.
		const nichtAusliefern = [
			'phone',
			'fax',
			'street',
			'zipCode',
			'city',
			'internalComment',
			'privacyConsentAt',
			'privacyConsentVersion',
			'nameConsentAt',
			'nameConsentVersion',
			'shipNameConsentAt',
			'shipNameConsentVersion',
			'mediaConsentAt',
			'mediaConsentVersion'
		];
		expect(nichtAusliefern.filter((feld) => INBOX_FIELDS.includes(feld as never))).toEqual([]);
	});

	it('sucht Duplikat-Kandidaten für alle gelisteten IDs in einem Aufruf', async () => {
		findDuplicateCandidates.mockResolvedValue({ 1: [{ id: 99 }] });

		const result = await runLoad(makeUrl());

		expect(findDuplicateCandidates).toHaveBeenCalledTimes(1);
		expect(findDuplicateCandidates).toHaveBeenCalledWith([1, 2]);
		expect(result.duplicatesBySighting).toEqual({ 1: [{ id: 99 }] });
	});

	/* Den Leerfall behandelt `findDuplicateCandidates` selbst (eigener Test:
	   keine DB-Abfrage ohne IDs). Der Loader muss ihn deshalb nicht doppelt
	   abfangen — er darf ihn nur nicht in eine leere ID-Liste verdrehen. */
	it('reicht bei leerer Liste eine leere ID-Liste durch', async () => {
		resolvedRows = [[], [{ count: 0 }], [{ count: 0 }], []];

		const result = await runLoad(makeUrl());

		expect(findDuplicateCandidates).toHaveBeenCalledWith([]);
		expect(result.duplicatesBySighting).toEqual({});
	});

	/* Gleiche Konstruktion wie beim Duplikat-Hinweis: ein Aufruf für alle
	   gelisteten Sichtungen, das Ergebnis unverändert durchgereicht. Ohne diesen
	   Test bliebe die Verdrahtung aus `+page.server.ts` unbeobachtet — der Mock
	   oben würde eine gelöschte `findReporterHistory`-Aufrufstelle nicht
	   bemerken, weil `db.execute` im Select-Mock gar nicht existiert und der
	   Fail-open-Zweig im echten Modul den Fehler schluckt (Befund aus dem
	   Abschluss-Review). */
	it('ermittelt die Melder-Historie für alle gelisteten Sichtungen in einem Aufruf', async () => {
		findReporterHistory.mockResolvedValue({
			1: { approved: 3, rejected: 0, open: 0, since: '2019-03-04T08:00:00Z' }
		});

		const result = await runLoad(makeUrl());

		expect(findReporterHistory).toHaveBeenCalledTimes(1);
		expect(findReporterHistory).toHaveBeenCalledWith([
			{ id: 1, email: 'melder-eins@example.com', approvedAt: null, rejectedAt: null },
			{ id: 2, email: 'melder-zwei@example.com', approvedAt: null, rejectedAt: null }
		]);
		expect(result.reporterHistoryBySighting).toEqual({
			1: { approved: 3, rejected: 0, open: 0, since: '2019-03-04T08:00:00Z' }
		});
	});

	it('leitet Tabellen-URLs mit 301 nach /admin/sichtungen weiter (Query bleibt erhalten)', async () => {
		const fehler = await runLoad(makeUrl({ page: '2', verified: '0' })).then(
			() => null,
			(error: unknown) => error as { status?: number; location?: string }
		);

		expect(fehler).not.toBeNull();
		expect(fehler?.status).toBe(301);
		expect(fehler?.location).toBe('/admin/sichtungen?page=2&verified=0');
		// Der Redirect steht vor jeder Abfrage — sonst kostet jeder Bookmark-Aufruf
		// vier Queries für eine Antwort, die niemand liest.
		expect(recordedSelects).toHaveLength(0);
	});

	it('Default-Sortierung ist created absteigend (neueste zuerst)', async () => {
		const result = await runLoad(makeUrl());

		expect(result.order).toBe('desc');
		expect(recordedSelects[0]?.orderBySql).toMatch(/"created"/);
		expect(recordedSelects[0]?.orderBySql).toMatch(/\bdesc\b/i);
	});

	it('?order=asc dreht die Richtung, alles andere fällt auf desc zurück', async () => {
		const aufsteigend = await runLoad(makeUrl({ order: 'asc' }));
		expect(aufsteigend.order).toBe('asc');
		expect(recordedSelects[0]?.orderBySql).toMatch(/\basc\b/i);

		recordedSelects = [];
		const kaputt = await runLoad(makeUrl({ order: 'kaputt' }));
		expect(kaputt.order).toBe('desc');
		expect(recordedSelects[0]?.orderBySql).toMatch(/\bdesc\b/i);
	});

	it('sortiert mit id als Tiebreaker — sonst kann die Nachbar-Query eine Meldung überspringen', async () => {
		await runLoad(makeUrl());

		const liste = recordedSelects[0];
		expect(liste?.orderBySql).toMatch(/"created" desc/);
		expect(liste?.orderBySql).toMatch(/"id" desc/);
	});

	it('gruppiert Bilddateien nach Sichtungs-ID', async () => {
		resolvedRows = [
			[{ id: 1 }, { id: 2 }],
			[{ count: 7 }],
			[{ count: 3 }],
			[{ max: 2 }],
			[
				{ id: 10, sightingId: 1, filePath: 'a.jpg', originalName: 'A.jpg' },
				{ id: 11, sightingId: 1, filePath: 'b.jpg', originalName: 'B.jpg' },
				{ id: 12, sightingId: 2, filePath: 'c.jpg', originalName: 'C.jpg' }
			]
		];

		const result = await runLoad(makeUrl());

		expect(result.imagesBySighting[1]).toHaveLength(2);
		expect(result.imagesBySighting[2]).toHaveLength(1);
		expect(result.imagesBySighting[1]?.[0]).toEqual({
			id: 10,
			filePath: 'a.jpg',
			originalName: 'A.jpg'
		});
	});

	it('lässt Sichtungen ohne Datei einfach weg statt sie mit undefined zu belegen', async () => {
		// Die Vorschau-Abfrage liefert nur Zeilen zu Sichtungen mit Bild. Task 7
		// iteriert über `imagesBySighting[id] ?? []` — ein Schlüssel mit
		// `undefined`-Wert wäre unauffällig falsch, ein fehlender ist korrekt.
		const result = await runLoad(makeUrl());

		expect(result.imagesBySighting).toEqual({});
		expect(Object.keys(result.imagesBySighting)).toHaveLength(0);
	});

	it('liefert Gesamtzahl und Foto-Ankündigungs-Zähler aus getrennten Abfragen', async () => {
		const result = await runLoad(makeUrl());

		expect(result.openTotal).toBe(7);
		expect(result.pendingPhotoAnnouncements).toBe(3);
		expect(result.open).toHaveLength(2);
	});

	/**
	 * Der Hinweis steht auf einer **Arbeitsliste**, also über Meldungen, die
	 * noch zu tun sind. Übernommen war er aus dem alten Tabellen-Dashboard, wo
	 * er bewusst über den gesamten Bestand zählte — dort war das richtig, hier
	 * nicht: Auf der lokalen DB nannte er vier Meldungen, von denen zwei längst
	 * freigegeben waren. Erledigte Arbeit als offen auszuweisen ist genau die
	 * Sorte Zahl, die man nach dem dritten Mal ignoriert.
	 */
	it('zählt nur offene Meldungen als ausstehende Foto-Ankündigung', async () => {
		await runLoad(makeUrl());

		// Gegen `openOnly()` selbst geprüft und nicht gegen abgetippte
		// Spaltennamen: Ein Literal hier wäre ein zweites, stumm alterndes
		// Freigabe-Prädikat — genau das, was `approvalPredicateScan.test.ts`
		// im ganzen Quelltext verbietet.
		const fotoZaehler = recordedSelects[2]?.whereSql ?? '';
		expect(fotoZaehler).toContain('"aufnahmeHochladen"');
		expect(fotoZaehler).toContain(toSqlText(openOnly()));
	});

	it('begrenzt die Liste, der Zähler bleibt ungekappt', async () => {
		await runLoad(makeUrl());

		expect(recordedSelects[0]?.limit).toBeGreaterThan(0);
		expect(recordedSelects[1]?.limit).toBeUndefined();
	});

	/**
	 * `count(*)` ist bigint und kommt je nach Treiber als **String** zurück. Die
	 * Seite verglich damit lexikografisch (`"9" > "50"`) bzw. auf Identität
	 * (`"1" === 1` ist falsch → „1 Fotos ausstehend"). Der Loader-Vertrag sagt
	 * `number`, also normalisiert der Loader — nicht jede Aufrufstelle einzeln.
	 */
	it('liefert beide Zähler als Zahl, auch wenn der Treiber Strings liefert', async () => {
		resolvedRows = [[{ id: 1 }, { id: 2 }], [{ count: '50' }], [{ count: '1' }], []];

		const result = await runLoad(makeUrl());

		expect(result.openTotal).toBe(50);
		expect(typeof result.openTotal).toBe('number');
		expect(result.pendingPhotoAnnouncements).toBe(1);
		expect(typeof result.pendingPhotoAnnouncements).toBe('number');
	});

	/*
	 * Die Baseline für den Hinweis auf neue Meldungen darf **nicht** aus
	 * `data.open` stammen: Die Liste ist auf INBOX_LIMIT begrenzt und nach
	 * `order` sortiert. Bei `?order=asc` enthält sie die 50 ältesten offenen
	 * Meldungen — die höchste ID im Bestand fehlt darin, und der Hinweis ginge
	 * sofort nach jedem Laden an. Genau diesen stillen Fehler pinnt der Test:
	 * Die Liste liefert hier die IDs 1 und 2, der eigene Query die 42.
	 */
	it('meldet als maxOpenId die höchste offene ID im Bestand, nicht die der geladenen Seite', async () => {
		const data = await runLoad(makeUrl({ order: 'asc' }));

		expect(data.maxOpenId).toBe(42);
	});

	it('bildet maxOpenId ohne Limit über genau die offenen Sichtungen', async () => {
		await runLoad(makeUrl({ order: 'asc' }));

		const record = recordedSelects[3];
		expect(record?.limit).toBeUndefined();
		expect(record?.whereSql).toBe(toSqlText(openOnly()));
	});

	it('meldet maxOpenId als 0, wenn keine Sichtung offen ist', async () => {
		// max() über eine leere Menge ist NULL.
		resolvedRows[3] = [{ max: null }];

		const data = await runLoad(makeUrl());

		expect(data.maxOpenId).toBe(0);
	});
});
