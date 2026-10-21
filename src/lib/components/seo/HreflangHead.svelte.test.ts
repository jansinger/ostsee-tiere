/**
 * @fileoverview Aufgabe 2.5 — die Komponente rendert `<link rel="alternate">`
 * und `og:locale` in `document.head`, für beide Sprachen positiv geprüft
 * (Muster aus `localeSwitchProof.test.ts`: nicht nur „es gibt einen Link",
 * sondern „unter de zeigt hreflang=en auf /en/…, unter en zeigt hreflang=de
 * zurück auf die deutsche Fassung").
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import HreflangHead from './HreflangHead.svelte';

function hreflangLink(hreflang: string): HTMLLinkElement | null {
	return document.head.querySelector(`link[rel="alternate"][hreflang="${hreflang}"]`);
}

function ogLocaleMeta(): string | null {
	return document.head.querySelector('meta[property="og:locale"]')?.getAttribute('content') ?? null;
}

function ogLocaleAlternateMetas(): string[] {
	return Array.from(document.head.querySelectorAll('meta[property="og:locale:alternate"]')).map(
		(el) => el.getAttribute('content') ?? ''
	);
}

describe('HreflangHead', () => {
	afterEach(async () => {
		const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => baseLocale);
	});

	const props = {
		origin: 'https://ostsee-tiere.example.com',
		pathAndQuery: '/about'
	};

	it('unter de: hreflang=de zeigt auf die aktuelle Seite, hreflang=en auf die /en-Fassung, x-default auf Deutsch', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'de');

		await render(HreflangHead, props);

		expect(hreflangLink('de')?.href).toBe('https://ostsee-tiere.example.com/about');
		expect(hreflangLink('en')?.href).toBe('https://ostsee-tiere.example.com/en/about');
		expect(hreflangLink('x-default')?.href).toBe('https://ostsee-tiere.example.com/about');
	});

	it('unter de: og:locale ist de_DE, og:locale:alternate ist en_GB', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'de');

		await render(HreflangHead, props);

		expect(ogLocaleMeta()).toBe('de_DE');
		expect(ogLocaleAlternateMetas()).toEqual(['en_GB']);
	});

	it('unter en: og:locale ist en_GB, og:locale:alternate ist de_DE', async () => {
		const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
		overwriteGetLocale(() => 'en');

		await render(HreflangHead, props);

		expect(ogLocaleMeta()).toBe('en_GB');
		expect(ogLocaleAlternateMetas()).toEqual(['de_DE']);
	});
});
