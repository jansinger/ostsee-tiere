import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { ReportKind } from '#lib/report/reportKind.ts';
import ReportKindChoice from './ReportKindChoice.svelte';

/**
 * Die Einstiegsseite fragt eine Weiche ab, kein Formularfeld: Jede der beiden
 * Antworten führt sofort woanders hin und hat eine eigene URL (`?meldung=…`).
 * Sie ist deshalb seit dem UX-Review (2026-08-07) keine Radiogruppe mit
 * „Weiter" mehr, sondern zwei Links — genau eine Aktion pro Karte.
 *
 * Warum das die richtige Form ist und die alte nicht:
 *
 * - **Radios dürfen nicht selbst auslösen** (WCAG 3.2.2, „On Input"): Wer per
 *   Pfeiltaste durch eine Radiogruppe geht, wählt zwangsläufig die erste Option
 *   aus. Eine anklickbare Radio-Karte mit Auto-Submit wäre also kein
 *   Fortschritt, sondern ein Anti-Pattern — die Auswahl-Semantik musste ganz
 *   weichen, nicht nur der Knopf.
 * - **Der Zustand „nichts gewählt" verschwindet strukturell.** Der frühere
 *   Fehler-Apparat (`selectionMissing`, `aria-invalid` an der Gruppe, Fokus-
 *   Sprung zum ersten Radio) existierte nur, weil „Weiter" ohne Auswahl
 *   drückbar war. Zwei direkte Links machen diesen Zustand unmöglich.
 * - **Der JS-lose Pfad wird trivial.** Er hängt nicht mehr an einem nativen
 *   GET-Submit, der die übrigen Query-Parameter ersetzt hätte (der bewusst in
 *   Kauf genommene Verlust von Kampagnen-Markern aus einem Museums-Link), und
 *   auch nicht mehr an einem stummen Reload auf `/?`, wenn nichts gewählt war.
 *   Der `href` trägt das Ziel; ohne JS navigiert der Browser einfach dorthin.
 */
describe('ReportKindChoice', () => {
	it('bietet beide Zweige als Links an, lebendes Tier zuerst', async () => {
		const screen = await render(ReportKindChoice, { onchoose: vi.fn() });

		const testids = Array.from(
			document.querySelectorAll<HTMLAnchorElement>('a[data-testid^="report-kind-option-"]')
		).map((link) => link.getAttribute('data-testid'));
		expect(testids).toEqual(['report-kind-option-lebend', 'report-kind-option-totfund']);

		await expect
			.element(screen.getByRole('link', { name: /lebenden Tieres/i }))
			.toBeInTheDocument();
		await expect.element(screen.getByRole('link', { name: /toten Tieres/i })).toBeInTheDocument();
	});

	it('trägt den Hinweistext im Namen des Links, nicht nur daneben', async () => {
		// Der Hinweis ist die eigentliche Unterscheidungshilfe („Sie haben ein
		// totes Tier gefunden, meist an einem Strand"). Stünde er außerhalb des
		// Links, hörte ein Screenreader-Nutzer beim Durchgehen der Links nur die
		// beiden ähnlich klingenden Überschriften.
		const screen = await render(ReportKindChoice, { onchoose: vi.fn() });

		await expect
			.element(screen.getByRole('link', { name: /totes Tier gefunden/i }))
			.toBeInTheDocument();
	});

	it('meldet den Zweig beim Klick und lässt den Browser nicht navigieren', async () => {
		const onchoose = vi.fn();
		await render(ReportKindChoice, { onchoose });

		const link = document.querySelector<HTMLAnchorElement>(
			'a[data-testid="report-kind-option-totfund"]'
		);
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		link?.dispatchEvent(event);

		expect(onchoose).toHaveBeenCalledWith('dead');
		expect(event.defaultPrevented).toBe(true);
	});
});

/**
 * Der `href` ist der JS-lose Pfad und muss ihn allein tragen: Ein Klick vor der
 * Hydration — auf einer schlechten Mobilverbindung am Strand sind das Sekunden —
 * navigiert nativ dorthin, und `resolveReportKind` löst `?meldung=totfund`
 * bereits serverseitig in den richtigen Zweig auf (`+page.svelte`).
 *
 * Die Parameterwerte sind bewusst deutsch (`lebend`/`totfund`) und kommen aus
 * `reportKindToParam` — warum das ein Vertrag und keine Kosmetik ist, steht an
 * `REPORT_KIND_PARAM` in `reportKind.ts`.
 */
