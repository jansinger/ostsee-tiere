<script lang="ts">
	// BuildInfo liegt unter $lib/types (nicht $lib/server/startup/versionInfo): Module
	// unter $lib/server/** sind für Client-Code gesperrt, auch bei reinen Typ-Importen.
	import type { BuildInfo } from '#lib/types/BuildInfo.ts';

	let { buildInfo }: { buildInfo: BuildInfo } = $props();
</script>

<footer class="border-base-300 text-base-content/70 mt-8 border-t p-4 text-center text-xs">
	<p>
		v{buildInfo.version} · commit {buildInfo.shortGitSha}
		{#if buildInfo.buildDate}
			· built {buildInfo.buildDate}
		{/if}
	</p>
</footer>
