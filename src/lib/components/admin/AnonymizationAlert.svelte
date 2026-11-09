<script lang="ts">
	/**
	 * Hinweisleiste der Anonymisierung im ganzen Admin-Bereich.
	 *
	 * Erscheint nur bei rotem Status: Meldungen über der Frist oder ein letzter
	 * Lauf vor mehr als 48 Stunden (`evaluateAnonymizationHealth`). Vor der
	 * Freischaltung bleibt sie aus — dann liegt erwartungsgemäß fast der ganze
	 * Bestand über der Frist, und das Panel zeigt die Vorbedingungen.
	 */
	import Icon from '#lib/components/Icon.svelte';
	import type { AnonymizationBanner } from '#lib/server/privacy/anonymizationStatus.ts';
	import { ANONYMIZATION_STALE_RUN_HOURS } from '#lib/utils/privacy/anonymizationHealth.ts';

	let { banner }: { banner: AnonymizationBanner | null } = $props();
</script>

{#if banner?.level === 'alert'}
	<div class="alert alert-error rounded-none" role="alert">
		<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
		<div class="text-sm">
			<strong>Anonymisierung:</strong>
			{#if banner.reasons.includes('overdue')}
				{banner.overdue.toLocaleString('de-DE')} Meldungen liegen über der Frist.
			{/if}
			{#if banner.reasons.includes('stale_run')}
				Der letzte Lauf liegt mehr als {ANONYMIZATION_STALE_RUN_HOURS} Stunden zurück — Cron prüfen.
			{/if}
		</div>
		<a class="btn btn-sm btn-outline" href="/admin/settings#anonymisierung">Zur Anonymisierung</a>
	</div>
{/if}
