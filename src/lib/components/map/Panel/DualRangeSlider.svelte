<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { formatDayOfYearLong, isoDateFromDayOfYear } from '#lib/map/dateUtils.ts';
	import { dayOfYearFromIsoDate } from '#lib/map/urlFilterState.ts';

	/**
	 * M10: Echter Dual-Range-Slider für den Zeitfilter der Sichtungskarte —
	 * ein Track, zwei Griffe, gefüllter Bereich dazwischen, plus zwei
	 * Datums-Eingabefelder als gleichwertige Alternative (Baymard: Dual-Slider
	 * werden ohne numerischen Fallback häufig missverstanden).
	 *
	 * DOM-Verträge nach außen (bewusst unverändert zum alten Aufbau):
	 * - IDs `time-range-start`/`time-range-end`: timeSliderManager hängt hier
	 *   seine input-Listener an (Clamping + setFilter), applyUrlFilters und
	 *   reset() schreiben value/max direkt und dispatchen input-Events.
	 * - `#time-start`/`#time-end`: der Map-Controller schreibt die formatierte
	 *   Auswahl per innerText hinein (updateTimeRange).
	 *
	 * Die Komponente klemmt Start ≤ Ende selbst (identisch zum Manager), damit
	 * ihr State unabhängig von der Listener-Reihenfolge konsistent bleibt —
	 * der Manager clampt danach denselben Wert als No-op.
	 */
	let { min = 0, max, year }: { min?: number; max: number; year: number } = $props();

	let startEl: HTMLInputElement | undefined = $state();
	let endEl: HTMLInputElement | undefined = $state();

	// Bewusst nur Startwerte: danach halten die input-Handler den State synchron.
	// svelte-ignore state_referenced_locally
	let startValue = $state(min);
	// svelte-ignore state_referenced_locally
	let endValue = $state(max);

	// Jahreswechsel: der Browser klemmt die value-Property selbst, sobald das
	// max-Attribut schrumpft — den geklemmten DOM-Stand in den State übernehmen.
	// (timeSliderManager.reset() dispatcht zusätzlich input-Events; dieser
	// Effect deckt den Fall ab, dass die Komponente ohne Manager läuft.)
	$effect(() => {
		void max;
		if (startEl) startValue = Number(startEl.value);
		if (endEl) endValue = Number(endEl.value);
	});

	const span = $derived(Math.max(max - min, 1));
	const startPct = $derived(((startValue - min) / span) * 100);
	const endPct = $derived(((endValue - min) / span) * 100);

	// Liegen beide Griffe übereinander, muss der bewegliche greifbar sein:
	// rechts gedrängt → Start liegt oben (kann nach links), sonst Ende.
	const startOnTop = $derived(startValue > (min + max) / 2);

	function clamp(value: number, lower: number, upper: number): number {
		return Math.min(Math.max(value, lower), upper);
	}

	/** Klemmen statt Verschieben: Start darf gleich Ende sein (einzelner Tag). */
	function onStartInput(): void {
		if (!startEl || !endEl) return;
		const end = Number(endEl.value);
		let value = Number(startEl.value);
		if (value > end) {
			value = end;
			startEl.value = String(value);
		}
		startValue = value;
		endValue = end;
	}

	function onEndInput(): void {
		if (!startEl || !endEl) return;
		const start = Number(startEl.value);
		let value = Number(endEl.value);
		if (value < start) {
			value = start;
			endEl.value = String(value);
		}
		startValue = start;
		endValue = value;
	}

	/**
	 * Datums-Eingabe → Slider: über denselben Pfad wie die Slider-Bedienung
	 * (value setzen + input-Event), damit der timeSliderManager Clamping und
	 * setFilter übernimmt. Ungültige oder jahres-fremde Daten werden verworfen;
	 * das Feld springt auf den aktuellen Wert zurück.
	 */
	function applyDateInput(input: HTMLInputElement, rangeEl: HTMLInputElement | undefined): void {
		if (!rangeEl) return;
		const day = input.value ? dayOfYearFromIsoDate(input.value, year) : null;
		if (day === null) {
			input.value = isoDateFromDayOfYear(year, Number(rangeEl.value));
			return;
		}
		rangeEl.value = String(clamp(day, min, max));
		rangeEl.dispatchEvent(new Event('input', { bubbles: true }));
		// Rückschreiben aus dem tatsächlichen (ggf. auf den anderen Griff
		// geklemmten) Wert: ändert die Klemmung den State nicht, würde Svelte
		// das Feld sonst auf dem getippten Datum stehen lassen.
		input.value = isoDateFromDayOfYear(year, Number(rangeEl.value));
	}

	function onStartDateChange(event: Event): void {
		applyDateInput(event.currentTarget as HTMLInputElement, startEl);
	}

	function onEndDateChange(event: Event): void {
		applyDateInput(event.currentTarget as HTMLInputElement, endEl);
	}
</script>

<div
	class="space-y-2"
	role="group"
	aria-label={m.components_map_panel_dualrangeslider_aria_label_zeitraum_waehlen()}
