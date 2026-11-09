<script lang="ts">
	/**
	 * Löschersuchen (Art. 17 DSGVO): alle Meldungen einer Person sofort
	 * anonymisieren und die Verknüpfung entfernen.
	 *
	 * Erst suchen, dann löschen — wie beim Aufräumen nebenan. Die Adresse geht
	 * nur an `POST /api/admin/reporter-erasure`, der sie selbst hasht; sie wird
	 * weder gespeichert noch geloggt und nach dem Löschen aus dem Feld entfernt.
	 * Nur für Superadmins eingeblendet; der Endpunkt prüft das selbst.
	 */
	import Icon from '#lib/components/Icon.svelte';
	import ConfirmDialog from '#lib/components/ui/Dialog/ConfirmDialog.svelte';
	import type { ErasureReport } from '#lib/server/privacy/eraseReporter.ts';

	let email = $state('');
	/** Adresse, zu der `preview` gehört — ändert sich das Feld, gilt sie nicht mehr. */
	let previewFor = $state<string | null>(null);
	let preview = $state<ErasureReport | null>(null);
	let result = $state<ErasureReport | null>(null);
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);
	let zeigeBestaetigung = $state(false);

	const currentPreview = $derived(preview && previewFor === email ? preview : null);

	async function request(address: string, mode: 'preview' | 'execute'): Promise<ErasureReport> {
		const response = await fetch('/api/admin/reporter-erasure', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(mode === 'execute' ? { email: address, mode } : { email: address })
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(body.error ?? `Status ${response.status}`);
		return body as ErasureReport;
	}

	async function search(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		// Vor dem Warten festhalten: Ändert sich das Feld, solange die Anfrage
		// läuft, gehört die Antwort zur alten Adresse und wird verworfen — sonst
		// stünde ihre Trefferzahl an der neuen, und „Löschen" träfe eine nie
		// gesuchte Adresse (Review PR #1013).
		const searched = email;
		busy = true;
		errorMessage = null;
		result = null;
		try {
			const report = await request(searched, 'preview');
			if (email !== searched) return;
			preview = report;
			previewFor = searched;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
		} finally {
			busy = false;
		}
	}

	async function erase(): Promise<void> {
		// Gelöscht wird genau die gesuchte Adresse, nicht der aktuelle Feldinhalt.
		const target = previewFor;
		if (!target) return;
		busy = true;
		errorMessage = null;
		try {
			result = await request(target, 'execute');
			email = '';
			preview = null;
			previewFor = null;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
		} finally {
			busy = false;
		}
	}
</script>

<section
	id="loeschersuchen"
	class="card bg-base-100 border-base-300 shadow-raised border"
	aria-labelledby="loeschersuchen-titel"
>
	<div class="card-body">
		<h2 id="loeschersuchen-titel" class="card-title">
			<Icon icon="lucide:eraser" width="20" class="text-primary" aria-hidden="true" />
			Löschersuchen
		</h2>
		<p class="text-base-content/70 text-sm">
			Verlangt eine Person die Löschung ihrer Daten, werden alle ihre Meldungen sofort anonymisiert
			— auch Name und Schiffsname, unabhängig von der Einwilligung. Die Meldungen bleiben, die
			Verknüpfung zur Person wird entfernt.
		</p>

		<form class="mt-4 flex flex-wrap items-end gap-2" onsubmit={search}>
			<label class="fieldset" for="loeschersuchen-email">
				<span class="fieldset-legend">E-Mail-Adresse der Person</span>
				<input
					id="loeschersuchen-email"
					class="input"
					type="email"
					autocomplete="off"
					required
					bind:value={email}
				/>
			</label>
			<button class="btn btn-outline" type="submit" disabled={busy}>Meldungen suchen</button>
		</form>

		{#if errorMessage}
			<div class="alert alert-error mt-4" role="alert">
				<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
				<span class="text-sm">Anfrage fehlgeschlagen: {errorMessage}</span>
			</div>
		{/if}

		{#if currentPreview}
			<div class="mt-4 flex flex-wrap items-center gap-3" role="status">
				{#if currentPreview.matched === 0}
					<span class="text-sm">Keine Meldungen zu dieser Adresse.</span>
				{:else}
					<span class="text-sm">
						{currentPreview.matched} Meldungen gefunden, davon {currentPreview.alreadyAnonymized} bereits
						anonymisiert.
					</span>
					<button
						class="btn btn-outline btn-error btn-sm"
						disabled={busy}
						onclick={() => (zeigeBestaetigung = true)}
					>
						Löschen
					</button>
				{/if}
			</div>
		{/if}

		{#if result}
			<div class="alert alert-success mt-4" role="status">
				<Icon icon="lucide:circle-check" class="shrink-0" aria-hidden="true" />
				<span class="text-sm">{result.erased} Meldungen anonymisiert, Verknüpfung entfernt.</span>
			</div>
		{/if}
	</div>
</section>

<ConfirmDialog
	bind:show={zeigeBestaetigung}
	title="Löschersuchen ausführen"
	message={`${currentPreview?.matched ?? 0} Meldungen dieser Person endgültig anonymisieren?`}
	detail="Kontaktdaten, Name und Schiffsname werden geleert; die Verknüpfung lässt sich nicht wiederherstellen."
	confirmLabel="Endgültig löschen"
	cancelLabel="Abbrechen"
	closeLabel="Dialog schließen"
	onConfirm={erase}
/>
