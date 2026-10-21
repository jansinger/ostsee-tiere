/**
 * @fileoverview Datenschutz-Zusicherungen des Suchfilters der öffentlichen Karte.
 *
 * Gegenstück zum Block „Datenschutz - Suche über personenbezogene Felder" in
 * `src/routes/sichtungen/showreports.json/showreports.test.ts`. Beide öffentlichen
 * Flächen geben laut `docs/LEGACY_API_SPECIFICATION.md` („Deviation: consent-gated
 * search") dieselbe Teilmenge frei — bisher war jedoch nur die Legacy-Seite durch
 * einen Test festgeschrieben. Ohne diesen Test hier könnte die Karte die Gatung
 * verlieren, ohne dass eine Zusicherung bricht.
 *
 * Anders als `coordinateFilter.test.ts` läuft dieser Test gegen das **echte**
 * Drizzle: geprüft wird das erzeugte SQL, nicht eine Marker-Struktur.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const captured = vi.hoisted(() => ({ where: null as unknown }));

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn((condition: unknown) => {
					captured.where = condition;
					return { orderBy: vi.fn(() => Promise.resolve([])) };
				})
			}))
		}))
	}
}));

vi.mock('#lib/map/mapUtils.ts', () => ({
	sightingsToGeoJSON: vi.fn(() => ({ type: 'FeatureCollection', features: [] }))
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

import { GET } from './+server';

const dialect = new PgDialect();

/** Ruft den Endpunkt auf und rendert die erzeugte WHERE-Bedingung als SQL. */
async function queryFor(search?: string): Promise<{ text: string; params: unknown[] }> {
	const url = new URL('http://localhost/api/map/sightings');
	if (search !== undefined) url.searchParams.set('search', search);

	await GET({
		url,
		locals: { user: null },
		setHeaders: vi.fn()
	} as unknown as Parameters<typeof GET>[0]);

	if (!captured.where) {
		throw new Error('Keine WHERE-Bedingung erfasst — wurde die Query ausgeführt?');
	}
	const query = dialect.sqlToQuery(captured.where as SQL);
	return { text: query.sql, params: query.params };
}

describe('GET /api/map/sightings — Datenschutz der Suche', () => {
	beforeEach(() => {
		captured.where = null;
	});

	it('durchsucht Name und Schiffsname nur mit Einwilligung', async () => {
		const { text } = await queryFor('Private');

		// Die Felder werden durchsucht ...
		expect(text).toContain('"vorname"');
		expect(text).toContain('"name"');
		expect(text).toContain('"schiffsname"');
		// ... aber ausschließlich innerhalb des Consent-Gates.
		expect(text).toMatch(/"namensnennung"\s*=\s*1/);
		expect(text).toMatch(/"schiffnamensnennung"\s*=\s*1/);
	});

	it('durchsucht die E-Mail-Adresse nicht', async () => {
		const { text } = await queryFor('melder@example.com');

		expect(text).not.toContain('"email"');
	});

	it('durchsucht die nicht-personenbezogenen Felder ohne Gate', async () => {
		// Fahrwasser und Seezeichen sind keine personenbezogenen Daten und
		// bleiben für die Kartensuche frei durchsuchbar.
		const { text } = await queryFor('Förde');

		expect(text).toContain('"fahrwasser"');
		expect(text).toContain('"seezeichen"');
	});

	it('behandelt LIKE-Wildcards im Suchbegriff als Literale', async () => {
		const { text, params } = await queryFor('50%_x');

		expect(params).toContain('%50\\%\\_x%');
		expect(text).toContain('ESCAPE');
	});

	it('trimmt den Suchbegriff wie die Legacy-Route', async () => {
		const { params } = await queryFor('  Wal  ');

		expect(params).toContain('%Wal%');
	});

	it('sucht case-sensitiv (LIKE) — die Legacy-Route ist separat auf ILIKE festgelegt', async () => {
		const { text } = await queryFor('Wal');

		// Drizzle rendert den Operator groß. Beide Zusicherungen zusammen sind
		// nötig: `toContain('LIKE')` allein wäre auch bei ILIKE erfüllt.
		expect(text).not.toContain('ILIKE');
		expect(text).toContain('LIKE');
	});

	it('wendet bei einem Suchbegriff aus reinem Whitespace keinen Filter an', async () => {
		// Gleichlauf mit der Legacy-Route, die in diesem Fall gar nicht filtert.
		// Ohne den Gleichlauf entstünde `%%`, was jede Zeile ausschlösse, in der
		// alle durchsuchten Felder NULL sind (`NULL LIKE '%%'` ist NULL, nicht
		// wahr) — die Zusage "dieselbe Teilmenge" wäre damit verletzt.
		const { text } = await queryFor('   ');

		expect(text).not.toContain('"fahrwasser"');
		expect(text).not.toContain('"vorname"');
		expect(text).not.toContain('"namensnennung"');
	});

	it('erzeugt ohne search-Parameter keine Bedingung auf personenbezogene Felder', async () => {
		const { text } = await queryFor();

		expect(text).not.toContain('"vorname"');
		expect(text).not.toContain('"schiffsname"');
		expect(text).not.toContain('"namensnennung"');
	});
});
