<!--
  Shared weather data display component
  Used by both WeatherDataFetcher and WeatherDataDisplay for consistent presentation
-->
<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getWeatherDescription } from '#lib/constants/weather.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Icon from '#lib/components/Icon.svelte';
	import { getSeaStateLabel } from '#lib/report/formOptions/seaState.ts';
	import { getVisibilityLabel } from '#lib/report/formOptions/visibility.ts';
	import { getWindStrengthLabel } from '#lib/report/formOptions/windStrength.ts';
	import type {
		WeatherData,
		WeatherFormFields,
		StoredWeatherData
	} from '#lib/services/weatherService.ts';
	import type { WeatherDataWithMetadata } from '#lib/types/index.ts';
	// `time`/`observation_time` ist zonenlose Berlin-Wanduhrzeit (siehe
	// weatherService.ts) — formatObservationTime reicht sie unkonvertiert durch (M4).
	import { formatObservationTime } from '#lib/utils/format/dateTime.ts';
	import { formatLocation } from '#lib/utils/format/formatLocation.ts';
	import {
		getWeatherIconClass,
		getWindDirectionIconClass
	} from '#lib/utils/weather/weatherIcons.ts';

	interface Props {
		weatherData: WeatherDataWithMetadata | WeatherData | StoredWeatherData;
		formFields?: WeatherFormFields;
		showLocation?: boolean;
		showTime?: boolean;
		showActions?: boolean;
		showAdvanced?: boolean;
		compact?: boolean;
		onApplyData?: () => void;
		latitude?: number | null;
		longitude?: number | null;
	}

	let {
		weatherData,
		formFields,
		showLocation = true,
		showTime = true,
		showActions = false,
		showAdvanced: _showAdvanced = false,
		compact = false,
		onApplyData,
		latitude,
		longitude
	}: Props = $props();

	// Handle all three weather data types: WeatherDataWithMetadata, WeatherData, and StoredWeatherData
	const displayData = $derived.by(() => {
		if (!weatherData) {
			return null;
		}

		// For admin display (StoredWeatherData) - check if it has all required properties
		const hasProcessed =
			weatherData && typeof weatherData === 'object' && 'processed' in weatherData;
		const hasLocation = weatherData && typeof weatherData === 'object' && 'location' in weatherData;
		const hasObservationTime =
			weatherData && typeof weatherData === 'object' && 'observation_time' in weatherData;

		if (hasProcessed && hasLocation && hasObservationTime) {
			const processed = weatherData.processed;
			const location = weatherData.location;
			const observationTime = weatherData.observation_time;

			if (!processed || !location) {
				return null;
			}

			return {
				temperature: processed.temperature,
				weatherCode: processed.weatherCode,
				weatherDescription: processed.weatherDescription,
				windSpeed: processed.windSpeed,
				windDirection: processed.windDirection,
				windDirectionCardinal: processed.windDirectionCardinal,
				seaState: processed.seaState,
				visibility: processed.visibility,
				pressure: processed.pressure,
				time: observationTime,
				location: {
					latitude: location.latitude,
					longitude: location.longitude
				}
			};
		}

		// For fetcher display (WeatherDataWithMetadata or WeatherData)
		return {
			temperature: weatherData.temperature,
			weatherCode: weatherData.weatherCode,
			weatherDescription: weatherData.weatherDescription,
			windSpeed: weatherData.windSpeed,
			windDirection: weatherData.windDirection,
			windDirectionCardinal: formFields?.windDirection,
			seaState: weatherData.seaState,
			visibility: weatherData.visibility,
			pressure: weatherData.pressure,
			time: weatherData.time,
			location: {
				latitude: latitude ?? null,
				longitude: longitude ?? null
			}
		};
	});
</script>

