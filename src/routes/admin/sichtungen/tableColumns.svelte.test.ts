import { render } from 'vitest-browser-svelte';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { SightingSelect } from '#lib/server/db/schema.ts';
import type { PageData } from './$types';
import { COLUMN_PREFERENCES_STORAGE_KEY } from './columnPreferences';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll: vi.fn(() => Promise.resolve())
}));
vi.mock('$app/state', () => ({
	page: { url: new URL('https://localhost:4000/admin/sichtungen') }
}));
vi.mock('#lib/components/admin/sightingVerdict.ts', () => ({
	submitVerdict: vi.fn(() => Promise.resolve(true))
}));

const SichtungenSeite = (await import('./+page.svelte')).default;

function sichtung(overrides: Partial<SightingSelect>): SightingSelect {
	return {
		id: 1,
		created: new Date('2026-08-01T10:00:00Z'),
		sightingDate: new Date('2026-07-30T08:00:00Z'),
		species: 0,
		totalCount: 1,
		juvenileCount: 0,
		isDead: 0,
		verified: 0,
		approvedAt: null,
		rejectedAt: null,
		inBalticSea: 1,
		inBalticSeaGeo: 1,
		...overrides
	} as unknown as SightingSelect;
}

/* Wie in `statusColumn.svelte.test.ts`: die Seite liest `data.pagination.*` und
   stürzt ohne das Objekt schon an der Seitenzahl-Auswahl ab. */
function daten(rows: SightingSelect[]): PageData {
	return {
		sightings: rows,
		/* Die Statusreiter über der Tabelle lesen diese Zahlen; ohne sie liefe
		   die Seite hier gar nicht erst durch. */
		statusCounts: { all: rows.length, open: rows.length, approved: 0, rejected: 0 },
		pagination: { page: 1, perPage: 20, total: rows.length, totalPages: 1, maxPerPage: 100 }
	} as unknown as PageData;
}

