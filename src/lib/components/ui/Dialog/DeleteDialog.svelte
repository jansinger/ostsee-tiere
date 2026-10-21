<script lang="ts">
	/**
	 * Rückfrage vor dem Löschen einer Sichtung.
	 *
	 * Die Dialog-Mechanik (natives `<dialog>`, ESC, Backdrop, Fokus-Rückkehr)
	 * steckt seit der Dialog-Konsolidierung in `ConfirmDialog.svelte`; hier
	 * bleiben nur die Texte dieses einen Falls. Die Prop-Schnittstelle ist
	 * unverändert, damit die Aufrufstellen nichts davon merken.
	 */
	import * as m from '#lib/paraglide/messages.js';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let {
		show = $bindable(false),
		onConfirm,
		// Default-Noop wie an den übrigen weitergereichten Callbacks:
		// `exactOptionalPropertyTypes` verbietet sonst das Durchreichen als
		// `{onCancel}` an `ConfirmDialog`, dessen eigener Proptyp `() => void`
		// ohne `undefined` verlangt.
		onCancel = () => {}
	}: {
		show?: boolean;
		onConfirm?: () => void;
		onCancel?: () => void;
	} = $props();
</script>

<ConfirmDialog
	bind:show
	title={m.components_ui_dialog_deletedialog_text_sichtung_loeschen()}
	message={m.components_ui_dialog_deletedialog_text_sind_sie_sicher_dass_sie()}
	confirmLabel={m.components_ui_dialog_deletedialog_text_loeschen()}
	cancelLabel={m.components_ui_dialog_deletedialog_text_abbrechen()}
	closeLabel={m.components_ui_dialog_deletedialog_aria_label_dialog_schliessen()}
	onConfirm={() => onConfirm?.()}
	{onCancel}
/>
