import { render } from 'vitest-browser-svelte';
import { describe, it, expect } from 'vitest';
import { page } from 'vitest/browser';
import FieldRenderer from './FieldRenderer.svelte';
import { getPublicBoatDriveOptions } from '#lib/report/formOptions/boatDrive.ts';
import type * as yup from 'yup';

// Mock field configs that mirror the real schema's .describe() output
// without importing the full schema (which pulls in PostGIS, Drizzle, etc.)

function makeFieldConfig(
	overrides: Partial<{
		label: string;
		optional: boolean;
		type: string;
		meta: Record<string, unknown>;
	}> = {}
): yup.SchemaDescription {
	return {
		type: overrides.type ?? 'string',
		label: overrides.label ?? 'Test-Feld',
		optional: overrides.optional ?? true,
		nullable: false,
		default: undefined,
		oneOf: [],
		notOneOf: [],
		tests: [],
		meta: {
			type: 'text',
			helpText: '',
			valueText: '',
			placeholder: '',
			selectPlaceholder: '',
			options: [],
			...(overrides.meta ?? {})
		}
	} as unknown as yup.SchemaDescription;
}

const emailFieldConfig = makeFieldConfig({
	label: 'E-Mail',
	optional: false,
	meta: {
		type: 'email',
		helpText: 'Ihre E-Mail-Adresse für Rückfragen',
		placeholder: 'email@beispiel.de'
	}
});

const phoneFieldConfig = makeFieldConfig({
	label: 'Telefon',
	optional: true,
	meta: { type: 'tel', helpText: '' }
});

const speciesFieldConfig = makeFieldConfig({
	label: 'Tierart',
	optional: false,
	meta: {
		type: 'select',
		selectPlaceholder: 'Bitte wählen...',
		options: [
			{ value: 0, label: 'Schweinswal' },
			{ value: 1, label: 'Kegelrobbe' },
			{ value: 2, label: 'Seehund' }
		]
	}
});

const isDeadFieldConfig = makeFieldConfig({
	label: 'Totfund',
	optional: true,
	type: 'boolean',
	meta: { type: 'toggle' }
});

const otherObsFieldConfig = makeFieldConfig({
	label: 'Sonstige Auffälligkeiten',
	optional: true,
	meta: { type: 'textarea', rows: 4, placeholder: 'Weitere Beobachtungen...' }
});

const dateFieldConfig = makeFieldConfig({
	label: 'Datum',
	optional: false,
	meta: { type: 'date' }
});

const distributionFieldConfig = makeFieldConfig({
	label: 'Verteilung',
	optional: true,
	type: 'number',
	meta: {
		type: 'radio',
		options: [
			{ value: 1, label: 'einzeln' },
			{ value: 2, label: 'Mutter mit Jungtier' },
			{ value: 3, label: 'deutliche Schulen' }
		]
	}
});

const deadConfirmedFieldConfig = makeFieldConfig({
	label: 'Totfund bestätigt',
	optional: true,
	type: 'boolean',
	meta: { type: 'checkbox' }
});

