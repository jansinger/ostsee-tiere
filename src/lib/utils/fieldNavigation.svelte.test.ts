/**
 * `fieldNavigation.ts` ist reine DOM-Logik (kein Svelte-Import), braucht aber
 * echtes `document`/`window` (siehe vitest.config.ts: von der Node-Coverage
 * ausgeschlossen als "Browser-only utility"). Der `.svelte.test.ts`-Suffix
 * routet diese Datei deshalb ins Browser-Test-Projekt (echter Chromium via
 * Playwright), obwohl keine Svelte-Komponente gerendert wird.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestParentScroll } from '#lib/utils/client/embedMessages.ts';
import { scrollToElement, scrollToFirstError, scrollToStepHeader } from './fieldNavigation';

// Im eingebetteten Zustand scrollt die Museumsseite, nicht die App — dorthin
// geht derselbe Zielwert als Nachricht (siehe embedMessages.ts).
vi.mock('#lib/utils/client/embedMessages.ts', () => ({ requestParentScroll: vi.fn() }));

/** Baut die für Step-Komponenten typische Struktur nach: Container > Step-Root > Header(Icon, h2, Badge) */
function buildStepContainer(containerId: string): { header: HTMLElement; heading: HTMLElement } {
	const container = document.createElement('div');
	container.id = containerId;

	const stepRoot = document.createElement('div'); // wie <div class="space-y-8"> in Step*.svelte
	const header = document.createElement('div'); // "Step Header": Icon + h2 + p + Badge

	const icon = document.createElement('div');
	const heading = document.createElement('h2');
	heading.textContent = 'Position & Zeit';
	const badge = document.createElement('div');
	badge.textContent = 'Schritt 1 von 4';

	header.append(icon, heading, badge);
	stepRoot.appendChild(header);
	container.appendChild(stepRoot);
	document.body.appendChild(container);

	return { header, heading };
}

describe('scrollToElement', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('scrollt mit dem Default-Offset von -80 (Platz für die sticky Navbar)', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
		const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		scrollToElement(el);

		expect(scrollSpy).toHaveBeenCalledWith({
			top: 500 + window.scrollY - 80,
			behavior: 'smooth'
		});
	});

	it('erlaubt einen eigenen Offset statt des Defaults', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
		const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		scrollToElement(el, -20);

		expect(scrollSpy).toHaveBeenCalledWith({
			top: 500 + window.scrollY - 20,
			behavior: 'smooth'
		});
	});

	it('bittet zusätzlich die einbettende Seite, an dieselbe Stelle zu scrollen', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		vi.mocked(requestParentScroll).mockClear();

		scrollToElement(el);

		expect(requestParentScroll).toHaveBeenCalledWith(500 + window.scrollY - 80);
	});

	it('tut nichts, wenn kein Element übergeben wird', () => {
		const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		vi.mocked(requestParentScroll).mockClear();
		scrollToElement(null);
		expect(scrollSpy).not.toHaveBeenCalled();
		expect(requestParentScroll).not.toHaveBeenCalled();
	});
});

describe('scrollToStepHeader', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('gibt null zurück und scrollt nicht, wenn der Container nicht existiert', () => {
		const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		expect(scrollToStepHeader('does-not-exist')).toBeNull();
		expect(scrollSpy).not.toHaveBeenCalled();
	});

	it('scrollt zum Eltern-Element der h2 (Icon+Badge-Block), nicht nur zum Container', () => {
		const { header } = buildStepContainer('form-content');
		vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ top: 300 } as DOMRect);
		const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		scrollToStepHeader('form-content');

		expect(scrollSpy).toHaveBeenCalledWith({
			top: 300 + window.scrollY - 80,
			behavior: 'smooth'
		});
	});

	it('gibt die h2 zurück, damit der Aufrufer sie fokussieren kann', () => {
		const { heading } = buildStepContainer('form-content');
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		expect(scrollToStepHeader('form-content')).toBe(heading);
	});
});

describe('scrollToFirstError', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	/**
	 * Regression: `LocationDescription.svelte` rendert `waterway` seit dem
	 * Vorgänger-Fix in einem einzigen `<details>`, dessen Startzustand nur
	 * einmalig gesetzt wird (kein `bind:open`) — der Nutzer darf den Block
	 * also zuklappen. Klappt er zu und schlägt „Weiter" wegen `waterway`
	 * fehl, liegt das Feld in einem geschlossenen `<details>`. Native
	 * `<details>` setzt seinen Inhalt dann auf `content-visibility: hidden`
	 * — `.focus()` auf ein Element darin tut still nichts, ohne dass
	 * `scrollToFirstError` das öffnet.
	 */
	it('öffnet ein geschlossenes Vorfahren-<details> und fokussiert das Feld darin', () => {
		vi.useFakeTimers();
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		const disclosure = document.createElement('details');
		disclosure.setAttribute('data-testid', 'location-description');
		const input = document.createElement('input');
		input.name = 'waterway';
		input.setAttribute('data-testid', 'field-waterway');
		disclosure.appendChild(input);
		document.body.appendChild(disclosure);

		expect(disclosure.open).toBe(false);

		const navigated = scrollToFirstError({ waterway: 'Pflichtfeld' });

		expect(navigated).toBe(true);
		// Muss synchron passieren, VOR dem verzögerten `.focus()` — sonst hätte
		// das geschlossene <details> beim Fokussieren keine Wirkung.
		expect(disclosure.open).toBe(true);

		vi.advanceTimersByTime(600);

		expect(document.activeElement).toBe(input);
	});

	it('öffnet mehrere verschachtelte <details>-Vorfahren', () => {
		vi.useFakeTimers();
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		const outer = document.createElement('details');
		const inner = document.createElement('details');
		const input = document.createElement('input');
		input.name = 'seaMark';
		inner.appendChild(input);
		outer.appendChild(inner);
		document.body.appendChild(outer);

		scrollToFirstError({ seaMark: 'Pflichtfeld' });

		expect(outer.open).toBe(true);
		expect(inner.open).toBe(true);

		vi.advanceTimersByTime(600);
		expect(document.activeElement).toBe(input);
	});

	it('funktioniert unverändert, wenn das Feld in keinem <details> liegt', () => {
		vi.useFakeTimers();
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

		const input = document.createElement('input');
		input.name = 'sightingDate';
		document.body.appendChild(input);

		const navigated = scrollToFirstError({ sightingDate: 'Pflichtfeld' });
		expect(navigated).toBe(true);

		vi.advanceTimersByTime(600);
		expect(document.activeElement).toBe(input);
	});
});
