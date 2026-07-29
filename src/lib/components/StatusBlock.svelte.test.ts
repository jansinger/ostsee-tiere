import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StatusBlock from './StatusBlock.svelte';

function block(variant: string): HTMLElement | null {
	return document.querySelector(`[data-testid="status-block-${variant}"]`);
}

describe('StatusBlock', () => {
	it('zeigt die Aussage in jeder Variante', () => {
		render(StatusBlock, { variant: 'loading', title: 'Sichtungen werden geladen …' });

		expect(block('loading')?.textContent).toContain('Sichtungen werden geladen …');
	});

	it('zeigt die Erklärung nur, wenn eine übergeben wurde', () => {
		render(StatusBlock, { variant: 'empty', title: 'Keine Treffer' });

		expect(block('empty')?.querySelectorAll('p')).toHaveLength(1);
	});

	/**
	 * Ein Ladevorgang ist keine Warnung, ein Filter ohne Treffer kein Fehler.
	 * Erst `partial`, `failed` und `offline` dürfen die Alert-Flächen nutzen.
	 */
	describe('Statusfarben', () => {
		it.each(['loading', 'empty'] as const)('gibt %s keine Statusfarbe', (variant) => {
			render(StatusBlock, { variant, title: 'Titel' });

			expect(block(variant)?.className).not.toMatch(/\balert\b/);
		});

		it.each([
			['partial', 'alert-info'],
			['failed', 'alert-warning'],
			['offline', 'alert-warning']
		] as const)('nutzt für %s die Fläche %s', (variant, expected) => {
			render(StatusBlock, { variant, title: 'Titel' });

			expect(block(variant)?.className).toContain(expected);
		});
	});

	/**
	 * `alert` unterbricht den Screenreader. Das ist nur gerechtfertigt, wenn der
	 * Zustand die Folge einer Nutzeraktion ist — sonst trifft es ihn beim Tippen.
	 */
	describe('ARIA-Rollen', () => {
		it('meldet failed per role="alert"', () => {
			render(StatusBlock, { variant: 'failed', title: 'Titel' });

			expect(block('failed')?.getAttribute('role')).toBe('alert');
		});

		it.each(['loading', 'empty', 'partial', 'offline'] as const)(
			'meldet %s höflich per role="status"',
			(variant) => {
				render(StatusBlock, { variant, title: 'Titel' });

				expect(block(variant)?.getAttribute('role')).toBe('status');
			}
		);

		/**
		 * Regression: Ein explizites `aria-live="polite"` überschreibt das
		 * implizite `assertive` von `role="alert"`. Stand es unbedingt am Element,
		 * fand die zugesagte Unterbrechung nie statt und der Unterschied zwischen
		 * den Rollen war reine Dekoration.
		 */
		it('setzt bei role="alert" kein aria-live, das die Rolle entwerten würde', () => {
			render(StatusBlock, { variant: 'failed', title: 'Titel' });

			expect(block('failed')?.hasAttribute('aria-live')).toBe(false);
		});

		it('setzt aria-live="polite" bei den höflichen Varianten', () => {
			render(StatusBlock, { variant: 'empty', title: 'Titel' });

			expect(block('empty')?.getAttribute('aria-live')).toBe('polite');
		});

		/**
		 * Ob ein Fehlschlag die Folge einer Nutzeraktion ist, weiß nur die
		 * Aufrufstelle. `FormHelp` lädt beim Seitenaufbau und darf deshalb nicht
		 * unterbrechen, obwohl der Zustand inhaltlich `failed` ist.
		 */
		it('lässt die Aufrufstelle die Rolle übersteuern', () => {
			render(StatusBlock, { variant: 'failed', title: 'Titel', announce: 'status' });

			expect(block('failed')?.getAttribute('role')).toBe('status');
			expect(block('failed')?.getAttribute('aria-live')).toBe('polite');
		});
	});

	describe('Aktion', () => {
		it('rendert keine Schaltfläche ohne action', () => {
			render(StatusBlock, { variant: 'empty', title: 'Keine Treffer' });

			expect(block('empty')?.querySelector('button')).toBeNull();
		});

		it('löst den Handler aus', async () => {
			const onClick = vi.fn();
			render(StatusBlock, {
				variant: 'offline',
				title: 'Keine Verbindung',
				action: { label: 'Erneut versuchen', onClick }
			});

			block('offline')?.querySelector('button')?.click();
			await tick();

			expect(onClick).toHaveBeenCalledOnce();
		});
	});

	/**
	 * Der Block nimmt den Platz der Daten ein. Ein `fixed inset-0`-Overlay würde
	 * bei jedem Ladevorgang die ganze Fläche aus der Hand nehmen.
	 */
	it('ist kein Overlay', () => {
		render(StatusBlock, { variant: 'loading', title: 'Lädt …' });

		expect(block('loading')?.className).not.toMatch(/fixed|inset-0|absolute/);
	});
});