describe('ReportKindChoice — der Link trägt den Zweig ohne JS', () => {
	it('zeigt per Default auf den Query-Parameter der Seite', async () => {
		await render(ReportKindChoice, { onchoose: vi.fn() });

		const hrefs = Array.from(
			document.querySelectorAll<HTMLAnchorElement>('a[data-testid^="report-kind-option-"]')
		).map((link) => link.getAttribute('href'));

		expect(hrefs).toEqual(['?meldung=lebend', '?meldung=totfund']);
	});

	it('überlässt das Ziel dem Aufrufer, damit fremde Query-Parameter überleben', async () => {
		// `+page.svelte` baut den `href` aus `page.url` und hält damit
		// Kampagnen-Marker aus einem Museums-Link erhalten. Die alte Lösung
		// konnte das auf dem JS-losen Weg nicht: Ein nativer GET-Submit ersetzt
		// die gesamte Query.
		await render(ReportKindChoice, {
			onchoose: vi.fn(),
			buildHref: (kind: ReportKind) =>
				`/?kampagne=museumsnacht&meldung=${kind === 'dead' ? 'totfund' : 'lebend'}`
		});

		const link = document.querySelector('a[data-testid="report-kind-option-totfund"]');
		expect(link?.getAttribute('href')).toBe('/?kampagne=museumsnacht&meldung=totfund');
	});
});

/**
 * Ein Link, der auf eine eigene URL zeigt, muss sich auch wie einer benehmen:
 * Strg-/Cmd-Klick öffnet einen neuen Tab, Shift einen neuen Fenster. Fängt der
 * Handler diese Klicks mit ab, bleibt der Nutzer im alten Tab zurück und der
 * neue zeigt nichts — der klassische Fehler beim „Aufwerten" eines Links per JS.
 */
describe('ReportKindChoice — modifizierte Klicks bleiben Browser-Sache', () => {
	/**
	 * Genau das Verhalten, das hier geprüft wird, macht den Test gefährlich: Ein
	 * Klick, den die Komponente absichtlich NICHT abfängt, aktiviert den Link —
	 * und Vitests Browser-Mode rendert jede Testdatei in einem eigenen iframe.
	 * Der navigiert dann weg, und der Lauf bricht mit „Cannot connect to the
	 * iframe" ab, ohne dass eine einzige Assertion fehlschlägt (in CI so
	 * passiert, lokal nicht — es ist ein Rennen gegen die Navigation).
	 *
	 * Der Helfer hängt deshalb einen eigenen Listener ans `document`. Er läuft in
	 * der Bubbling-Phase, also NACH dem Handler am Link: Er liest zuerst ab, ob
	 * die Komponente den Klick abgefangen hat, und unterbindet danach die
	 * Navigation. Ein `preventDefault` in der Capture-Phase wäre kein Ersatz — es
	 * verdeckte genau die Frage, um die es geht.
	 */
	function klickenOhneNavigation(
		link: Element,
		modifier: MouseEventInit
	): { vonKomponenteAbgefangen: boolean } {
		let vonKomponenteAbgefangen = false;
		const wächter = (event: Event) => {
			vonKomponenteAbgefangen = event.defaultPrevented;
			event.preventDefault();
		};
		document.addEventListener('click', wächter);
		try {
			link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...modifier }));
		} finally {
			document.removeEventListener('click', wächter);
		}
		return { vonKomponenteAbgefangen };
	}

	it.each([
		['Strg', { ctrlKey: true }],
		['Cmd', { metaKey: true }],
		['Shift', { shiftKey: true }],
		['Alt', { altKey: true }]
	])('%s-Klick wird nicht abgefangen', async (_name, modifier) => {
		const onchoose = vi.fn();
		await render(ReportKindChoice, { onchoose });

		const link = document.querySelector('a[data-testid="report-kind-option-totfund"]');
		expect(link).not.toBeNull();
		const { vonKomponenteAbgefangen } = klickenOhneNavigation(link as Element, modifier);

		expect(onchoose).not.toHaveBeenCalled();
		expect(vonKomponenteAbgefangen).toBe(false);
	});

	it('fängt den gewöhnlichen Klick dagegen ab — die Gegenprobe zum Helfer', async () => {
		// Ohne sie belegte das Grün oben nur, dass `vonKomponenteAbgefangen`
		// irgendwie `false` wird: Ein Helfer, der die Flanke gar nicht misst, wäre
		// für alle vier Modifier genauso grün.
		const onchoose = vi.fn();
		await render(ReportKindChoice, { onchoose });

		const link = document.querySelector('a[data-testid="report-kind-option-totfund"]');
		const { vonKomponenteAbgefangen } = klickenOhneNavigation(link as Element, {});

		expect(onchoose).toHaveBeenCalledWith('dead');
		expect(vonKomponenteAbgefangen).toBe(true);
	});
});

