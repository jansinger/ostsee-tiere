import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { clearAllToasts, errorToast, successToast } from '#lib/stores/toastState.svelte.ts';
import ToastContainer from './ToastContainer.svelte';

/**
 * Regression: `ToastContainer` reichte die Dauer als `toast.duration || 5000`
 * weiter. `errorToast()` setzt bewusst `duration: 0` (= nicht automatisch
 * schließen), aber `0` ist falsy — daraus wurden 5000 ms. Fehler-Toasts
 * verschwanden also nach 5 Sekunden, obwohl sie stehen bleiben sollen.
 *
 * Die Zeit wird mit Fake-Timern vorgespult; abgefragt wird direkt am DOM,
 * weil die wiederholenden `expect.element`-Matcher selbst auf Timern sitzen.
 */
describe('ToastContainer — automatisches Schließen', () => {
	beforeEach(async () => {
		clearAllToasts();
	});

	afterEach(async () => {
		vi.useRealTimers();
		clearAllToasts();
	});

	it('schließt einen errorToast mit duration: 0 nicht automatisch', async () => {
		vi.useFakeTimers();
		await render(ToastContainer);

		errorToast('Der Server hat nicht geantwortet');
		await tick();

		expect(document.body.textContent).toContain('Der Server hat nicht geantwortet');

		// Weit über die 5000 ms hinaus, die der Fallback fälschlich gesetzt hat.
		await vi.advanceTimersByTimeAsync(30_000);
		await tick();

		expect(document.body.textContent).toContain('Der Server hat nicht geantwortet');
	});

	it('schließt einen successToast nach der Standarddauer weiterhin automatisch', async () => {
		vi.useFakeTimers();
		await render(ToastContainer);

		successToast('Sichtung gespeichert');
		await tick();

		expect(document.body.textContent).toContain('Sichtung gespeichert');

		await vi.advanceTimersByTimeAsync(5_000);
		await tick();

		expect(document.body.textContent).not.toContain('Sichtung gespeichert');
	});

	it('behält den Titel-Fallback für Toasts ohne Titel', async () => {
		vi.useFakeTimers();
		await render(ToastContainer);

		errorToast('Ohne Titel');
		await tick();

		// Kein leerer Titel-Knoten: `title || ''` bleibt korrekt und unangetastet.
		expect(document.body.querySelector('h3')).toBeNull();
	});
});
