import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BoatDriveEnum } from '#lib/report/formOptions/boatDrive.ts';
import { GET } from './+server';

/**
 * Keeps frozen legacy inbox files in sync with this route. When a label changes
 * here, `npm run generate:antworten` must run — otherwise the app and inbox
 * will serve different enum tables.
 */
async function routeResponse(routePath: string) {
	const response = await GET({
		url: new URL(`https://localhost${routePath}`),
		getClientAddress: () => '127.0.0.1',
		request: new Request(`https://localhost${routePath}`)
	} as never);
	return response.json();
}

async function frozenFile(filename: string) {
	const content = await readFile(path.resolve('legacy-inbox/data', filename), 'utf8');
	return JSON.parse(content);
}

describe('Frozen antworten.json', () => {
	it('should match the German route', async () => {
		expect(await frozenFile('antworten.de.json')).toEqual(
			await routeResponse('/rest_sichtungen/antworten.json')
		);
	});

	it('should match the English route', async () => {
		expect(await frozenFile('antworten.en.json')).toEqual(
			await routeResponse('/en/rest_sichtungen/antworten.json')
		);
	});
});

/**
 * PR 4 (Museum, 2026-08-04): `BoatDriveEnum` bekommt einen sechsten Wert
 * `MOTOR_OFF = 6` ("Motor aus"). Dieser Endpunkt baut `bootsantrieb` direkt aus
 * `BoatDriveEnum` (`+server.ts:152`) — ein neuer Enum-Wert erscheint dort also
 * automatisch als zusätzlicher Eintrag "6".
 *
 * Merke für künftige Enum-Erweiterungen: Ein neuer Wert macht auch die beiden
 * `toEqual`-Verträge oben ("Frozen antworten.json") rot, bis
 * `npm run generate:antworten` gelaufen ist und die Fixtures
 * (`legacy-inbox/data/antworten.de.json` / `.en.json`) mit committet wurden.
 * Die Fixtures werden nie von Hand editiert.
 */
describe('antworten.json — bootsantrieb "Motor aus" (PR 4)', () => {
	it('führt einen Eintrag "6" mit dem Label "Motor aus"', async () => {
		const response = await routeResponse('/rest_sichtungen/antworten.json');
		expect(response.bootsantrieb[String(BoatDriveEnum.MOTOR_OFF)]).toBe('Motor aus');
	});
});
