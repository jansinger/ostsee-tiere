<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import WeatherDisplay from '#lib/components/weather/WeatherDisplay.svelte';
	import type { StoredWeatherData } from '#lib/services/weatherService.ts';
	// `observation_time` ist zonenlose Berlin-Wanduhrzeit, `fetched_at` ein echter
	// UTC-Instant — deshalb formatObservationTime bzw. formatLocalDateTime (M4).
	import { formatLocalDateTime, formatObservationTime } from '#lib/utils/format/dateTime.ts';
	import { formatLocation } from '#lib/utils/format/formatLocation.ts';
	import { toast } from '#lib/stores/toastState.svelte.ts';

	interface Props {
		weatherData: StoredWeatherData | null;
		sightingId: number;
		sightingDate: Date | string;
		latitude: number | null;
		longitude: number | null;
		canRefresh?: boolean;
		onWeatherRefresh?: (weatherData: StoredWeatherData) => void;
	}

	let {
		weatherData,
		sightingId,
		sightingDate,
		latitude,
		longitude,
		canRefresh = false,
		onWeatherRefresh
	}: Props = $props();

	let isExpanded = $state(false);
	let isRefreshing = $state(false);

	// Prüfe ob Sichtungsdatum heute ist
	const isToday = $derived(() => {
		const today = new Date();
		const sightingDateObj = new Date(sightingDate);
		return sightingDateObj.toDateString() === today.toDateString();
	});

	// Bestimme Datenquelle und passende Hinweise
	const sourceInfo = $derived.by(() => {
		if (!weatherData) {
			return null;
		}

		return {
			type: weatherData.data_type,
			label: weatherData.data_type === 'forecast' ? 'Vorhersagedaten (heute)' : 'Historische Daten',
			icon: weatherData.data_type === 'forecast' ? 'lucide:zap' : 'lucide:archive',
			className: weatherData.data_type === 'forecast' ? 'forecast-data' : 'historical-data',
			warning:
				weatherData.data_type === 'forecast' && isToday()
					? 'Die Wetterdaten basieren auf Vorhersagen, da die Meldung am Tag der Sichtung stattfand.'
					: null
		};
	});

	async function refreshWeatherData() {
		if (!latitude || !longitude) {
			toast.warning('Keine GPS-Koordinaten für Wetter-Update verfügbar');
			return;
		}

		isRefreshing = true;
		try {
			const response = await fetch(`/api/admin/weather/${sightingId}/refresh`, {
				method: 'POST'
			});

			if (response.ok) {
				const result = await response.json();
				if (result.success && result.weatherData && onWeatherRefresh) {
					// Aktualisiere die Daten über Callback, anstatt die ganze Seite neu zu laden
					onWeatherRefresh(result.weatherData);
				} else {
					// Fallback: ganze Seite neu laden wenn kein Callback verfügbar
					location.reload();
				}
			} else {
				const error = await response.json();
				toast.error(`Fehler beim Aktualisieren der Wetterdaten: ${error.error}`);
			}
		} catch (error) {
			toast.error(`Netzwerkfehler: ${error}`);
		} finally {
			isRefreshing = false;
		}
	}
</script>

