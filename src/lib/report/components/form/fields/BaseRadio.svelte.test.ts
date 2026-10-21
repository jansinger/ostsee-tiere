import { render } from 'vitest-browser-svelte';
import { describe, it, expect } from 'vitest';
import { page } from 'vitest/browser';
import BaseRadio from './BaseRadio.svelte';
import { getPublicBoatDriveOptions } from '#lib/report/formOptions/boatDrive.ts';

/**
 * `BaseRadio` war bis zur Motorfrage (PR 4, 2026-08-04) ein nie ausgeführter
 * Codepfad — kein einziges Feld des Sichtungsformulars nutzte `type: 'radio'`.
 * Diese Datei sichert das Verhalten ab, auf das sich `FieldRenderer` verlässt.
 */
describe('BaseRadio', () => {
	const options = getPublicBoatDriveOptions();

	function radiosOf(container: HTMLElement): HTMLInputElement[] {
		return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
	}

	describe('Optionsliste', () => {
		it('rendert einen Radio-Input pro Option', async () => {
			const screen = await render(BaseRadio, { options, name: 'boatDrive' });

			expect(screen.container.querySelectorAll('input[type="radio"]')).toHaveLength(options.length);
			await expect.element(page.getByText('Motor lief', { exact: true })).toBeVisible();
			await expect.element(page.getByText('Motor lief nicht')).toBeVisible();
		});

		it('rendert gar nichts ohne Optionen', async () => {
			const screen = await render(BaseRadio, { options: [], name: 'boatDrive' });

			expect(screen.container.querySelector('input[type="radio"]')).toBeNull();
		});

		it('bindet alle Optionen unter denselben name — sonst wäre es keine Gruppe', async () => {
			const screen = await render(BaseRadio, { options, name: 'boatDrive' });

			const namen = [...screen.container.querySelectorAll('input[type="radio"]')].map((radio) =>
				radio.getAttribute('name')
			);
			expect(new Set(namen)).toEqual(new Set(['boatDrive']));
		});

		it('hängt den Optionswert an die data-testid, damit E2E die Optionen unterscheiden kann', async () => {
			await render(BaseRadio, { options, name: 'boatDrive', 'data-testid': 'field-boatDrive' });

			await expect.element(page.getByTestId('field-boatDrive-1')).toBeInTheDocument();
			await expect.element(page.getByTestId('field-boatDrive-6')).toBeInTheDocument();
		});
	});

	describe('Auswahl', () => {
		it('markiert die Option, die dem übergebenen Wert entspricht', async () => {
			await render(BaseRadio, { options, name: 'boatDrive', value: 6 });

			await expect.element(page.getByRole('radio', { name: 'Motor lief nicht' })).toBeChecked();
			await expect
				.element(page.getByRole('radio', { name: 'Motor lief', exact: true }))
				.not.toBeChecked();
		});

		it('markiert nichts, solange kein Wert gesetzt ist', async () => {
			const screen = await render(BaseRadio, { options, name: 'boatDrive' });

			expect(screen.container.querySelector('input[type="radio"]:checked')).toBeNull();
		});
	});

	describe('Feld-Icon', () => {
		it('zeichnet kein Icon — das gehört einmal an die Legende, nicht in jede Optionszeile', async () => {
			// `icon` ist bewusst KEIN Prop von BaseRadio (mehr): Die Komponente gab
			// es innerhalb der `{#each options}`-Schleife aus, bei zwei Optionen
			// stand derselbe Blitz also zweimal untereinander. `FieldRenderer`
			// rendert es jetzt einmal in der Legende der Radiogruppe — so wie
			// BaseInput/BaseSelect es einmal am Feld zeigen.
			//
			// Der Cast hält genau den Rückfall fest: Wer den Prop wieder ergänzt
			// und pro Option ausgibt, lässt diesen Test scheitern.
			const screen = await render(BaseRadio, {
				options,
				name: 'boatDrive',
				icon: 'lucide:zap'
			} as never);

			expect(screen.container.querySelectorAll('svg')).toHaveLength(0);
		});
	});

	/**
	 * `aria-invalid` und `aria-required` gehören NICHT an das einzelne Radio.
	 * ARIA 1.2 hat beide aus den globalen Zuständen entfernt; unterstützt werden
	 * sie von `role="radiogroup"`, nicht von `role="radio"` — `svelte-check`
	 * meldet die Attribute am `<input type="radio">` als a11y-Warnung.
	 *
	 * Getragen werden sie deshalb vom `fieldset[role="radiogroup"]` in
	 * `FieldRenderer` (dort getestet). Dieser Test hält die Entscheidung fest,
	 * damit sie nicht in gutem Glauben wieder an die Inputs wandert.
	 */
	describe('ARIA-Zustände liegen an der Gruppe, nicht am einzelnen Radio', () => {
		it('setzt kein aria-invalid am Input, auch nicht bei hasError', async () => {
			const screen = await render(BaseRadio, {
				options,
				name: 'boatDrive',
				'data-testid': 'field-boatDrive',
				hasError: true
			});

			const radios = radiosOf(screen.container);
			expect(radios).toHaveLength(options.length);
			radios.forEach((radio) => {
				expect(radio.hasAttribute('aria-invalid')).toBe(false);
			});
		});

		it('setzt kein aria-required am Input, auch nicht bei required', async () => {
			const screen = await render(BaseRadio, {
				options,
				name: 'boatDrive',
				'data-testid': 'field-boatDrive',
				required: true
			});

			const radios = radiosOf(screen.container);
			expect(radios).toHaveLength(options.length);
			radios.forEach((radio) => {
				expect(radio.hasAttribute('aria-required')).toBe(false);
			});
		});

		/**
		 * Die native `required`-Angabe bleibt: Sie ist auf `<input type="radio">`
		 * gültig, trägt die Constraint-Validierung und wird vom Browser ohnehin
		 * als „required" in den Accessibility-Baum gemappt.
		 */
		it('behält die native required-Angabe am Input', async () => {
			const screen = await render(BaseRadio, { options, name: 'boatDrive', required: true });

			radiosOf(screen.container).forEach((radio) => {
				expect(radio.required).toBe(true);
			});
		});

		it('reicht aria-describedby an jedes Radio durch', async () => {
			const screen = await render(BaseRadio, {
				options,
				name: 'boatDrive',
				'aria-describedby': 'field-boatDrive-error'
			});

			radiosOf(screen.container).forEach((radio) => {
				expect(radio.getAttribute('aria-describedby')).toBe('field-boatDrive-error');
			});
		});
	});

	/**
	 * DaisyUI hat für Radios kein `input-error`-Äquivalent im Wortsinn, wohl aber
	 * `radio-error`. Die Klasse setzt dieselbe Variable wie `radio-primary`
	 * (`--input-color`), auf derselben Ebene und mit derselben Spezifität —
	 * stünden beide am Element, entschiede die Reihenfolge im Stylesheet und
	 * nicht die im `class`-Attribut. Der Zustand muss deshalb GENAU EINE der
	 * Klassen emittieren, analog zum `stateClass` in `BaseInput`/`BaseSelect`.
	 */
	describe('Fehler-Optik', () => {
		it('nutzt radio-error statt radio-primary bei hasError', async () => {
			const screen = await render(BaseRadio, { options, name: 'boatDrive', hasError: true });

			radiosOf(screen.container).forEach((radio) => {
				expect(radio.classList.contains('radio-error')).toBe(true);
				expect(radio.classList.contains('radio-primary')).toBe(false);
			});
		});

		it('nutzt radio-success statt radio-primary bei isValid', async () => {
			const screen = await render(BaseRadio, { options, name: 'boatDrive', isValid: true });

			radiosOf(screen.container).forEach((radio) => {
				expect(radio.classList.contains('radio-success')).toBe(true);
				expect(radio.classList.contains('radio-primary')).toBe(false);
			});
		});

		it('bleibt ohne Zustand auf radio-primary', async () => {
			const screen = await render(BaseRadio, { options, name: 'boatDrive' });

			radiosOf(screen.container).forEach((radio) => {
				expect(radio.classList.contains('radio-primary')).toBe(true);
				expect(radio.classList.contains('radio-error')).toBe(false);
				expect(radio.classList.contains('radio-success')).toBe(false);
			});
		});

		it('zeigt den Fehler-Zustand auch dann, wenn isValid gleichzeitig gesetzt ist', async () => {
			const screen = await render(BaseRadio, {
				options,
				name: 'boatDrive',
				hasError: true,
				isValid: true
			});

			radiosOf(screen.container).forEach((radio) => {
				expect(radio.classList.contains('radio-error')).toBe(true);
				expect(radio.classList.contains('radio-success')).toBe(false);
			});
		});
	});

	/** Die Größen-Klasse darf durch den Zustands-Zweig nicht verloren gehen. */
	describe('Größen', () => {
		it('behält die Größen-Klasse neben dem Fehler-Zustand', async () => {
			const screen = await render(BaseRadio, {
				options,
				name: 'boatDrive',
				size: 'sm' as const,
				hasError: true
			});

			radiosOf(screen.container).forEach((radio) => {
				expect(radio.classList.contains('radio-sm')).toBe(true);
				expect(radio.classList.contains('radio-error')).toBe(true);
			});
		});
	});
});
