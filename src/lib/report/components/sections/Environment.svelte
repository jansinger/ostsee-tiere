<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import WeatherDataFetcher from '#lib/components/weather/WeatherDataFetcher.svelte';
	import { getFormContext } from '#lib/report/formContext.ts';
	import type {
		WeatherData,
		WeatherFormFields,
		OpenMeteoRawData
	} from '#lib/services/weatherService.ts';
	import { convertToStoredWeatherData } from '#lib/services/weatherService.ts';
	import { berlinCalendarDayIso } from '#lib/utils/format/dateTime.ts';
	import { environmentIntro } from '#lib/report/wording.ts';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import SectionCard from './SectionCard.svelte';

	/** Siehe `Behavior.svelte` — vollständiger Editor statt kuratierter Teilmenge. */
	let { adminMode = false }: { adminMode?: boolean } = $props();

	const { form, handleChange } = getFormContext();

	let latitude: number | null | undefined = $derived($form.latitude);
	let longitude: number | null | undefined = $derived($form.longitude);
	let sightingDate: string | null = $derived($form.sightingDate);
	let sightingTime: string | undefined | null = $derived($form.sightingTime);
	let intro: string = $derived(environmentIntro($form.isDead));

	// Handle weather data
	function handleWeatherData(weatherFields: WeatherFormFields) {
		// Update form fields with weather data
		Object.entries(weatherFields).forEach(([field, value]) => {
			handleChange({
				target: { name: field, value }
			} as unknown as Event);
		});
	}

	// Handle full weather data storage
	function handleFullWeatherData(weatherData: WeatherData) {
		// Bestimme automatisch den data_type basierend auf dem Sichtungsdatum
		// (NIEDRIG: Berlin-Datum statt UTC — läuft im Browser, kein Server-Import).
		const today = berlinCalendarDayIso();
		const sightingDateStr = sightingDate || '';
		const dataType = sightingDateStr >= today ? 'forecast' : 'historical';

		// Convert to StoredWeatherData format for database storage
		const storedWeatherData = convertToStoredWeatherData(
			weatherData,
			weatherData as OpenMeteoRawData, // Use weatherData as rawData fallback
			dataType, // Automatische Erkennung: forecast für heutige/zukünftige, historical für vergangene Daten
			Number(latitude) || 0,
			Number(longitude) || 0
		);

		// Store in form
		handleChange({
			target: { name: 'weatherData', value: storedWeatherData }
		} as unknown as Event);
	}
</script>

<!-- Environmental Conditions Section -->
<SectionCard
	title={m.report_components_sections_environment_title_umweltbedingungen()}
	icon="lucide:waves"
>
	<!-- Beim Totfund nennt der Satz den Zustand des Tieres statt Sichtbarkeit
	     und Verhalten (Wunsch des Meeresmuseums) — die Entscheidung steht wie
	     die übrigen Zweigtexte in `wording.ts`, weil diese Karte auch die
	     Admin-Maske rendert. -->
	<p class="text-base-content/70 mb-4 text-sm">
		{intro}
	</p>

	<!-- Optionaler Hinweis für User Experience -->
	<p class="text-base-content/60 mb-2 text-xs">
		{m.report_components_sections_environment_text_sobald_position_und_datum_gesetzt()}
	</p>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<!-- Sea State -->
		<FormField name="seaState" />

		<!-- Visibility -->
		<FormField name="visibility" />
	</div>

	<!-- `windDirection` wird hier bewusst nicht mehr abgefragt (Wunsch des
	     Deutschen Meeresmuseums), geht aber nicht verloren: `applyWeatherData`
	     im WeatherDataFetcher unten schreibt `windForce`, `windDirection`,
	     `seaState` und `visibility` gemeinsam ins Formular
	     (`WeatherFormFields`) — `windDirection` fährt also mit den drei
	     Feldern mit, die hier weiterhin stehen.

	     Genauer als in der Analyse notiert: Die Wetterdaten werden zwar
	     automatisch GEHOLT (`autoFetch`), ins Formular übernommen werden sie
	     aber erst mit „Daten übernehmen". Ohne diesen Klick blieb auch vorher
	     schon keines der vier Felder gefüllt — die Windrichtung verliert durch
	     das Ausblenden also nichts, was sie vorher gehabt hätte. Im Browser
	     gegengeprüft: nach dem Klick steht `windDirection` im Formular-State,
	     obwohl das Feld nicht mehr gerendert wird.

	     Schema-Eintrag und DB-Spalte `windrichtung` bleiben unverändert. -->
	<!-- Zweispaltig nur, wenn auch zwei Felder darin stehen — sonst stünde die
	     Windstärke im Meldeformular auf halber Breite neben einer Leerstelle. -->
	<div class="mt-4 grid grid-cols-1 gap-4 {adminMode ? 'md:grid-cols-2' : ''}">
		<!-- Wind Force -->
		<FormField name="windForce" />

		<!-- Im Admin editierbar: 9.642 Datensätze tragen eine Windrichtung. -->
		{#if adminMode}
			<FormField name="windDirection" />
		{/if}
	</div>

	<!-- `shipCount` fragt laut Schema nach der Anzahl ANDERER Schiffe in näherer
	     Umgebung — Störungskontext wie Seegang und Sichtweite, keine Angabe zum
	     eigenen Boot des Melders (Task 12, zog aus `BoatInfo.svelte` hierher
	     um). Nur im Meldeformular: Die Admin-Maske zeigt das Feld bereits
	     admin-only in `OptionalSightingDetails.svelte` — `BoatInfo` bindet sie
	     nicht ein, `Environment` dagegen schon, ein zweites `shipCount` stünde
	     hier doppelt im selben Formular.

	     Es steht hinter der Windstärke und nicht mehr an erster Stelle: Die
	     Karte kündigt oben an, dass Wetterdaten automatisch vorgeschlagen
	     werden, und `shipCount` ist das einzige Feld darin, das der Abruf nie
	     füllt. Direkt unter diesem Satz las es sich wie ein Wetterfeld. Die
	     Feldliste in `formConfig.ts` (Schritt `observations`) trägt dieselbe
	     Reihenfolge — `scrollToFirstError` läuft sie ab, um zum ersten
	     fehlerhaften Feld zu springen. -->
	{#if !adminMode}
		<div class="mt-4 grid grid-cols-1 gap-4">
			<FormField name="shipCount" />
		</div>
	{/if}

	<!-- Weather Data Fetcher - Auto-fetch when environment section is visible -->
	{#if latitude && longitude && sightingDate}
		<div class="border-base-300 mt-6 border-t pt-4">
			<WeatherDataFetcher
				{latitude}
				{longitude}
				date={sightingDate}
				time={sightingTime ?? null}
				onWeatherFetched={handleWeatherData}
				onWeatherDataFetched={handleFullWeatherData}
				autoFetch={true}
				showInCard={false}
			/>
		</div>
	{/if}
</SectionCard>
