<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import type { WeatherData, WeatherFormFields } from '#lib/services/weatherService.ts';
	import type { WeatherDataWithMetadata } from '#lib/types/index.ts';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import Icon from '#lib/components/Icon.svelte';
	import StatusBlock from '#lib/components/StatusBlock.svelte';
	import WeatherDisplay from './WeatherDisplay.svelte';

	interface Props {
		latitude: number | null;
		longitude: number | null;
		date: string | null;
		time: string | null;
		onWeatherFetched: (formFields: WeatherFormFields) => void;
		onWeatherDataFetched?: (weatherData: WeatherData) => void;
		autoFetch?: boolean;
		showInCard?: boolean;
	}

	let {
		latitude,
		longitude,
		date,
		time,
		onWeatherFetched,
		onWeatherDataFetched,
		autoFetch = false,
		showInCard = true
	}: Props = $props();

	let error = $state<string | null>(null);
	let weatherData = $state<WeatherDataWithMetadata | null>(null);
	let formFields = $state<WeatherFormFields>({} as WeatherFormFields);
	let showSuggestions = $state(false);
	let lastFetchKey = $state<string>('');
	let loading = $state(false);

	// Check if we can fetch weather
	const canFetch = $derived(
		latitude !== null && longitude !== null && date !== null && date !== ''
	);

	// Create a key for current fetch params
	const fetchKey = $derived(`${latitude}-${longitude}-${date}-${time || ''}`);

	// Auto-fetch when params change
	$effect(() => {
		if (autoFetch && canFetch && fetchKey !== lastFetchKey) {
			fetchWeather();
		}
	});

	async function fetchWeather() {
		if (!canFetch) return;

		error = null;
		weatherData = null;
		formFields = {} as WeatherFormFields;
		showSuggestions = false;
		loading = true;
		lastFetchKey = fetchKey;

		try {
			const params = new SvelteURLSearchParams({
				lat: String(latitude),
				lng: String(longitude),
				date: date!
			});

			if (time) {
				params.append('time', time);
			}

			const response = await fetch(`/api/weather/historical?${params}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(
					data.error ||
						m.components_weather_weatherdatafetcher_text_fehler_beim_abrufen_der_wetterdaten()
				);
			}

			if (!data.weather) {
				error =
					m.components_weather_weatherdatafetcher_text_fuer_diese_kombination_aus_ort_und_datum();
				loading = false;
				return;
			}

			weatherData = data.weather;
			formFields = data.formFields;
			showSuggestions = true;

			// Store metadata about the weather data source
			if (weatherData) {
				weatherData._metadata = data.metadata;
			}

			// Automatically store full weather data in form if callback provided
			if (weatherData && onWeatherDataFetched) {
				onWeatherDataFetched(weatherData);
			}
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: m.components_weather_weatherdatafetcher_text_unbekannter_fehler();
		} finally {
			loading = false;
		}
	}

	function applyWeatherData() {
		if (!formFields) return;
		onWeatherFetched(formFields as WeatherFormFields);

		// Also store the full weather data when applying manually
		if (weatherData && onWeatherDataFetched) {
			onWeatherDataFetched(weatherData);
		}
	}
</script>

<div class="weather-fetcher">
	{#if error}
		<div class="alert alert-error mt-2" role="alert">
			<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
			<span>{error}</span>
		</div>
	{/if}

	{#if loading}
		<div class="mt-2 flex items-center gap-2" aria-live="polite">
			<span class="loading loading-spinner loading-sm"></span>
			<span>{m.components_weather_weatherdatafetcher_text_lade_wetterdaten()}</span>
		</div>
	{/if}

	{#if showSuggestions && weatherData}
		<div class={showInCard ? 'card bg-base-200 mt-3 p-4' : 'mt-3'}>
			<h4 class="mb-2 text-base font-semibold">
				{m.components_weather_weatherdatafetcher_text_vorgeschlagene_wetterdaten_fuer_die_ange()}
			</h4>

			<WeatherDisplay
				{weatherData}
				{formFields}
				{latitude}
				{longitude}
				showActions={true}
				onApplyData={applyWeatherData}
			/>

			<div class="text-base-content/60 mt-2 space-y-1 text-xs">
				<p>
					{m.components_weather_weatherdatafetcher_text_quelle()}
					{weatherData._metadata?.source || 'Open-Meteo Weather API'}
					{#if weatherData._metadata?.cached}
						<span class="badge badge-xs badge-info ml-2"
							>{m.components_weather_weatherdatafetcher_text_aus_cache()}</span
						>
					{/if}
				</p>
			</div>

			<!--
				Prognosewerte sind unvollständige Daten, keine Warnung an den Nutzer —
				`partial` ist dafür die richtige Variante. Vorher ein Absatz mit
				Emoji-Warndreieck, der weder Form noch ARIA-Rolle hatte und im
				Fließtext der Quellenangabe unterging.
			-->
			{#if weatherData._metadata?.dataType === 'forecast'}
				<StatusBlock
					variant="partial"
					title={m.components_weather_weatherdatafetcher_title_prognosedaten_fuer_die_heutige_sichtung()}
					description={m.components_weather_weatherdatafetcher_description_fuer_heute_liegen_noch()}
				/>
			{/if}
		</div>
	{/if}
</div>

<style>
	.weather-fetcher {
		margin-top: 0.5rem;
	}
</style>
