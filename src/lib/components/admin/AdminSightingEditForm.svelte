<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { isFormDirty } from '#lib/form/isFormDirty.ts';
	import { getAdminSightingSchema } from '#lib/form/validation/sightingSchema.ts';
	import Form from '#lib/report/components/form/Form.svelte';
	import Administrative from '#lib/report/components/sections/Administrative.svelte';
	import AnimalInfo from '#lib/report/components/sections/AnimalInfo.svelte';
	import Behavior from '#lib/report/components/sections/Behavior.svelte';
	import DateTime from '#lib/report/components/sections/DateTime.svelte';
	import Environment from '#lib/report/components/sections/Environment.svelte';
	import Location from '#lib/report/components/sections/Location.svelte';
	import OptionalSightingDetails from '#lib/report/components/sections/OptionalSightingDetails.svelte';
	import type { FormContext } from '#lib/report/types.ts';

	import Media from '#lib/report/components/sections/Media.svelte';
	import SightingDetails from '#lib/report/components/sections/SightingDetails.svelte';
	import type { FrontendSighting } from '#lib/types/index.ts';
	import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';

	import { buildAdminEditInitialValues } from './adminEditInitialValues';
	import { getSightingStatus, SIGHTING_STATUS_PRESENTATION } from './sightingStatus';

	let {
		sighting = {} as FrontendSighting,
		onSave = (_sighting: FrontendSighting) => {},
		onCancel = () => {}
	}: {
		sighting: FrontendSighting;
		onSave?: (sighting: FrontendSighting) => void;
		onCancel?: () => void;
	} = $props();

	let formContext: FormContext = $state({}) as FormContext;

	async function submitForm(values: Record<string, unknown>): Promise<FrontendSighting> {
		try {
			// API-Aufruf zum Speichern der Daten
			const response = await fetch(`/api/sightings/${sighting.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(values)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => null);
				throw new Error(
					errorData?.message || `Fehler beim Speichern der Daten (${response.status})`
				);
			}

			const updatedSighting = await response.json();
			// Vor `onSave`, weil der Aufrufer dort navigiert: Der Guard darf nicht
			// nach Änderungen fragen, die soeben in der Datenbank gelandet sind.
			guardEntschaerft = true;
			await onSave(updatedSighting);
			/* Navigiert der Aufrufer nicht (eine künftige Aufrufstelle ohne
			   Navigation) und wird hier weiterbearbeitet, ist der Guard wieder
			   scharf — mit dem aktuellen Formular-Store als neuer Basis, sonst
			   fragte er nach den bereits gespeicherten Änderungen. Bewusst der
			   Store und nicht der `values`-Parameter oder die Server-Antwort:
			   `isFormDirty` vergleicht gegen den Store, und sowohl der
			   Schema-Cast im Submit als auch das Datensatz-Format der Antwort
			   weichen von ihm ab — beide meldeten eine saubere Maske als dirty. */
			initProps.initialValues = { ...get(formContext.form) };
			guardEntschaerft = false;
			return updatedSighting;
		} catch (error) {
			console.error('Fehler beim Speichern:', error);
			throw error;
		}
	}

	// Initialisiere das Formular mit den vorhandenen Daten (one-time, untracked)
	const initProps = untrack(() => ({
		initialValues: buildAdminEditInitialValues(sighting),
		validationSchema: getAdminSightingSchema(),
		onSubmit: submitForm
	}));
	let isValid = $derived(formContext.isValid);
	let isSubmitting = $derived(formContext.isSubmitting);
	let errors = $derived(formContext.errors);
	let values = $derived(formContext.form);

	/**
	 * Die Fehlerliste ist die Begründung, auf die der Speichern-Knopf zeigt und
	 * zu der sein Wächter springt. Beide Seiten teilen sich diese eine `id` —
	 * ein `aria-describedby` ins Leere meldet niemand.
	 */
	const ERROR_SUMMARY_ID = 'admin-edit-error-summary';
	let errorSummary = $state<HTMLDivElement | null>(null);
	const hasErrors = $derived(
		!!$errors &&
			Object.values($errors).some((message) => typeof message === 'string' && message !== '')
	);

	function focusErrorSummary(): void {
		errorSummary?.scrollIntoView({ block: 'center' });
		errorSummary?.focus();
	}

	/**
	 * Der Wächter aus `design-system.md`: Der Knopf bleibt frei klickbar, und ein
	 * Klick mit bekannten Fehlern springt zur Fehlerliste, statt still zu
	 * scheitern. Ein `disabled`/`aria-disabled` verbot hier beides — DaisyUI legt
	 * an solche Knöpfe ein `pointer-events: none`, der Klick käme also nie an.
	 */
	function guardSave(event: MouseEvent): void {
		if ($isValid) return;
		event.preventDefault();
		focusErrorSummary();
	}

	// Der erste Klick läuft durch den Wächter (noch keine Fehler bekannt) und
	// bringt die Fehler erst hervor — der Sprung gehört deshalb auch an ihr
	// Erscheinen, nicht nur an den Wiederholungsklick.
	$effect(() => {
		if (hasErrors) focusErrorSummary();
	});

	let guardEntschaerft = $state(false);
	const hasUnsavedChanges = $derived(
		!guardEntschaerft && isFormDirty($values, initProps.initialValues)
	);

	/**
	 * Rückfrage vor dem Verlassen der Maske. `confirm()` statt eines
	 * projektüblichen Dialogs, weil `beforeNavigate` synchron entscheiden muss:
	 * Ein `cancel()` nach einem `await` kommt zu spät, die Navigation ist dann
	 * längst gelaufen.
	 */
	beforeNavigate((navigation) => {
		if (!hasUnsavedChanges) return;
		if (navigation.type === 'leave') {
			// Harter Reload oder Tab schließen: SvelteKit setzt `cancel()` hier in
			// den `beforeunload`-Dialog des Browsers um. Ein eigenes `confirm()`
			// zeigt in diesem Fenster kein Browser mehr an.
			navigation.cancel();
			return;
		}
		if (!confirm('Die Änderungen an dieser Sichtung sind nicht gespeichert. Seite verlassen?')) {
			navigation.cancel();
		}
	});

	// Abgeleiteter Status, dieselbe Quelle wie Eingang, Tabelle und
	// Detailansicht — kein Bedienelement hier, die Maske bearbeitet Sachdaten.
	const status = $derived(getSightingStatus(sighting));
</script>

<Form class="space-y-6" {...initProps} bind:context={formContext}>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-1">
		<div class="space-y-4">
			<div class="card bg-base-200 p-4">
				<!-- Technische Informationen -->
				<div class="text-base-content/70 text-sm">
					<p>Datensatz ID: {sighting.id}</p>
					<p>Gemeldet: {formatLocalDateTime(sighting.created)}</p>
					<p>
						Status:
						<span class="badge {SIGHTING_STATUS_PRESENTATION[status].badgeClass}">
							{SIGHTING_STATUS_PRESENTATION[status].label}
						</span>
						{#if status === 'approved'}
							<!-- „durch …" nur bei bekannter Person — der Altbestand trägt kein
							     `freigegeben_von` und darf kein „durch null" zeigen. -->
							— Freigegeben am {formatLocalDateTime(
								sighting.approvedAt,
								'datetime'
							)}{sighting.approvedBy ? ` durch ${sighting.approvedBy}` : ''}
						{:else if status === 'rejected'}
							— Abgelehnt am {formatLocalDateTime(
								sighting.rejectedAt,
								'datetime'
							)}{sighting.rejectedBy ? ` durch ${sighting.rejectedBy}` : ''}
						{/if}
					</p>
				</div>
			</div>

			<Location />
			<DateTime />
			<AnimalInfo adminMode={true} />
			<SightingDetails adminMode={true} />
		</div>

		<!-- Rechte Spalte - Zusatzinformationen -->
		<div class="space-y-4">
			<!-- Zusätzliche Informationen -->
			<OptionalSightingDetails adminMode={true} />
			<!-- Umweltbedingungen -->
			<Environment adminMode={true} />
			<!-- Verhalten und Reaktion -->
			<Behavior adminMode={true} />
			<Media adminMode={true} />
			<!-- Administratives -->
			<Administrative />
		</div>
	</div>
	<!-- Fehler-Liste anzeigen, wenn es Validierungsfehler gibt -->
	{#if hasErrors}
		<!-- `tabindex="-1"`, damit der Wächter des Speichern-Knopfes hierher
		     fokussieren kann; die Fläche ist kein Bedienelement und bleibt
		     deshalb außerhalb der Tab-Reihenfolge. -->
		<div
			class="alert alert-error"
			id={ERROR_SUMMARY_ID}
			bind:this={errorSummary}
			tabindex="-1"
			role="alert"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div>
				<h3 class="font-bold">Eingabefehler gefunden:</h3>
				<ul class="mt-2 list-inside list-disc">
					{#each Object.entries($errors).filter(([_field, message]) => typeof message === 'string' && message !== '') as [_field, message] (_field)}
						<li class="text-sm">{message}</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}

	<!-- Aktionsbuttons -->
	<div class="mt-6 flex justify-end space-x-2">
		<button type="button" class="btn btn-ghost" onclick={onCancel}> Abbrechen </button>
		<!-- Hart gesperrt bleibt einzig der laufende Submit: sehr kurz, nichts zu
		     erklären, und ein Doppelklick schriebe zweimal. Fehlende Eingabe
		     sperrt dagegen nicht — dafür gibt es den Wächter und die Fehlerliste. -->
		<button
			type="submit"
			class="btn btn-primary"
			disabled={$isSubmitting}
			aria-describedby={hasErrors ? ERROR_SUMMARY_ID : undefined}
			onclick={guardSave}
		>
			{#if $isSubmitting}
				<span class="loading loading-spinner loading-xs mr-2"></span>
			{/if}
			Speichern
		</button>
	</div>
</Form>
