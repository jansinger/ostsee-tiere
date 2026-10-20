<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import { returnTarget } from './tableReturnUrl';

	let { children, data } = $props();

	const zurueck = $derived(returnTarget(page.url, page.params.id));

	function handleClose() {
		goto(zurueck.href);
	}
</script>

<div class="container mx-auto p-4">
	<div class="mb-2 flex justify-end">
		<button class="btn btn-ghost btn-sm" onclick={handleClose}>
			<Icon icon="lucide:arrow-left" class="mr-2 h-4 w-4" />
			{zurueck.label}
		</button>
	</div>

	{#await data.sighting}
		<div class="flex justify-center p-8">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:then}
		<div class="bg-base-100 shadow-raised rounded-lg">
			<div class="p-6">
				{@render children()}
			</div>
		</div>
	{:catch error}
		<div class="alert alert-error">
			<Icon icon="lucide:alert-circle" class="h-6 w-6 shrink-0" />
			<span>{error}</span>
		</div>
	{/await}
</div>
