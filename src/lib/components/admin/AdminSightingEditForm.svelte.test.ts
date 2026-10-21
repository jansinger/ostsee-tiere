/**
 * @fileoverview Technik-Karte der Bearbeitungsmaske zeigt den abgeleiteten
 * Status (Task 8, Nachtrag).
 *
 * Die Maske zeigte hier bisher „Verifiziert: Ja/Nein" — eine Lesestelle von
 * `sighting.verified`, die Task 9 (Guard gegen genau diese Lesestelle) sonst
 * blockiert hätte — und separat „Freigegeben am …". Beides ersetzt eine
 * einzelne Statuszeile aus der gemeinsamen Quelle `sightingStatus.ts`, wie in
 * der Metazeile von `AdminSightingView.svelte`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AdminSightingEditForm from './AdminSightingEditForm.svelte';
import { SIGHTING_STATUS_PRESENTATION } from './sightingStatus';
import type { FrontendSighting } from '#lib/types/index.ts';

// `beforeNavigate` gibt es außerhalb des SvelteKit-Routers nicht — der Mock
// fängt die registrierte Rückrufe ab, damit der Test eine Navigation auslösen
// kann, ohne einen Router zu bauen.
const navigation = vi.hoisted(() => ({
	callbacks: [] as Array<(nav: { type: string; cancel: () => void }) => void>
}));

vi.mock('$app/navigation', () => ({
	beforeNavigate: (callback: (nav: { type: string; cancel: () => void }) => void) => {
		navigation.callbacks.push(callback);
	}
}));

/** Löst eine Navigation aus und meldet, ob der Guard sie abgebrochen hat. */
function navigiere(type = 'link'): { abgebrochen: boolean } {
	let abgebrochen = false;
	for (const callback of navigation.callbacks) {
		callback({ type, cancel: () => (abgebrochen = true) });
	}
	return { abgebrochen };
}

function baseSighting(overrides: Record<string, unknown> = {}): FrontendSighting {
	return {
		id: 1,
		species: 0,
		totalCount: 1,
		sightingDate: new Date('2026-07-30T10:00:00Z'),
		created: new Date('2026-07-30T09:00:00Z'),
		verified: false,
		approvedAt: null,
		rejectedAt: null,
		rejectedBy: null,
		uploadedFiles: [],
		...overrides
	} as unknown as FrontendSighting;
}

/**
 * Eine Sichtung, die der Browser abschicken lässt: Ohne Werte in
 * `waterway`, `sightingFrom`, `distance`, `entryChannel` und `boatDrive` hält
 * die HTML-Pflichtfeldprüfung das `submit`-Ereignis auf, und die Maske käme nie
 * bis zur Yup-Prüfung — der Test bestätigte dann nur die Browser-Sperre.
 * Die Yup-Fehler kommen hier aus den Feldern, die das Formular gar nicht
 * anzeigt (Referenz-ID, Kontaktdaten).
 */
function absendbareSichtung(overrides: Record<string, unknown> = {}): FrontendSighting {
	return baseSighting({
		waterway: 'Ostsee',
		sightingFrom: 1,
		distance: 1,
		entryChannel: 1,
		boatDrive: 1,
		...overrides
	});
}

/** Vollständig genug, damit `adminSightingSchema` die Werte durchlässt. */
function gueltigeSichtung(overrides: Record<string, unknown> = {}): FrontendSighting {
	return absendbareSichtung({
		referenceId: 'REF-1',
		firstName: 'Anna',
		lastName: 'Beispiel',
		email: 'anna@example.org',
		privacyConsent: true,
		...overrides
	});
}

