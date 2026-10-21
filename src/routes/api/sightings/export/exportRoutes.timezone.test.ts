/**
 * Naht-Tests: Die Export-Routen müssen die getesteten Berlin-Exporter aus
 * `#lib/server/export/*` benutzen — nicht eigene Inline-Implementierungen, die
 * rohe `Date`-Objekte bzw. UTC-ISO-Strings ausgeben.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('#lib/server/auth/auth.ts', () => ({ requireUserRole: vi.fn() }));

vi.mock('#lib/server/audit/auditService.ts', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const { mockOrderBy } = vi.hoisted(() => ({ mockOrderBy: vi.fn() }));

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({ orderBy: mockOrderBy }),
				orderBy: mockOrderBy
			})
		})
	}
}));

vi.mock('#lib/server/db/schema.ts', () => ({
	sightings: {
		id: 'id',
		sightingDate: 'sightingDate',
		latitude: 'latitude',
		longitude: 'longitude',
		verified: 'verified',
		entryChannel: 'entryChannel',
		mediaUpload: 'mediaUpload'
	}
}));

import { GET as csvGET } from './csv/+server';
import { GET as jsonGET } from './json/+server';
import { GET as kmlGET } from './kml/+server';
import { GET as xmlGET } from './xml/+server';
import { generateCsvData } from '#lib/server/export/csvExport.ts';
import { generateKmlData } from '#lib/server/export/kmlExport.ts';
import { generateXmlData } from '#lib/server/export/xmlExport.ts';
import type { FrontendSighting } from '#lib/types/index.ts';

/** 15.06.2024 18:30 UTC = 20:30 Berlin (MESZ). */
const SIGHTING_ROW = {
	id: 4711,
	referenceId: 'REF-001',
	sightingDate: new Date('2024-06-15T18:30:00.000Z'),
	created: new Date('2024-06-15T19:00:00.000Z'),
	species: 0,
	totalCount: 2,
	juvenileCount: 0,
	distribution: 0,
	distance: 0,
	sightingFrom: 0,
	boatDrive: 0,
	seaState: 0,
	visibility: 0,
	behavior: 0,
	latitude: '54.500000',
	longitude: '13.500000',
	location: null,
	isDead: 0,
	waterway: 'Kadetrinne',
	seaMark: null,
	windDirection: 'NW',
	windForce: 3,
	shipName: 'Seestern',
	shipNameConsent: 1,
	homePort: 'Sassnitz',
	boatType: 'Segelboot',
	shipCount: 1,
	mediaUpload: 0,
	firstName: 'Max',
	lastName: 'Muster',
	nameConsent: 1,
	email: 'max@example.com',
	phone: null,
	fax: null,
	street: null,
	zipCode: null,
	city: 'Rostock',
	notes: null,
	otherObservations: null,
	inBalticSeaGeo: true,
	verified: 1,
	entryChannel: 0
};

/** Dieselbe Zeile als FrontendSighting — Referenzwert für den Vergleich mit den Exportern. */
const SIGHTING = SIGHTING_ROW as unknown as FrontendSighting;

function event(path: string) {
	return {
		url: new URL(`http://localhost${path}`),
		locals: { user: { email: 'admin@test.com', roles: ['admin'] } }
	} as never;
}

describe('Export-Routen benutzen die Berlin-Exporter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockOrderBy.mockResolvedValue([SIGHTING_ROW]);
	});

	it('CSV: Ausgabe entspricht generateCsvData und zeigt Berliner Ortszeit', async () => {
		const res = await csvGET(event('/api/sightings/export/csv'));
		const body = await res.text();

		expect(body).toBe(generateCsvData([SIGHTING]));
		expect(body).toContain('"15.06.2024";"20:30"');
		expect(body).not.toContain('GMT');
		expect(res.headers.get('content-type')).toContain('text/csv');
		expect(res.headers.get('content-disposition')).toContain('sichtungen-export.csv');
	});

	it('KML: Ausgabe entspricht generateKmlData und zeigt Berliner Ortszeit', async () => {
		const res = await kmlGET(event('/api/sightings/export/kml'));
		const body = await res.text();

		expect(body).toBe(generateKmlData([SIGHTING]));
		expect(body).toContain('15.06.24 20:30');
		expect(body).not.toContain('GMT');
		expect(res.headers.get('content-type')).toContain('vnd.google-earth.kml+xml');
		expect(res.headers.get('content-disposition')).toContain('sichtungen-export.kml');
	});

	it('XML: Ausgabe entspricht generateXmlData und zeigt Berliner Ortszeit', async () => {
		const res = await xmlGET(event('/api/sightings/export/xml'));
		const body = await res.text();

		expect(body).toBe(generateXmlData([SIGHTING]));
		expect(body).toContain('<datum>15.06.24</datum>');
		expect(body).toContain('<uhrzeit>2030</uhrzeit>');
		expect(res.headers.get('content-type')).toContain('application/xml');
		expect(res.headers.get('content-disposition')).toContain('sichtungen-export.xml');
	});

	it('JSON bleibt bewusst maschinenlesbares UTC-ISO', async () => {
		const res = await jsonGET(event('/api/sightings/export/json'));
		const body = JSON.parse(await res.text());

		expect(body.sichtungen[0].sightingDate).toBe('2024-06-15T18:30:00.000Z');
	});
});
