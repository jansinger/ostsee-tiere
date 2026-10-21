<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import DeadAnimal from './DeadAnimal.svelte';

	import { getFormContext } from '#lib/report/formContext.ts';
	import FormField from '#lib/report/components/form/fields/FormField.svelte';
	import SectionCard from './SectionCard.svelte';
	import { isDeadFinding } from '#lib/report/formConfig.ts';
	import { speciesQuestion } from '#lib/report/wording.ts';

	let { adminMode = false }: { adminMode?: boolean } = $props();

	const { form } = getFormContext();

	// Beim Totfund fragt das Artfeld nach dem, was gefunden wurde (Wunsch des
	// Museums). Über den `label`-Override an `FormField` — derselbe Weg, den PR 4
	// für den Bootsantrieb gebaut hat: Eine Schema-Spalte, in zwei Zuständen
	// unterschiedlich gefragt, ohne das `.label()` des Schemas anzufassen.
	const speciesLabel = $derived(speciesQuestion($form.isDead));
</script>

<!-- Animal Information Section -->
<SectionCard
	title={m.report_components_sections_animalinfo_title_tierinformationen()}
	icon="lucide:eye"
>
	{#if adminMode}
		<!-- Die Totfund-Frage steht ganz oben, weil das Museum sie am Kartenende für
		     übersehbar hielt. Sie entscheidet außerdem, ob der Detailblock darunter
		     erscheint — als letztes Feld stand der Auslöser hinter seiner Wirkung.

		     Hervorgehoben wird über Position und Erhebung, NICHT über den
		     Warn-Tint: Der gehört dem Totfund-Block in DeadAnimal.svelte, der
		     unmittelbar darunter sitzt. Zwei gleich aussehende Warnflächen
		     übereinander hätten die untere entwertet — und im Regelfall (lebendes
		     Tier) sähe jede Meldung nach Warnung aus, obwohl nichts zu warnen ist.
		     Eine hellere Platte auf der base-200-Karte trägt hier weiter als Farbe.

		     Das Totenkopf-Icon am Schalter kommt aus dem Schema (`meta.icon`), die
		     Beschriftung aus der Feld-Pipeline — beides gehört nicht hierher.

		     Nur in der Admin-Maske: Hier korrigiert eine Bearbeiterin einen
		     bestehenden Datensatz, es gibt keine vorgeschaltete Einstiegsseite. Im
		     Meldeformular beantwortet die Einstiegsseite „Was möchten Sie melden?"
		     dieselbe Frage bereits — der Schalter entfällt dort ersatzlos, damit
		     die beiden Antworten nicht auseinanderlaufen können. Die Rückmeldung
		     „Sie melden: … · [Ändern]", die hier als else-Zweig stand, sitzt seit
		     dem Umzug einmal in der Aktionszeile unter dem Formular
		     (`form/FormActions.svelte`) und gilt von dort für alle vier
		     Schritte. -->
		<div
			class="bg-base-100 border-base-300 rounded-lg border p-4"
			style="box-shadow: var(--shadow-raised)"
		>
			<FormField name="isDead" />
		</div>
	{/if}

	<!-- Dead Animal Additional Fields — unmittelbar unter dem Schalter, nicht
	     mehr am Kartenende. isDeadFinding statt eines rohen Booleans, aus
	     demselben Grund wie in `ReportKindFeedback.svelte`: `isDead` kommt hier
	     über dieselben drei Quellen an (Storage-String, DB-Zahl, echter
	     Boolean) — ein roher Ternär (`$form.isDead`) zeigte den Block bei einem
	     falsy-wirkenden String wie '0' trotzdem, während die Rückmeldung in der
	     Aktionszeile schon korrekt „lebend" auswies. -->
	{#if isDeadFinding($form.isDead)}
		<DeadAnimal {adminMode} />
	{/if}

	<!-- Species Selection -->
	<div class="mt-4">
		<FormField name="species" label={speciesLabel} />
	</div>

	<!-- Animal Count -->
	<div class="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
		<FormField name="totalCount" />
		<FormField name="juvenileCount" />
	</div>
</SectionCard>