>
	<div
		class="dual-range"
		data-testid="dual-range"
		style="--range-start:{startPct}%; --range-end:{endPct}%"
	>
		<div class="dual-range-track" aria-hidden="true">
			<div class="dual-range-fill"></div>
		</div>
		<input
			type="range"
			id="time-range-start"
			bind:this={startEl}
			class="dual-range-input"
			class:dual-range-input-top={startOnTop}
			{min}
			{max}
			value={startValue}
			aria-label={m.components_map_panel_dualrangeslider_aria_label_zeitraum_start()}
			aria-valuetext={formatDayOfYearLong(year, startValue)}
			oninput={onStartInput}
		/>
		<input
			type="range"
			id="time-range-end"
			bind:this={endEl}
			class="dual-range-input"
			class:dual-range-input-top={!startOnTop}
			{min}
			{max}
			value={endValue}
			aria-label={m.components_map_panel_dualrangeslider_aria_label_zeitraum_ende()}
			aria-valuetext={formatDayOfYearLong(year, endValue)}
			oninput={onEndInput}
		/>
	</div>

	<!-- Vom Map-Controller (updateTimeRange) per innerText befüllt -->
	<div class="text-base-content/70 flex justify-between text-xs" aria-hidden="true">
		<span id="time-start" class="bg-base-200 rounded px-2 py-1 font-medium"></span>
		<span id="time-end" class="bg-base-200 rounded px-2 py-1 font-medium"></span>
	</div>

	<div class="grid grid-cols-2 gap-2">
		<div>
			<label class="label py-0" for="time-date-start">
				<span class="text-xs">{m.components_map_panel_dualrangeslider_text_start()}</span>
			</label>
			<input
				type="date"
				id="time-date-start"
				class="input input-sm focus:input-primary w-full"
				min={isoDateFromDayOfYear(year, min)}
				max={isoDateFromDayOfYear(year, max)}
				value={isoDateFromDayOfYear(year, startValue)}
				onchange={onStartDateChange}
			/>
		</div>
		<div>
			<label class="label py-0" for="time-date-end">
				<span class="text-xs">{m.components_map_panel_dualrangeslider_text_ende()}</span>
			</label>
			<input
				type="date"
				id="time-date-end"
				class="input input-sm focus:input-primary w-full"
				min={isoDateFromDayOfYear(year, min)}
				max={isoDateFromDayOfYear(year, max)}
				value={isoDateFromDayOfYear(year, endValue)}
				onchange={onEndDateChange}
			/>
		</div>
	</div>
</div>

<style>
	/* 44px hoch: die Griffe füllen die volle Höhe als Touch-Target (WCAG 2.5.5) */
	.dual-range {
		position: relative;
		height: 2.75rem;
	}

	.dual-range-track {
		position: absolute;
		top: 50%;
		right: 0;
		left: 0;
		height: 0.5rem;
		transform: translateY(-50%);
		overflow: hidden;
		border-radius: 9999px;
		background-color: var(--color-base-300);
	}

	/* Gefüllter Bereich zwischen den Griffen — zeigt den gewählten Zeitraum */
	.dual-range-fill {
		position: absolute;
		top: 0;
		bottom: 0;
		left: var(--range-start);
		width: calc(var(--range-end) - var(--range-start));
		background-color: var(--color-primary);
	}

	/* Zwei überlagerte native Inputs: nur die Griffe nehmen Pointer-Events an */
	.dual-range-input {
		position: absolute;
		inset: 0;
		z-index: 2;
		width: 100%;
		height: 100%;
		margin: 0;
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		pointer-events: none;
	}

	.dual-range-input-top {
		z-index: 3;
	}

	/* Griff: 44px Hit-Area (transparenter Rand), 24px sichtbarer Kreis */
	.dual-range-input::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		pointer-events: auto;
		width: 44px;
		height: 44px;
		border: 10px solid transparent;
		border-radius: 50%;
		background-color: var(--color-primary);
		background-clip: content-box;
		cursor: pointer;
	}

	.dual-range-input::-moz-range-thumb {
		pointer-events: auto;
		box-sizing: border-box;
		width: 44px;
		height: 44px;
		border: 10px solid transparent;
		border-radius: 50%;
		background-color: var(--color-primary);
		background-clip: content-box;
		cursor: pointer;
	}

	.dual-range-input::-moz-range-track {
		background: transparent;
	}

	/* Sichtbarer Fokusring am Griff (Fokus-Regel aus app.css greift hier nicht,
	   weil das Input selbst unsichtbar ist) */
	.dual-range-input:focus-visible {
		outline: none;
	}

	.dual-range-input:focus-visible::-webkit-slider-thumb {
		outline: 3px solid var(--color-primary);
		outline-offset: -4px;
	}

	.dual-range-input:focus-visible::-moz-range-thumb {
		outline: 3px solid var(--color-primary);
		outline-offset: -4px;
	}
</style>
