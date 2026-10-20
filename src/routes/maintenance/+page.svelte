<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import OstseeTiereLogo from '#lib/components/OstseeTiereLogo.svelte';

	let { data } = $props();

	function refreshPage() {
		window.location.reload();
	}
</script>

<svelte:head>
	<title>{m.routes_maintenance_page_text_wartungsmodus_ostsee_tiere()}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="bg-base-200 flex min-h-screen items-center justify-center">
	<div class="card bg-base-100 shadow-raised w-full max-w-md">
		<div class="card-body text-center">
			<!-- Logo -->
			<div class="mb-6 flex justify-center">
				<OstseeTiereLogo size="lg" showText={true} />
			</div>

			<!-- Maintenance Icon -->
			<div class="mb-6 flex justify-center">
				<div class="bg-warning/20 rounded-full p-6">
					<Icon icon="lucide:settings" class="text-warning-strong size-16 animate-spin" />
				</div>
			</div>

			<!-- Title -->
			<h1 class="text-base-content flex items-center justify-center gap-2 text-2xl font-bold">
				<Icon icon="lucide:settings" width="24" />
				{m.routes_maintenance_page_text_wartungsmodus()}
			</h1>

			<!-- Message -->
			<div class="text-base-content/80 mt-4">
				<p class="text-lg leading-relaxed">
					{data.maintenanceMessage ||
						'Die Anwendung wird gewartet. Bitte versuchen Sie es später erneut.'}
				</p>
			</div>

			<!-- Refresh Button -->
			<div class="mt-8">
				<button onclick={refreshPage} class="btn btn-primary gap-2">
					<Icon icon="lucide:refresh-cw" class="size-5" />
					{m.routes_maintenance_page_text_seite_aktualisieren()}
				</button>
			</div>

			<!-- Info -->
			<div class="text-base-content/60 mt-6 text-sm">
				<p>{m.routes_maintenance_page_text_wir_arbeiten_daran_die_anwendung()}</p>
				<p class="mt-1">{m.routes_maintenance_page_text_vielen_dank_fuer_ihr_verstaendnis()}</p>
			</div>
		</div>
	</div>
</div>
