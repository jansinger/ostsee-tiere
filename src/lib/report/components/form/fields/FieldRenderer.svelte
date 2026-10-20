<!--
  Field renderer component that uses fieldConfig to route to the correct field component
  Independent of form context, accepts fieldConfig and value props
-->
<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import type { FieldOption, FieldSize, FieldVariant } from '#lib/types/index.ts';
	import * as yup from 'yup';
	import BaseCheckbox from './BaseCheckbox.svelte';
	import BaseInput from './BaseInput.svelte';
	import BaseRadio from './BaseRadio.svelte';
	import BaseSelect from './BaseSelect.svelte';
	import BaseTextarea from './BaseTextarea.svelte';
	import BaseToggle from './BaseToggle.svelte';
	import SpeciesIdentificationHelp from './SpeciesIdentificationHelp.svelte';

	let {
		fieldConfig,
		name = '',
		value = $bindable(),
		error = undefined,
		touched = false,
		disabled = false,
		size = 'md',
		variant = 'default',
		onchange = undefined,
		required: requiredOverride = undefined,
		label: labelOverride = undefined,
		type: typeOverride = undefined,
		options: optionsOverride = undefined,
		helpText: helpTextOverride = undefined,
		describedBy = undefined
	}: {
		fieldConfig: yup.SchemaDescription;
		name?: string;
		value?: string | number | boolean | undefined | null;
		error?: string | undefined;
		touched?: boolean;
		disabled?: boolean;
		size?: FieldSize;
		variant?: FieldVariant;
		onchange?: (event: Event) => void;
		/**
		 * Überschreibt die aus dem Yup-Schema abgeleitete Pflichtfeld-Markierung.
		 * Nötig für konditionale `when()`-Regeln, die in `fieldConfig.optional`
		 * nicht sichtbar sind (z.B. `waterway` ohne GPS-Position).
		 * `undefined` = Ableitung aus dem Schema (Default).
		 */
		required?: boolean | undefined;
		/**
		 * Überschreibt die aus `fieldConfig.label` abgeleitete Beschriftung, wenn
		 * dieselbe Schema-Spalte in zwei Kontexten unterschiedlich gefragt wird.
		 * `undefined` = Ableitung aus dem Schema (Default).
		 */
		label?: string | undefined;
		/**
		 * Überschreibt den aus `meta.type` abgeleiteten Feldtyp. Nötig, wenn
		 * dasselbe Schema-Feld je nach Kontext anders bedient wird — z.B.
		 * `boatDrive`: Select mit allen Antriebsarten in der Admin-Maske,
		 * Zwei-Optionen-Radiogruppe im Meldeformular.
		 * `undefined` = Ableitung aus dem Schema (Default).
		 */
		type?: string | undefined;
		/**
		 * Überschreibt die aus `meta.options` abgeleitete Optionsliste. Gehört
		 * fachlich zum `type`-Override und wird meist zusammen mit ihm gesetzt.
		 * `undefined` = Ableitung aus dem Schema (Default).
		 */
		options?: FieldOption[] | undefined;
		/**
		 * Überschreibt den aus `meta.helpText` abgeleiteten Hilfetext. Nötig,
		 * wenn ein `label`/`type`-Override die Frage so verändert, dass der
		 * Schema-Hilfetext sie nicht mehr beantwortet — z.B. `boatDrive`:
		 * „Welcher Antrieb wurde verwendet?" passt zur Admin-Auswahl, nicht zur
		 * Ja/Nein-Motorfrage im Meldeformular.
		 * `null` = bewusst kein Hilfetext (dann auch nicht in
		 * `aria-describedby`), `undefined` = Ableitung aus dem Schema (Default).
		 */
		helpText?: string | null | undefined;
		/**
		 * `id` eines Elements, das der Aufrufer selbst neben das Feld gestellt
		 * hat und das mitvorgelesen werden soll — zusätzlich zu Hilfetext,
		 * Beschreibung und Fehler, die diese Pipeline ohnehin verknüpft.
		 *
		 * Gebraucht, wenn der Kontext einer Frage nicht im Schema stehen kann,
		 * weil er aus dem Formularzustand kommt: `mediaConsent` auf Schritt 4
		 * nennt die hochgeladenen Aufnahmen namentlich (`Step4Contact.svelte`,
		 * UX-Review 2026-08-06, Punkt 2). Ohne diese Verknüpfung sieht ein
		 * Sehender die Dateinamen, wer direkt aufs Ankreuzfeld tabbt aber nicht.
		 *
		 * Bewusst nur die `id` und kein Text: Der Inhalt steht im Markup des
		 * Aufrufers, nicht in dieser Pipeline — sonst gäbe es ihn zweimal.
		 */
		describedBy?: string | undefined;
	} = $props();

	// Bindable values for different component types
	let booleanValue = $state(false);
	let stringValue = $state('');
	let numberValue = $state<number | string>('');

	// Sync boolean value with main value prop
	$effect(() => {
		if (normalizedType === 'checkbox' || normalizedType === 'toggle') {
			booleanValue = typeof value === 'boolean' ? value : value === undefined ? false : !!value;
		} else if (normalizedType === 'textarea') {
			stringValue = typeof value === 'string' ? value : '';
		} else if (
			[
				'text',
				'email',
				'tel',
				'number',
				'url',
				'password',
				'date',
				'time',
				'select',
				'radio'
			].includes(normalizedType)
		) {
			const next = typeof value === 'boolean' ? '' : (value ?? '');

			// Radiogruppen brauchen den Wert als ZAHL, alle anderen nicht.
			//
			// `BaseRadio` bindet per `bind:group`, und das vergleicht strikt gegen
			// die Optionswerte — die sind Zahlen. Der Formular-Store trägt aber
			// nach `handleChange` den String aus dem DOM-Event ("6"), weil
			// `createForm` das Event liest und nicht den hier gesetzten Wert.
			// Ohne Angleichung findet die Gruppe ihren eigenen gerade gesetzten
			// Wert nicht wieder und springt zurück auf „nichts gewählt": Der
			// Melder klickt, und der Punkt bleibt leer.
			//
			// Beim `<select>` fällt dieselbe Verkettung nicht auf, weil dessen
			// DOM-Wert ohnehin ein String ist und der Browser die Auswahl hält —
			// deshalb ist das erst mit dem ersten Radiofeld des Formulars
			// aufgetreten (`boatDrive`, PR 4). `next !== ''` schützt davor, dass
			// „nichts gewählt" über `Number('')` zu einer echten 0 wird — bei
			// `BoatDriveEnum.OTHER = 0` wäre das eine falsche Antwort.
			numberValue = normalizedType === 'radio' && next !== '' ? Number(next) : next;
		}
	});

	// Update main value when type-specific values change
	function handleBooleanChange(event?: Event) {
		if (normalizedType === 'checkbox' || normalizedType === 'toggle') {
			value = booleanValue;
			if (onchange && event) onchange(event);
		}
	}

	function handleStringChange(event?: Event) {
		if (normalizedType === 'textarea') {
			value = stringValue;
			if (onchange && event) onchange(event);
		}
	}

	function handleNumberChange(event?: Event) {
		if (
			[
				'text',
				'email',
				'tel',
				'number',
				'url',
				'password',
				'date',
				'time',
				'select',
				'radio'
			].includes(normalizedType)
		) {
			value = numberValue === null ? undefined : Number(numberValue);
			if (onchange && event) onchange(event);
		}
	}

	// Extract field configuration (reactive to prop changes)
	// Einzige Quelle für Sternchen UND aria-required: expliziter Override, sonst Schema.
	let required = $derived(requiredOverride ?? fieldConfig.optional === false);
	let metaValues = $derived.by(() => {
		const meta = fieldConfig.meta || {};
		return {
			options: optionsOverride ?? meta.options,
			// Kein `??`: `null` ist hier die ausdrückliche Ansage „kein Hilfetext"
			// und darf nicht auf den Schema-Text zurückfallen.
			helpText: helpTextOverride === undefined ? meta.helpText : helpTextOverride,
			valueText: meta.valueText,
			type: typeOverride ?? meta.type ?? fieldConfig.type,
			icon: meta.icon,
			rows: meta.rows,
			placeholder: meta.placeholder,
			selectPlaceholder: meta.selectPlaceholder,
			description: meta.description,
			autocomplete: meta.autocomplete
		};
	});
	let hasOptions = $derived(metaValues.options && metaValues.options.length > 0);
	let label = $derived(labelOverride ?? fieldConfig.label);

	// State computations
	let hasError = $derived(!!error && error.length > 0);
	let hasValue = $derived(value !== undefined && value !== '' && value !== null);
	// Grünes Häkchen nur für vom Nutzer berührte Felder — Default-Werte gelten nicht als bestätigt
	let isValid = $derived(touched && hasValue && !hasError);

	// Type normalization
	let normalizedType = $derived(
		metaValues.type === 'string'
			? 'text'
			: metaValues.type === 'boolean'
				? 'toggle'
				: metaValues.type
	);

	// Gruppenfelder: Radio hat mehrere Inputs (kein einzelnes label-Ziel) → fieldset/legend.
	// Checkbox/Toggle rendern ihr eigenes <label> mit dem Control → kein doppeltes Caption-Label.
	let isRadioGroup = $derived(normalizedType === 'radio' && hasOptions);
	let isSingleControl = $derived(normalizedType === 'checkbox' || normalizedType === 'toggle');

	// Dynamic CSS classes
	let containerClasses = $derived.by(() => {
		const base = 'fieldset w-full';
		const variantClass = variant === 'compact' ? 'compact' : variant === 'full' ? 'full-width' : '';
		return [base, variantClass].filter(Boolean).join(' ');
	});

	// Field IDs for accessibility
	let fieldId = $derived(`field-${name}`);
	let helpId = $derived(`${fieldId}-help`);
	let errorId = $derived(`${fieldId}-error`);
	let descriptionId = $derived(`${fieldId}-desc`);
	let legendId = $derived(`${fieldId}-legend`);

	// ARIA attributes
	let ariaDescribedBy = $derived.by(() => {
		const ids = [];
		// Zuerst: Was der Aufrufer neben das Feld gestellt hat, steht dort auch
		// optisch VOR ihm — die Vorlesereihenfolge soll der gesehenen folgen.
		if (describedBy) ids.push(describedBy);
		if (metaValues.helpText) ids.push(helpId);
		if (metaValues.description && metaValues.description !== metaValues.helpText)
			ids.push(descriptionId);
		if (error) ids.push(errorId);
		return ids.length > 0 ? ids.join(' ') : undefined;
	});

	// Common field props
	let commonFieldProps = $derived.by(() => ({
		id: fieldId,
		name,
		disabled,
		required,
		size,
		hasError,
		isValid,
		icon: metaValues.icon,
		...(ariaDescribedBy && { 'aria-describedby': ariaDescribedBy }),
		'aria-invalid': hasError,
		'aria-required': required,
		'data-testid': `field-${name}`
	}));

	// Type-specific props
	let inputProps = $derived.by(() => {
		const props = {
			...commonFieldProps,
			type: normalizedType as
				'text' | 'email' | 'tel' | 'number' | 'url' | 'password' | 'date' | 'time',
			placeholder: metaValues.placeholder || '',
			options: metaValues.options ?? [],
			...(metaValues.autocomplete && { autocomplete: metaValues.autocomplete })
		};
		return props;
	});

	let selectProps = $derived.by(() => {
		const props = {
			...commonFieldProps,
			options: metaValues.options ?? [],
			placeholder:
				metaValues.selectPlaceholder ||
				m.report_components_form_fields_fieldrenderer_text_bitte_waehlen()
		};
		return props;
	});

	let textareaProps = $derived.by(() => {
		const props = {
			...commonFieldProps,
			placeholder: metaValues.placeholder || '',
			rows: metaValues.rows || 4
		};
		return props;
	});

	// Die beiden ARIA-Zustände trägt das `fieldset[role="radiogroup"]`, nicht das
	// einzelne Radio (Begründung am fieldset im Markup). Sie werden hier bewusst
	// wieder entfernt, damit sie nicht als tote Props an `BaseRadio` gehen — genau
	// dort sind sie vorher still verschwunden, weil die Komponente sie nie annahm.
	let radioProps = $derived.by(() => {
		// Ohne `icon`: Eine Radiogruppe hat kein einzelnes Control, an dem das
		// Feld-Icon sitzen könnte — es steht deshalb an der Legende (siehe
		// caption-Snippet). `BaseRadio` würde es sonst pro Option ausgeben.
		const {
			icon: _icon,
			'aria-invalid': _ariaInvalid,
			'aria-required': _ariaRequired,
			...rest
		} = commonFieldProps;
		return {
			...rest,
			options: metaValues.options ?? []
		};
	});

	let checkboxProps = $derived.by(() => {
		const props = {
			...commonFieldProps,
			label: label || '',
			...(metaValues.valueText && { valueText: metaValues.valueText })
		};
		return props;
	});

	let toggleProps = $derived.by(() => {
		const props = {
			...commonFieldProps,
			label: label || '',
			...(metaValues.valueText && { valueText: metaValues.valueText })
		};
		return props;
	});
