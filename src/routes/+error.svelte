<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { localizeHref } from '$lib/paraglide/runtime';

	// Error-Informationen aus der page store (Runes Mode)
	const error = $derived(page.error);
	const status = $derived(page.status);

	/**
	 * Navigiert zurück zur Startseite. `localizeHref`, nicht `goto('/')`
	 * direkt: Ein Tippfehler in `/en/<pfad>` landete sonst auf `/`, und der
	 * Nutzer verlor damit die Sprache genau in dem Moment, in dem etwas
	 * schiefgegangen ist (Important-Fund, Task-8-Review — `goto(...)` stand
	 * nicht als `href` im Markup und fiel deshalb durchs erste Raster).
	 */
	const goHome = (): void => {
		goto(localizeHref('/'));
	};

	/**
	 * Navigiert zur vorherigen Seite oder zur Startseite
	 */
	const goBack = (): void => {
		if (browser && window.history.length > 1) {
			window.history.back();
		} else {
			goHome();
		}
	};

	/**
	 * Lädt die aktuelle Seite neu
	 */
	const reloadPage = (): void => {
		if (browser) {
			window.location.reload();
		}
	};

	/**
	 * Bestimmt das passende Icon basierend auf dem HTTP-Status
	 */
	const getErrorIcon = (statusCode: number) => {
		switch (statusCode) {
			case 404:
				return 'lucide:file-search';
			case 403:
				return 'lucide:lock';
			case 500:
				return 'lucide:circle-alert';
			case 503:
				return 'lucide:database';
			default:
				return 'lucide:circle-alert';
		}
	};

	/**
	 * Bestimmt die passende Nachricht basierend auf dem HTTP-Status
	 */
	const getErrorMessage = (statusCode: number): { title: string; description: string } => {
		switch (statusCode) {
			case 404:
				return {
					title: m.routes_error_text_seite_nicht_gefunden(),
					description: m.routes_error_text_die_angeforderte_seite_existiert_nicht_o()
				};
			case 403:
				return {
					title: m.routes_error_text_zugriff_verweigert(),
					description: m.routes_error_text_sie_haben_keine_berechtigung_auf_diese_r()
				};
			case 500:
				return {
					title: m.routes_error_text_serverfehler(),
					description: m.routes_error_text_ein_unerwarteter_fehler_ist_aufgetreten()
				};
			case 503:
				return {
					title: m.routes_error_text_dienst_nicht_verfuegbar(),
					description: m.routes_error_text_die_datenbank_ist_derzeit_nicht_erreichb()
				};
			default:
				return {
					title: m.routes_error_text_ein_fehler_ist_aufgetreten(),
					description: m.routes_error_text_entschuldigung_etwas_ist_schiefgelaufen()
				};
		}
	};

	let errorMessage = $derived(getErrorMessage(status));
	let errorIcon = $derived(getErrorIcon(status));
</script>

<svelte:head>
	<title>{m.routes_error_title_fehler_status_ostsee_tiere({ status })}</title>
	<meta name="description" content="Ein Fehler ist aufgetreten - {errorMessage.title}" />
</svelte:head>

<div class="bg-base-200 flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-md">
		<!-- Hauptfehler-Karte -->
		<div class="card bg-base-100 shadow-raised">
			<div class="card-body items-center text-center">
				<!-- Fehler-Icon -->
				<div class="avatar placeholder mb-4">
					<div class="bg-error text-error-content h-20 w-20 rounded-full">
						<Icon icon={errorIcon} class="h-10 w-10" />
					</div>
				</div>

				<!-- Status Code -->
				<div class="badge badge-error badge-lg mb-2 font-mono font-bold">
					{status}
				</div>

				<!-- Titel -->
				<h1 class="card-title mb-2 text-2xl">
					{errorMessage.title}
				</h1>

				<!-- Beschreibung -->
				<p class="text-base-content/70 mb-6">
					{errorMessage.description}
				</p>

				<!-- Debug-Informationen (nur im Development-Modus) -->
				{#if error?.message && status !== 404}
					<div class="collapse-arrow bg-base-200 collapse mb-4">
						<input type="checkbox" />
						<div class="collapse-title text-sm font-medium">
							{m.routes_error_text_technische_details()}
						</div>
						<div class="collapse-content">
							<div class="mockup-code text-xs">
								<pre class="text-error"><code>{error.message}</code></pre>
							</div>
						</div>
					</div>
				{/if}

				<!-- Aktions-Buttons -->
				<div class="card-actions w-full justify-center">
					<div class="join join-vertical sm:join-horizontal">
						<button
							class="btn btn-primary join-item"
							onclick={goHome}
							aria-label={m.routes_error_aria_label_zur_startseite()}
						>
							<Icon icon="lucide:home" class="mr-2 h-4 w-4" />
							{m.routes_error_text_startseite()}
						</button>

						<button
							class="btn btn-ghost join-item"
							onclick={goBack}
							aria-label={m.routes_error_aria_label_zurueck()}
						>
							<Icon icon="lucide:arrow-left" class="mr-2 h-4 w-4" />
							{m.routes_error_text_zurueck()}
						</button>

						{#if status >= 500}
							<button
								class="btn btn-outline join-item"
								onclick={reloadPage}
								aria-label={m.routes_error_aria_label_seite_neu_laden()}
							>
								<Icon icon="lucide:refresh-cw" class="mr-2 h-4 w-4" />
								{m.routes_error_text_neu_laden()}
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Zusätzliche Hilfe-Karte -->
		<div class="card bg-base-100 shadow-raised mt-4">
			<div class="card-body">
				<h2 class="card-title text-lg">
					<Icon icon="lucide:info" class="mr-2 h-5 w-5" />
					{m.routes_error_text_hilfe_kontakt()}
				</h2>

				<div class="text-base-content/70 space-y-2 text-sm">
					<p>{m.routes_error_text_falls_das_problem_weiterhin_besteht()}</p>
					<ul class="ml-4 list-inside list-disc space-y-1">
						<li>{m.routes_error_text_ueberpruefen_sie_ihre_internetverbindung()}</li>
						<li>{m.routes_error_text_versuchen_sie_es_in_ein()}</li>
						<li>{m.routes_error_text_leeren_sie_den_browser_cache()}</li>
					</ul>
					<p>{m.routes_error_text_andernfalls_versuchen_sie_es_spaeter()}</p>
				</div>

				<!-- Zur Startseite -->
				<div class="card-actions mt-4 justify-end">
					<button
						class="btn btn-sm btn-ghost"
						onclick={goHome}
						aria-label={m.routes_error_aria_label_zur_startseite_2()}
					>
						<Icon icon="lucide:home" class="mr-1 h-4 w-4" />
						{m.routes_error_text_zur_startseite()}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	/* Zusätzliche Animationen für bessere UX */
	.card {
		animation: fadeInUp 0.6s ease-out;
	}

	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
