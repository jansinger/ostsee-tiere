<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import Icon from '$lib/components/Icon.svelte';
	import StepProgressCompact from './StepProgressCompact.svelte';
	import { SUBMIT_STATUS_OFFLINE_ID } from './submitStatusIds';
	import { validateStep } from '$lib/form/validation/stepValidation';
	import { createLogger } from '$lib/logger';
	import { getFormContext } from '$lib/report/formContext';
	import { toast } from '$lib/stores/toastState.svelte';
	import {
		getErrorCount,
		scrollToElement,
		scrollToFirstError,
		scrollToStepHeader
	} from '$lib/utils/fieldNavigation';
	import { formStepsConfig, getFormSteps } from '$lib/report/formConfig';
	import {
		getStepAlertMessages,
		shouldShowStepAlert,
		type StepAttemptMarker
	} from './stepNavigationState';

	const logger = createLogger('report:StepNavigation');

	/**
	 * Stabiler Toast-Key für den Validierungshinweis dieser Navigation. Ein
	 * erneuter „Weiter"-Klick auf demselben Schritt ERSETZT den Toast statt sich
	 * daneben zu stapeln (UX-Review: 4 identische Toasts bei viermal „Weiter"),
	 * und der Schrittwechsel-Effect unten schließt ihn aktiv — sonst stünde die
	 * Meldung des alten Schritts bis zu 5s auf dem neuen und widerspräche dem
	 * sichtbaren Zustand.
	 */
	const VALIDATION_TOAST_KEY = 'step-validation';

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

	/**
	 * Schritt-Konfiguration des AKTUELLEN Zweigs — dieselbe Quelle, aus der
	 * `validateStep` unten seine Felder nimmt. `formStepsConfig` (statisch)
	 * führt auch Felder, die im aktuellen Zweig gar nicht gerendert werden.
	 *
	 * Für die Feldreihenfolge unten ist das heute folgenlos: `scrollToFirstError`
	 * sucht in ihr das erste Feld, das in den Fehlern vorkommt — und die Fehler
	 * stammen ausschließlich aus `validateStep`, das ausgeblendete Felder gar
	 * nicht erst prüft. Trotzdem dieselbe Quelle, statt zwei Listen, deren
	 * Gleichlauf niemand erzwingt: Sobald hier eine zweite Fehlerquelle
	 * dazukäme (Server-Felder etwa, wie in `ModernReportForm`), zeigte die
	 * statische Liste auf ein Feld ohne DOM-Element und der Sprung fiele aus.
	 */
	const formSteps = $derived(getFormSteps($form));

	// Get field orders from form configuration
	const stepFieldOrders = $derived(formSteps.map((step) => step.fields));

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
			// Ein Validierungs-Toast kann nur entstehen, während `attemptedStep`
			// gesetzt ist (siehe `showValidationError`) — hier ist deshalb genau
			// der Moment, in dem ein noch aktiver Toast den VERLASSENEN Schritt
			// beschreibt und nicht mehr zum sichtbaren (neuen) Schritt passt.
			toast.removeByKey(VALIDATION_TOAST_KEY);
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

	/**
	 * Führt zur bereits stehenden Begründung über der Navigation.
	 *
	 * UX-Review-Nachgang (2026-08-06): Der Knopf trug für diese Sperre
	 * `aria-disabled` + `btn-disabled`, und DaisyUI legt darauf ein
	 * `pointer-events: none` (design-system.md, „Der Vorbehalt"). Ein Klick kam
	 * damit nie an, per Tastatur endete er in einem `logger.info` — beides ohne
	 * jede Rückmeldung. Der `title` mit dem Grund erschien aus demselben Grund
	 * beim Hovern nie.
	 *
	 * Erklärt werden muss hier nichts Neues: `SubmitStatus` steht mit dem vollen
	 * Grund und der Datenzusage direkt über dieser Navigation. Nur ist die
	 * Navigation unterhalb `md` ein ortsfester Balken am unteren Rand — die
	 * Begründung kann also weggescrollt sein, während der Knopf sichtbar bleibt.
	 * Genau dorthin führt dieser Sprung, und der Fokus sorgt für die Ansage.
	 */
	function revealSubmitBlockedReason(): void {
		const reason = document.getElementById(SUBMIT_STATUS_OFFLINE_ID);
		if (!reason) return;
		scrollToElement(reason);
		reason.setAttribute('tabindex', '-1');
		reason.focus({ preventScroll: true });
	}

	async function nextStep(): Promise<void> {
		try {
			// Der Knopf ist NICHT als deaktiviert ausgezeichnet (Begründung an
			// `revealSubmitBlockedReason`) — die Sperre sitzt allein hier, und sie
			// antwortet, statt still auszusteigen.
			if (isSubmitBlocked) {
				logger.info('Absenden gesperrt — keine Verbindung');
				revealSubmitBlockedReason();
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
		const currentStepName =
			formSteps[currentStep]?.title ||
			m.report_components_form_stepnavigation_text_schritt_step({ step: currentStep + 1 });

		if (errorCount === 0) {
			return;
		}

		// Update form errors with step-specific errors
		errors.update((currentErrors) => ({
			...currentErrors,
			...stepErrors
		}));

		// ICU-Plural statt if/else: Die Einzahl-/Mehrzahl-Grenze liegt nicht in
		// jeder Sprache bei eins (Protokoll, Muster B).
		const errorMessage =
			m.report_components_form_stepnavigation_text_bitte_beheben_sie_die_fehler_plural({
				count: errorCount,
				step: currentStepName
			});

		// Show toast notification — per key statt zu stapeln: ein erneuter
		// „Weiter"-Klick auf demselben invaliden Schritt ersetzt den bestehenden
		// Toast (inkl. neuer Anzeigedauer) statt einen weiteren daneben zu zeigen.
		toast.error(errorMessage, {
			title: 'Validierungsfehler',
			duration: 5000,
			key: VALIDATION_TOAST_KEY
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
		aria-label={m.report_components_form_stepnavigation_aria_label_formular_navigation()}
	>
		<button
			type="button"
			onclick={previousStep}
			disabled={isFirstStep || $isSubmitting}
			class="btn btn-outline"
			aria-label={m.report_components_form_stepnavigation_aria_label_vorheriger_schritt()}
		>
			{m.report_components_form_stepnavigation_text_zurueck()}
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
				aria-label={m.report_components_form_stepnavigation_aria_label_zu_den_fehlerhaften_plural({
					count: stepErrorCount
				})}
			>
				<Icon icon="lucide:triangle-alert" width="16" class="shrink-0" aria-hidden="true" />
				{m.report_components_form_stepnavigation_text_steperrorcount_fehler_plural({
					count: stepErrorCount
				})}
			</button>
		{/if}

		<!--
			Die Verbindungssperre zeichnet den Knopf NICHT mehr als deaktiviert aus
			(kein `aria-disabled`, kein `btn-disabled`, kein `title`): DaisyUI legt
			auf jede dieser Auszeichnungen ein `pointer-events: none`, wodurch der
			Klick nie ankam, der Wächter nichts melden konnte und der `title` beim
			Hovern nie erschien (design-system.md, „Der Vorbehalt"). Stattdessen
			führt ein Klick zur Begründung, die ohnehin über der Navigation steht —
			`revealSubmitBlockedReason`.

			`aria-describedby` auf dieselbe Fläche: So trägt der Knopf den Grund
			auch für Screenreader, ohne dass er dafür angeklickt werden muss. Das
			ersetzt den `title`, der ohnehin nur am Zeigegerät hing.

			Der laufende Submit sperrt weiterhin hart über `disabled` — dort ist der
			Zustand von sehr kurzer Dauer, es gibt nichts zu erklären, und ein
			Doppelklick hätte echte Folgen.
		-->
		<button
			type="button"
			onclick={nextStep}
			disabled={$isSubmitting}
			class="btn btn-primary"
			aria-label={isLastStep
				? m.report_components_form_stepnavigation_aria_label_formular_absenden()
				: m.report_components_form_stepnavigation_aria_label_naechster_schritt()}
			aria-describedby={isSubmitBlocked ? SUBMIT_STATUS_OFFLINE_ID : undefined}
		>
			{#if $isSubmitting}
				<span class="loading loading-spinner loading-sm"></span>
			{:else if isSubmitBlocked}
				<Icon icon="lucide:wifi-off" width="16" class="shrink-0" aria-hidden="true" />
			{/if}
			{isLastStep
				? m.report_components_form_stepnavigation_text_absenden()
				: m.report_components_form_stepnavigation_text_weiter()}
		</button>
	</nav>
</div>
