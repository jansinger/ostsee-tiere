<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
</script>

<!-- Der gemeinsame Kopf von Einstiegsseite und Formular (Wunsch des Deutschen
     Meeresmuseums, 2026-08-13). Bis dahin trug die Einstiegsseite eine eigene,
     kürzere Überschrift ohne Unterzeile — beim Sprung ins Formular wechselte
     der Titel also mitten im Vorgang.

     Die `isNotIFrame`-Bedingung steht bewusst an den beiden Aufrufstellen und
     nicht hier: Auf meeresmuseum.de trägt die Museumsseite ihre eigene
     Überschrift, und die Aufrufstellen unterdrücken diese hier aus genau dem
     Grund, den sie dort auch kommentieren. Hier drin wäre die Komponente
     zudem nicht mehr unit-testbar (Vitest rendert im iframe).

     Die beiden Schlüssel behalten ihren `modernreportform`-Präfix — er kommt
     vom Extraktions-Pfad und ist ein Bezeichner, kein Ort. -->
<!-- Enger unterhalb `md`: Auf 375 px kostete der Kopf 376 px, bevor das
     Formular begann — die Schriftgrößen bleiben, gekürzt werden die
     Abstände. Kleinere Schrift wäre hier das falsche Mittel: Das Formular
     wird an Deck und bei Sonnenlicht ausgefüllt (design-system.md). -->
<div class="mb-3 text-center md:mb-8">
	<h1 class="text-base-content mb-1 text-2xl font-bold md:mb-2 md:text-3xl lg:text-4xl">
		{m.report_components_modernreportform_text_sichtung_von_meeressaeugetieren_melden()}
	</h1>
	<p class="text-base-content/70 px-2 text-sm md:text-lg">
		{m.report_components_modernreportform_text_fuer_die_forschung_des_deutschen()}
	</p>
</div>
