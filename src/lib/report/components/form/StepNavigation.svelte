<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import StepProgressCompact from './StepProgressCompact.svelte';
	import { validateStep } from '$lib/form/validation/stepValidation';
	import { createLogger } from '$lib/logger';
	import { getFormContext } from '$lib/report/formContext';
	import { toast } from '$lib/stores/toastState.svelte';
	import {
		getErrorCount,
		scrollToFirstError,
		scrollToStepHeader
	} from '$lib/utils/fieldNavigation';
	import { formStepsConfig } from '$lib/report/formConfig';
	import {
		getStepAlertMessages,
		shouldShowStepAlert,
		type StepAttemptMarker
	} from './stepNavigationState';

	const logger = createLogger('report:StepNavigation');

	let {
		currentStep = $bindable(0),
		totalSteps = $bindable(formStepsConfig.length),
		onSubmit,
		submitBlocked = false
	}: {
		onSubmit?: (e: Event) => Promise<void>;
		currentStep?: number;
		totalSteps?: number;
		/**
		 * Sperrt „Absenden" vorab, statt den Versuch scheitern zu lassen. Die
		 * Begründung steht in `SubmitStatus` über dieser Navigation — ein
		 * vorhersehbarer Fehlschlag ist keine Fehlermeldung wert.
		 */
		submitBlocked?: boolean;
	} = $props();

	const formContext = getFormContext();
	const { isSubmitting, form, errors } = formContext;

	// Get field orders from form configuration
	const stepFieldOrders = formStepsConfig.map((step) => step.fields);

	// Single validation pass — used for both canGoNext and stepErrorMessages
	const stepValidation = $derived.by(() => validateStep(currentStep, $form));

	const canGoNext = $derived(stepValidation.isValid);

	// Tracks whether the user already attempted "Weiter"/"Absenden" on the
	// CURRENT step. Errors must never appear just from entering a step —
	// only after a failed navigation attempt (see stepNavigationState.ts).
	let attemptedStep = $state<StepAttemptMarker>(null);

	// Reset the attempt marker whenever currentStep changes — this covers
	// both our own next/previousStep() calls AND external changes via the
	// stepper in FormSteps.svelte (currentStep is a shared $bindable prop),
	// so a freshly (re-)entered step never shows a stale alert.
	$effect(() => {
		if (attemptedStep !== null && attemptedStep !== currentStep) {
			attemptedStep = null;
		}
	});

	// Whether the inline alert above the navigation should be visible
	const showStepAlert = $derived(shouldShowStepAlert(attemptedStep, currentStep, canGoNext));

	// All error messages of the current step, for inline display
	const stepErrorMessages = $derived(getStepAlertMessages(stepValidation.errors));

	// Zahl für die kompakte Anzeige im Balken. Dieselbe Quelle wie die
	// ausgeschriebene Liste — getErrorCount zählt bereits, was showValidationError
	// für seine Toast-Meldung benutzt.
	const stepErrorCount = $derived(getErrorCount(stepValidation.errors));

	/** Springt zum ersten fehlerhaften Feld — gleiche Reihenfolge wie nach „Weiter". */
	function jumpToFirstError(): void {
		scrollToFirstError(stepValidation.errors, stepFieldOrders[currentStep] ?? []);
	}

	const isLastStep = $derived(currentStep >= totalSteps - 1);
	const isFirstStep = $derived(currentStep <= 0);

	/**
	 * Scrollt zum Kopf des neuen Schritts (Icon/Überschrift/Badge) und fokussiert
	 * die Überschrift für die Screenreader-Ansage.
	 *
	 * U9: `#form-content` bleibt über den Schrittwechsel hinweg dasselbe Element,
	 * enthält aber auch den bisherigen Schritt-Inhalt — Scrollen direkt dorthin
	 * kann den Kopf des NEUEN Schritts (Badge/Überschrift) außerhalb des sichtbaren
	 * Bereichs lassen. `scrollToStepHeader` findet daher gezielt den Kopfbereich
	 * (Elternelement der `h2`, das laut Step-Konvention Icon+Badge umschließt).
	 *
	 * Suche UND Scroll werden verzögert, bis Svelte den neuen Schritt gerendert
	 * hat — sonst würden wir noch den Kopf des VORHERIGEN Schritts finden.
	 */
	function scrollAndFocusStep(): void {
		requestAnimationFrame(() => {
			const stepHeading = scrollToStepHeader('form-content');
			if (stepHeading) {
				stepHeading.setAttribute('tabindex', '-1');
				stepHeading.focus({ preventScroll: true });
			}
		});
	}

	// Navigation functions
	/** Absenden ist gesperrt — nur auf dem letzten Schritt relevant. */
	const isSubmitBlocked = $derived(isLastStep && submitBlocked);

	async function nextStep(): Promise<void> {
		try {
			// Wächter zur `aria-disabled`-Sperre am Button: Das Element bleibt
			// fokussierbar (siehe design-system.md), die eigentliche Sperre sitzt hier.
			if (isSubmitBlocked) {
				logger.info('Absenden gesperrt — keine Verbindung');
				return;
			}

			if (!canGoNext) {
				logger.warn({ currentStep }, 'Validation failed for current step');
				attemptedStep = currentStep;
				await showValidationError();
				return;
			}

			if (isLastStep) {
				await handleFormSubmission();
			} else {
				currentStep += 1;
				scrollAndFocusStep();
			}
		} catch (error) {
			logger.error({ error }, 'Error in nextStep navigation');
		}
	}

	async function previousStep(): Promise<void> {
		try {
			if (!isFirstStep) {
				currentStep -= 1;
				scrollAndFocusStep();
			}
		} catch (error) {
			logger.error({ error }, 'Error in previousStep navigation');
		}
	}

	async function handleFormSubmission(): Promise<void> {
		if (!onSubmit) {
			logger.warn('No onSubmit handler provided');
			return;
		}

		try {
			// Create a synthetic submit event and call the handler
			const submitEvent = new Event('submit');
			await onSubmit(submitEvent);
			logger.info('Form submitted successfully');
		} catch (error) {
			logger.error({ error }, 'Error during form submission');
			// Kein Toast mehr: Der Fehlschlag steht als `SubmitStatus` direkt über
			// dieser Navigation, verschwindet nicht von selbst und trägt die
			// Wiederholen-Aktion. Ein Toast daneben wäre eine zweite Anzeige
			// derselben Sache — und die flüchtigere von beiden.
			// Der Validierungs-Toast in `showValidationError` bleibt: der ist
			// flüchtig, verlangt keine Handlung an Ort und Stelle und begleitet
			// den Sprung zum fehlerhaften Feld.
			await showValidationError();
		}
	}

	async function showValidationError(): Promise<void> {
		// Use the validation function that collects errors
		const { errors: stepErrors } = validateStep(currentStep, $form);
		const errorCount = getErrorCount(stepErrors);
		const currentStepName = formStepsConfig[currentStep]?.title || `Schritt ${currentStep + 1}`;

		if (errorCount === 0) {
			return;
		}

		// Update form errors with step-specific errors
		errors.update((currentErrors) => ({
			...currentErrors,
			...stepErrors
		}));

		let errorMessage: string;
		if (errorCount === 1) {
			errorMessage = `Bitte beheben Sie den Fehler in "${currentStepName}" bevor Sie fortfahren.`;
		} else {
			errorMessage = `Bitte beheben Sie die ${errorCount} Fehler in "${currentStepName}" bevor Sie fortfahren.`;
		}

		// Show toast notification
		toast.error(errorMessage, {
			title: 'Validierungsfehler',
			duration: 5000
		});

		// Navigate to first error field
		const fieldOrder = stepFieldOrders[currentStep] || [];
		const navigated = scrollToFirstError(stepErrors, fieldOrder);

		if (navigated) {
			logger.debug('Navigated to first error field');
		} else {
			logger.warn('Could not navigate to error field');
		}
	}
