<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';

	let { isAdmin = false, maintenanceMessage = '' } = $props();
</script>

<!-- Maintenance Mode Banner for Admins -->
{#if isAdmin}
	<div class="alert alert-warning">
		<div class="flex items-center gap-2">
			<Icon icon="lucide:settings" class="size-5" style="animation: spin 3s linear infinite" />
			<Icon icon="lucide:alert-circle" class="size-5" />
		</div>
		<div class="flex-1">
			<h3 class="flex items-center gap-2 font-bold">
				<Icon icon="lucide:triangle-alert" width="20" height="20" class="text-warning-strong" />
				{m.components_maintenancebanner_text_wartungsmodus_ist_aktiv()}
			</h3>
			<div class="text-sm">
				{m.components_maintenancebanner_text_normale_benutzer_sehen_die_wartungsseite()}
			</div>
			{#if maintenanceMessage}
				<div class="mt-2 text-sm opacity-80">
					<strong>{m.components_maintenancebanner_text_aktuelle_nachricht()}</strong>
					{maintenanceMessage}
				</div>
			{/if}
		</div>
		<div>
			<a href="/admin/settings" class="btn btn-warning btn-sm">
				{m.components_maintenancebanner_text_einstellungen()}
			</a>
		</div>
	</div>
{/if}

<!-- Spin animation ist jetzt global in app.css definiert -->
