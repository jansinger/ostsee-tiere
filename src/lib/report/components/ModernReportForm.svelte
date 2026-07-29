<script lang="ts">
	import StepNavigation from './form/StepNavigation.svelte';

	import FormActions from './form/FormActions.svelte';
	import RequiredConsent from './form/RequiredConsent.svelte';

	import { browser } from '$app/environment';
	import Icon from '$lib/components/Icon.svelte';
	import { describeSubmitFailure, submitSightingForm } from '$lib/form/submitSightingForm';
	import { sightingSchema } from '$lib/form/validation/sightingSchema';
	import { createLogger } from '$lib/logger';
	import { findStepForErrors } from '$lib/report/findStepForErrors';
	import { initialFormState } from '$lib/report/formConfig';
	import { toast } from '$lib/stores/toastState.svelte';
	import {
		clearFormDataOnly,
		clearStorage,
		loadFromStorage,
		loadUserContactData,
		saveToStorage,
		saveUserContactDataWithConsent,
		STORAGE_KEYS
	} from '$lib/storage/localStorage';
	import type { FormContext, SightingFormData, UserContactData } from '$lib/types';
	import type { SightingFormValues } from '$lib/types/Form';
	import { isNotIFrame } from '$lib/utils/client/isNotIFrame';
	import { createId } from '@paralleldrive/cuid2';
	import { formStepsConfig } from '$lib/report/formConfig';
	import { ValidationError } from 'yup';
	import Form from './form/Form.svelte';
	import FormSteps from './form/FormSteps.svelte';
	import FormHelp from './FormHelp.svelte';
	import Step1LocationTime from './steps/Step1LocationTime.svelte';
	import Step2SightingDetails from './steps/Step2SightingDetails.svelte';
	import Step3Observations from './steps/Step3Observations.svelte';
	import Step4Contact from './steps/Step4Contact.svelte';

	const logger = createLogger('report:modern-report-form');

	let {
		onSubmit = async (value) => {
			logger.info({ value }, 'Form submitted:');
		},
		onCancel = () => {}
	}: {
		onSubmit?: (data: SightingFormValues) => Promise<void>;
		onCancel?: () => void;
	} = $props();

	// Lade gespeicherte Benutzer-Kontaktdaten
	const savedUserContactData = loadUserContactData();

	// Kombiniere initial state mit persistenten Benutzer-Kontaktdaten
	const initialFormData: SightingFormData = {
		...initialFormState,
		...savedUserContactData,
		referenceId: createId()
	};

	// Gespeicherte Formulardaten oder Initialwerte laden
	const hadSavedFormData = browser && !!sessionStorage.getItem(STORAGE_KEYS.FORM_DATA);
	const savedFormData: SightingFormData = loadFromStorage(STORAGE_KEYS.FORM_DATA, {
		...initialFormData
	});

	// Zeige Feedback wenn vorherige Eingaben wiederhergestellt wurden
	if (hadSavedFormData) {
		// Defer toast to after Svelte hydration
		queueMicrotask(() => {
			toast.info('Ihre vorherigen Eingaben wurden wiederhergestellt.', { duration: 4000 });
		});
	}

	// Status für Fehleranzeige
	let submissionError = $state<string | null>(null);

	// Formular initialisieren
	const formProps = {
		initialValues: { ...savedFormData },
		validationSchema: sightingSchema,
		onSubmit: async (values: SightingFormData) => {
			try {
				// Remove admin only attributes and uploaded files (already uploaded)
				const { verified, internalComment, uploadedFiles, ...submitValuesTemp } = values;
				let submitValues: SightingFormValues = submitValuesTemp as SightingFormValues;
				// Datum und Uhrzeit gehen als Strings (deutsche Wanduhrzeit) raus — den
				// Zeitpunkt bildet ausschließlich der Server, sonst ginge die Zeitzone
				// des Browsers in den gespeicherten Instant ein.
				// set mediaUpload indicator
				submitValues.mediaUpload = uploadedFiles ? uploadedFiles.length > 0 : false;

				const result = await submitSightingForm(submitValues);

				if (result.status !== 'ok') {
					// Zwischenschritt: Die Oberfläche kann die vier Fehlerarten noch nicht
					// unterschiedlich darstellen, deshalb wird hier auf eine Meldung
					// eingedampft. `SubmitStatus` übernimmt den Zustand als Ganzes.
					throw new Error(describeSubmitFailure(result));
				}

				// Speichere Benutzer-Kontaktdaten für zukünftige Formulare basierend auf Zustimmung
				{
					const userContactData: UserContactData = {
						firstName: values.firstName,
						lastName: values.lastName,
						email: values.email,
						phone: values.phone,
						street: values.street,
						zipCode: values.zipCode,
						city: values.city,
						shipName: values.shipName,
						homePort: values.homePort,
						boatType: values.boatType,
						nameConsent: values.nameConsent,
						shipNameConsent: values.shipNameConsent,
						persistentDataConsent: values.persistentDataConsent || false
					};
					saveUserContactDataWithConsent(userContactData);
					logger.info(
						{ userContactData },
						'User contact data saved with consent-based persistence'
					);
				}

				submissionError = null;
				const submitResult = await onSubmit(submitValues);
				// Reset nur nach erfolgreichem Submit (Fehler in onSubmit soll Formular erhalten).
				// Diese Stelle ist seither die EINZIGE, die nach einer Übermittlung aufräumt:
				// `submitSightingForm` rief zuvor zusätzlich `clearStorage()` — und zwar schon
				// vor `onSubmit`, was den Kommentar oben aushebelte. `clearFormDataOnly()` plus
				// das Zurücksetzen von CURRENT_STEP deckt denselben Umfang ab.
				clearFormDataOnly(); // Clears only form data, keeps currentStep and user contact data
				currentStep = 0;
				saveToStorage(STORAGE_KEYS.CURRENT_STEP, 0);
				return submitResult;
			} catch (error: unknown) {
				submissionError = (error as Error)?.message || 'Unbekannter Fehler bei der Übermittlung';
				logger.error(error, submissionError);
				throw error;
			}
		}
	};

	let formContext: FormContext = $state({} as FormContext);

	// Formularstatus
	async function handleFinalSubmit(e: Event): Promise<void> {
		logger.info('Final submission:');

		// Pre-submit: validate against the FULL Schema. A step's own
		// validation only covers ITS OWN fields — a field can become invalid
		// after its step was already left (e.g. a value depends on another
		// step). Submitting despite that must never look like "nothing
		// happened", so on failure we:
		// 1. write the resulting errors into the errors store (so the
		//    affected fields render as invalid wherever they are shown),
		// 2. jump to the earliest affected step,
		// 3. abort BEFORE calling formContext.handleSubmit — and rethrow so
		//    StepNavigation's existing submit-catch (toast + showValidationError)
		//    takes over, exactly like it already does for real submit errors.
		const formValues = await new Promise<unknown>((resolve) => {
			const unsub = formContext.form.subscribe((v) => resolve(v));
			unsub();
		});

		try {
			await sightingSchema.validate(formValues, { abortEarly: false });
			logger.info('Pre-submit validation: all fields OK');
		} catch (yupError) {
			if (!(yupError instanceof ValidationError)) {
				throw yupError;
			}

			const validationErrors: Record<string, string> = {};
			for (const innerError of yupError.inner) {
				if (innerError.path && innerError.message) {
					validationErrors[innerError.path] = innerError.message;
				}
			}

			logger.error({ validationErrors }, 'Pre-submit validation FAILED — submission blocked');

			// Mark all currently invalid fields, wherever their step is
			formContext.errors.set(validationErrors);

			// Jump to the earliest step that actually contains an error —
			// no-op if the errors are already visible on the current step
			const targetStep = findStepForErrors(
				Object.keys(validationErrors),
				formStepsConfig,
				currentStep
			);
			if (targetStep !== null) {
				currentStep = targetStep;
			}

			throw new Error('Formularvalidierung fehlgeschlagen. Bitte prüfen Sie Ihre Eingaben.', {
				cause: yupError
			});
		}

		return formContext.handleSubmit(e);
	}

	function onReset() {
		logger.info('Resetting form:');
		// Lösche alle gespeicherten Daten
		clearFormDataOnly();
		clearStorage();
		currentStep = 0;
		// Stelle sicher, dass currentStep auch im localStorage zurückgesetzt wird
		saveToStorage(STORAGE_KEYS.CURRENT_STEP, 0);
		formContext.updateInitialValues(initialFormData);
	}

	// Lade currentStep aus localStorage oder starte bei 0
	let currentStep: number = $state(loadFromStorage(STORAGE_KEYS.CURRENT_STEP, 0));

	const form = $derived(formContext.form);

	// Speichere currentStep direkt bei Änderungen
	$effect(() => {
		saveToStorage(STORAGE_KEYS.CURRENT_STEP, currentStep);
		logger.debug({ currentStep }, 'Step persisted');
	});

	// Speichere Formulardaten (trackt nur $form, nicht currentStep — verhindert doppelten Trigger)
	$effect(() => {
		const formData = $form;
		saveToStorage(STORAGE_KEYS.FORM_DATA, formData);
		logger.debug({ uploaded: formData.uploadedFiles }, 'Form data persisted');
	});