{#if weatherData && sourceInfo}
	<div
		class="weather-data-container border-base-300 mt-4 rounded-lg border p-4 {sourceInfo?.className}"
	>
		<h4 class="mb-3 flex items-center gap-2 font-semibold">
			{#if sourceInfo?.icon}
				<Icon icon={sourceInfo.icon} width="18" class="text-primary" />
			{/if}
			<span>API-Wetterdaten ({sourceInfo?.label})</span>
			<span class="badge badge-sm badge-primary">Open-Meteo</span>
		</h4>

		{#if sourceInfo?.warning}
			<div class="alert alert-info alert-sm mb-3">
				<Icon icon="lucide:circle-alert" width="16" />
				<span class="text-xs">{sourceInfo.warning}</span>
			</div>
		{/if}

		<!-- API Wetterdaten mit gemeinsamer WeatherDisplay Komponente -->
		<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
			<div class="bg-base-100 rounded-lg p-3">
				<h5 class="mb-2 flex items-center gap-2 font-medium">
					<Icon icon="lucide:info" width="16" class="text-info-strong" />
					API-Wetterdaten
				</h5>

				<WeatherDisplay {weatherData} showLocation={false} showTime={false} compact={true} />
			</div>

			<div class="bg-base-100 rounded-lg p-3">
				<h5 class="mb-2 flex items-center gap-2 font-medium">
					<Icon icon="lucide:map-pin" width="16" class="text-secondary-strong" />
					Position & Zeit
				</h5>

				<div class="space-y-1 text-sm">
					<div class="flex items-center gap-2">
						<Icon icon="lucide:map-pin" width="12" />
						<span
							>{formatLocation(weatherData.location.longitude, weatherData.location.latitude)}</span
						>
					</div>
					<div class="flex items-center gap-2">
						<Icon icon="lucide:calendar" width="12" />
						<span>{formatObservationTime(weatherData.observation_time)}</span>
					</div>
					{#if weatherData.location.elevation}
						<div class="flex items-center gap-2">
							<Icon icon="lucide:mountain" width="12" class="text-base-content/70" />
							<span>{weatherData.location.elevation}m ü.NN</span>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Zusätzliche Wetterdaten -->
		<div class="border-base-300 mt-4 border-t pt-3">
			<h5 class="mb-2 flex items-center gap-2 text-sm font-medium">
				<Icon icon="lucide:cloud" width="16" class="text-info-strong" />
				Erweiterte Wetterdaten
			</h5>
			<div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
				{#if weatherData.processed.humidity}
					<div class="flex items-center gap-2">
						<Icon icon="lucide:cloud" width="14" class="text-info-strong" />
						<span>Luftfeuchtigkeit: {weatherData.processed.humidity}%</span>
					</div>
				{/if}
				{#if weatherData.raw_data.precipitation}
					<div class="flex items-center gap-2">
						<Icon icon="lucide:cloud-rain" width="14" class="text-info-strong" />
						<span>Niederschlag: {weatherData.raw_data.precipitation}mm</span>
					</div>
				{/if}
				{#if weatherData.raw_data.cloud_cover}
					<div class="flex items-center gap-2">
						<Icon icon="lucide:cloud" width="14" />
						<span>Bewölkung: {weatherData.raw_data.cloud_cover}%</span>
					</div>
				{/if}
				{#if weatherData.raw_data.wave_height}
					<div class="flex items-center gap-2">
						<Icon icon="lucide:waves" width="14" class="text-info-strong" />
						<span>Wellenhöhe: {weatherData.raw_data.wave_height.toFixed(2)}m</span>
					</div>
				{/if}
				{#if weatherData.raw_data.wave_direction}
					<div class="flex items-center gap-2">
						<Icon icon="lucide:wind" width="14" class="text-info-strong" />
						<span>Wellenrichtung: {Math.round(weatherData.raw_data.wave_direction)}°</span>
					</div>
				{/if}
				{#if weatherData.raw_data.wave_period}
					<div class="flex items-center gap-2">
						<Icon icon="lucide:gem" width="14" class="text-info-strong" />
						<span>Wellenperiode: {weatherData.raw_data.wave_period.toFixed(1)}s</span>
					</div>
				{/if}
				{#if weatherData.raw_data.sea_surface_temperature}
					<div class="flex items-center gap-2">
						<Icon icon="lucide:thermometer" width="14" class="text-info-strong" />
						<span>Wassertemp: {weatherData.raw_data.sea_surface_temperature}°C</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Qualitäts- und Quellinfos Toggle -->
		<div class="border-base-300 mt-4 border-t pt-3">
			<button onclick={() => (isExpanded = !isExpanded)} class="btn btn-xs btn-ghost gap-1">
				<Icon icon={isExpanded ? 'lucide:chevron-down' : 'lucide:chevron-right'} width="12" />
				{isExpanded ? 'Qualitätsinfos ausblenden' : 'Qualitäts- und Quellinfos anzeigen'}
			</button>

			{#if isExpanded}
				<div class="expanded-weather-data bg-base-200 mt-3 rounded border p-3">
					<h6 class="text-base-content/70 mb-2 text-xs font-medium">QUALITÄTS- UND QUELLINFO</h6>
					<div class="text-base-content/60 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
						<div>Abgerufen: {formatLocalDateTime(weatherData.fetched_at, 'datetime')}</div>
						<div>Datenquelle: {weatherData.quality.data_source}</div>
						<div>API-Version: {weatherData.provider} {weatherData.api_version}</div>
						<div>Konfidenz: {Math.round(weatherData.quality.confidence * 100)}%</div>
					</div>
					{#if weatherData.quality.notes}
						<div class="text-base-content/70 mt-2 text-xs">
							Hinweis: {weatherData.quality.notes}
						</div>
					{/if}
				</div>
			{/if}

			{#if canRefresh && weatherData?.data_type === 'forecast'}
				<button
					onclick={refreshWeatherData}
					disabled={isRefreshing}
					class="btn btn-xs btn-secondary mt-3 gap-1"
				>
					<Icon icon="lucide:refresh-cw" width="12" class={isRefreshing ? 'animate-spin' : ''} />
					{isRefreshing ? 'Lade...' : 'Wetterdaten aktualisieren'}
				</button>
			{/if}
		</div>
	</div>
{:else}
	<div class="no-weather-data border-base-300 bg-base-50 mt-4 rounded-lg border p-4">
		<div class="text-base-content/70 text-center">
			<!-- opacity-50 ist hier zulässig: rein dekoratives Leerzustands-Icon ohne
			     Textinhalt. Die /60-Untergrenze aus design-system.md gilt für Zeichen,
			     die gelesen werden müssen — die Aussage trägt der Text darunter. -->
			<Icon icon="lucide:cloud" width="24" class="mx-auto mb-2 opacity-50" />
			<p class="font-medium">Keine API-Wetterdaten verfügbar</p>
			<p class="mt-1 text-sm">Diese Sichtung wurde vor der Weather-API-Integration erstellt.</p>

			{#if canRefresh && latitude && longitude}
				<button
					onclick={refreshWeatherData}
					disabled={isRefreshing}
					class="btn btn-xs btn-primary mt-3 gap-1"
				>
					<Icon icon="lucide:refresh-cw" width="12" class={isRefreshing ? 'animate-spin' : ''} />
					{isRefreshing ? 'Lade...' : 'Wetterdaten nachträglich laden'}
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.forecast-data {
		border-left: 4px solid var(--color-info);
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--color-info) 15%, var(--color-base-100)) 0%,
			var(--color-base-100) 100%
		);
	}

	.historical-data {
		border-left: 4px solid var(--color-success);
		background: linear-gradient(
			135deg,
			color-mix(in oklab, var(--color-success) 15%, var(--color-base-100)) 0%,
			var(--color-base-100) 100%
		);
	}

	.expanded-weather-data {
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			max-height: 0;
		}
		to {
			opacity: 1;
			max-height: 300px;
		}
	}
</style>
