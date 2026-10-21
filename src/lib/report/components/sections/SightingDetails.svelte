<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getFormContext } from '#lib/report/formContext.ts';
	import { BoatDriveEnum, getPublicBoatDriveOptions } from '#lib/report/formOptions/boatDrive.ts';
	import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
	import { slide } from 'svelte/transition';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import SectionCard from './SectionCard.svelte';
	import { detailsSectionTitle, sightingFromQuestion } from '#lib/report/wording.ts';
	import { isDeadFinding } from '#lib/report/formConfig.ts';
	import {
		NOT_YET_TRACKED,
		isBoatSightingFrom,
		shouldResetBoatDrive,
		type TrackedSightingFromValue
	} from './boatDriveReset';

	const { adminMode = false }: { adminMode?: boolean } = $props();

	const { form, updateField } = getFormContext();

	// „Statt Sichtungsdetails ‚Funddetails' einfügen" (Wunsch des Museums für den
	// Totfund). Gilt auch in der Admin-Maske — dort kommt `isDead` aus dem
	// geladenen Datensatz, und ein Totfund heißt auch dort ein Fund.
	const cardTitle = $derived(detailsSectionTitle($form.isDead));

	// Die Frage über der Herkunftsauswahl folgt demselben Zweig wie der
	// Kartentitel — „Funddetails" mit „Von wo aus wurde die SICHTUNG gemacht?"
	// darunter war der auffälligste Rest der alten Ansprache (UX-Review
	// 2026-08-07). In der Admin-Maske bleibt es beim Schema-Label: Dort wird ein
	// Datensatz bearbeitet, und die Beschriftung ist dieselbe wie in Export und
	// Detailansicht — `sightingFromQuestion(false)` IST dieses Label (in
	// `wording.test.ts` gegen das Schema geprüft), deshalb ein unbedingter
	// String statt eines `undefined`, das `exactOptionalPropertyTypes` an einem
	// optionalen Prop ohnehin nicht zuließe.
	const sightingFromLabel = $derived(sightingFromQuestion(adminMode ? false : $form.isDead));

	/** Sichtung erfolgte von einem Boot mit Antrieb (Segelschiff/Motorboot) aus. */
	const showsBoatDrive = $derived(isBoatSightingFrom($form.sightingFrom));

	// Zuletzt gesehener sightingFrom-Wert. Startet mit NOT_YET_TRACKED, damit der
	// erste Durchlauf (Mount, ggf. mit vorbefüllten Admin-Daten) NIE einen Reset
	// auslöst - siehe shouldResetBoatDrive.
	let previousSightingFrom: TrackedSightingFromValue = NOT_YET_TRACKED;

	// Wechselt der NUTZER aktiv von Boot zu Land/Fähre/Sonstiges, verstecken wir
	// den Bootsantrieb-Block wieder. Dabei müssen boatDrive/boatDriveText im
	// Formular-State zurückgesetzt werden, damit keine versteckten
	// Boot-Angaben unbeabsichtigt mit übermittelt werden. Beim initialen Mount
	// (z.B. Admin-Edit einer bestehenden Land-Sichtung) darf das NICHT passieren,
	// sonst geht ein gespeicherter boatDrive-Wert unsichtbar verloren.
	$effect(() => {
		const currentSightingFrom = $form.sightingFrom;

		if (shouldResetBoatDrive(previousSightingFrom, currentSightingFrom)) {
			if ($form.boatDrive !== undefined) {
				updateField('boatDrive', undefined);
			}
			if ($form.boatDriveText !== undefined) {
				updateField('boatDriveText', undefined);
			}
		}

		previousSightingFrom = currentSightingFrom;
	});
</script>

