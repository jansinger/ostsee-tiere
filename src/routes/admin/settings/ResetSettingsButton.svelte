<script lang="ts">
	/**
	 * Destruktive Aktion "Einstellungen zurücksetzen" mit dem projektüblichen
	 * Bestätigungsdialog. Der Trigger-Button folgt der Destruktiv-Konvention aus
	 * design-system.md: btn btn-outline btn-error btn-sm, nie ohne Bestätigung.
	 *
	 * Der Dialog war hier bis zur Dialog-Konsolidierung eine wörtliche Kopie von
	 * `DeleteDialog.svelte`; beide teilen sich jetzt `ConfirmDialog.svelte`.
	 */
	import Icon from '#lib/components/Icon.svelte';
	import ConfirmDialog from '#lib/components/ui/Dialog/ConfirmDialog.svelte';

	let { onReset }: { onReset: () => void } = $props();

	let show = $state(false);
</script>

<button type="button" class="btn btn-outline btn-error btn-sm gap-2" onclick={() => (show = true)}>
	<Icon icon="lucide:refresh-cw" class="size-4" aria-hidden="true" />
	Zurücksetzen
</button>

<ConfirmDialog
	bind:show
	title="Einstellungen zurücksetzen"
	message="Alle Einstellungen auf die Vorbelegung zurücksetzen — gespeicherte Werte gehen verloren."
	confirmLabel="Endgültig zurücksetzen"
	cancelLabel="Abbrechen"
	closeLabel="Dialog schließen"
	onConfirm={onReset}
/>
