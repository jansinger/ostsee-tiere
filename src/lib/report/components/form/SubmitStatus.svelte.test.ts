import { ORPHAN_RETENTION_HOURS } from '$lib/constants/uploadRetention';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SubmitStatus from './SubmitStatus.svelte';

/** Findet den Statusblock im gerenderten Dokument. */
function block(testid: string): HTMLElement | null {
	return document.querySelector(`[data-testid="${testid}"]`);
}

describe('SubmitStatus', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('rendert im Zustand idle nichts', () => {
		const { container } = render(SubmitStatus, { state: 'idle' });

		expect(container.textContent?.trim()).toBe('');
	});

	describe('offline', () => {
		it('nennt das Schicksal der Daten', () => {
			render(SubmitStatus, { state: 'offline' });

			expect(block('submit-status-offline')?.textContent).toContain(
				'Eingaben bleiben vollständig gespeichert'
			);
		});

		/**
		 * Der Offline-Zustand entsteht von selbst, oft während der Nutzer noch
		 * tippt. `role="alert"` würde den Screenreader mitten im Satz unterbrechen.
		 */
		it('meldet sich höflich per role="status", nicht per role="alert"', () => {
			render(SubmitStatus, { state: 'offline' });

			expect(block('submit-status-offline')?.getAttribute('role')).toBe('status');
			expect(document.querySelector('[role="alert"]')).toBeNull();
		});
	});

	/**
	 * `failed` und `partial` entstehen beide, weil jemand „Absenden" gedrückt
	 * hat — die Unterbrechung ist dort erwartet. `offline` und `submitting`
	 * laufen von selbst auf und melden sich höflich. Weil die Zustände einander
	 * ausschließen, kann nie mehr als eine Live-Region gleichzeitig feuern.
	 */
	describe('ARIA-Rollen', () => {
		it.each([
			['failed', 'alert'],
			['partial', 'alert'],
			['offline', 'status'],
			['submitting', 'status']
		] as const)('meldet %s per role="%s"', (state, expected) => {
			render(SubmitStatus, { state });

			expect(block(`submit-status-${state}`)?.getAttribute('role')).toBe(expected);
		});

		it('rendert nie zwei Live-Regionen gleichzeitig', () => {
			render(SubmitStatus, { state: 'partial' });

			expect(document.querySelectorAll('[role="alert"], [role="status"]')).toHaveLength(1);
		});
	});

	describe('failed', () => {
		it('unterbricht per role="alert", weil es die Folge einer Nutzeraktion ist', () => {
			render(SubmitStatus, { state: 'failed' });

			expect(block('submit-status-failed')?.getAttribute('role')).toBe('alert');
		});

		it('sagt zu, dass die Eingaben erhalten bleiben', () => {
			render(SubmitStatus, { state: 'failed' });

			expect(block('submit-status-failed')?.textContent).toContain(
				'Ihre Eingaben sind nicht verloren'
			);
		});

		it('zeigt die Referenz-ID für die Rückfrage', () => {
			render(SubmitStatus, { state: 'failed', referenceId: 'clx8k2p9a0001' });

			expect(block('submit-status-reference')?.textContent).toContain('clx8k2p9a0001');
			expect(block('submit-status-failed')?.textContent).toContain(
				'bei einer Rückfrage die unten stehende Referenz'
			);
		});

		/**
		 * Der Entwurf nannte `sichtungen@meeresmuseum.de` — dafür gibt es im
		 * Bestand keinen Beleg. Eine Adresse, die niemand liest, ist im Fehlerfall
		 * schlimmer als gar keine: die Rückfrage läuft ins Leere und der Nutzer
		 * hält es für erledigt. Verlinkt wird deshalb die Kontaktseite, die
		 * `about/+page.svelte` Nutzern ohnehin schon zeigt.
		 */
		it('nennt keine unbelegte E-Mail-Adresse', () => {
			render(SubmitStatus, { state: 'failed', referenceId: 'clx8k2p9a0001' });

			const html = block('submit-status-failed')?.innerHTML ?? '';
			expect(html).not.toMatch(/mailto:/);
			expect(html).not.toMatch(/@meeresmuseum\.de/);
			expect(html).toContain('https://www.deutsches-meeresmuseum.de/kontakt');
		});

		it('zeigt keine Referenzzeile, solange keine ID vorliegt', () => {
			render(SubmitStatus, { state: 'failed', referenceId: '' });

			expect(block('submit-status-reference')).toBeNull();
		});

		it('macht sichtbar, der wievielte Versuch das war', () => {
			render(SubmitStatus, { state: 'failed', attempt: 2, maxAttempts: 3 });

			expect(block('submit-status-failed')?.textContent).toContain('Versuch 2 von 3');
		});

		it('blendet den Zähler vor dem ersten Versuch aus', () => {
			render(SubmitStatus, { state: 'failed', attempt: 0 });

			expect(block('submit-status-failed')?.textContent).not.toContain('Versuch');
		});

		/**
		 * Die Versuche sind nirgends begrenzt — `ModernReportForm` zählt einfach
		 * weiter. „Das war Versuch 4 von 3" wäre eine Grenze, die niemand
		 * durchsetzt.
		 */
		it('behauptet oberhalb der Bezugsgröße keine Grenze mehr', () => {
			render(SubmitStatus, { state: 'failed', attempt: 4, maxAttempts: 3 });

			const text = block('submit-status-failed')?.textContent ?? '';
			expect(text).toContain('Das war Versuch 4.');
			expect(text).not.toContain('von 3');
		});

		it('setzt die übergebene Überschrift ein', () => {
			render(SubmitStatus, { state: 'failed', title: 'Zu viele Übermittlungen' });

			expect(block('submit-status-failed')?.textContent).toContain('Zu viele Übermittlungen');
		});

		it('löst über die Schaltfläche einen erneuten Versuch aus', async () => {
			const onRetry = vi.fn();
			render(SubmitStatus, { state: 'failed', onRetry });

			const button = block('submit-status-failed')?.querySelector('button');
			button?.click();
			await tick();

			expect(onRetry).toHaveBeenCalledOnce();
		});
	});

	describe('partial', () => {
		/**
		 * Der einzige Zustand, der die Datenzusage nicht geben kann: Die Aufnahme
		 * liegt schon auf dem Server.
		 */
		it('gibt keine uneingeschränkte Datenzusage', () => {
			render(SubmitStatus, { state: 'partial' });

			const text = block('submit-status-partial')?.textContent ?? '';
			expect(text).toContain('liegt bereits bei uns');
			expect(text).not.toContain('bleiben vollständig gespeichert');
		});

		/**
		 * Die Frist stammt aus derselben Konstante, aus der `UPLOAD_NOTICE` an der
		 * Dropzone schöpft und nach der das Aufräum-Tool tatsächlich löscht — eine
		 * fest hineingeschriebene Zahl könnte davon abweichen.
		 */
		it('nennt genau die Frist, die auch tatsächlich angewendet wird', () => {
			render(SubmitStatus, { state: 'partial' });

			expect(block('submit-status-partial')?.textContent).toContain(
				`${ORPHAN_RETENTION_HOURS} Stunden`
			);
		});

		/**
		 * Regression: Eine Meldung mit angehängter Aufnahme landet IMMER in
		 * `partial` — auch bei einer inhaltlichen Ablehnung. Solange dieser Zweig
		 * `title` nicht rendert, verschwindet der eigentliche Grund („E-Mail
		 * ungültig") hinter dem Aufbewahrungshinweis und der Nutzer wiederholt
		 * ins Leere.
		 */
		it('nennt auch hier den Grund des Fehlschlags', () => {
			render(SubmitStatus, {
				state: 'partial',
				title: 'Validierungsfehler bei der Eingabe',
				attempt: 1
			});

			const text = block('submit-status-partial')?.textContent ?? '';
			expect(text).toContain('Validierungsfehler bei der Eingabe');
			expect(text).toContain('Das war Versuch 1 von 3.');
		});
	});

	/**
	 * Regression: Der Offline-Zustand kann aus einem einzelnen gescheiterten
	 * Request abgeleitet sein und dann falsch liegen — `fetch` wirft denselben
	 * TypeError bei einem Server-Neustart. Ohne Ausweg bliebe der Nutzer bis zum
	 * Neuladen gefangen, denn ohne `online`-Ereignis hebt nichts den Zustand auf.
	 */
	describe('Ausweg aus dem Offline-Zustand', () => {
		it('bietet einen Versuch an, wenn der Aufrufer einen Handler übergibt', async () => {
			const onRetry = vi.fn();
			render(SubmitStatus, { state: 'offline', onRetry });

			const button = block('submit-status-offline')?.querySelector('button');
			expect(button?.textContent).toContain('Trotzdem versuchen');

			button?.click();
			await tick();

			expect(onRetry).toHaveBeenCalledOnce();
		});

		it('zeigt keine Schaltfläche, wenn die Sperre sicher ist', () => {
			render(SubmitStatus, { state: 'offline' });

			expect(block('submit-status-offline')?.querySelector('button')).toBeNull();
		});
	});

	describe('submitting', () => {
		it('trägt keine Statusfarbe — ein Ladevorgang ist keine Warnung', () => {
			render(SubmitStatus, { state: 'submitting' });

			const element = block('submit-status-submitting');
			expect(element?.className).not.toMatch(/alert-(warning|error|info|success)/);
			expect(element?.getAttribute('role')).toBe('status');
		});
	});

	/**
	 * Die Komponente verschwindet nie von selbst — anders als der Toast, den sie
	 * ersetzt. Wer den Fehler wegbekommen will, sendet erneut.
	 */
	it('verschwindet nicht von selbst', async () => {
		vi.useFakeTimers();
		render(SubmitStatus, { state: 'failed' });

		expect(block('submit-status-failed')).not.toBeNull();

		await vi.advanceTimersByTimeAsync(60_000);
		await tick();

		expect(block('submit-status-failed')).not.toBeNull();
	});
});