</script>

<!--
  Der volle Alert steht im Fluss, NICHT im ortsfesten Balken.

  Er dort hineinzunehmen war der naheliegende Reflex — `position: sticky` wirkt
  nur auf das Element mit der Klasse, ein Alert davor scrollt also weg. Gemessen
  ist das aber die schlechtere Wahl: Schritt 1 kann fünf Regeln gleichzeitig
  verletzen (Breitengrad, Längengrad, Fahrwasser-Länge, Zukunftsdatum,
  Uhrzeitformat), und die <ul> darunter machte den Balken bei 390×844 dann
  390px hoch — 46 % des Bildschirms, dauerhaft im Weg.

  Der Alert muss auch gar nicht stehen bleiben: Er wird in dem Moment gelesen,
  in dem er entsteht, und direkt danach springt `scrollToFirstError` zum ersten
  fehlerhaften Feld, wo das Feld seinen Fehler selbst trägt (`FieldRenderer`,
  `role="alert"`). Was im Balken bleiben muss, ist nur die Tatsache „hier sind
  noch N Fehler" plus ein Weg zurück dorthin — das leistet die kompakte
  Schaltfläche unten mit einer Zeile Höhe statt fünf.
-->
{#if showStepAlert && stepErrorMessages.length > 0}
	<div class="alert alert-warning mb-2" role="alert">
		<Icon icon="lucide:triangle-alert" class="shrink-0" aria-hidden="true" />
		{#if stepErrorMessages.length === 1}
			<span>{stepErrorMessages[0]?.message}</span>
		{:else}
			<ul class="list-inside list-disc">
				{#each stepErrorMessages as { field, message } (field)}
					<li>{message}</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<!--
  Unterhalb `md` ist dieser Block der ortsfeste Balken am unteren Rand
  (`.form-step-nav`, Regel in app.css inkl. `env(safe-area-inset-bottom)`).

  Die Klasse trägt der Wrapper und nicht das <nav> darin: der Balken ist mehr
  als die Navigations-Landmark — er trägt auch den Fortschritt und den
  Fehler-Sprung. Das <nav> bleibt die Landmark, der Wrapper ist reines Layout.
-->
<div class="form-step-nav bg-base-200 rounded-lg p-4">
	<!-- Fortschritt im Balken — nur unterhalb `md`, oberhalb zeigt ihn FormSteps -->
	<StepProgressCompact steps={formStepsConfig} bind:currentStep />

	<!-- Navigation UI -->
	<nav
		class="mt-2 flex items-center justify-between gap-2 md:mt-0"
		aria-label="Formular Navigation"
	>
		<button
			type="button"
			onclick={previousStep}
			disabled={isFirstStep || $isSubmitting}
			class="btn btn-outline"
			aria-label="Vorheriger Schritt"
		>
			← Zurück
		</button>

		<!--
			Kompakte Fehleranzeige — ersetzt im Balken die ausgeschriebene Liste.
			Nur unterhalb `md`: darüber ist der Balken nicht ortsfest, der volle
			Alert steht also ohnehin sichtbar direkt darüber und diese Schaltfläche
			wäre eine zweite Anzeige derselben Sache.

			„Fehler" ist im Deutschen im Singular und Plural gleich, der sichtbare
			Text braucht deshalb keine Fallunterscheidung — der Accessible Name
			schon, sonst liest der Screenreader „Zu den 1 fehlerhaften Feldern".
		-->
		{#if showStepAlert && stepErrorCount > 0}
			<button
				type="button"
				onclick={jumpToFirstError}
				class="btn btn-ghost btn-sm text-error gap-1 md:hidden"
				aria-label={stepErrorCount === 1
					? 'Zum fehlerhaften Feld springen'
					: `Zu den ${stepErrorCount} fehlerhaften Feldern springen`}
			>
				<Icon icon="lucide:triangle-alert" width="16" class="shrink-0" aria-hidden="true" />
				{stepErrorCount} Fehler
			</button>
		{/if}

		<!--
			`aria-disabled` statt `disabled` für die Verbindungssperre: Das Element
			bleibt fokussierbar, damit die Tastaturposition erhalten bleibt und der
			Grund erreichbar ist (design-system.md). Der laufende Submit sperrt
			weiterhin hart über `disabled` — dort ist der Zustand von sehr kurzer
			Dauer und ein Doppelklick hätte echte Folgen.
		-->
		<button
			type="button"
			onclick={nextStep}
			disabled={$isSubmitting}
			aria-disabled={isSubmitBlocked}
			class="btn btn-primary"
			class:btn-disabled={isSubmitBlocked}
			aria-label={isLastStep ? 'Formular absenden' : 'Nächster Schritt'}
			title={isSubmitBlocked ? 'Ohne Internetverbindung kann nicht abgesendet werden' : undefined}
		>
			{#if $isSubmitting}
				<span class="loading loading-spinner loading-sm"></span>
			{:else if isSubmitBlocked}
				<Icon icon="lucide:wifi-off" width="16" class="shrink-0" aria-hidden="true" />
			{/if}
			{isLastStep ? 'Absenden' : 'Weiter →'}
		</button>
	</nav>
</div>
