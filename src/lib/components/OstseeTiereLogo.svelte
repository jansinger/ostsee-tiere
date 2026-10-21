<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';

	let {
		size = 'md',
		showText = true,
		linkToHome = true,
		className = ''
	}: {
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		showText?: boolean;
		linkToHome?: boolean;
		className?: string;
	} = $props();

	// Größen-Definitionen
	const sizeMap = {
		xs: { logo: 32, text: 'text-sm' }, // 32px - Mini
		sm: { logo: 48, text: 'text-base' }, // 48px - Klein (Admin Nav)
		md: { logo: 64, text: 'text-lg' }, // 64px - Medium
		lg: { logo: 96, text: 'text-xl' }, // 96px - Groß
		xl: { logo: 128, text: 'text-2xl' } // 128px - Extra groß
	};

	const currentSize = $derived(sizeMap[size]);

	// WebP-Support für moderne Browser
	const supportsWebP =
		typeof window !== 'undefined' &&
		window.document?.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') ===
			0;

	// Dynamische Bildquelle basierend auf Größe und Format
	const imageSrc = $derived(
		supportsWebP && currentSize.logo <= 128
			? `/ostsee-tiere-${currentSize.logo}.webp`
			: `/ostsee-tiere-${currentSize.logo}.png`
	);
</script>

{#if linkToHome}
	<a
		href={localizeHref('/')}
		class="inline-flex items-center gap-2 transition-opacity hover:opacity-90 {className}"
		aria-label={m.components_ostseetierelogo_aria_label_ostsee_tiere_startseite()}
	>
		<img
			src={imageSrc}
			alt={m.components_ostseetierelogo_alt_ostsee_tiere_logo_springender_delfin()}
			width={currentSize.logo}
			height={currentSize.logo}
			class="object-contain"
		/>
		{#if showText}
			<div class="flex flex-col">
				<span class="font-bold {currentSize.text} text-primary leading-tight">
					{m.components_ostseetierelogo_text_ostsee_tiere_de()}
				</span>
			</div>
		{/if}
	</a>
{:else}
	<div class="inline-flex items-center gap-2 {className}">
		<img
			src={imageSrc}
			alt={m.components_ostseetierelogo_alt_ostsee_tiere_logo_springender_delfin_2()}
			width={currentSize.logo}
			height={currentSize.logo}
			class="object-contain"
		/>
		{#if showText}
			<div class="flex flex-col">
				<span class="font-bold {currentSize.text} text-primary leading-tight">
					{m.components_ostseetierelogo_text_ostsee_tiere_de_2()}
				</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Optimierte Bilddarstellung */
	img {
		image-rendering: -webkit-optimize-contrast;
		image-rendering: crisp-edges;
	}
</style>
