<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { get } from 'svelte/store';
	import { getFormContext } from '#lib/report/formContext.ts';
	import Icon from '#lib/components/Icon.svelte';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import { hasCoordinates } from '#lib/report/components/form/coordinateValue.ts';
	import { descriptionCollapsed } from './positionPanelState';

	const { form } = getFormContext();

	const coordinatesPresent = $derived(hasCoordinates($form.latitude, $form.longitude));

	// Die Ortsbeschreibung ist laut Schema Pflicht, solange keine GPS-Position
	// vorliegt (`waterway.when('hasPosition', { is: (v) => v !== true, ... })`).
	// Der Override ist nötig, weil `FieldRenderer` `required` aus der statischen
	// Schema-Beschreibung ableitet, in der ein `when()` nicht sichtbar ist.
	const waterwayRequired = $derived($form.hasPosition !== true);

	// Startzustand, EINMALIG beim Mounten bestimmt — bewusst über `get(form)`
	// statt `$form`, damit daraus keine reaktive Abhängigkeit wird.
	//
	// `descriptionCollapsed` hängt an `waterway`. Würde der Auf-/Zuklapp-Zustand
	// reaktiv daran gebunden, kippte er beim ersten `change` in genau dem Feld,
	// in dem gerade getippt wird. Vorher lag darunter sogar ein `{#if}` mit
	// eigenen `FormField`-Instanzen: Svelte riss den Teilbaum ab, das fokussierte
	// Feld verschwand und `document.activeElement` fiel auf `<body>` zurück. Das
	// Feld steht deshalb genau einmal im Markup, in einem Container, der nie
	// ausgetauscht wird.
	//
	// Kein `bind:open`: `PositionPanel.focusDescription()` klappt Vorfahren-
	// `<details>` imperativ auf, bevor es fokussiert. Ein gebundener Zustand
	// würde dagegen zurückschreiben.
	const initialValues = get(form);
	const startsOpen = !descriptionCollapsed(
		hasCoordinates(initialValues.latitude, initialValues.longitude),
		initialValues.waterway
	);
</script>

<details
	class="border-base-300 bg-base-200/40 collapse mt-4 rounded-lg border"
	open={startsOpen}
	data-testid="location-description"
>
	<!-- `<summary>` ist nativ fokussierbar — kein `tabindex` nötig. -->
	<summary class="collapse-title flex min-h-11 items-center gap-2 py-3 text-sm font-medium">
		<Icon aria-hidden="true" icon="lucide:waves" width="16" class="text-primary shrink-0" />
		<!--
			„den Ort", nicht „das Seegebiet": Das Feld darunter deckt seit A2.4 auch
			Fahrwasser und Orientierungspunkte ab — eine engere Aufforderung legt
			Melder unnötig auf eine Gewässerbezeichnung fest. Gleiche Wortwahl wie
			in der Pflicht-Fehlermeldung des Schemas („Bitte beschreiben Sie den Ort
			oder wählen Sie eine GPS-Position").
		-->
		{coordinatesPresent
			? 'Ortsbeschreibung ergänzen (optional)'
			: 'Kein GPS? Beschreiben Sie den Ort'}
	</summary>
	<div class="collapse-content">
		<p class="text-base-content/70 text-support mb-3">
			{m.report_components_form_position_locationdescription_text_nicht_jede_sichtung_laesst_sich()}
		</p>

		<!--
			EIN Freitextfeld statt der früheren zwei (Wunsch des Deutschen
			Meeresmuseums, A2.4): Seegebiet, Fahrwasser und Orientierungspunkte
			werden gemeinsam beschrieben. `seaMark` bleibt im Schema und in der
			Admin-Maske (`sections/Location.svelte`), damit der Altbestand
			korrigierbar bleibt — hier gehört es nicht mehr hin.

			`data-testid="field-waterway"` ist der Sprungpunkt von
			`PositionPanel.focusDescription()` und von `scrollToFirstError`.
		-->
		<FormField name="waterway" required={waterwayRequired} />
	</div>
</details>
