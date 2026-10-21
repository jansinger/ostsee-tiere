<!--
  Global toast container that displays all active toasts
  Should be placed in the main layout
  Modernized with Svelte 5 runes
-->
<script lang="ts">
	import { toasts, removeToast } from '#lib/stores/toastState.svelte.ts';
	import Toast from './Toast.svelte';
</script>

<!-- Toast Container positioned at top right -->
<div class="toast toast-top toast-end z-overlay">
	{#each toasts as toast (toast.id)}
		<Toast
			type={toast.type}
			title={toast.title || ''}
			message={toast.message}
			duration={toast.duration ?? 5000}
			dismissible={!!toast.dismissible}
			action={toast.action}
			onDismiss={() => removeToast(toast.id)}
		/>
	{/each}
</div>

<style>
	.toast {
		position: fixed;
		pointer-events: none;
	}
</style>