describe('AdminSightingEditForm — Technik-Karte', () => {
	it('zeigt den abgeleiteten Status statt „Verifiziert" und keine Bedienelemente', async () => {
		await render(AdminSightingEditForm, {
			sighting: baseSighting(),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		expect(document.body.textContent).not.toContain('Verifiziert');
		await expect
			.element(page.getByText(SIGHTING_STATUS_PRESENTATION.open.label, { exact: true }))
			.toBeVisible();
		// Die Maske bearbeitet Sachdaten — der Status ändert sich in Tabelle
		// oder Detailansicht, nicht hier.
		expect(page.getByRole('radiogroup', { name: /status/i }).elements()).toHaveLength(0);
	});

	it('zeigt den Freigabe-Zeitpunkt bei freigegebenen Sichtungen', async () => {
		await render(AdminSightingEditForm, {
			sighting: baseSighting({ approvedAt: new Date('2026-03-12T09:00:00Z') }),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		await expect
			.element(page.getByText(SIGHTING_STATUS_PRESENTATION.approved.label, { exact: true }))
			.toBeVisible();
		expect(document.body.textContent).toContain('Freigegeben am');
	});

	it('nennt bei freigegebenen Sichtungen auch die freigebende Person', async () => {
		await render(AdminSightingEditForm, {
			sighting: baseSighting({
				approvedAt: new Date('2026-03-12T09:00:00Z'),
				approvedBy: 'bernd@example.org'
			}),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		expect(document.body.textContent).toContain('bernd@example.org');
	});

	it('zeigt Zeitpunkt und Bearbeiter bei abgelehnten Sichtungen', async () => {
		await render(AdminSightingEditForm, {
			sighting: baseSighting({
				rejectedAt: new Date('2026-03-12T09:00:00Z'),
				rejectedBy: 'anna@example.org'
			}),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		await expect
			.element(page.getByText(SIGHTING_STATUS_PRESENTATION.rejected.label, { exact: true }))
			.toBeVisible();
		expect(document.body.textContent).toContain('anna@example.org');
	});
});

/**
 * Ändert ein Feld der Maske so, wie es ein Mensch täte.
 *
 * `fill` allein genügt nicht: Die Feld-Pipeline hängt an `onchange`, und der
 * Helfer löst nur `input` aus — der Formular-Store bliebe unberührt und die
 * Maske gälte fälschlich als unverändert.
 */
async function aendereAnzahl(wert: string): Promise<void> {
	const feld = document.querySelector('[data-field="totalCount"] input');
	expect(feld).not.toBeNull();
	await page.elementLocator(feld as HTMLElement).fill(wert);
	feld?.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('AdminSightingEditForm — Speichern-Knopf', () => {
	it('bleibt bei Validierungsfehlern bedienbar und verweist auf die Fehlerliste', async () => {
		await render(AdminSightingEditForm, {
			sighting: absendbareSichtung(),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		const speichern = page.getByRole('button', { name: 'Speichern' });
		await speichern.click();

		const knopf = speichern.element() as HTMLButtonElement;
		await vi.waitFor(() => {
			// Hart gesperrt bleibt einzig der laufende Submit — der ist hier vorbei.
			expect(knopf.disabled).toBe(false);
			expect(knopf.getAttribute('aria-disabled')).toBeNull();

			const beschreibung = knopf.getAttribute('aria-describedby');
			expect(beschreibung).toBeTruthy();
			const fehlerliste = document.getElementById(beschreibung as string);
			expect(fehlerliste?.textContent).toContain('Eingabefehler gefunden');
		});
	});

	it('fokussiert die Fehlerliste, statt still auszusteigen', async () => {
		await render(AdminSightingEditForm, {
			sighting: absendbareSichtung(),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		await page.getByRole('button', { name: 'Speichern' }).click();

		await vi.waitFor(() => {
			const aktiv = document.activeElement as HTMLElement | null;
			expect(aktiv?.textContent).toContain('Eingabefehler gefunden');
			expect(aktiv?.getAttribute('tabindex')).toBe('-1');
		});
	});

	it('reißt den Fokus beim Korrigieren eines Feldes nicht zurück zur Fehlerliste', async () => {
		await render(AdminSightingEditForm, {
			sighting: absendbareSichtung(),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		await page.getByRole('button', { name: 'Speichern' }).click();
		await vi.waitFor(() => {
			expect((document.activeElement as HTMLElement | null)?.textContent).toContain(
				'Eingabefehler gefunden'
			);
		});

		/* Der Nutzer korrigiert ein Feld: `updateField` räumt dessen Eintrag aus
		   dem errors-Store, die Liste bleibt wegen der übrigen Fehler stehen.
		   Der Fokus muss im gerade bearbeiteten Feld bleiben — ein Rücksprung
		   zur Liste risse die Korrektur mitten in der Eingabe ab. */
		await aendereAnzahl('7');
		await new Promise((r) => setTimeout(r, 80));
		expect((document.activeElement as HTMLElement | null)?.textContent ?? '').not.toContain(
			'Eingabefehler gefunden'
		);
	});

	it('verweist ohne Fehlerliste auf nichts', async () => {
		await render(AdminSightingEditForm, {
			sighting: baseSighting(),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		const knopf = page.getByRole('button', { name: 'Speichern' }).element() as HTMLButtonElement;
		// Ein `aria-describedby` ins Leere meldet niemand — es darf erst
		// entstehen, wenn die Fläche im DOM steht.
		expect(knopf.getAttribute('aria-describedby')).toBeNull();
		expect(knopf.disabled).toBe(false);
	});
});

describe('AdminSightingEditForm — Schutz vor ungespeicherten Änderungen', () => {
	let bestaetigung: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		navigation.callbacks.length = 0;
		bestaetigung = vi.spyOn(window, 'confirm').mockReturnValue(true);
	});

	afterEach(async () => {
		bestaetigung.mockRestore();
		vi.restoreAllMocks();
	});

	it('lässt eine Navigation ohne Änderungen unbehelligt durch', async () => {
		await render(AdminSightingEditForm, {
			sighting: baseSighting(),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		expect(navigiere().abgebrochen).toBe(false);
		expect(bestaetigung).not.toHaveBeenCalled();
	});

	it('fragt vor dem Wegnavigieren mit Änderungen nach', async () => {
		await render(AdminSightingEditForm, {
			sighting: baseSighting(),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		await aendereAnzahl('7');

		expect(navigiere().abgebrochen).toBe(false);
		expect(bestaetigung).toHaveBeenCalledOnce();
	});

	it('bricht die Navigation ab, wenn die Rückfrage verneint wird', async () => {
		bestaetigung.mockReturnValue(false);
		await render(AdminSightingEditForm, {
			sighting: baseSighting(),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		await aendereAnzahl('7');

		expect(navigiere().abgebrochen).toBe(true);
	});

	it('hält einen harten Reload auf, ohne einen eigenen Dialog zu zeigen', async () => {
		await render(AdminSightingEditForm, {
			sighting: baseSighting(),
			onSave: vi.fn(),
			onCancel: vi.fn()
		});

		await aendereAnzahl('7');

		// Beim Verlassen der Seite gehört der Dialog dem Browser — ein `confirm()`
		// zeigt in diesem Fenster kein Browser mehr an.
		expect(navigiere('leave').abgebrochen).toBe(true);
		expect(bestaetigung).not.toHaveBeenCalled();
	});

	it('fragt nach erfolgreichem Speichern nicht mehr nach', async () => {
		const gespeichert = { ...gueltigeSichtung(), totalCount: 7 };
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			if (String(input).startsWith('/api/sightings/')) {
				return new Response(JSON.stringify(gespeichert), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			}
			return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
		});
		const onSave = vi.fn();
		await render(AdminSightingEditForm, {
			sighting: gueltigeSichtung(),
			onSave,
			onCancel: vi.fn()
		});

		await aendereAnzahl('7');
		await page.getByRole('button', { name: 'Speichern' }).click();
		await vi.waitFor(() => expect(onSave).toHaveBeenCalled());

		// Der Aufrufer navigiert in `onSave` — was jetzt noch abgefragt würde,
		// wäre eine Rückfrage nach bereits gespeicherten Daten.
		expect(navigiere().abgebrochen).toBe(false);
		expect(bestaetigung).not.toHaveBeenCalled();
	});
});
