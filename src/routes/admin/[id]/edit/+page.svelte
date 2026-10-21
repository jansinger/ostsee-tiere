<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AdminSightingEditForm from '#lib/components/admin/AdminSightingEditForm.svelte';
	import { carryReturnParams } from '../tableReturnUrl';
	import { createLogger } from '#lib/logger.ts';
	import type { FrontendSighting } from '#lib/types/FrontendSighting.ts';
	import Icon from '#lib/components/Icon.svelte';

	const logger = createLogger('AdminSightingEditPage');

	let { data } = $props();

	let sighting = $derived(data.sighting);

	/* Herkunft und Tabellenfilter zurück an die Detailansicht reichen — ohne sie
	   endet deren Zurück-Knopf in der ungefilterten Tabelle, egal wo der
	   Rundweg begonnen hat. */
	const detailHref = $derived(`/admin/${sighting.id}${carryReturnParams(page.url)}`);

	function onCancel() {
		goto(detailHref);
	}

	function handleSave(updatedSighting: FrontendSighting) {
		logger.info({ updatedSighting }, 'Sichtung gespeichert');
		goto(detailHref, { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>Sichtung #{data.sighting?.id} bearbeiten - Admin - Ostsee-Tiere</title>
	<meta
		name="description"
		content="Bearbeitung der Sichtung #{data.sighting
			?.id}. Admin-Bereich zur Korrektur und Anpassung von Sichtungsdaten."
	/>
	<meta
		name="keywords"
		content="Sichtung, Bearbeiten, Admin, {data.sighting?.species ||
			'Meerestier'}, Ostsee, Verwaltung"
	/>

	<!-- Open Graph -->
	<meta property="og:title" content="Sichtung #{data.sighting?.id} bearbeiten - Admin" />
	<meta
		property="og:description"
		content="Bearbeitung einer Meerestier-Sichtung im Admin-Bereich"
	/>
	<meta property="og:type" content="website" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Sichtung #{data.sighting?.id} bearbeiten - Admin" />
	<meta
		name="twitter:description"
		content="Bearbeitung einer Meerestier-Sichtung im Admin-Bereich"
	/>
</svelte:head>

<div class="mb-0 flex items-center justify-between">
	<!-- `h1` aus demselben Grund wie in der Detailansicht nebenan: Ohne sie
	     begann die Überschriftenstruktur auf Ebene 2 (WCAG 1.3.1). `text-xl`
	     ebenfalls wie dort — die Begründung der Ausnahme von `text-display`
	     steht in `[id]/+page.svelte`. -->
	<h1 class="text-xl font-bold">Sichtung bearbeiten</h1>
	<div class="flex gap-2">
		<button
			class="btn btn-ghost btn-sm"
			onclick={onCancel}
			title="Abbrechen"
			aria-label="Sichtungsbearbeitung abbrechen"
		>
			<Icon icon="lucide:pen-off" class="mr-1 h-4 w-4" />
			Abbrechen
		</button>
	</div>
</div>
<div class="text-base-content/70 mb-4 text-sm">
	Referenz-ID: {sighting.referenceId}
</div>
<AdminSightingEditForm {sighting} {onCancel} onSave={handleSave} />