describe('FieldRenderer', () => {
	describe('Pflichtfeld-Anzeige', () => {
		it('zeigt Pflichtfeld-Stern (*) für required Fields', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: ''
			});

			await expect.element(page.getByLabelText('Pflichtfeld')).toBeVisible();
		});

		it('zeigt keinen Stern für optionale Fields', async () => {
			await render(FieldRenderer, {
				fieldConfig: phoneFieldConfig,
				name: 'phone',
				value: ''
			});

			const star = page.getByLabelText('Pflichtfeld');
			await expect.element(star).not.toBeInTheDocument();
		});
	});

	describe('Pflichtfeld-Override (konditionale Schema-Regeln)', () => {
		// waterway ist im Schema `optional`, wird aber über `when('hasPosition')`
		// zur Pflicht, sobald keine GPS-Position vorliegt.
		const waterwayFieldConfig = makeFieldConfig({
			label: 'Fahrwasser/Seegebiet',
			optional: true,
			meta: { type: 'text', placeholder: 'z.B. Kieler Bucht' }
		});

		it('zeigt Stern für ein schema-optionales Feld mit required={true}', async () => {
			await render(FieldRenderer, {
				fieldConfig: waterwayFieldConfig,
				name: 'waterway',
				value: '',
				required: true
			});

			await expect.element(page.getByLabelText('Pflichtfeld')).toBeVisible();
		});

		it('setzt aria-required=true bei required={true} trotz optionalem Schema', async () => {
			await render(FieldRenderer, {
				fieldConfig: waterwayFieldConfig,
				name: 'waterway',
				value: '',
				required: true
			});

			await expect
				.element(page.getByTestId('field-waterway'))
				.toHaveAttribute('aria-required', 'true');
		});

		it('entfernt Stern und aria-required bei required={false}', async () => {
			await render(FieldRenderer, {
				fieldConfig: waterwayFieldConfig,
				name: 'waterway',
				value: '',
				required: false
			});

			await expect.element(page.getByLabelText('Pflichtfeld')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('field-waterway'))
				.not.toHaveAttribute('aria-required', 'true');
		});

		it('unterdrückt die Schema-Pflicht, wenn required={false} übergeben wird', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: '',
				required: false
			});

			await expect.element(page.getByLabelText('Pflichtfeld')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('field-email'))
				.not.toHaveAttribute('aria-required', 'true');
		});

		it('nutzt ohne Override weiterhin die Schema-Ableitung', async () => {
			await render(FieldRenderer, {
				fieldConfig: waterwayFieldConfig,
				name: 'waterway',
				value: ''
			});

			await expect.element(page.getByLabelText('Pflichtfeld')).not.toBeInTheDocument();
		});
	});

	/**
	 * PR 4 (Museum, 2026-08-04): `boatDrive` bleibt im Schema ein 6-Werte-Select
	 * (für die Admin-Maske), soll im Meldeformular aber nur noch als
	 * Zwei-Optionen-Radiogruppe ("Motor lief" / "Motor lief nicht") erscheinen —
	 * ohne eigenes Markup in der Section (design-system.md: Label,
	 * Pflicht-Sternchen, `aria-describedby` müssen aus der Feld-Pipeline kommen).
	 * Dafür bekommen `FormField`/`FieldRenderer` zwei neue Overrides, analog zum
	 * bereits vorhandenen `required`-Override: `type` und `options`.
	 */
	describe('type/options-Override (PR 4 — Bootsantrieb "Motor an/aus")', () => {
		// Bootsantrieb, wie ihn das Schema für die Admin-Maske beschreibt: ein
		// Select mit allen fünf/sechs Werten.
		const boatDriveSelectFieldConfig = makeFieldConfig({
			label: 'Bootsantrieb',
			optional: false,
			meta: {
				type: 'select',
				helpText: 'Welcher Antrieb wurde während der Sichtung verwendet?',
				selectPlaceholder: 'Bitte wählen...',
				options: [
					{ value: 0, label: 'Sonstiger Bootsantrieb' },
					{ value: 1, label: 'Motor' },
					{ value: 2, label: 'Segel' },
					{ value: 3, label: 'Treibend' },
					{ value: 4, label: 'Vor Anker' }
				]
			}
		});

		// Die echte Konstante, nicht eine Kopie: So fällt hier auf, wenn die
		// öffentliche Auswahl aus `formOptions/boatDrive.ts` wegdriftet.
		const publicBoatDriveOptions = getPublicBoatDriveOptions();

		it('rendert bei type="radio" + eigenen options eine Radiogruppe mit genau diesen Optionen', async () => {
			await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions
			});

			await expect.element(page.getByText('Motor lief nicht')).toBeVisible();
			await expect.element(page.getByRole('radio').first()).toBeVisible();
		});

		it('zeigt die Schema-Select-Optionen NICHT mehr, wenn options überschrieben wurde', async () => {
			await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions
			});

			await expect.element(page.getByText('Treibend')).not.toBeInTheDocument();
			await expect.element(page.getByText('Vor Anker')).not.toBeInTheDocument();
			await expect.element(page.getByRole('combobox')).not.toBeInTheDocument();
		});

		it('behält Label und Pflicht-Sternchen aus dem Schema, auch mit Override', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions
			});

			// Gezielt die Legend der Radiogruppe (nicht per getByText('Bootsantrieb'),
			// das mit "Sonstiger Bootsantrieb" mehrdeutig würde, solange der
			// Options-Override noch nicht greift und das Schema-Select weiterhin
			// mitrendert wird).
			const legend = screen.container.querySelector('legend');
			expect(legend?.textContent).toContain('Bootsantrieb');
			await expect.element(page.getByLabelText('Pflichtfeld')).toBeVisible();
		});

		it('verknüpft aria-describedby weiterhin mit dem Hilfetext, auch mit Override', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions
			});

			const helpElement = screen.container.querySelector('#field-boatDrive-help');
			expect(helpElement).not.toBeNull();
			expect(helpElement?.textContent).toContain(
				'Welcher Antrieb wurde während der Sichtung verwendet?'
			);

			const radios = screen.container.querySelectorAll('input[type="radio"]');
			expect(radios.length).toBeGreaterThan(0);
			radios.forEach((radio) => {
				expect(radio.getAttribute('aria-describedby')).toContain('field-boatDrive-help');
			});
		});

		/**
		 * Die ARIA-Zustände der Radiogruppe liegen am `fieldset`, nicht an den
		 * einzelnen Radios: ARIA 1.2 hat `aria-invalid`/`aria-required` aus den
		 * globalen Zuständen genommen, `role="radio"` unterstützt sie seither
		 * nicht mehr. Damit das fieldset sie tragen darf, überschreibt es seine
		 * implizite Rolle `group` mit `radiogroup`.
		 *
		 * Ein Test an `BaseRadio` allein bemerkt nicht, wenn `FieldRenderer`
		 * aufhört, den Zustand zu setzen — deshalb steht das hier.
		 */
		it('macht das fieldset zur radiogroup und benennt es über die Legend', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions
			});

			const group = screen.container.querySelector('fieldset');
			expect(group?.getAttribute('role')).toBe('radiogroup');

			const legend = screen.container.querySelector('legend');
			expect(legend?.id).toBeTruthy();
			expect(group?.getAttribute('aria-labelledby')).toBe(legend?.id);
		});

		it('setzt aria-invalid=true an der Radiogruppe, wenn ein Fehler anliegt', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions,
				error: 'Bitte wählen Sie den Bootsantrieb aus.'
			});

			expect(screen.container.querySelector('fieldset')?.getAttribute('aria-invalid')).toBe('true');
		});

		it('setzt kein aria-invalid an der Radiogruppe ohne Fehler', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions
			});

			expect(screen.container.querySelector('fieldset')?.getAttribute('aria-invalid')).not.toBe(
				'true'
			);
		});

		it('setzt aria-required=true an der Radiogruppe (Schema-Pflichtfeld)', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions
			});

			expect(screen.container.querySelector('fieldset')?.getAttribute('aria-required')).toBe(
				'true'
			);
		});

		/**
		 * Sternchen und `aria-required` müssen laut `design-system.md` aus
		 * derselben Variable kommen. Vorher rendete die Caption das Sternchen,
		 * während die Gruppe kein `aria-required` trug — genau das Driften, das
		 * die Regel verbietet.
		 */
		it('hält Pflicht-Sternchen und aria-required der Radiogruppe zusammen', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions,
				required: false
			});

			expect(screen.container.querySelector('[aria-label="Pflichtfeld"]')).toBeNull();
			expect(screen.container.querySelector('fieldset')?.getAttribute('aria-required')).not.toBe(
				'true'
			);
		});

		/**
		 * Gegenprobe zur Entscheidung oben: Die Attribute stehen aus
		 * `commonFieldProps` zwar bereit, dürfen aber nicht an den Radios landen.
		 */
		it('setzt die ARIA-Zustände NICHT an den einzelnen Radios', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions,
				error: 'Bitte wählen Sie den Bootsantrieb aus.'
			});

			const radios = screen.container.querySelectorAll('input[type="radio"]');
			expect(radios.length).toBeGreaterThan(0);
			radios.forEach((radio) => {
				expect(radio.hasAttribute('aria-invalid')).toBe(false);
				expect(radio.hasAttribute('aria-required')).toBe(false);
			});
		});

		it('gibt der Radiogruppe bei Fehler die Fehler-Optik statt radio-primary', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null,
				type: 'radio',
				options: publicBoatDriveOptions,
				error: 'Bitte wählen Sie den Bootsantrieb aus.'
			});

			const radios = screen.container.querySelectorAll('input[type="radio"]');
			expect(radios.length).toBeGreaterThan(0);
			radios.forEach((radio) => {
				expect(radio.classList.contains('radio-error')).toBe(true);
				expect(radio.classList.contains('radio-primary')).toBe(false);
			});
		});

		it('rendert ohne Override weiterhin das Schema-Select (Admin-Maske)', async () => {
			await render(FieldRenderer, {
				fieldConfig: boatDriveSelectFieldConfig,
				name: 'boatDrive',
				value: null
			});

			await expect.element(page.getByRole('combobox')).toBeVisible();
			await expect.element(page.getByText('Motor lief nicht')).not.toBeInTheDocument();
		});

		/**
		 * Nacharbeit zu PR 4: Der Schema-Hilfetext ("Welcher Antrieb wurde
		 * während der Sichtung verwendet?") gehört zur Admin-Maske mit ihrer
		 * vollen Antriebsauswahl. Im Meldeformular steht darüber eine
		 * Ja/Nein-Frage — der Text beantwortet dort etwas, das gar nicht gefragt
		 * wird. `undefined` erbt weiterhin aus dem Schema, ein String ersetzt,
		 * `null` unterdrückt.
		 */
		describe('helpText-Override', () => {
			it('unterdrückt den Schema-Hilfetext bei helpText={null}', async () => {
				const screen = await render(FieldRenderer, {
					fieldConfig: boatDriveSelectFieldConfig,
					name: 'boatDrive',
					value: null,
					type: 'radio',
					options: publicBoatDriveOptions,
					helpText: null
				});

				expect(screen.container.querySelector('#field-boatDrive-help')).toBeNull();
				await expect
					.element(page.getByText('Welcher Antrieb wurde während der Sichtung verwendet?'))
					.not.toBeInTheDocument();
			});

			it('nimmt den unterdrückten Hilfetext auch aus aria-describedby heraus', async () => {
				const screen = await render(FieldRenderer, {
					fieldConfig: boatDriveSelectFieldConfig,
					name: 'boatDrive',
					value: null,
					type: 'radio',
					options: publicBoatDriveOptions,
					helpText: null
				});

				const radios = screen.container.querySelectorAll('input[type="radio"]');
				expect(radios.length).toBeGreaterThan(0);
				radios.forEach((radio) => {
					expect(radio.getAttribute('aria-describedby') ?? '').not.toContain(
						'field-boatDrive-help'
					);
				});
			});

			it('ersetzt den Schema-Hilfetext durch einen übergebenen String', async () => {
				const screen = await render(FieldRenderer, {
					fieldConfig: boatDriveSelectFieldConfig,
					name: 'boatDrive',
					value: null,
					type: 'radio',
					options: publicBoatDriveOptions,
					helpText: 'Nur Motorgeräusche zählen.'
				});

				const helpElement = screen.container.querySelector('#field-boatDrive-help');
				expect(helpElement?.textContent).toContain('Nur Motorgeräusche zählen.');
				expect(helpElement?.textContent).not.toContain('Welcher Antrieb');
			});

			it('nutzt ohne Override weiterhin den Schema-Hilfetext', async () => {
				const screen = await render(FieldRenderer, {
					fieldConfig: boatDriveSelectFieldConfig,
					name: 'boatDrive',
					value: null,
					type: 'radio',
					options: publicBoatDriveOptions
				});

				const helpElement = screen.container.querySelector('#field-boatDrive-help');
				expect(helpElement?.textContent).toContain(
					'Welcher Antrieb wurde während der Sichtung verwendet?'
				);
			});
		});

		/**
		 * Nacharbeit zu PR 4: `BaseRadio` gab das Feld-Icon innerhalb der
		 * Options-Schleife aus — bei zwei Optionen stand derselbe Blitz zweimal
		 * untereinander. Das Icon gehört einmal an die Gruppe, so wie es bei
		 * Select und Text einmal am Feld steht.
		 */
		describe('Feld-Icon bei Radiogruppen', () => {
			const boatDriveRadioFieldConfig = makeFieldConfig({
				label: 'Bootsantrieb',
				optional: false,
				type: 'number',
				meta: {
					type: 'radio',
					icon: 'lucide:zap',
					options: getPublicBoatDriveOptions()
				}
			});

			it('rendert das Feld-Icon genau einmal, nicht pro Option', async () => {
				const screen = await render(FieldRenderer, {
					fieldConfig: boatDriveRadioFieldConfig,
					name: 'boatDrive',
					value: null
				});

				// Zwei Optionen, aber nur ein Icon im gesamten Feld.
				expect(screen.container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
				expect(screen.container.querySelectorAll('svg')).toHaveLength(1);
			});

			it('setzt das Icon in die Legende der Gruppe', async () => {
				const screen = await render(FieldRenderer, {
					fieldConfig: boatDriveRadioFieldConfig,
					name: 'boatDrive',
					value: null
				});

				expect(screen.container.querySelector('legend svg')).not.toBeNull();
			});

			it('rendert kein Icon in den Optionszeilen', async () => {
				const screen = await render(FieldRenderer, {
					fieldConfig: boatDriveRadioFieldConfig,
					name: 'boatDrive',
					value: null
				});

				const optionRows = screen.container.querySelectorAll('label:has(input[type="radio"])');
				expect(optionRows.length).toBe(2);
				optionRows.forEach((row) => {
					expect(row.querySelector('svg')).toBeNull();
				});
			});
		});
	});

	describe('Häkchen nur bei berührten Feldern', () => {
		it('zeigt KEIN grünes Häkchen für ein Feld mit Wert, das nicht berührt wurde', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: 'test@test.de',
				touched: false
			});

			// Erfolgs-Icon (lucide:check) darf nicht gerendert sein
			const check = screen.container.querySelector('.text-success-strong');
			expect(check).toBeNull();
		});

		it('zeigt grünes Häkchen für ein berührtes Feld mit Wert und ohne Fehler', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: 'test@test.de',
				touched: true
			});

			const check = screen.container.querySelector('.text-success-strong');
			expect(check).not.toBeNull();
		});

		it('zeigt kein Häkchen für ein berührtes Feld mit Fehler', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: 'test@test.de',
				touched: true,
				error: 'Fehler'
			});

			const check = screen.container.querySelector('.text-success-strong');
			expect(check).toBeNull();
		});
	});

	describe('Error-Anzeige', () => {
		it('zeigt Fehlermeldung mit role="alert"', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: '',
				error: 'E-Mail ist erforderlich'
			});

			const alert = page.getByRole('alert');
			await expect.element(alert).toBeVisible();
			await expect.element(page.getByText('E-Mail ist erforderlich')).toBeVisible();
		});

		it('setzt aria-live="polite" auf Fehlermeldung', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: '',
				error: 'Fehler'
			});

			const alert = page.getByRole('alert');
			await expect.element(alert).toHaveAttribute('aria-live', 'polite');
		});

		it('zeigt keine Fehlermeldung ohne Error', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: 'test@test.de'
			});

			const alert = page.getByRole('alert');
			await expect.element(alert).not.toBeInTheDocument();
		});
	});

	/**
	 * `hasError`/`isValid` stehen seit jeher in `commonFieldProps` und gingen über
	 * `checkboxProps`/`toggleProps` hinaus — nur nahmen `BaseCheckbox` und
	 * `BaseToggle` sie nicht an, und sie fielen still weg. Genau deshalb reichen
	 * die Tests an den Komponenten nicht: Sie merken nicht, wenn der Renderer
	 * aufhört, die Props zu setzen. Diese Gruppe prüft die Strecke.
	 */
	describe('Fehler-Optik erreicht Checkbox und Toggle', () => {
		function controlOf(testId: string): HTMLInputElement {
			const el = document.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
			if (!el) throw new Error(`Kein Control mit data-testid="${testId}"`);
			return el;
		}

		it('reicht hasError als checkbox-error durch', async () => {
			await render(FieldRenderer, {
				fieldConfig: deadConfirmedFieldConfig,
				name: 'deadConfirmed',
				value: false,
				error: 'Bitte bestätigen'
			});

			await expect.element(page.getByRole('checkbox')).toBeVisible();
			const box = controlOf('field-deadConfirmed');
			expect(box.classList.contains('checkbox-error')).toBe(true);
			expect(box.classList.contains('checkbox-primary')).toBe(false);
		});

		it('reicht hasError als toggle-error durch', async () => {
			await render(FieldRenderer, {
				fieldConfig: isDeadFieldConfig,
				name: 'isDead',
				value: false,
				error: 'Bitte bestätigen'
			});

			await expect.element(page.getByTestId('field-isDead')).toBeVisible();
			const toggle = controlOf('field-isDead');
			expect(toggle.classList.contains('toggle-error')).toBe(true);
			expect(toggle.classList.contains('toggle-primary')).toBe(false);
		});

		/** `isValid` = `touched && hasValue && !hasError` (siehe FieldRenderer). */
		it('reicht isValid als checkbox-success durch', async () => {
			await render(FieldRenderer, {
				fieldConfig: deadConfirmedFieldConfig,
				name: 'deadConfirmed',
				value: true,
				touched: true
			});

			await expect.element(page.getByRole('checkbox')).toBeVisible();
			const box = controlOf('field-deadConfirmed');
			expect(box.classList.contains('checkbox-success')).toBe(true);
			expect(box.classList.contains('checkbox-primary')).toBe(false);
		});

		it('reicht isValid als toggle-success durch', async () => {
			await render(FieldRenderer, {
				fieldConfig: isDeadFieldConfig,
				name: 'isDead',
				value: true,
				touched: true
			});

			await expect.element(page.getByTestId('field-isDead')).toBeVisible();
			const toggle = controlOf('field-isDead');
			expect(toggle.classList.contains('toggle-success')).toBe(true);
			expect(toggle.classList.contains('toggle-primary')).toBe(false);
		});

		it('bleibt im Normalfall auf der primary-Variante', async () => {
			await render(FieldRenderer, {
				fieldConfig: isDeadFieldConfig,
				name: 'isDead',
				value: false
			});

			await expect.element(page.getByTestId('field-isDead')).toBeVisible();
			const toggle = controlOf('field-isDead');
			expect(toggle.classList.contains('toggle-primary')).toBe(true);
			expect(toggle.classList.contains('toggle-error')).toBe(false);
			expect(toggle.classList.contains('toggle-success')).toBe(false);
		});
	});

	describe('ARIA-Attribute', () => {
		it('setzt aria-invalid=true bei Fehler', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: '',
				error: 'Fehler'
			});

			const input = page.getByTestId('field-email');
			await expect.element(input).toHaveAttribute('aria-invalid', 'true');
		});

		it('setzt aria-invalid=false ohne Fehler', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: 'test@test.de'
			});

			const input = page.getByTestId('field-email');
			// Svelte renders boolean false as "false" string attribute
			await expect.element(input).not.toHaveAttribute('aria-invalid', 'true');
		});

		it('setzt aria-required=true für Pflichtfelder', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: ''
			});

			const input = page.getByTestId('field-email');
			await expect.element(input).toHaveAttribute('aria-required', 'true');
		});

		it('setzt aria-required=false für optionale Felder', async () => {
			await render(FieldRenderer, {
				fieldConfig: phoneFieldConfig,
				name: 'phone',
				value: ''
			});

			const input = page.getByTestId('field-phone');
			// Optional fields should not have aria-required=true
			await expect.element(input).not.toHaveAttribute('aria-required', 'true');
		});

		it('setzt data-testid mit Feldnamen', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: ''
			});

			await expect.element(page.getByTestId('field-email')).toBeVisible();
		});

		it('verknüpft Hilfetext via aria-describedby', async () => {
			const screen = await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: ''
			});

			// The help text element should exist with the correct ID
			const helpElement = screen.container.querySelector('#field-email-help');
			expect(helpElement).not.toBeNull();
			expect(helpElement?.textContent).toContain('Ihre E-Mail-Adresse für Rückfragen');
		});

		// Das Feld-Icon aus meta.icon ist rein dekorativ — die Bedeutung trägt das Label.
		// Ohne aria-hidden meldet der Screenreader es als unbeschriftete Grafik.
		it.each([
			['text', 'text'],
			['select', 'select'],
			['textarea', 'textarea'],
			['radio', 'radio']
		])('blendet das dekorative Feld-Icon aus (%s)', async (_name, fieldType) => {
			const screen = await render(FieldRenderer, {
				fieldConfig: makeFieldConfig({
					label: 'Bemerkungen',
					meta: {
						type: fieldType,
						icon: 'lucide:file-text',
						options: [{ value: 1, label: 'Eins' }]
					}
				}),
				name: 'notes',
				value: ''
			});

			const svg = screen.container.querySelector('svg');
			expect(svg).not.toBeNull();
			expect(svg?.closest('[aria-hidden="true"]')).not.toBeNull();
		});
	});

	describe('Hilfetext', () => {
		it('zeigt Hilfetext wenn konfiguriert', async () => {
			await render(FieldRenderer, {
				fieldConfig: emailFieldConfig,
				name: 'email',
				value: ''
			});

			await expect.element(page.getByText('Ihre E-Mail-Adresse für Rückfragen')).toBeVisible();
		});

		it('zeigt keinen Hilfetext wenn leer', async () => {
			await render(FieldRenderer, {
				fieldConfig: phoneFieldConfig,
				name: 'phone',
				value: ''
			});

			// Phone hat leeren helpText → kein Hilfetext-Element
			const helpEl = page.getByText('Ihre E-Mail-Adresse');
			await expect.element(helpEl).not.toBeInTheDocument();
		});
	});

	describe('Feld-Typ-Rendering', () => {
		it('rendert Select mit Optionen', async () => {
			await render(FieldRenderer, {
				fieldConfig: speciesFieldConfig,
				name: 'species',
				value: ''
			});

			const select = page.getByTestId('field-species');
			await expect.element(select).toBeVisible();
			// Options exist in DOM (not visible when dropdown is closed, but present)
			const selectEl = await select.element();
			const options = selectEl.querySelectorAll('option');
			// 3 options + 1 placeholder = 4
			expect(options.length).toBeGreaterThanOrEqual(3);
		});

		it('rendert Toggle für Boolean-Feld', async () => {
			await render(FieldRenderer, {
				fieldConfig: isDeadFieldConfig,
				name: 'isDead',
				value: false
			});

			const toggle = page.getByTestId('field-isDead');
			await expect.element(toggle).toBeVisible();
		});

		it('rendert Textarea', async () => {
			await render(FieldRenderer, {
				fieldConfig: otherObsFieldConfig,
				name: 'otherObservations',
				value: ''
			});

			const textarea = page.getByTestId('field-otherObservations');
			await expect.element(textarea).toBeVisible();
		});

		it('rendert Date-Input', async () => {
			await render(FieldRenderer, {
				fieldConfig: dateFieldConfig,
				name: 'sightingDate',
				value: ''
			});

			const input = page.getByTestId('field-sightingDate');
			await expect.element(input).toBeVisible();
		});

		it('rendert Radio-Optionen mit allen Auswahlmöglichkeiten', async () => {
			await render(FieldRenderer, {
				fieldConfig: distributionFieldConfig,
				name: 'distribution',
				value: null
			});

			await expect.element(page.getByText('einzeln')).toBeVisible();
			await expect.element(page.getByText('Mutter mit Jungtier')).toBeVisible();
			await expect.element(page.getByText('deutliche Schulen')).toBeVisible();
		});

		it('rendert Checkbox mit Label', async () => {
			await render(FieldRenderer, {
				fieldConfig: deadConfirmedFieldConfig,
				name: 'deadConfirmed',
				value: false
			});

			await expect.element(page.getByRole('checkbox')).toBeVisible();
			await expect.element(page.getByText('Totfund bestätigt').first()).toBeVisible();
		});
	});

	describe('value synchronisation — incoming prop → internal state', () => {
		const numberFieldConfig = makeFieldConfig({
			label: 'Anzahl',
			optional: true,
			meta: { type: 'number', placeholder: '' }
		});

		it('zeigt numerischen Wert 42 korrekt im Number-Input', async () => {
			await render(FieldRenderer, {
				fieldConfig: numberFieldConfig,
				name: 'count',
				value: 42
			});

			const input = page.getByTestId('field-count');
			// toHaveValue on <input type="number"> returns a number, not a string
			await expect.element(input).toHaveValue(42);
		});

		it('zeigt String-Wert "5" korrekt im Number-Input ohne Verfälschung', async () => {
			await render(FieldRenderer, {
				fieldConfig: numberFieldConfig,
				name: 'count',
				value: '5'
			});

			const input = page.getByTestId('field-count');
			// toHaveValue on <input type="number"> returns a number, not a string
			await expect.element(input).toHaveValue(5);
		});

		it('zeigt Datums-String "2024-01-15" korrekt im Date-Input (kein NaN)', async () => {
			await render(FieldRenderer, {
				fieldConfig: dateFieldConfig,
				name: 'sightingDate',
				value: '2024-01-15'
			});

			const input = page.getByTestId('field-sightingDate');
			await expect.element(input).toHaveValue('2024-01-15');
		});

		it('setzt Checkbox als aktiviert wenn value=true', async () => {
			await render(FieldRenderer, {
				fieldConfig: deadConfirmedFieldConfig,
				name: 'deadConfirmed',
				value: true
			});

			await expect.element(page.getByRole('checkbox')).toBeChecked();
		});

		it('setzt Checkbox als deaktiviert wenn value=false', async () => {
			await render(FieldRenderer, {
				fieldConfig: deadConfirmedFieldConfig,
				name: 'deadConfirmed',
				value: false
			});

			await expect.element(page.getByRole('checkbox')).not.toBeChecked();
		});

		it('zeigt Textarea-Inhalt "Hallo Welt" korrekt', async () => {
			await render(FieldRenderer, {
				fieldConfig: otherObsFieldConfig,
				name: 'otherObservations',
				value: 'Hallo Welt'
			});

			const textarea = page.getByTestId('field-otherObservations');
			await expect.element(textarea).toHaveValue('Hallo Welt');
		});

		it('selektiert Option mit Wert 0 im Select korrekt', async () => {
			const selectWithZero = makeFieldConfig({
				label: 'Bootsantrieb',
				optional: true,
				meta: {
					type: 'select',
					selectPlaceholder: 'Bitte wählen...',
					options: [
						{ value: 0, label: 'Sonstiges' },
						{ value: 1, label: 'Motor' }
					]
				}
			});

			await render(FieldRenderer, {
				fieldConfig: selectWithZero,
				name: 'boatDrive',
				value: 0
			});

			const select = page.getByTestId('field-boatDrive');
			await expect.element(select).toHaveValue('0');
		});
	});
});