function kopfzeilen(container: HTMLElement): string[] {
	return [...container.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
}

/* Die Client-Testumgebung lädt kein `app.css` — die Theme-Tokens existieren dort
   also nicht, und `var(--color-base-100)` fiele auf „transparent" zurück. Die
   Sticky-Zellen sind aber genau dann kaputt, wenn ihr Hintergrund durchsichtig
   ist. Deshalb werden die beiden Tokens hier gesetzt: dann misst der Test die
   tatsächlich gewählte Fläche statt nur die Existenz einer Deklaration. */
const BASE_100 = 'rgb(255, 255, 255)';
const BASE_200 = 'rgb(240, 240, 240)';

describe('Sichtungstabelle — Spalten', () => {
	beforeEach(async () => {
		document.documentElement.style.setProperty('--color-base-100', BASE_100);
		document.documentElement.style.setProperty('--color-base-200', BASE_200);
		// Ohne das hier: Der Round-Trip-Test unten schreibt eine geänderte
		// Spaltenauswahl in denselben `localStorage` (jsdom teilt ihn über alle
		// Tests der Datei), und ein davor oder danach laufender Test bekäme sie
		// ungefragt untergeschoben.
		window.localStorage.clear();
	});

	afterEach(async () => {
		document.documentElement.style.removeProperty('--color-base-100');
		document.documentElement.style.removeProperty('--color-base-200');
		/* Die URL im `$app/state`-Mock ist ein gemeinsames Objekt: Ein Test, der
		   sie für seinen Fall umsetzt, dürfte sie den übrigen nicht dauerhaft
		   unterschieben — der Sortier-Test daneben lebt gerade davon, dass keine
		   Parameter darin stehen. */
		const { page: appState } = await import('$app/state');
		// Cast: SvelteKit typisiert `page.url.pathname` als Union aller Routen —
		// eine frisch gebaute URL kennt diese Verengung nicht.
		appState.url = new URL('https://localhost:4000/admin/sichtungen') as typeof appState.url;
		vi.mocked((await import('$app/navigation')).goto).mockClear();
	});

	it('zeigt E-Mail, Entfernung und Verteilung per Default nicht', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({})]) });

		const kopf = kopfzeilen(screen.container);
		expect(kopf).not.toContain('E-Mail');
		expect(kopf).not.toContain('Entfernung');
		expect(kopf).not.toContain('Verteilung');
	});

	it('behält Status und Aktionen in der Default-Auswahl', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({})]) });

		const kopf = kopfzeilen(screen.container);
		expect(kopf).toContain('Status');
		expect(kopf).toContain('Aktionen');
	});

	it('friert Status und Aktionen am rechten Rand fest', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({})]) });

		const zellen = [...screen.container.querySelectorAll('tbody tr td')];
		const aktionen = zellen.at(-1) as HTMLElement;
		const status = zellen.at(-2) as HTMLElement;

		expect(getComputedStyle(aktionen).position).toBe('sticky');
		expect(getComputedStyle(aktionen).right).toBe('0px');

		// Die Statusspalte rastet links neben den Aktionen ein, nicht darunter.
		expect(getComputedStyle(status).position).toBe('sticky');
		expect(parseFloat(getComputedStyle(status).right)).toBeCloseTo(aktionen.offsetWidth, 0);
	});

	it('gibt den fixierten Zellen einen opaken Hintergrund, der Zebra mitmacht', async () => {
		const screen = await render(SichtungenSeite, {
			data: daten([sichtung({ id: 1 }), sichtung({ id: 2 })])
		});

		const zellen = [...screen.container.querySelectorAll('tbody tr td:last-child')];
		const ersteAktionen = zellen.at(0) as HTMLElement;
		const zweiteAktionen = zellen.at(1) as HTMLElement;

		expect(getComputedStyle(ersteAktionen).backgroundColor).toBe(BASE_100);
		// `table-zebra` färbt das <tr>, nicht die Zelle — ohne eigene Regel bliebe
		// die fixierte Zelle hier durchsichtig und der Inhalt liefe darunter durch.
		expect(getComputedStyle(zweiteAktionen).backgroundColor).toBe(BASE_200);
	});

	it('sagt am Screenreader, was der Gedankenstrich der Spam-Spalte bedeutet', async () => {
		// Die Zelle einer nie bewerteten Sichtung zeigt nur „—". Die Erklärung
		// hing allein am `title`, und das ist an einem nicht fokussierbaren
		// `span` für assistive Technik nicht verlässlich erreichbar.
		const screen = await render(SichtungenSeite, { data: daten([sichtung({ spamScore: null })]) });

		const zeile = screen.container.querySelector('tbody tr') as HTMLElement;
		expect(zeile.textContent).toContain('Nicht bewertet');
		const strich = [...zeile.querySelectorAll('[aria-hidden="true"]')].find(
			(el) => el.textContent?.trim() === '—'
		);
		expect(strich, 'der Gedankenstrich selbst wird nicht mit vorgelesen').toBeTruthy();
	});

	it('zeigt schon beim ersten Aufruf, wonach sortiert ist', async () => {
		// Die gemockte URL trägt keine Query-Parameter — genau der erste Aufruf.
		// Der Loader sortiert dann nach Sichtungsdatum absteigend; vorher stand
		// an keinem Kopf ein Pfeil.
		const screen = await render(SichtungenSeite, { data: daten([sichtung({})]) });

		const aktiv = [...screen.container.querySelectorAll('thead th')].filter(
			(th) => th.getAttribute('aria-sort') !== 'none' && th.getAttribute('aria-sort') !== null
		);

		expect(aktiv).toHaveLength(1);
		const kopf = aktiv[0] as HTMLElement;
		expect(kopf.textContent).toContain('Sichtungsdatum');
		expect(kopf.getAttribute('aria-sort')).toBe('descending');
		// Die Richtung darf nicht allein am Pfeilzeichen hängen (WCAG 1.4.1).
		expect(kopf.querySelector('button')?.getAttribute('aria-label')).toContain('absteigend');
	});

	it('zeigt an inaktiven sortierbaren Köpfen ein dezentes Sortier-Icon, an nicht sortierbaren keins', async () => {
		// Default-Sortierung ist Sichtungsdatum absteigend — Meldedatum ist damit
		// ein sortierbarer, aber inaktiver Kopf; Aufnahme ist gar nicht sortierbar.
		const screen = await render(SichtungenSeite, { data: daten([sichtung({})]) });

		const köpfe = [...screen.container.querySelectorAll('thead th')];
		const meldedatum = köpfe.find((th) => th.textContent?.includes('Meldedatum')) as HTMLElement;
		const aufnahme = köpfe.find((th) => th.textContent?.trim() === 'Aufnahme') as HTMLElement;

		expect(meldedatum.getAttribute('aria-sort')).toBe('none');
		expect(
			meldedatum.querySelector('svg[aria-hidden="true"]'),
			'inaktiver sortierbarer Kopf zeigt das Affordance-Icon'
		).toBeTruthy();

		expect(aufnahme.querySelector('button'), 'Aufnahme ist nicht sortierbar').toBeFalsy();
		expect(
			aufnahme.querySelector('svg'),
			'nicht sortierbarer Kopf bekommt kein Sortier-Icon'
		).toBeFalsy();
	});

	it('zentriert die Auswahl-Checkbox in ihrer Zelle', async () => {
		// `app.css` setzt für jedes `label:has(> .checkbox)` ungelayert
		// `align-items: flex-start` — richtig für mehrzeilige Feld-Labels, in
		// einer Tabellenzeile hängt die Checkbox damit oben. Ein `items-center`
		// als Utility verliert dagegen.
		const screen = await render(SichtungenSeite, { data: daten([sichtung({})]) });

		const label = screen.container.querySelector('tbody tr td label') as HTMLElement;
		expect(getComputedStyle(label).alignItems).toBe('center');
	});

	it('springt beim Umsortieren zurück auf Seite 1', async () => {
		// Sortierung und Seitenzahl gehören nicht zusammen: Wer auf Seite 7
		// umsortiert, sah bisher die Mitte der neuen Reihenfolge — eine Stelle,
		// die mit dem, was er gerade gesucht hat, nichts zu tun hat.
		const { page: appState } = await import('$app/state');
		const { goto } = await import('$app/navigation');
		appState.url = new URL(
			'https://localhost:4000/admin/sichtungen?page=7&perPage=20'
		) as typeof appState.url;

		const screen = await render(SichtungenSeite, { data: daten([sichtung({})]) });
		const tierart = [...screen.container.querySelectorAll('thead th button')].find((b) =>
			b.textContent?.includes('Tierart')
		) as HTMLButtonElement;
		tierart.click();

		const ziel = new URL(vi.mocked(goto).mock.calls.at(-1)?.[0] as URL);
		expect(ziel.searchParams.get('sort')).toBe('species');
		expect(ziel.searchParams.has('page'), 'die Seitenzahl fällt weg').toBe(false);
		// `perPage` ist eine Einstellung, keine Position — die bleibt.
		expect(ziel.searchParams.get('perPage')).toBe('20');
	});

	it('verspricht an nicht sortierbaren Spaltenköpfen keine Klickbarkeit', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({})]) });

		const nichtSortierbar = [...screen.container.querySelectorAll('thead th')].filter(
			(th) => !th.querySelector('button')
		);

		expect(nichtSortierbar.length).toBeGreaterThan(0);
		for (const th of nichtSortierbar) {
			expect([...th.classList]).not.toContain('hover:bg-base-300');
		}
	});

	it('lässt localStorage unangetastet, solange niemand die Spaltenauswahl ändert', async () => {
		// Fix-Runde-2-Regression: Die Effekt-Aufspaltung setzte
		// `hatGespeicherteSpaltenGeladen` synchron im Lade-Effekt, bevor der
		// Speicher-Effekt zum ersten Mal lief — dessen erster Durchlauf schrieb
		// dadurch den (unveränderten) Default sofort zurück. Jeder Seitenaufruf
		// seedete damit `localStorage`, nicht nur der einer Person, die die
		// Spaltenauswahl tatsächlich ändert.
		await render(SichtungenSeite, { data: daten([sichtung({})]) });

		expect(window.localStorage.getItem(COLUMN_PREFERENCES_STORAGE_KEY)).toBeNull();
	});

	/* WP7-Bugfix-Regression: Begründung der Effekt-Aufspaltung steht in
	   `+page.svelte` beim Speicher-Effekt. Der mittlere Schritt unten —
	   `localStorage` nach einer Checkbox-Änderung — reproduziert genau den
	   Bug, den die Aufspaltung behoben hat; gegen die unaufgespaltene Fassung
	   schlägt er fehl (siehe Fix-Report). */
	it('speichert die Spaltenauswahl bei jeder Änderung und setzt sie per Reset-Button zurück', async () => {
		const screen = await render(SichtungenSeite, { data: daten([sichtung({})]) });

		const resetButton = [...screen.container.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Standard wiederherstellen'
		) as HTMLButtonElement;
		expect(resetButton, 'Reset-Button existiert').toBeTruthy();
		expect(resetButton.disabled, 'Ruhezustand entspricht dem Default').toBe(true);

		const sichtungsdatumCheckbox = [...screen.container.querySelectorAll('label')]
			.find((label) => label.textContent?.includes('Sichtungsdatum'))
			?.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(sichtungsdatumCheckbox, 'Checkbox „Sichtungsdatum" existiert').toBeTruthy();
		expect(sichtungsdatumCheckbox.checked, 'Spalte ist per Default sichtbar').toBe(true);

		sichtungsdatumCheckbox.click();

		// Reproduziert den Bug: Vor der Effekt-Aufspaltung blieb `localStorage`
		// hier dauerhaft leer, weil der Speicher-Effekt nie eine Abhängigkeit
		// auf `columnVisibility` trackte.
		await vi.waitFor(() => expect(resetButton.disabled).toBe(false));
		await vi.waitFor(() => {
			const gespeichert = window.localStorage.getItem(COLUMN_PREFERENCES_STORAGE_KEY);
			expect(gespeichert).toBeTruthy();
			expect(JSON.parse(gespeichert as string).columns.sightingDate).toBe(false);
		});

		resetButton.click();

		await vi.waitFor(() => expect(resetButton.disabled).toBe(true));
		await vi.waitFor(() => {
			const gespeichert = window.localStorage.getItem(COLUMN_PREFERENCES_STORAGE_KEY);
			expect(JSON.parse(gespeichert as string).columns.sightingDate).toBe(true);
		});
		expect(sichtungsdatumCheckbox.checked, 'Checkbox folgt dem Reset').toBe(true);
	});
});
