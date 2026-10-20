<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { layoutBars, type BarDatum } from './barChartScale';

	interface Props {
		/** Datenreihe in Anzeigereihenfolge (links nach rechts). */
		data: BarDatum[];
		/** Was das Diagramm zeigt — wird zur Textalternative des SVG (WCAG 1.1.1). */
		caption: string;
		/** Spaltenüberschrift der Kategorie in der Wertetabelle, z. B. „Monat". */
		categoryLabel: string;
		/** Spaltenüberschrift der Werte, z. B. „Sichtungen". */
		valueLabel: string;
		/** Erklärt, was ein hervorgehobener Balken bedeutet. */
		highlightNote?: string;
		/** Höchstzahl an Achsenbeschriftungen, bevor ausgedünnt wird. */
		maxLabels?: number;
		/** Zahlenformatierung, damit die Seite ihr `Intl`-Format behält. */
		formatValue?: (value: number) => string;
	}

	let {
		data,
		caption,
		categoryLabel,
		valueLabel,
		highlightNote,
		maxLabels = 12,
		formatValue = (value: number) => new Intl.NumberFormat('de-DE').format(value)
	}: Props = $props();

	/** Zeichenfläche in viewBox-Einheiten — das SVG skaliert über die Breite mit. */
	const PLOT_WIDTH = 600;
	const PLOT_HEIGHT = 180;
	/** Platz unter der Grundlinie für die Achsenbeschriftung. */
	const LABEL_BAND = 22;
	/**
	 * Platz **über** der Zeichenfläche für die Wertbeschriftung.
	 *
	 * Ohne ihn wurde die Beschriftung des höchsten Balkens auf den oberen Rand
	 * geklemmt und landete damit im Balken — dunkle Schrift auf dunkler Fläche,
	 * dazu auf der Achsenlinie. Bei zwölf Monaten trifft das jeden Monat einen
	 * Balken, weil einer immer die Achsenobergrenze erreicht.
	 */
	const TOP_BAND = 16;

	const layout = $derived(
		layoutBars(data, { width: PLOT_WIDTH, height: PLOT_HEIGHT, gap: 6, maxLabels })
	);

	/** Werte über den Balken nur, solange sie nicht ineinanderlaufen. */
	const zeigeWerte = $derived(data.length <= 12);

	const titelId = $props.id();
</script>

<figure class="m-0">
	<svg
		viewBox="0 0 {PLOT_WIDTH} {TOP_BAND + PLOT_HEIGHT + LABEL_BAND}"
		class="h-56 w-full"
		role="img"
		aria-labelledby={titelId}
	>
		<title id={titelId}>{caption}</title>

		<g transform="translate(0 {TOP_BAND})">
			<!-- Obergrenze der Achse: gestrichelt, damit sie nicht wie ein Datenwert
			     aussieht. Nur diese eine Hilfslinie — mehr Raster verdichtet die Fläche,
			     ohne dass eine Übersichtsgrafik davon genauer würde. -->
			<line
				x1="0"
				y1="0.5"
				x2={PLOT_WIDTH}
				y2="0.5"
				class="stroke-base-300"
				stroke-width="1"
				stroke-dasharray="4 4"
			/>
			{#if !zeigeWerte}
				<!-- Nur wenn die Balken ihre Werte nicht selbst tragen: Sonst stünde
				     dieselbe Zahl zweimal fast an derselben Stelle. -->
				<text x="2" y="-4" class="fill-base-content/70" font-size="11">
					{formatValue(layout.axisMax)}
				</text>
			{/if}

			{#each layout.bars as bar (bar.label)}
				<!-- Die Hervorhebung trägt zusätzlich eine Kontur und eine fette
			     Beschriftung: Farbe allein darf kein Bedeutungsträger sein (WCAG 1.4.1). -->
				<rect
					x={bar.x}
					y={bar.y}
					width={bar.width}
					height={bar.height}
					rx="2"
					class={bar.highlighted ? 'fill-accent-strong' : 'fill-primary'}
					stroke-width={bar.highlighted ? 1.5 : 0}
					stroke={bar.highlighted ? 'currentColor' : 'none'}
				/>
				{#if zeigeWerte && bar.value > 0}
					<text
						x={bar.x + bar.width / 2}
						y={bar.y - 4}
						text-anchor="middle"
						class="fill-base-content"
						font-size="11"
					>
						{formatValue(bar.value)}
					</text>
				{/if}
				{#if bar.showLabel}
					<text
						x={bar.x + bar.width / 2}
						y={PLOT_HEIGHT + 15}
						text-anchor="middle"
						class="fill-base-content"
						font-size="11"
						font-weight={bar.highlighted ? '700' : '400'}
					>
						{bar.label}
					</text>
				{/if}
			{/each}

			<line
				x1="0"
				y1={PLOT_HEIGHT + 0.5}
				x2={PLOT_WIDTH}
				y2={PLOT_HEIGHT + 0.5}
				class="stroke-base-300"
				stroke-width="1"
			/>
		</g>
	</svg>

	<!-- Textalternative zum Diagramm (WCAG 1.1.1). Sie steht aufklappbar und nicht
	     nur für Screenreader versteckt: Wer eine Zahl ablesen will, statt sie am
	     Balken zu schätzen, braucht dieselbe Tabelle. Quelle sind dieselben Daten
	     wie im SVG — eine zweite, driftende Aufbereitung gibt es nicht. -->
	<figcaption class="mt-2">
		<details>
			<summary class="text-support text-base-content/70 cursor-pointer">
				{m.components_charts_barchart_text_werte_als_tabelle()}
			</summary>
			<div class="mt-2 overflow-x-auto">
				<table class="table-sm table">
					<caption class="sr-only">{caption}</caption>
					<thead>
						<tr>
							<th scope="col">{categoryLabel}</th>
							<th scope="col">{valueLabel}</th>
						</tr>
					</thead>
					<tbody>
						{#each data as datum (datum.label)}
							<tr>
								<th scope="row" class="font-normal">
									{datum.label}{#if datum.highlighted && highlightNote}
										<span class="text-base-content/70"> ({highlightNote})</span>
									{/if}
								</th>
								<td>{formatValue(datum.value)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>
	</figcaption>
</figure>
