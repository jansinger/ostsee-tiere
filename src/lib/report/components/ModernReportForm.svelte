<script lang="ts">
	import StepNavigation from './form/StepNavigation.svelte';

	import FormActions from './form/FormActions.svelte';
	import RequiredConsent from './form/RequiredConsent.svelte';

	import SubmitStatus, { type SubmitState } from './form/SubmitStatus.svelte';

	import { browser } from '$app/environment';
	import { connection, watchConnection } from '$lib/stores/connectionState.svelte';
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

	/**
	 * Zustand der Übermittlung — getragen von `SubmitStatus` über der Navigation.
	 *
	 * Ersetzt den früheren `submissionError`-Alert plus den Submit-Fehler-Toast:
	 * beide sagten nur, DASS etwas schiefging, nicht was mit den Daten passiert
	 * ist und was der Nutzer jetzt tun kann.
	 */
	let submitState = $state<SubmitState>('idle');
	/** Überschrift im Zustand `failed` — je nach Fehlerart eine andere. */
	let submitTitle = $state('Der Server hat nicht geantwortet');
	/** Zählt die Absende-Versuche, damit „Wiederholen" sichtbar etwas bewirkt. */
	let submitAttempt = $state(0);

	// Verbindungszustand an die Browser-Ereignisse binden.
	$effect(() => watchConnection());

	/**
	 * Ohne Verbindung wird vorab gesperrt, statt den Versuch scheitern zu lassen.
	 * Ein laufender Submit behält seinen eigenen Zustand — sonst überschriebe ein
	 * kurzer Aussetzer die Anzeige mitten in der Übertragung.
	 */
	$effect(() => {
		if (connection.isOffline) {
			// NUR aus `idle` heraus. Ein bereits angezeigter Fehlschlag darf nicht
			// überschrieben werden: Er verschwände beim nächsten Verbindungswechsel
			// von selbst wieder — genau das, was `SubmitStatus` ausschließt.
			if (submitState === 'idle') submitState = 'offline';
		} else if (submitState === 'offline') {
			submitState = 'idle';
		}
	});

	/**
	 * Hart gesperrt wird nur beim sicheren Nein des Browsers.
	 *
	 * `connection.isOffline` ist auch dann wahr, wenn lediglich der letzte
	 * Request an einem `TypeError` gescheitert ist — das wirft `fetch` aber auch
	 * bei einem Server-Neustart oder einem CORS-Fehler, und dort feuert nie ein
	 * `online`-Ereignis, das den Zustand wieder aufhebt. An dieser Bedingung
	 * gesperrt käme der Nutzer nur durch ein Neuladen wieder heraus.
	 */
	const submitBlocked = $derived(submitState === 'offline' && connection.isInterfaceDown);

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

				submitAttempt += 1;
				submitState = 'submitting';

				const result = await submitSightingForm(submitValues);

				if (result.status !== 'ok') {
					// Jede Fehlerart bekommt ihren eigenen Zustand: `offline` sperrt das
					// Absenden vorab, die übrigen bieten Wiederholen an. Liegt bereits
					// eine Aufnahme auf dem Server, gilt die Datenzusage nicht mehr
					// uneingeschränkt — dafür gibt es `partial`.
					connection[result.status === 'offline' ? 'reportUnreachable' : 'reportReachable']();

					// Einmal berechnen: Anzeige und geworfene Meldung sollen dieselbe
					// Aussage tragen, nicht zwei unabhängig entstandene.
					const failure = describeSubmitFailure(result);

					if (result.status === 'offline') {
						submitState = 'offline';
					} else {
						submitState = submitValues.mediaUpload ? 'partial' : 'failed';
						submitTitle = failure;
					}

					throw new Error(failure);
				}

				connection.reportReachable();
				submitState = 'idle';
				submitAttempt = 0;

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
				const message = (error as Error)?.message || 'Unbekannter Fehler bei der Übermittlung';
				// Scheitert erst der `onSubmit`-Callback (nicht die Übermittlung),
				// steht `submitState` noch auf `submitting` — auch dieser Fall ist ein
				// Fehlschlag und braucht die Wiederholen-Fläche.
				if (submitState === 'submitting') {
					submitState = 'failed';
					submitTitle = message;
				}
				logger.error(error, message);
				throw error;
			}
		}
	};

	let formContext: FormContext = $state({} as FormContext);

	/**
	 * Erneuter Versuch aus `SubmitStatus` heraus.
	 *
	 * `handleFinalSubmit` wirft bei einem Fehlschlag weiter, damit die
	 * Schritt-Navigation ihren Weg zum fehlerhaften Feld gehen kann. Hier gibt es
	 * keinen solchen Aufrufer — der Zustand steht bereits in `submitState`, das
	 * erneute Werfen wäre nur eine unbehandelte Rejection in der Konsole.
	 */
	function retrySubmit(): void {
		void handleFinalSubmit(new Event('submit')).catch((error: unknown) => {
			logger.error({ error }, 'Erneuter Absendeversuch fehlgeschlagen');
		});
	}

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

	<!--
		Der frühere `submissionError`-Alert stand hier oben, weit weg von der
		Schaltfläche, die ihn ausgelöst hat — auf dem Telefon außerhalb des
		Bildschirms. Er ist in `SubmitStatus` aufgegangen, das direkt über der
		Schritt-Navigation sitzt.
	-->

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

			<!--
				`referenceId` kommt aus `savedFormData`, nicht aus `$form`: `formContext`
				wird erst über `bind:context` gefüllt, beim Server-Rendering ist `$form`
				an dieser Stelle noch undefiniert. Die Referenz steht ohnehin fest — sie
				entsteht einmal beim Aufbau des Formulars und ändert sich nie.
			-->
			<SubmitStatus
				state={submitState}
				title={submitTitle}
				attempt={submitAttempt}
				referenceId={savedFormData.referenceId ?? ''}
				onRetry={submitBlocked ? undefined : retrySubmit}
			/>

			<StepNavigation bind:currentStep onSubmit={handleFinalSubmit} {submitBlocked} />
		</div>
	</div>

	<FormActions {onCancel} {onReset}></FormActions>

	<FormHelp />
</Form>
