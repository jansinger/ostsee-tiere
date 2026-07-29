<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * Nur noch `initial`.
	 *
	 * Diese Komponente ist ein `fixed inset-0`-Overlay mit Backdrop — sie nimmt
	 * die ganze Karte aus der Hand. Beim allerersten Aufbau ist das richtig: Es
	 * gibt noch nichts zu bedienen. Für alles danach ist es der falsche Griff,
	 * und die früheren Varianten `filter`, `features` und `default` waren genau
	 * das: Sie hätten bei jedem Filterwechsel die Karte gesperrt. Aufrufstellen
	 * hatten sie keine — der Filterzustand läuft über den Inline-Spinner im
	 * `FilterPanel` (`isLoading`), Leer- und Fehlerzustände über `StatusBlock`.
	 *
	 * Die Varianten sind entfernt, damit der blockierende Weg nicht versehentlich
	 * wieder eingeschlagen wird. Wer hier eine neue braucht, prüft zuerst, ob ein
	 * `StatusBlock` an der Stelle der Daten genügt.
	 */
	type LoadingType = 'initial';

	let { isVisible = false, type = 'initial' }: { isVisible?: boolean; type?: LoadingType } =
		$props();

	const iconMap: Record<LoadingType, string> = {
		initial: 'lucide:loader-2'
	};

	const messageMap: Record<LoadingType, string> = {
		initial: 'Karte wird initialisiert...'
	};

	const loadingType = $derived(type as LoadingType);
	const displayMessage = $derived(messageMap[loadingType]);
</script>

<!-- H5: Der Ladezustand ist kein Dialog, sondern eine Statusmeldung. Die
     Live-Region bleibt dauerhaft im DOM, damit Screenreader schon die erste
     Statusänderung ansagen; der Inhalt wird nur bei Sichtbarkeit gerendert. -->
<div role="status" aria-live="polite">
	{#if isVisible}
		<!-- Backdrop (rein visuell) -->
		<div
			class="animate-fade-in fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-all duration-300"
		></div>

		<!-- Loading Content -->
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div
				data-testid="map-loading-content"
				class="animate-bounce-in bg-base-100 mx-auto w-full max-w-sm scale-100 transform rounded-2xl p-8 shadow-2xl transition-all duration-300"
			>
				<!-- Header -->
				<div class="mb-6 text-center">
					<div
						class="bg-primary/10 mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full"
					>
						<Icon
							icon={iconMap[loadingType]}
							class="text-primary h-8 w-8 animate-spin"
							aria-hidden="true"
						/>
					</div>
					<h3 class="text-base-content text-lg font-semibold">
						{displayMessage}
					</h3>
				</div>

				<!-- Indeterminate Loading Dots -->
				<div class="mb-2 flex items-center justify-center space-x-2">
					<div class="bg-primary h-2 w-2 animate-bounce rounded-full"></div>
					<div
						class="bg-primary h-2 w-2 animate-bounce rounded-full"
						style="animation-delay: 0.1s"
					></div>
					<div
						class="bg-primary h-2 w-2 animate-bounce rounded-full"
						style="animation-delay: 0.2s"
					></div>
				</div>

				{#if type === 'initial'}
					<div class="text-base-content/60 mt-4 text-center text-sm">
						<!-- H7: Kürzel wirken nur bei fokussierter Karte (WCAG 2.1.4) -->
						<p>
							Tastaturkürzel: Karte fokussieren, dann <kbd class="kbd kbd-xs">H</kbd> drücken
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Animations sind jetzt global in app.css definiert -->
