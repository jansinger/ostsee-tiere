<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getSpeciesLabel } from '$lib/report/formOptions/species';
	import type { SightingFormValues } from '$lib/types/Form';
	import { formatWallClockDateTime } from '$lib/utils/format/formatWallClockDateTime';
	import { formatLocation } from '$lib/utils/format/formatLocation';
	import { maskEmail } from '$lib/utils/privacy/emailMask';
	import { MEDIA_FALLBACK_EMAIL } from '$lib/constants/contact';
	import Icon from '$lib/components/Icon.svelte';
	import { localizeHref } from '$lib/paraglide/runtime';

	// Success state management
	let {
		submittedData,
		handleNewReport
	}: {
		submittedData: SightingFormValues | null;
		handleNewReport: () => void;
	} = $props();
</script>

<!-- Success Page -->
<div class="bg-base-100 min-h-screen py-12">
	<div class="container mx-auto max-w-2xl px-4">
		<!-- Success Header -->
		<div class="mb-8 space-y-6 text-center">
			<div class="flex justify-center">
				<div class="bg-success/20 flex h-20 w-20 items-center justify-center rounded-full">
					<Icon icon="lucide:check" width="40" class="text-success-strong" aria-hidden="true" />
				</div>
			</div>

			<h1
				class="text-base-content flex items-center justify-center gap-3 text-3xl font-bold lg:text-4xl"
			>
				{m.report_components_submissionsuccess_text_vielen_dank()}
				<Icon
					icon="custom:porpoise"
					width="32"
					height="32"
					class="text-primary"
					aria-hidden="true"
				/>
			</h1>

			<!-- „Meldung … übermittelt" statt „Sichtung … gemeldet" (A5.3): Über
			     dieses Formular wird auch ein Totfund gemeldet, und „Sichtung"
			     schloss diesen Fall sprachlich aus. „Übermittelt" statt
			     „gemeldet", weil „Ihre Meldung wurde gemeldet" doppelt sagt. -->
			<p class="text-base-content/80 text-xl">
				{m.report_components_submissionsuccess_text_ihre_meldung_wurde_erfolgreich_uebermitt()}
			</p>
		</div>

		<!-- Success Details -->
		<div class="card bg-base-200 shadow-raised mb-8">
			<div class="card-body">
				<h2 class="card-title text-success-strong mb-4">
					{m.report_components_submissionsuccess_text_was_passiert_als_naechstes()}
				</h2>

				<div class="space-y-4">
					<!-- Kein automatischer Mailversand an die meldende Person — weder beim
					     Absenden noch bei der Freigabe; `notification.email.*` steuert
					     ausschließlich die interne Mail ans Museum. Zugesagt wird deshalb
					     nur, dass die Kontaktdaten angekommen sind — nicht, dass etwas
					     zurückkommt. Eine persönliche Rückmeldung des Museums bleibt damit
					     möglich, ohne dass die Seite sie versprochen hätte, und der Kanal
					     bleibt offen (Rückfragen laufen auch telefonisch). -->
					<div class="flex items-start gap-3">
						<Icon
							icon="lucide:message-circle"
							width="24"
							height="24"
							class="text-info-strong mt-1"
							aria-hidden="true"
						/>
						<div>
							<h3 class="font-semibold">
								{m.report_components_submissionsuccess_text_rueckfragen_zu_ihrer_meldung()}
							</h3>
							<p class="text-base-content/70 text-sm">
								{m.report_components_submissionsuccess_text_eine_automatische_bestaetigungsmail()}
								<strong
									>{submittedData?.email ? maskEmail(submittedData.email) : '***@***.***'}</strong
								>{#if submittedData?.phone}
									{m.report_components_submissionsuccess_text_oder_telefonisch()}{/if}.
							</p>
						</div>
					</div>

					<div class="flex items-start gap-3">
						<Icon
							icon="lucide:activity"
							width="24"
							height="24"
							class="text-info-strong mt-1"
							aria-hidden="true"
						/>
						<div>
							<h3 class="font-semibold">
								{m.report_components_submissionsuccess_text_wissenschaftliche_auswertung()}
							</h3>
							<p class="text-base-content/70 text-sm">
								{m.report_components_submissionsuccess_text_ihre_daten_fliessen_in_die()}
							</p>
						</div>
					</div>

					<div class="flex items-start gap-3">
						<Icon
							icon="lucide:camera"
							width="24"
							height="24"
							class="text-accent-strong mt-1"
							aria-hidden="true"
						/>
						<div>
							<h3 class="font-semibold">
								{m.report_components_submissionsuccess_text_fotos_und_videos()}
							</h3>
							<p class="text-base-content/70 text-sm">
								{#if submittedData?.mediaUpload}
									{m.report_components_submissionsuccess_text_ihre_aufnahmen_wurden_uebermittelt()}
								{/if}
								{m.report_components_submissionsuccess_text_waren_aufnahmen_zu_gross_fuer_den()}
								<a class="link" href="mailto:{MEDIA_FALLBACK_EMAIL}">{MEDIA_FALLBACK_EMAIL}</a>
								{m.report_components_submissionsuccess_text_mit_datum_und_uhrzeit_ihrer()}
							</p>
						</div>
					</div>

					{#if submittedData?.isDead}
						<div class="flex items-start gap-3">
							<Icon
								icon="lucide:triangle-alert"
								width="24"
								height="24"
								class="text-warning-strong mt-1"
								aria-hidden="true"
							/>
							<div>
								<h3 class="font-semibold">
									{m.report_components_submissionsuccess_text_totfund_gemeldet()}
								</h3>
								<p class="text-base-content/70 text-sm">
									{m.report_components_submissionsuccess_text_totfunde_werden_prioritaer_behandelt_bei()}
								</p>
							</div>
						</div>
					{/if}

					<div class="flex items-start gap-3">
						<Icon
							icon="lucide:chart-pie"
							width="24"
							height="24"
							class="text-primary mt-1"
							aria-hidden="true"
						/>
						<div>
							<h3 class="font-semibold">
								{m.report_components_submissionsuccess_text_daten_einsehen()}
							</h3>
							<p class="text-base-content/70 text-sm">
								{m.report_components_submissionsuccess_text_erscheint_nach_pruefung_auf_der()}
								<a href={localizeHref('/map')} class="link link-primary"
									>{m.report_components_submissionsuccess_text_interaktiven_karte()}</a
								>
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Submission Summary -->
		{#if submittedData}
			<div class="card bg-base-100 shadow-raised mb-8">
				<div class="card-body">
					<h2 class="card-title mb-4">
						{m.report_components_submissionsuccess_text_ihre_meldung()}
					</h2>
					<div class="mb-4 grid grid-cols-1 gap-1 text-sm">
						<div>
							<span class="font-medium"
								>{m.report_components_submissionsuccess_text_referenz_id()}</span
							>
							{submittedData.referenceId}
						</div>
						<span class="text-base-content/70 text-xs">
							{m.report_components_submissionsuccess_text_bitte_geben_sie_die_id()}
						</span>
					</div>
					<div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
						<div>
							<span class="font-medium">{m.report_components_submissionsuccess_text_tierart()}</span
							>
							{getSpeciesLabel(submittedData.species)}
						</div>
						<div>
							<span class="font-medium">{m.report_components_submissionsuccess_text_anzahl()}</span>
							{m.report_components_submissionsuccess_text_totalcount_tier_plural({
								count: submittedData.totalCount
							})}
						</div>
						<div>
							<span class="font-medium">{m.report_components_submissionsuccess_text_datum()}</span>
							{formatWallClockDateTime(submittedData.sightingDate, submittedData.sightingTime)}
						</div>
						<div>
							<span class="font-medium"
								>{m.report_components_submissionsuccess_text_position()}</span
							>
							{submittedData.hasPosition
								? formatLocation(submittedData.longitude, submittedData.latitude)
								: submittedData.waterway || 'Nicht angegeben'}
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Action Buttons -->
		<!-- Nur noch ein Button: „Zur Startseite" landete wegen des gespeicherten
		     Zweigs (ReportKind) faktisch im leeren Formular des alten Zweigs statt
		     auf der Einstiegsseite — fast dieselbe Wirkung wie „Weitere Meldung
		     abgeben", nur ohne den sauberen Zweig-Reset (UX-Review 2026-08-07). -->
		<div class="flex flex-col justify-center gap-4 md:flex-row">
			<button onclick={handleNewReport} class="btn btn-primary btn-lg">
				{m.report_components_submissionsuccess_text_weitere_meldung_abgeben()}
			</button>
		</div>

		<!-- Additional Resources -->
		<div class="mt-12">
			<div class="card bg-base-200">
				<div class="card-body text-center">
					<h3 class="mb-4 text-lg font-semibold">
						{m.report_components_submissionsuccess_text_interessiert_an_mehr()}
					</h3>

					<div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
						<a href={localizeHref('/map')} class="btn btn-outline btn-sm flex items-center gap-2">
							<Icon icon="lucide:map" width="16" height="16" aria-hidden="true" />
							{m.report_components_submissionsuccess_text_alle_sichtungen_auf_der_karte()}
						</a>
						<a
							href="https://www.meeresmuseum.de"
							target="_blank"
							rel="noopener"
							class="btn btn-outline btn-sm flex items-center gap-2"
						>
							<Icon icon="lucide:shield-check" width="16" height="16" aria-hidden="true" />
							{m.report_components_submissionsuccess_text_deutsches_meeresmuseum()}
						</a>
					</div>

					<p class="text-base-content/60 mt-4 text-xs">
						{m.report_components_submissionsuccess_text_folgen_sie_uns_fuer_updates()}
					</p>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	/* Success page specific styles */
	.container {
		max-width: 768px;
	}

	/* Link styling */
	.link {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.link:hover {
		text-decoration-thickness: 2px;
	}

	/* Mobile-first responsive adjustments */
	@media (max-width: 640px) {
		.container {
			padding-left: 1rem;
			padding-right: 1rem;
		}
	}
</style>
