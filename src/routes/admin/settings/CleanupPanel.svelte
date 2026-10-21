<script lang="ts">
	/**
	 * Aufräumen verwaister Uploads aus der Admin-Oberfläche.
	 *
	 * Erst Vorschau, dann bestätigen: Der Lösch-Button erscheint bewusst erst,
	 * wenn ein Befund vorliegt — sonst löscht ein Admin blind.
	 */
	import Icon from '#lib/components/Icon.svelte';
	import ConfirmDialog from '#lib/components/ui/Dialog/ConfirmDialog.svelte';

	type CleanupReport = {
		retentionHours: number;
		rowsFound: number;
		filesFound: number | null;
		rowsDeleted: number;
		filesDeleted: number;
		failed: number;
		remaining: number;
	};

	let report = $state<CleanupReport | null>(null);
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);

	let hasFindings = $derived(!!report && report.rowsFound + (report.filesFound ?? 0) > 0);

	async function run(execute: boolean) {
		busy = true;
		errorMessage = null;
		try {
			const response = await fetch(
				`/api/admin/cleanup-orphans?mode=${execute ? 'execute' : 'preview'}`,
				{ method: 'POST' }
			);
			if (!response.ok) throw new Error(`Status ${response.status}`);
			report = await response.json();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
		} finally {
			busy = false;
		}
	}

	/**
	 * Rückfrage über `ConfirmDialog` statt `window.confirm` — derselbe Weg wie
	 * bei `ResetSettingsButton` nebenan (UX MEDIUM 13, Dialog-Konsolidierung).
	 */
	let zeigeBestaetigung = $state(false);
</script>

<section class="card bg-base-100 border-base-300 shadow-raised border">
	<div class="card-body">
		<h2 class="card-title">
			<Icon icon="lucide:trash-2" width="20" class="text-primary" aria-hidden="true" />
			Verwaiste Uploads
		</h2>
		<p class="text-base-content/70 text-sm">
			Aufnahmen, die übertragen, aber nie mit einer abgeschickten Sichtung verknüpft wurden.
		</p>

		<div class="mt-4 flex flex-wrap gap-2">
			<button class="btn btn-primary" disabled={busy} onclick={() => run(false)}>
				Vorschau laden
			</button>
			<!-- „Löschen", nicht „Endgültig löschen": Der Knopf löscht nichts, er
			     stellt die Rückfrage. „Endgültig" steht auf dem Knopf im Dialog,
			     der es tatsächlich auslöst — wie bei ResetSettingsButton. -->
			{#if hasFindings}
				<button
					class="btn btn-outline btn-error btn-sm"
					disabled={busy}
					onclick={() => (zeigeBestaetigung = true)}
				>
					Löschen
				</button>
			{/if}
		</div>

		{#if errorMessage}
			<div class="alert alert-error mt-4" role="alert">
				<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
				<span class="text-sm">Aufräumen fehlgeschlagen: {errorMessage}</span>
			</div>
		{:else if report}
			<div class="alert alert-info mt-4">
				<Icon icon="lucide:info" class="shrink-0" aria-hidden="true" />
				<span class="text-sm">
					{report.rowsFound} Zeilen ohne Sichtung,
					{report.filesFound ?? 'nicht anwendbar'} Dateien ohne Zeile (Frist: {report.retentionHours}
					Stunden).
					{#if report.rowsDeleted + report.filesDeleted > 0}
						Entfernt: {report.rowsDeleted} Zeilen, {report.filesDeleted} Dateien.
					{/if}
					{#if report.remaining > 0}
						Noch {report.remaining} übrig — erneut ausführen.
					{/if}
				</span>
			</div>
		{/if}
	</div>
</section>

<ConfirmDialog
	bind:show={zeigeBestaetigung}
	title="Verwaiste Uploads löschen"
	message="Verwaiste Uploads endgültig löschen?"
	detail="Das lässt sich nicht rückgängig machen."
	confirmLabel="Endgültig löschen"
	cancelLabel="Abbrechen"
	closeLabel="Dialog schließen"
	onConfirm={() => run(true)}
/>
