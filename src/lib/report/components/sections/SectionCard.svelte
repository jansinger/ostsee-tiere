<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';

	/**
	 * Zwei Varianten, ein Abschnittsmuster (siehe /styleguide → „Abschnitt").
	 *
	 * - `card`  — eigenständiger Abschnitt auf Seitenebene (DaisyUI-Karte).
	 * - `inset` — untergeordneter Block innerhalb eines Schritts. Genau die Box,
	 *   die `PositionAndTime.svelte` und `PositionPanel.svelte` bisher jeweils
	 *   selbst zusammengesetzt haben.
	 *
	 * Der Hover-Zustand steht nicht mehr hier: `.card:hover` in `app.css` gilt
	 * für alle Karten. Der frühere lokale `<style>`-Block hat ihn ein zweites Mal
	 * definiert — mit `transition: all` und einem handgeschriebenen `box-shadow`
	 * statt eines Elevation-Tokens.
	 */
	interface Props {
		title: string;
		icon: string;
		variant?: 'card' | 'inset';
		children: Snippet;
	}

	let { title, icon, variant = 'card', children }: Props = $props();
</script>

{#if variant === 'card'}
	<div class="card bg-base-200 shadow-raised">
		<div class="card-body">
			<!-- `wrap-anywhere`: Der Titel steht als anonymes Flex-Item neben dem
			     Icon und kann deshalb nicht unter seine Mindestbreite schrumpfen.
			     „Boot-/Schiffsinformationen" misst so 229px und drückte die ganze
			     Seite auf 320px um 60px auseinander — der Seiten-Wrapper ist ein
			     Flex-Item mit `mx-auto` und wächst mit seinem Inhalt statt mit dem
			     Fenster. `wrap-anywhere` senkt die Mindestbreite auf ein Zeichen;
			     gebrochen wird trotzdem nur, wenn der Titel sonst nicht passt (ab
			     360px also gar nicht). `hyphens: auto` allein würde hier nicht
			     genügen: Chromes Trennmuster hängen an Wörterbüchern, die auf
			     Headless-CI-Images fehlen können, und eine Layoutgrenze darf davon
			     nicht abhängen (dieselbe Begründung wie am `.label`-Block in
			     `src/app.css`). Gefunden von `e2e/horizontal-overflow.spec.ts`. -->
			<h3 class="card-title text-section flex items-center gap-2 wrap-anywhere">
				<Icon {icon} width="20" class="text-primary" aria-hidden="true" />
				{title}
			</h3>
			{@render children()}
		</div>
	</div>
{:else}
	<div class="border-base-300 bg-base-200/50 rounded-box border p-3 md:p-4">
		<!-- `wrap-anywhere` wie in der `card`-Variante oben. -->
		<h3 class="text-section mb-3 flex items-center gap-2 font-semibold wrap-anywhere">
			<Icon {icon} width="20" class="text-primary" aria-hidden="true" />
			{title}
		</h3>
		{@render children()}
	</div>
{/if}
