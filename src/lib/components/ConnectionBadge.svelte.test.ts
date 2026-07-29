import { connection } from '$lib/stores/connectionState.svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ConnectionBadge from './ConnectionBadge.svelte';

function badge(state: 'offline' | 'reconnected'): HTMLElement | null {
	return document.querySelector(`[data-testid="connection-badge-${state}"]`);
}

describe('ConnectionBadge', () => {
	beforeEach(() => {
		connection.reset();
	});

	afterEach(() => {
		vi.useRealTimers();
		connection.reset();
	});

	/**
	 * Ein Zustand, der 99 % der Zeit dasselbe sagt, wird nicht gelesen. Im
	 * Normalfall darf die Komponente deshalb keinen Platz kosten.
	 */
	it('rendert nichts, solange die Verbindung steht', async () => {
		render(ConnectionBadge);
		await tick();

		expect(badge('offline')).toBeNull();
		expect(badge('reconnected')).toBeNull();
	});

	/**
	 * Regression: Vorher stand ein leeres Wrapper-`<div>` dauerhaft im DOM. In
	 * der Navbar (`.navbar-end` mit `gap-2`) war das ein Flex-Item mit Breite 0
	 * — gemessen 8px toter Abstand, obwohl nichts zu sehen war. Die Live-Region
	 * bleibt deshalb `sr-only` (absolut positioniert, kein Flex-Item), die
	 * sichtbare Fläche wird bedingt gerendert.
	 */
	it('hinterlässt online nur die layoutneutrale Live-Region', async () => {
		const { container } = render(ConnectionBadge);
		await tick();

		// `getComputedStyle` taugt hier nicht: Die Browser-Komponententests laden
		// Tailwinds CSS nicht, `sr-only` wäre also wirkungslos gemessen. Geprüft
		// wird deshalb der Vertrag (die Klasse); die tatsächliche Layout-Wirkung
		// misst `e2e/submit-offline.spec.ts` an der echten Navbar.
		expect(container.children).toHaveLength(1);
		expect(container.children[0]?.className).toContain('sr-only');
	});

	/**
	 * Die Layout-Klassen gehören an die sichtbare Fläche, nicht an einen
	 * Wrapper der Aufrufstelle — sonst bliebe deren Abstand im Online-Fall
	 * stehen.
	 */
	it('reicht Layout-Klassen an die sichtbare Fläche durch', async () => {
		render(ConnectionBadge, { class: 'mb-2 md:hidden' });
		connection.reportUnreachable();
		await tick();

		expect(badge('offline')?.className).toContain('mb-2');
		expect(badge('offline')?.className).toContain('md:hidden');
	});

	it('zeigt den Offline-Zustand mit der Zusage zu den Eingaben', async () => {
		render(ConnectionBadge);
		connection.reportUnreachable();
		await tick();

		expect(badge('offline')?.textContent).toContain('Offline');
		expect(badge('offline')?.textContent).toContain('Eingaben werden gespeichert');
	});

	it('lässt den Zusatz im kompakten Modus weg', async () => {
		render(ConnectionBadge, { compact: true });
		connection.reportUnreachable();
		await tick();

		expect(badge('offline')?.textContent).toContain('Offline');
		expect(badge('offline')?.textContent).not.toContain('Eingaben werden gespeichert');
	});

	/**
	 * Navbar und Schritt-Balken zeigen das Abzeichen gleichzeitig. Zwei
	 * Live-Regionen mit demselben Text lassen den Screenreader „Offline" doppelt
	 * ansagen — nur die globale Instanz meldet.
	 */
	describe('Live-Region', () => {
		/**
		 * Die Region muss schon im DOM stehen, BEVOR sich ihr Inhalt ändert —
		 * wird sie zusammen mit ihrem Text eingefügt, sagen viele Screenreader
		 * nichts. Sie ist deshalb auch im Online-Fall vorhanden, nur leer.
		 */
		it('steht schon vor dem Zustandswechsel bereit', async () => {
			const { container } = render(ConnectionBadge);
			await tick();

			const live = container.querySelector('[role="status"]');
			expect(live).not.toBeNull();
			expect(live?.textContent?.trim()).toBe('');
		});

		it('trägt den Text der Ansage, nicht die sichtbare Fläche', async () => {
			const { container } = render(ConnectionBadge);
			connection.reportUnreachable();
			await tick();

			expect(container.querySelector('[role="status"]')?.textContent).toContain(
				'Keine Internetverbindung'
			);
			// Sonst stünde derselbe Text zweimal im Accessibility-Baum.
			expect(badge('offline')?.getAttribute('aria-hidden')).toBe('true');
		});

		it('bleibt mit announce={false} stumm, aber sichtbar', async () => {
			const { container } = render(ConnectionBadge, { announce: false });
			connection.reportUnreachable();
			await tick();

			expect(container.querySelector('[role="status"]')).toBeNull();
			expect(container.querySelector('[aria-live]')).toBeNull();
			expect(badge('offline')).not.toBeNull();
		});
	});

	/**
	 * WLAN an Bord ohne Uplink: `navigator.onLine` meldet `true`, jeder Request
	 * scheitert trotzdem. Das Ergebnis des letzten echten Requests hat deshalb
	 * das letzte Wort.
	 */
	it('folgt dem letzten Request-Ergebnis, nicht navigator.onLine', async () => {
		render(ConnectionBadge);
		expect(navigator.onLine).toBe(true);

		connection.reportUnreachable();
		await tick();

		expect(badge('offline')).not.toBeNull();
	});

	/**
	 * Regression: `isOffline` allein taugt nicht als Sperrbedingung. `fetch`
	 * wirft denselben TypeError bei einem Server-Neustart oder CORS-Fehler wie
	 * bei fehlendem Netz — dort bleibt `navigator.onLine` auf `true` und es
	 * feuert nie ein `online`-Ereignis, das den Zustand aufheben könnte. Wer
	 * daran hart sperrt, sperrt bis zum Neuladen.
	 */
	describe('sicheres gegen vermutetes Offline', () => {
		it('meldet ein gescheitertes Request-Ergebnis NICHT als sicheres Offline', () => {
			connection.reportUnreachable();

			expect(connection.isOffline).toBe(true);
			expect(connection.isInterfaceDown).toBe(false);
		});

		it('meldet eine abgeschaltete Schnittstelle als sicheres Offline', async () => {
			// Erst rendern: `watchConnection()` hängt am `$effect` der Komponente,
			// ohne Instanz hört niemand auf das Ereignis.
			render(ConnectionBadge);
			await tick();

			window.dispatchEvent(new Event('offline'));
			await tick();

			expect(connection.isInterfaceDown).toBe(true);
		});
	});

	describe('Wieder online', () => {
		it('erscheint nach der Rückkehr aus dem Offline-Zustand', async () => {
			render(ConnectionBadge);

			connection.reportUnreachable();
			await tick();
			connection.reportReachable();
			await tick();

			expect(badge('offline')).toBeNull();
			expect(badge('reconnected')?.textContent).toContain('Wieder online');
		});

		it('erscheint nicht, wenn es nie offline war', async () => {
			render(ConnectionBadge);

			connection.reportReachable();
			await tick();

			expect(badge('reconnected')).toBeNull();
		});

		/**
		 * Die eine Stelle, an der ein flüchtiger Hinweis richtig ist: Er verlangt
		 * keine Handlung, er nimmt nur eine Sorge weg.
		 */
		it('verschwindet nach 4 Sekunden wieder', async () => {
			vi.useFakeTimers();
			render(ConnectionBadge);

			connection.reportUnreachable();
			connection.reportReachable();
			await tick();
			expect(badge('reconnected')).not.toBeNull();

			await vi.advanceTimersByTimeAsync(4000);
			await tick();

			expect(badge('reconnected')).toBeNull();
		});

		it('steht kurz vor Ablauf der Frist noch', async () => {
			vi.useFakeTimers();
			render(ConnectionBadge);

			connection.reportUnreachable();
			connection.reportReachable();
			await tick();

			await vi.advanceTimersByTimeAsync(3500);
			await tick();

			expect(badge('reconnected')).not.toBeNull();
		});
	});
});
