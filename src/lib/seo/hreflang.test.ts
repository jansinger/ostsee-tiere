/**
 * @fileoverview Aufgabe 2.5 — hreflang-Alternates und og:locale je Route.
 *
 * `buildHreflangLinks` teilt sich `localizeHref` mit `LanguageSwitcher.svelte`
 * (`#lib/paraglide/runtime.js`), damit Sprachumschalter und der
 * Suchmaschinen-Hinweis nie auseinanderlaufen — dieselbe Quelle, zwei
 * Verbraucher.
 */
import { describe, expect, it } from 'vitest';
import { buildHreflangLinks, ogLocale, ogLocaleAlternates } from './hreflang';

describe('buildHreflangLinks', () => {
	it('liefert eine absolute URL je unterstützter Locale plus x-default auf Deutsch', () => {
		const links = buildHreflangLinks('https://ostsee-tiere.example.com', '/about');

		expect(links).toEqual([
			{ hreflang: 'de', href: 'https://ostsee-tiere.example.com/about' },
			{ hreflang: 'en', href: 'https://ostsee-tiere.example.com/en/about' },
			{ hreflang: 'x-default', href: 'https://ostsee-tiere.example.com/about' }
		]);
	});

	it('behält Query-Parameter beim Lokalisieren (Kampagnen-Marker aus Museums-Links)', () => {
		const links = buildHreflangLinks('https://ostsee-tiere.example.com', '/?art=schweinswal');

		expect(links.find((link) => link.hreflang === 'en')?.href).toBe(
			'https://ostsee-tiere.example.com/en/?art=schweinswal'
		);
	});

	it('funktioniert unabhängig davon, ob der übergebene Pfad bereits ein /en-Präfix trägt', () => {
		const links = buildHreflangLinks('https://ostsee-tiere.example.com', '/en/map');

		expect(links).toEqual([
			{ hreflang: 'de', href: 'https://ostsee-tiere.example.com/map' },
			{ hreflang: 'en', href: 'https://ostsee-tiere.example.com/en/map' },
			{ hreflang: 'x-default', href: 'https://ostsee-tiere.example.com/map' }
		]);
	});
});

describe('ogLocale / ogLocaleAlternates', () => {
	it('bildet de auf de_DE und en auf en_GB ab — en-GB, wie in Aufgabe 2.1 entschieden', () => {
		expect(ogLocale('de')).toBe('de_DE');
		expect(ogLocale('en')).toBe('en_GB');
	});

	it('nennt je Locale genau die jeweils andere als Alternative', () => {
		expect(ogLocaleAlternates('de')).toEqual(['en_GB']);
		expect(ogLocaleAlternates('en')).toEqual(['de_DE']);
	});
});