</script>

<!-- Caption-Inhalt (Label-Text, Pflichtfeld-Markierung, Status, Info-Tooltip) -->
<!-- `overflow-wrap: anywhere` statt des früheren `break-word` (ebenso in
     BaseCheckbox, BaseToggle und Checkbox): Nur `anywhere` senkt die
     Mindestbreite des Textes und macht das Layout damit unabhängig davon, ob
     `hyphens: auto` greift. Chromes Trennmuster hängen an Wörterbüchern, die auf
     Headless-CI-Images fehlen — nachgestellt lief Schritt 3 auf 320px sonst um
     11px über. Ausführliche Begründung am `.label`-Block in `src/app.css`;
     abgesichert durch `e2e/horizontal-overflow.spec.ts`. -->
{#snippet caption()}
	<span class="text-base-content block font-medium" style="overflow-wrap: anywhere; hyphens: auto;">
		<!-- Feld-Icon der Radiogruppe. BaseInput und BaseSelect setzen es links
		     ins Control; eine Radiogruppe hat kein solches Control, also steht es
		     hier an der Legende — einmal pro Feld, nicht einmal pro Option. -->
		{#if isRadioGroup && metaValues.icon}
			<span class="mr-1.5 inline-flex align-middle" aria-hidden="true">
				<Icon icon={metaValues.icon} width="16" class="text-base-content/60" />
			</span>
		{/if}
		{label}
		{#if required}
			<!-- `role="img"` ist nicht dekorativ, sondern die Bedingung dafür, dass das
			     `aria-label` überhaupt gilt: ARIA erlaubt eine Namensangabe nur an
			     Elementen mit einer Rolle, die Naming unterstützt — ein nacktes `span`
			     hat gar keine. axe meldet das als `aria-prohibited-attr`, allerdings
			     unter `incomplete` („not well supported"), und dort sah es bis zum
			     2026-08-14 niemand an. Dieselbe Ergänzung steht an den vier weiteren
			     Sternchen-Aufrufstellen (BaseCheckbox, BaseToggle, LocationInput,
			     /styleguide). -->
			<span
				class="text-error ml-1 text-sm"
				role="img"
				aria-label={m.report_components_form_fields_fieldrenderer_aria_label_pflichtfeld()}>*</span
			>
		{/if}

		<!-- Status Indicator (Häkchen nur bei berührten, gültigen Feldern) -->
		{#if hasError || isValid}
			<span class="ml-2 inline-block" aria-hidden="true">
				{#if hasError}
					<Icon icon="lucide:x" width="14" class="text-error inline" />
				{:else if isValid}
					<Icon icon="lucide:check" width="14" class="text-success-strong inline" />
				{/if}
			</span>
		{/if}

		<!-- Value Information Tooltip (fokussierbar für Tastatur/Touch)

		     `min-h-11 min-w-11` hält das 44-px-Touch-Target (design-system.md),
		     das `btn-xs` mit 24 px deutlich unterschritt. Das `-my-2.5` nimmt die
		     zusätzlichen 2 × 10 px wieder aus dem Zeilenfluss heraus, damit die
		     Label-Zeile bei 28 px bleibt und das Label nicht von seinem Feld
		     weggedrückt wird — ohne den Negativ-Margin wächst sie auf 48 px.

		     Damit das trägt, darf am Label/Legend kein `overflow-hidden` stehen:
		     es klippt nicht nur den überstehenden Teil der Trefferfläche, sondern
		     auch die Tooltip-Blase selbst. Horizontal hält `w-full` zusammen mit
		     dem `overflow-wrap` der Caption-Span (seit 2026-08-04 `anywhere`,
		     Begründung dort). -->
		{#if metaValues.valueText}
			<span class="tooltip tooltip-left ml-2 inline-block" data-tip={metaValues.valueText}>
				<button
					type="button"
					class="btn btn-ghost btn-sm btn-circle -my-2.5 min-h-11 min-w-11"
					aria-label={m.report_components_form_fields_fieldrenderer_aria_label_hinweis_valuetext({
						valueText: metaValues.valueText
					})}
				>
					<Icon icon="lucide:info" width="14" class="text-base-content/70" />
				</button>
			</span>
		{/if}
	</span>
{/snippet}

<!-- Field-Description (falls abweichend vom Hilfetext) -->
{#snippet description()}
	{#if metaValues.description && metaValues.description !== metaValues.helpText}
		<div id={descriptionId} class="text-base-content/70 mb-2 text-left text-sm">
			{metaValues.description}
		</div>
	{/if}
{/snippet}

<!-- Field-Component-Auswahl -->
{#snippet fieldControl()}
	{#if ['text', 'email', 'tel', 'number', 'url', 'password', 'date', 'time'].includes(normalizedType)}
		<BaseInput {...inputProps} bind:value={numberValue} onchange={handleNumberChange} />
	{:else if normalizedType === 'textarea'}
		<BaseTextarea {...textareaProps} bind:value={stringValue} onchange={handleStringChange} />
	{:else if normalizedType === 'select'}
		<BaseSelect {...selectProps} bind:value={numberValue} onchange={handleNumberChange} />
	{:else if normalizedType === 'radio' && hasOptions}
		<BaseRadio {...radioProps} bind:value={numberValue} onchange={handleNumberChange} />
	{:else if normalizedType === 'checkbox'}
		<BaseCheckbox {...checkboxProps} bind:checked={booleanValue} onchange={handleBooleanChange} />
	{:else if normalizedType === 'toggle'}
		<BaseToggle {...toggleProps} bind:checked={booleanValue} onchange={handleBooleanChange} />
	{/if}
{/snippet}

<div class={containerClasses}>
	{#if isRadioGroup}
		<!-- Radiogruppe: fieldset+legend statt label[for], das ins Leere zeigen würde.

		     `role="radiogroup"` überschreibt die implizite Rolle `group` des
		     fieldset — nur die Radiogruppe unterstützt `aria-invalid` und
		     `aria-required`. Beide gehören hierher und NICHT an die einzelnen
		     Radios: ARIA 1.2 hat sie aus den globalen Zuständen genommen, seither
		     unterstützt `role="radio"` sie nicht mehr (`svelte-check` meldet es).
		     Der Fehler-Zustand erreicht die Radios stattdessen als Optik über
		     `hasError` → `radio-error` in `BaseRadio`.

		     Das `aria-labelledby` auf die Legend ist bewusst explizit: Die
		     Namensgebung aus dem `<legend>` hängt am fieldset-Element, und mit
		     überschriebener Rolle ist sie nicht mehr selbstverständlich. -->
		<fieldset
			class="w-full"
			role="radiogroup"
			aria-labelledby={legendId}
			aria-invalid={hasError || undefined}
			aria-required={required || undefined}
		>
			<legend id={legendId} class="label w-full pb-1">{@render caption()}</legend>
			{@render description()}
			{@render fieldControl()}
		</fieldset>
	{:else if isSingleControl}
		<!-- Checkbox/Toggle rendern eigenes Label mit dem Control → kein doppeltes Caption-Label -->
		{@render description()}
		{@render fieldControl()}
	{:else}
		<label for={fieldId} class="label w-full pb-1">{@render caption()}</label>
		{@render description()}
		{@render fieldControl()}
	{/if}

	<!-- Help Text -->
	{#if metaValues.helpText}
		<div id={helpId} class="mt-1 text-left">
			<span class="text-base-content/70 text-support leading-relaxed">
				{metaValues.helpText}
			</span>
		</div>
	{/if}

	<!-- Error Message -->
	{#if error}
		<div id={errorId} class="mt-1 text-left" role="alert" aria-live="polite">
			<span class="text-error text-support flex items-center gap-1 font-medium">
				<Icon icon="lucide:triangle-alert" width="14" class="text-error flex-shrink-0" />
				{error}
			</span>
		</div>
	{/if}

	<!-- Species Identification Help (only for species field) -->
	<!-- Kein Duplikat zu /bestimmungshilfe und FormHelp.svelte: Auf meeresmuseum.de läuft die
	     App im iframe, dort blenden PublicNavbar und PublicFooter per `{#if isNotIFrame}` aus —
	     und damit jeden Link auf die eigenständige Seite. Für die Mehrheit der Nutzer ist sie so
	     nicht erreichbar, der iframe bleibt (Museum, 2026-08-04).
	     Belege: docs/IFRAME_EINBETTUNG.md -->
	{#if name === 'species' && normalizedType === 'select'}
		<SpeciesIdentificationHelp currentValue={value} />
	{/if}
</div>