<!-- Sighting Details Section -->
<SectionCard title={cardTitle} icon="lucide:activity">
	<div class="mt-2 grid grid-cols-1 gap-4 md:grid-cols-1">
		<FormField name="sightingFrom" label={sightingFromLabel} />
		{#if String($form.sightingFrom) === String(SightingFromEnum.OTHER)}
			<!-- `required` als Override, weil die Pflicht im Schema in einem
			     `when('sightingFrom')` steckt und `describe()` das nicht sieht —
			     derselbe Fall wie `boatDrive` unten.

			     Anders als dort ist der Wert hier NICHT unbedingt `true`, obwohl
			     dieser Zweig nur bei „Sonstiges" rendert: `adminSightingSchema` baut
			     das Feld ausdrücklich als `notRequired()` neu auf, weil 1.120
			     Bestandszeilen `vonwo = 0` ohne Freitext tragen und sonst nicht mehr
			     speicherbar wären. In der Admin-Maske würde ein Sternchen also eine
			     Pflicht behaupten, die beim Speichern niemand prüft. -->
			<div transition:slide>
				<FormField name="sightingFromText" required={!adminMode} />
			</div>
		{/if}
	</div>
	<!-- `boatDrive` braucht KEINE eigene isFromLand-Bedingung für Task 11
	     („Bootsfelder entfallen bei Land"): `showsBoatDrive` zeigt den Block
	     ohnehin nur bei Segelschiff/Motorboot — das schließt Land (und auch
	     Fähre/Sonstiges) bereits ein, in beiden Zweigen (Admin wie Meldeformular),
	     weil `{#if showsBoatDrive}` außen um beide `{#if adminMode}`-Zweige
	     steht. `getFormSteps` (formConfig.ts, `HIDDEN_WHEN_FROM_LAND`) nimmt
	     `boatDrive` aus demselben Grund aus der Validierung — beide Seiten
	     bleiben damit konsistent, ohne eine zweite Regel neben
	     `isBoatSightingFrom` einzuführen. -->
	{#if showsBoatDrive}
		<div class="mt-2 grid grid-cols-1 gap-4 md:grid-cols-1" transition:slide>
			{#if adminMode}
				<!-- Admin-Maske: volle Antriebsauswahl aus dem Schema. Die feinere
				     Bedeutung von "Segel", "Treibend" und "Vor Anker" bleibt hier
				     erhalten, damit Altbestand unverändert nachbearbeitet werden kann.

				     `required` wie im Meldeformular-Zweig unten und aus demselben
				     Grund: Die Pflicht steckt in einem `when('sightingFrom')`, das
				     `describe()` nicht sieht, und `adminSightingSchema` lockert sie
				     nicht. Unbedingt `true`, weil dieser Zweig ausschließlich bei
				     Segelschiff oder Motorboot rendert. Dass der Wert beim Bearbeiten
				     meist vorbefüllt ist, ändert daran nichts — im Altbestand steht
				     `bootsantrieb` auch bei Bootsmeldungen leer. -->
				<FormField name="boatDrive" required={true} />
				{#if String($form.boatDrive) === String(BoatDriveEnum.OTHER)}
					<!-- Freitext nur in der Admin-Maske: `OTHER` ist im Meldeformular
					     seit PR 4 nicht mehr wählbar, kann aber im Altbestand stehen. -->
					<div transition:slide>
						<FormField name="boatDriveText" />
					</div>
				{/if}
			{:else}
				<!-- Meldeformular: nur noch "Motor lief / Motor lief nicht" (PR 4,
				     Museum 2026-08-04) — es geht allein um Motorgeräusche. Radio statt
				     Schalter, weil ein Toggle keinen unbeantworteten Zustand kennt und
				     `boatDrive` bei Segelschiff/Motorboot Pflichtfeld ist. Label, Stern,
				     ARIA und `data-testid` kommen weiterhin aus der Feld-Pipeline.

				     `required` als Override, weil die Pflicht im Schema in einem
				     `when('sightingFrom')` steckt und `describe()` das nicht sieht —
				     derselbe Fall wie `waterway` in LocationDescription.svelte. Hier
				     ist es unbedingt `true`: Dieser Zweig rendert ausschließlich bei
				     Segelschiff oder Motorboot, also genau dann, wenn das Schema den
				     Wert verlangt. Ohne den Override liefe ein Melder ohne Sternchen
				     und ohne `aria-required` in „Bitte wählen Sie den Bootsantrieb
				     aus." — die Admin-Maske hat dasselbe Loch, dort aber mit
				     vorbefülltem Wert.

				     `helpText={null}`, weil der Schema-Hilfetext („Welcher Antrieb
				     wurde während der Sichtung verwendet?") zur vollen Auswahl der
				     Admin-Maske gehört und die Ja/Nein-Frage hier nicht beantwortet.
				     Ein Ersatztext wäre überflüssig: Die Frage ist mit ihren zwei
				     Optionen selbsterklärend, und dass es um Unterwasserlärm geht,
				     steht bereits im `valueText`-Tooltip desselben Feldes. -->
				<FormField
					name="boatDrive"
					label={m.report_components_sections_sightingdetails_label_lief_waehrend_der_sichtung()}
					type="radio"
					options={getPublicBoatDriveOptions()}
					helpText={null}
					required={true}
				/>
			{/if}
		</div>
	{/if}

	<!-- Markup-Hälfte zu `HIDDEN_WHEN_DEAD` (formConfig.ts): Beim Totfund steht
	     der Melder neben dem Tier — „Entfernung zum Tier" ist dort nicht
	     beantwortbar und war als Pflichtfeld eine Sperre ohne Ausweg. Die
	     Admin-Maske behält das Feld: 282 Bestandszeilen tragen den Sentinel `0`
	     („nicht angegeben"), und ein Totfund muss dort weiter nachbearbeitbar
	     bleiben — dieselbe Struktur wie bei `deadSex` in `DeadAnimal.svelte`. -->
	{#if adminMode || !isDeadFinding($form.isDead)}
		<FormField name="distance" />
	{/if}
</SectionCard>