{#if displayData && Object.keys(displayData).length > 0}
	<div class="weather-display {compact ? 'compact' : ''}">
		{#if showLocation && displayData.location?.latitude && displayData.location?.longitude}
			<div class="text-base-content/70 mb-3 flex items-center gap-4 text-sm">
				<span class="flex items-center gap-1">
					<Icon icon="lucide:map-pin" width="16" class="text-primary" />
					{formatLocation(displayData.location.longitude, displayData.location.latitude)}
				</span>
				{#if showTime && displayData.time}
					<span class="flex items-center gap-1">
						<Icon icon="lucide:calendar" width="16" class="text-primary" />
						{formatObservationTime(displayData.time)}
					</span>
				{/if}
			</div>
		{/if}

		<div class="weather-data space-y-2 text-sm">
			{#if displayData.temperature !== undefined && displayData.temperature !== null}
				<div class="flex items-center gap-2">
					<Icon icon="lucide:thermometer" width="18" class="text-primary" />
					<span
						>{m.components_weather_weatherdisplay_text_temperatur()}
						<strong>{displayData.temperature}°C</strong></span
					>
				</div>
			{/if}

			{#if displayData.weatherDescription}
				<div class="flex items-center gap-2">
					<i
						class="wi {getWeatherIconClass(displayData.weatherCode)} text-primary"
						style="font-size: 18px;"
					></i>
					<!-- Aus dem CODE übersetzt, nicht aus `weatherDescription`: Letzteres
					     ist der gespeicherte deutsche Bestand (JSONB-Spalte `weather_data`,
					     bewusst auf `baseLocale` gepinnt, siehe `constants/weather.ts`).
					     Die Anzeige folgt dagegen der aktiven Sprache. Die `{#if}`-Bedingung
					     bleibt am gespeicherten Feld: Sie fragt, OB Wetterdaten vorliegen —
					     ein Wettercode 0 („Klar") wäre als Bedingung falsch. -->
					<span
						>{m.components_weather_weatherdisplay_text_wetter()}
						<strong>{getWeatherDescription(displayData.weatherCode ?? 0, getLocale())}</strong
						></span
					>
				</div>
			{/if}

			{#if (displayData.windSpeed !== undefined && displayData.windSpeed !== null) || formFields?.windForce}
				<div class="flex items-center gap-2">
					<Icon icon="lucide:wind" width="18" class="text-primary" />
					<span>
						{m.components_weather_weatherdisplay_text_wind()}
						<strong>
							{#if formFields?.windForce}
								{m.components_weather_weatherdisplay_text_beaufort()}
								{getWindStrengthLabel(Number(formFields.windForce))}
							{:else}
								{displayData.windSpeed} {m.components_weather_weatherdisplay_text_km_h()}
							{/if}
						</strong>
					</span>
				</div>
			{/if}

			{#if displayData.windDirectionCardinal || displayData.windDirection !== undefined}
				<div class="flex items-center gap-2">
					<i
						class="wi {getWindDirectionIconClass(displayData.windDirectionCardinal)} text-primary"
						style="font-size: 18px;"
					></i>
					<span>
						{m.components_weather_weatherdisplay_text_windrichtung()}
						<strong
							>{displayData.windDirectionCardinal ||
								m.components_weather_weatherdisplay_text_unbekannt()}</strong
						>
						{#if displayData.windDirection !== undefined && displayData.windDirection !== null}
							- {displayData.windDirection}°{/if}
					</span>
				</div>
			{/if}

			{#if (displayData.seaState !== undefined && displayData.seaState !== null) || formFields?.seaState}
				<div class="flex items-center gap-2">
					<Icon icon="lucide:waves" width="18" class="text-primary" />
					<span>
						{m.components_weather_weatherdisplay_text_seegang()}
						<strong>
							{#if formFields?.seaState}
								{getSeaStateLabel(Number(formFields.seaState))}
							{:else}
								{m.components_weather_weatherdisplay_text_stufe()} {displayData.seaState}
							{/if}
						</strong>
					</span>
				</div>
			{/if}

			{#if (displayData.visibility !== undefined && displayData.visibility !== null) || formFields?.visibility}
				<div class="flex items-center gap-2">
					<Icon icon="lucide:eye" width="18" class="text-primary" />
					<span>
						{m.components_weather_weatherdisplay_text_sichtweite()}
						<strong>
							{#if formFields?.visibility}
								{getVisibilityLabel(Number(formFields.visibility))}
							{:else}
								{Math.round(displayData.visibility / 1000)}
								{m.components_weather_weatherdisplay_text_km()}
							{/if}
						</strong>
					</span>
				</div>
			{/if}

			{#if displayData.pressure !== undefined && displayData.pressure !== null}
				<div class="flex items-center gap-2">
					<Icon icon="lucide:gauge" width="18" class="text-primary" />
					<span
						>{m.components_weather_weatherdisplay_text_luftdruck()}
						<strong>{displayData.pressure} {m.components_weather_weatherdisplay_text_hpa()}</strong
						></span
					>
				</div>
			{/if}
		</div>

		{#if showActions && onApplyData}
			<div class="mt-3 flex gap-2">
				<button
					type="button"
					onclick={onApplyData}
					class="btn btn-sm btn-primary"
					aria-label={m.components_weather_weatherdisplay_aria_label_wetterdaten_ins_formular_uebernehmen()}
				>
					{m.components_weather_weatherdisplay_text_daten_uebernehmen()}
				</button>
			</div>
		{/if}
	</div>
{:else}
	<div class="weather-display">
		<p class="text-base-content/60 text-sm">
			{m.components_weather_weatherdisplay_text_keine_wetterdaten_verfuegbar()}
		</p>
	</div>
{/if}

<style>
	.weather-display.compact .weather-data {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.5rem;
	}

	.weather-display.compact .weather-data > div {
		font-size: 0.75rem;
	}
</style>