</script>

<Form {...formProps} bind:context={formContext}>
	{#if isNotIFrame}
		<!-- Form Title -->
		<div class="mb-4 text-center md:mb-8">
			<h1 class="text-base-content mb-2 text-2xl font-bold md:text-3xl lg:text-4xl">
				Meerestier-Sichtung melden
			</h1>
			<p class="text-base-content/70 px-2 text-sm md:text-lg">
				Helfen Sie der Forschung mit Ihrer Wal- oder Robbensichtung
			</p>
		</div>
	{/if}

	<!-- Error Message -->
	{#if submissionError}
		<div class="alert alert-error mb-6" role="alert">
			<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
			<span>{submissionError}</span>
		</div>
	{/if}

	<!-- Step Progress -->
	<FormSteps steps={formStepsConfig} bind:currentStep />

	<!-- Form Content -->
	<div class="card bg-base-100" id="form-content">
		<div class="card-body p-0">
			<!-- Step Content -->
			<div class="min-h-[400px]">
				{#if currentStep === 0}
					<Step1LocationTime />
				{:else if currentStep === 1}
					<Step2SightingDetails />
				{:else if currentStep === 2}
					<Step3Observations bind:currentStep />
				{:else if currentStep === 3}
					<Step4Contact />
				{/if}
			</div>

			<!-- Required Privacy Consent - Prominent placement before submit -->
			<RequiredConsent {currentStep} />

			<StepNavigation bind:currentStep onSubmit={handleFinalSubmit} />
		</div>
	</div>

	<FormActions {onCancel} {onReset}></FormActions>

	<FormHelp />
</Form>
