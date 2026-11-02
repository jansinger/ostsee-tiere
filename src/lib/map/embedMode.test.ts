import { describe, expect, it } from 'vitest';
import { standaloneMapHref } from './embedMode.ts';

describe('standaloneMapHref', () => {
	it('übernimmt Pfad und Filter der eingebetteten Karte', () => {
		expect(
			standaloneMapHref({
				origin: 'https://www.ostsee-tiere.de',
				pathname: '/map',
				search: '?year=2025&species=0'
			})
		).toBe('https://www.ostsee-tiere.de/map?year=2025&species=0');
	});

	it('behält ein Locale-Präfix im Pfad', () => {
		expect(
			standaloneMapHref({ origin: 'https://www.ostsee-tiere.de', pathname: '/en/map', search: '' })
		).toBe('https://www.ostsee-tiere.de/en/map');
	});

	// Der Hash ist ein Sprungziel innerhalb der eingebetteten Seite (Skip-Link
	// #map-skip-target). In einem neuen Fenster setzte er den Fokus hinter die
	// Karte — also genau an die Stelle, an der niemand ankommen will.
	it('lässt den Hash weg', () => {
		expect(
			standaloneMapHref({
				origin: 'https://www.ostsee-tiere.de',
				pathname: '/map',
				search: '?year=2025',
				hash: '#map-skip-target'
			})
		).toBe('https://www.ostsee-tiere.de/map?year=2025');
	});
});