/**
 * B7 (Abschlussreview, wichtig): „Ändern" ersetzte den gesamten Formularbaum
 * durch die Einstiegsseite — der auslösende Knopf verschwand, der Fokus fiel
 * auf `<body>`, angesagt wurde nichts. Das Formular macht es an jedem
 * Schrittwechsel bereits richtig (`scrollAndFocusStep` in
 * `form/StepNavigation.svelte`): Kopf des neuen Inhalts fokussieren.
 *
 * Fokussiert wird die Frage „Was möchten Sie melden?", nicht die `<h1>`: Die
 * Seitenüberschrift ist im iframe bewusst ausgeblendet (dieselbe Bedingung wie
 * in `ModernReportForm.svelte`), die Frage dagegen immer vorhanden. Ein Fokus
 * auf ein bedingt fehlendes Element wäre im iframe wirkungslos — genau der
 * Fall, den dieser Test über `document.getElementById` statt über die (im
 * iframe unsichtbare) Rolle „heading" prüft.
 *
 * Bis zum Umbau auf Links war das eine `<legend>`; die Rolle im Fokus-Muster
 * ist unverändert.
 *
 * `autofocusHeading` ist bewusst `false` per Default: Beim allerersten
 * Seitenaufruf ist die Auswahlseite kein „Wechsel" — ein Fokus-Sprung dorthin
 * verschöbe für Tastaturnutzer nur den ersten Tab-Stopp hinter die Navigation,
 * ohne Nutzen.
 */
describe('ReportKindChoice — Fokus beim Rücksprung aus dem Formular (B7)', () => {
	it('fokussiert die Frage, wenn autofocusHeading gesetzt ist', async () => {
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		await render(ReportKindChoice, { onchoose: vi.fn(), autofocusHeading: true });
		await tick();

		const frage = document.getElementById('report-kind-question');
		expect(frage).not.toBeNull();
		expect(document.activeElement).toBe(frage);
	});

	it('lässt den Fokus beim allerersten Aufruf unangetastet (kein Prop)', async () => {
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		await render(ReportKindChoice, { onchoose: vi.fn() });
		await tick();

		const frage = document.getElementById('report-kind-question');
		expect(document.activeElement).not.toBe(frage);
	});
});

/**
 * Politur (Abschlussreview, nicht blockierend): `ModernReportForm.svelte`
 * unterdrückt seine `<h1>` bewusst im iframe (die Museumsseite trägt ihre
 * eigene Überschrift) — die Einstiegsseite tat das bisher nicht. Der
 * eingebettete Besucher sah den Titel doppelt, und nach der Auswahl verschwand
 * er wieder, was den Höhensprung im iframe vergrößerte.
 *
 * Seit dem 2026-08-13 ist es derselbe Kopf wie über dem Formular
 * (`ReportHeading.svelte`, Wunsch des Meeresmuseums) — die Bedingung hier
 * bleibt davon unberührt, sie steht weiterhin an dieser Aufrufstelle.
 *
 * `window.top !== window` in dieser Testumgebung (Vitest Browser Mode rendert
 * jede Testdatei in einem eigenen iframe) — `isNotIFrame` ist hier immer
 * `false`, derselbe Zustand wie in `ModernReportForm.svelte.test.ts`, das aus
 * genau diesem Grund den umgekehrten Fall („Titel sichtbar, echtes
 * Top-Fenster") ebenfalls nicht unit-testet.
 */
describe('ReportKindChoice — Seitentitel im iframe unterdrückt (Politur)', () => {
	it('rendert die Seiten-H1 in dieser (iframe-artigen) Testumgebung nicht', async () => {
		await render(ReportKindChoice, { onchoose: vi.fn() });

		expect(document.querySelector('h1')).toBeNull();
	});
});
