<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import StepNavigation from './form/StepNavigation.svelte';

	import FormActions from './form/FormActions.svelte';
	import RequiredConsent from './form/RequiredConsent.svelte';

	import SubmitStatus, { type SubmitState } from './form/SubmitStatus.svelte';

	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { connection, watchConnection } from '$lib/stores/connectionState.svelte';
	import { describeSubmitFailure, submitSightingForm } from '$lib/form/submitSightingForm';
	import { getSightingSchema } from '$lib/form/validation/sightingSchema';
	import { createLogger } from '$lib/logger';
	import {
		fieldsOutsideReportKind,
		reportKindClearedNotice
	} from '$lib/report/fieldsOutsideReportKind';
	import { findStepForErrors } from '$lib/report/findStepForErrors';
	import { hasMeaningfulSavedData } from '$lib/report/hasMeaningfulSavedData';
	import { resolveServerFieldErrors } from '$lib/report/serverFieldErrors';
	import {
		getFormSteps,
		hasUploadedMedia,
		hiddenFormFields,
		initialFormState,
		isDeadFinding
	} from '$lib/report/formConfig';
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
	import { discardFormUploads } from '$lib/report/discardFormUploads';
	import { isNotIFrame } from '$lib/utils/client/isNotIFrame';
	import { scrollToFirstError } from '$lib/utils/fieldNavigation';
	import { createId } from '@paralleldrive/cuid2';
	import { formStepsConfig } from '$lib/report/formConfig';
	import { tick, untrack } from 'svelte';
	import { ValidationError } from 'yup';
	import Form from './form/Form.svelte';
	import FormSteps from './form/FormSteps.svelte';
	import FormHelp from './FormHelp.svelte';
	import ReportHeading from './ReportHeading.svelte';
	import Step1LocationTime from './steps/Step1LocationTime.svelte';
	import Step2SightingDetails from './steps/Step2SightingDetails.svelte';
	import Step3Observations from './steps/Step3Observations.svelte';
	import Step4Contact from './steps/Step4Contact.svelte';

	const logger = createLogger('report:modern-report-form');

	let {
		onSubmit = async (value) => {
			logger.info({ value }, 'Form submitted:');
		},
		onCancel = () => {},
		initialIsDead,
		// Default-Noop wie `onCancel` oben: `exactOptionalPropertyTypes` verbietet sonst das
		// Weiterreichen als `{onchangekind}` an `FormActions`.
		onchangekind = () => {},
		// Default-Noop aus demselben Grund wie `onchangekind` — hier gibt es
		// aber keine weitere Aufrufstelle, an die durchgereicht werden müsste.
		onreset = () => {}
	}: {
		onSubmit?: (data: SightingFormValues) => Promise<void>;
		onCancel?: () => void;
		/**
		 * Zweig aus der Einstiegsseite (`ReportKindChoice`). Bleibt das Prop weg
		 * (andere Aufrufstellen), passiert nichts — `undefined` ist bewusst kein
		 * gültiger Totfund-Wert.
		 */
		initialIsDead?: boolean;
		/**
		 * Reicht den „Ändern"-Knopf aus `ReportKindFeedback` bis zur Aufrufstelle
		 * durch — nur `+page.svelte` kennt die Einstiegsseite, zu der er
		 * zurückführt. Empfänger ist seit dem Umzug in die Aktionszeile nur noch
		 * `FormActions`; die Rückmeldung stand vorher doppelt am Kopf von
		 * Schritt 1 und Schritt 2.
		 */
		onchangekind?: () => void;
		/**
		 * Abschlussreview B1: „Formular zurücksetzen" (`onReset()` unten) räumt
		 * Storage und Formular-Zustand clientseitig auf, kann den Zweig-`$state`
		 * in `+page.svelte` aber nicht selbst anfassen — der lebt eine Ebene
		 * höher. Ohne dieses Prop bliebe die Auswahlseite nach einem Reset
		 * unsichtbar: `isDead` fiele im Formular still auf den Schema-Default
		 * `false` zurück, während `+page.svelte` weiter den alten Zweig zeigt.
		 */
		onreset?: () => void;
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

	// UX-Review (2026-08-07, Befund 6): Schnappschuss VOR der `initialIsDead`-
	// Überschreibung und VOR dem Zweig-Aufräumen weiter unten — das ist der
	// ehrlichste Vergleichszustand. `savedFormData` wird direkt im Anschluss
	// mutiert (Zeile mit `savedFormData.isDead = …` und der `resetField`-
	// Schleife); ein Vergleich NACH diesen Schritten sähe zweigfremde, aber
	// echt vom Nutzer eingegebene Werte (z. B. `deadCondition` aus einer
	// Totfund-Sitzung, wenn jetzt der Lebend-Zweig startet) nicht mehr — sie
	// wurden zu diesem Zeitpunkt schon auf den Default zurückgesetzt. Der
	// Wiederherstellungs-Hinweis soll aber genau das sagen: Es LAG etwas vor,
	// unabhängig davon, ob es zum aktuellen Zweig passt (dafür gibt es
	// `clearedNotice` weiter unten, als eigene, zusätzliche Meldung).
	const savedFormDataAtLoad: SightingFormData = { ...savedFormData };

	// `initialIsDead` überschreibt `isDead` aus dem Formular-State. Fehlten
	// gespeicherte Formulardaten, steht dort ohnehin nur der Schema-Default —
	// die Zuweisung ist dann gleichbedeutend mit „erstmalig setzen". Lagen
	// Formulardaten vor, ist ein Unterschied zu `initialIsDead` genau der Fall
	// „Zweig hat sich seit dem letzten Stand geändert"; stimmen beide bereits
	// überein, ist die Zuweisung ein No-op. Ein `undefined`-Prop (Aufrufstellen
	// ohne Einstiegsseite) lässt `isDead` unangetastet.
	//
	// Nur der Anfangswert des Props zählt, nicht reaktiv nachgezogen — deshalb
	// einmalig per `untrack` in eine Konstante gelesen, vor der Prüfung.
	const initialIsDeadAtMount = untrack(() => initialIsDead);
	if (initialIsDeadAtMount !== undefined) {
		savedFormData.isDead = initialIsDeadAtMount;
	}

	// Task 8: Zweigfremde Felder leeren. Maßgeblich ist NICHT, ob sich der Zweig
	// gegenüber einer vorherigen Sitzung geändert hat — das ist seit `changeKind()`
	// (`reportKind.ts` entfernt `isDead` aus den gespeicherten `FORM_DATA`) nicht
	// mehr rekonstruierbar. Maßgeblich ist einzig, was in den Zweig gehört, in dem
	// das Formular JETZT startet (`savedFormData.isDead`, nach der Überschreibung
	// oben). Das räumt auch zweigfremde Daten aus einer ÄLTEREN Sitzung auf, die
	// mit dem aktuellen `initialIsDead`-Prop nie etwas zu tun hatten.
	//
	// `resetField` bindet den Schlüsseltyp pro Aufruf an einen einzigen generischen
	// Parameter — eine direkte `savedFormData[field] = initialFormState[field]` in
	// der Schleife lässt TypeScript nicht zu (`field` ist `keyof SightingFormData`
	// als Union, kein einzelner Schlüssel; `svelte-check` meldet dort einen echten
	// Typfehler, keine Falschmeldung).
	function resetField<K extends keyof SightingFormData>(key: K): void {
		savedFormData[key] = initialFormState[key];
	}
	const reportKindAtMount = isDeadFinding(savedFormData.isDead) ? 'dead' : 'alive';
	const fieldsToClear = fieldsOutsideReportKind(reportKindAtMount);
	// UX-Review (2026-08-06, Punkt 3): Nur die Felder zählen, die WIRKLICH einen
	// Wert trugen. Die Schleife darunter läuft unverändert über alle — sie ist
	// idempotent, und ein Reset auf den bereits geltenden Default kostet nichts.
	// Gezählt wird VOR dem Reset, sonst wäre die Antwort immer null.
	const clearedCount = fieldsToClear.filter(
		(field) => savedFormData[field] !== initialFormState[field]
	).length;
	for (const field of fieldsToClear) {
		resetField(field);
	}

	// Zeige Feedback wenn vorherige Eingaben wiederhergestellt wurden.
	//
	// UX-Review (2026-08-07, Befund 6): `hadSavedFormData` allein sagt nur, DASS
	// der Schlüssel `FORM_DATA` in `sessionStorage` stand — und den schreibt der
	// `$effect` weiter unten schon beim bloßen Öffnen des Formulars, ohne dass
	// der Nutzer etwas eingegeben hat. Auswahlseite → Formular → „Ändern" →
	// Formular zeigte den Hinweis dadurch auch dann, wenn nichts wiederherzustellen
	// war. `hasMeaningfulSavedData` prüft zusätzlich, ob sich die geladenen Daten
	// TATSÄCHLICH vom Initialzustand unterscheiden (Ausnahmen und Begründung dort).
	if (hadSavedFormData && hasMeaningfulSavedData(savedFormDataAtLoad, initialFormData)) {
		// Defer toast to after Svelte hydration
		queueMicrotask(() => {
			toast.info(
				m.report_components_modernreportform_text_ihre_vorherigen_eingaben_wurden_wiederhe(),
				{ duration: 4000 }
			);
		});
	}

	/**
	 * UX-Review (2026-08-06, Punkt 3): Der Zweigwechsel über „Ändern" nahm die
	 * Felder des verlassenen Zweigs oben kommentarlos mit. Steht direkt hinter
	 * dem Wiederherstellungs-Hinweis, weil beide Meldungen dasselbe Ereignis
	 * betreffen und in dieser Reihenfolge zusammen gelesen werden: „Ihre
	 * vorherigen Eingaben wurden wiederhergestellt." — „Ihre Angaben zum Totfund
	 * wurden entfernt, alles Übrige bleibt erhalten."
	 *
	 * Dasselbe `queueMicrotask` wie oben: ein Toast, der während des Aufbaus der
	 * Komponente in den `$state`-Store schreibt, käme vor der Hydration.
	 */
	const clearedNotice = reportKindClearedNotice(reportKindAtMount, clearedCount);
	if (clearedNotice) {
		queueMicrotask(() => {
			toast.info(clearedNotice, { duration: 6000 });
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
	/**
	 * Überschrift im Zustand `failed` — je nach Fehlerart eine andere.
	 *
	 * `$state<string>` statt des abgeleiteten Typs: Eine Paraglide-Botschaft
	 * liefert die Marke `LocalizedString`, und die späteren Zuweisungen
	 * (Servermeldung, Fehlertext aus dem Catch) sind gewöhnliche
	 * Zeichenketten. Ohne die Annotation erbt die Variable die Marke aus
	 * ihrem Startwert und weist jede davon zurück.
	 */
	let submitTitle = $state<string>(
		m.report_components_modernreportform_text_der_server_hat_nicht_geantwortet()
	);
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

	/**
	 * Entfernt eine Liste von Schlüsseln aus einem Objekt, unabhängig davon, ob
	 * `T` sie als optional führt. `shipNameConsent` ist wegen `.default(false)`
	 * im Schema z. B. NICHT optional inferiert — `delete obj[key]` direkt auf
	 * `T` wäre dort unter `exactOptionalPropertyTypes` ein Typfehler. Der Weg
	 * über `Partial<T>` umgeht das, ohne die Feldliste ein zweites Mal als
	 * Typ-Literal zu pflegen.
	 */
	function omitFields<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
		const result: Partial<T> = { ...obj };
		for (const key of keys) {
			delete result[key];
		}
		return result as Omit<T, K>;
	}

	/**
	 * Das Schema dieses Absende-Versuchs: das volle, minus der Felder, die der
	 * aktuelle Zweig ausblendet.
	 *
	 * Als **Resolver** übergeben und nicht als fertiges Schema, weil sich der
	 * Beobachtungsort zur Laufzeit ändert, `createForm` aber nur einmal beim
	 * Mount läuft (`ValidationSchemaOption` in `createForm.ts`). Vorher prüfte
	 * die maßgebliche Validierung deshalb weiter gegen das volle Schema: Ein zu
	 * langer `reaction`-Text, der den Wechsel auf „Land" überlebt hat, hielt das
	 * Absenden auf — und zwar STILL. `handleSubmit` fängt den `ValidationError`
	 * und kehrt zurück, `StepNavigation` sieht keinen Fehler und loggt „Form
	 * submitted successfully". Kein Toast, kein Sprung, keine Markierung; das
	 * Feld ist nicht gerendert. Der Melder drückte „Absenden" und nichts geschah.
	 *
	 * Dieselbe Zeile steht in `handleFinalSubmit` als Vorab-Prüfung — beide
	 * Ebenen rechnen jetzt mit derselben Regel, statt dass die eine durchlässt,
	 * was die andere aufhält.
	 *
	 * **Was der Resolver NICHT tut:** Er entfernt die Felder nicht aus dem
	 * Ergebnis. Yups `omit` lässt unbekannte Schlüssel durchlaufen (nur
	 * ungeprüft und ungecastet) — `values` in `onSubmit` unten trägt deshalb
	 * weiterhin `shipName`/`homePort`/`boatType`/`shipNameConsent`, aus denen
	 * die dauerhaft gespeicherten Kontaktdaten gebaut werden. Genau daran hing
	 * die Regression aus Task 11 (zweite Runde): `saveUserContactDataWithConsent`
	 * überschreibt ohne Merge, ein wiederkehrender Melder verlöre bei einer
	 * Land-Meldung seine Bootsdaten. Abgesichert in `createForm.test.ts`
	 * („lässt den Wert des ausgenommenen Feldes trotzdem an onSubmit durch") —
	 * wer dort auf `stripUnknown`/`noUnknown` umstellt, bricht das hier.
	 */
	function reachableSchema(values: SightingFormData) {
		return getSightingSchema().omit(hiddenFormFields(values));
	}

	// Formular initialisieren
	const formProps = {
		initialValues: { ...savedFormData },
		validationSchema: reachableSchema,
		onSubmit: async (values: SightingFormData) => {
			try {
				// Remove admin only attributes and uploaded files (already uploaded)
				const { verified, internalComment, uploadedFiles, ...submitValuesTemp } = values;
				let submitValues: SightingFormValues = submitValuesTemp as SightingFormValues;

				// Was der aktuelle Zweig ausblendet, geht auch nicht raus —
				// ausgeblendet heißt: nicht Teil dieser Meldung. Dieselbe Größe,
				// gegen die oben validiert wird (`reachableSchema`), sodass nie
				// etwas gesendet wird, das ungeprüft und ungecastet durch Yups
				// `omit` gelaufen ist.
				//
				// Entfernt wird am Absende-Rand, NICHT vorher aus `$form`.
				// Begründung samt verworfenem ersten Ansatz (ein `$effect`, der
				// `$form` leerte, und die Kontaktdaten-Regression daraus):
				// `HIDDEN_WHEN_FROM_LAND` in formConfig.ts. `values` bleibt
				// unangetastet — die Kontaktdaten unten werden bewusst daraus
				// gebaut, nicht aus `submitValues`.
				//
				// Bis hierher standen an dieser Stelle ZWEI Sonderfälle
				// (`OWN_VESSEL_FIELDS` und `mediaConsent`), während `boatDrive`
				// bei einer Land-Meldung und `behavior`/`behaviorText` beim
				// Totfund mitgingen — teils gewollt, teils nur historisch. Kein
				// Feld verliert dabei Aussage: `mapFormToSighting` bildet alle
				// sechs neu entfallenden auf denselben Wert ab wie ihren Default
				// (`deadCondition`→0, `deadSize`→null, `deadPhoneContact`→0,
				// `behavior`→`UNKNOWN`, `reaction`/`behaviorText` durchgereicht).
				// Bei `boatDrive` ist das Weglassen sogar die korrektere Angabe:
				// `resolveBoatDrive` schreibt ohne Angabe `NONE`, während der
				// Default `0` „Sonstiger Antrieb" bedeutet — die Kategorie, die
				// durch dieselbe Verwechslung schon einmal 5.858 Zeilen falsch
				// gefüllt hat.
				submitValues = omitFields(
					submitValues,
					hiddenFormFields(values) as (keyof SightingFormValues)[]
				) as SightingFormValues;

				// Datum und Uhrzeit gehen als Strings (deutsche Wanduhrzeit) raus — den
				// Zeitpunkt bildet ausschließlich der Server, sonst ginge die Zeitzone
				// des Browsers in den gespeicherten Instant ein.
				// set mediaUpload indicator
				// `mediaConsent` ist dabei schon durch die Zeile oben entfallen, falls
				// keine Aufnahme vorliegt: `hiddenFormFields` prüft es über dieselbe
				// `hasUploadedMedia`-Funktion (Task 15 — keine Einwilligung ohne
				// Gegenstand; ohne abgeschlossene Übertragung gibt es serverseitig
				// nichts, wofür `mapFormToSighting` einen Nachweis `…_am`/`…_version`
				// stempeln könnte).
				submitValues.mediaUpload = hasUploadedMedia(uploadedFiles);

				submitAttempt += 1;
				submitState = 'submitting';

				// Zeit-Token aus dem Seiten-Load (nur Spam-Score, siehe
				// src/routes/+page.server.ts). Fehlt es — etwa weil die Komponente
				// außerhalb der Startseite gerendert wird — geht die Meldung
				// trotzdem raus; der Server wertet das Fehlen nur als Indikator.
				const formToken = typeof page.data.formToken === 'string' ? page.data.formToken : undefined;

				const result = await submitSightingForm(submitValues, formToken);

				if (result.status !== 'ok') {
					// Jede Fehlerart bekommt ihren eigenen Zustand: `offline` sperrt das
					// Absenden vorab, die übrigen bieten Wiederholen an. Liegt bereits
					// eine Aufnahme auf dem Server, gilt die Datenzusage nicht mehr
					// uneingeschränkt — dafür gibt es `partial`.
					connection[result.status === 'offline' ? 'reportUnreachable' : 'reportReachable']();

					// Einmal berechnen: Anzeige und geworfene Meldung sollen dieselbe
					// Aussage tragen, nicht zwei unabhängig entstandene.
					const failure = describeSubmitFailure(result);

					// Hat der Server Felder benannt, ist die Meldung über der Navigation
					// nicht die vollständige Antwort — sie lautet bei einer Validierung
					// immer „Validierungsfehler bei der Eingabe". Das Ziel steht in
					// `fields`; siehe `applyServerFieldErrors`.
					if (result.status === 'rejected' && result.fields) {
						applyServerFieldErrors(result.fields);
					}

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
				const message =
					(error as Error)?.message ||
					m.report_components_modernreportform_text_unbekannter_fehler_bei_der_uebermittlung();
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

	/**
	 * Übernimmt die Feldfehler einer Server-Ablehnung ins Formular und führt zum
	 * ersten betroffenen Feld.
	 *
	 * Das ist derselbe Weg, den die Vorab-Validierung in `handleFinalSubmit` unten
	 * für Yup-Fehler geht — nur mit den Feldern des Servers als Quelle. Beide
	 * Fälle sind für den Nutzer dasselbe Ereignis: „ein Feld stimmt nicht, und es
	 * kann in einem anderen Schritt liegen". Getrennt bleiben sie trotzdem: dieser
	 * Weg mischt die Fehler und scrollt selbst, der andere setzt sie und überlässt
	 * das Scrollen der Schritt-Navigation.
	 *
	 * Die Fehler werden **gemischt**, nicht gesetzt: Ein bereits sichtbarer
	 * Client-Fehler an einem anderen Feld ist damit nicht plötzlich weg, nur weil
	 * der Server ein zusätzliches Feld beanstandet.
	 *
	 * `scrollToFirstError` läuft erst im nächsten Frame — der Schrittwechsel oben
	 * ist zu diesem Zeitpunkt noch nicht gerendert, das Zielfeld existiert also
	 * noch gar nicht im DOM.
	 *
	 * **Abhängigkeit, die nicht offensichtlich ist:** Nach dem `throw` unten läuft
	 * in `StepNavigation.handleFormSubmission` der Catch-Zweig mit
	 * `showValidationError()`, das einen ZWEITEN `scrollToFirstError` samt
	 * eigenem Fokus-Timeout auslöst. Zwei konkurrierende Sprünge entstehen daraus
	 * heute nicht, weil `handleFinalSubmit` vorvalidiert: Der Server wird nur mit
	 * client-seitig gültigen Daten erreicht, `validateStep` findet dort nichts und
	 * `showValidationError` steigt sofort wieder aus. Dass die Vorab-Prüfung die
	 * im Zweig ausgeblendeten Felder auslässt, ändert daran nichts — `validateStep`
	 * lässt über `getFormSteps` genau dieselben aus. Wer das Vorab-Gate weiter
	 * lockert, muss die beiden Sprünge gegeneinander absichern.
	 */
	function applyServerFieldErrors(serverFields: Record<string, string>): void {
		// `getFormSteps($form)`, nicht `formStepsConfig`: Die statische Liste führt
		// auch Felder, die im aktuellen Zweig nicht gerendert werden. Benennt der
		// Server eines davon, hätte es hier zwei Wirkungen, die beide falsch sind
		// — es käme als unbehebbarer Fehler in den Store (`updateField` löscht nur
		// den Fehler des GEÄNDERTEN Feldes, und dieses Feld hat kein
		// Bedienelement), und es stünde in der Feldreihenfolge vor dem sichtbaren
		// Feld, sodass `scrollToFirstError` kein Element fände und der Sprung ganz
		// ausfiele. Die Zweig-Fassung filtert es an derselben Stelle weg, an der
		// `resolveServerFieldErrors` schon die schrittlosen Felder (`allgemein`,
		// `referenceId`, …) aussortiert — dieselbe Begründung, dieselbe Naht.
		const { fields, targetStep, fieldOrder } = resolveServerFieldErrors(
			serverFields,
			getFormSteps($form),
			currentStep
		);

		// Ausschließlich unbekannte Felder benannt — es gibt nichts anzuspringen und
		// nichts zu markieren. Die Meldung selbst steht weiterhin in `SubmitStatus`.
		if (Object.keys(fields).length === 0) {
			return;
		}

		formContext.errors.update((current) => ({ ...current, ...fields }));

		if (targetStep !== null) {
			currentStep = targetStep;
		}

		requestAnimationFrame(() => {
			scrollToFirstError(fields, fieldOrder);
		});
	}

	// Formularstatus
	async function handleFinalSubmit(e: Event): Promise<void> {
		logger.info('Final submission:');

		// Pre-submit: validate across ALL steps at once. A step's own
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
		const formValues = await new Promise<SightingFormData>((resolve) => {
			const unsub = formContext.form.subscribe((v) => resolve(v));
			unsub();
		});

		// Geprüft wird das volle Schema OHNE die Felder, die der aktuelle Zweig
		// ausblendet — `reachableSchema` oben, dieselbe Funktion, mit der auch
		// `createForm` gleich darunter prüft. Ein ungültiger Restwert darin
		// brächte hier beides zum Stillstand: Der Sprung landete auf einem
		// Schritt, auf dem nichts markiert ist, und das Absenden bliebe mit
		// einer Meldung an einem Feld hängen, das niemand sieht und niemand
		// korrigieren kann.
		//
		// Erreichbar ist das über den Beobachtungsort, nicht über den Zweig:
		// `HIDDEN_WHEN_FROM_LAND` lässt `$form` bewusst stehen (Begründung samt
		// verworfenem Ansatz dort), also überlebt ein zu langer `reaction`- oder
		// `shipName`-Text den Wechsel auf „Land" — kein `maxlength` im
		// Feld-Renderer hält ihn vorher auf. Über den Zweig entsteht kein
		// Restwert: `boatDrive` räumt `shouldResetBoatDrive` beim Übergang
		// Boot→Land ab (`sections/boatDriveReset.ts`), und die drei
		// `HIDDEN_WHEN_DEAD`-Felder leert der Mount-Aufräumer oben über
		// `fieldsOutsideReportKind` — ein Zweigwechsel geht immer über die
		// Einstiegsseite und mountet dieses Formular neu (`+page.svelte`).
		//
		// Diese Prüfung ist damit keine Absicherung mehr gegen die Ebene
		// darunter, sondern nur noch das, wozu sie da ist: Sie prüft ALLE
		// Schritte auf einmal (ein Feld kann ungültig werden, nachdem sein
		// Schritt verlassen wurde) und führt zum frühesten betroffenen Schritt.
		try {
			await reachableSchema(formValues).validate(formValues, { abortEarly: false });
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
			// Zweig-Fassung, aus demselben Grund wie in `applyServerFieldErrors`:
			// `findStepForErrors` liefert den frühesten Schritt, der eines der
			// Felder führt — aus der statischen Liste könnte das ein Schritt sein,
			// auf dem das Feld gar nicht gerendert wird.
			const targetStep = findStepForErrors(
				Object.keys(validationErrors),
				getFormSteps(formValues),
				currentStep
			);
			if (targetStep !== null) {
				currentStep = targetStep;
			}

			throw new Error(
				m.report_components_modernreportform_text_formularvalidierung_fehlgeschlagen_bitte(),
				{
					cause: yupError
				}
			);
		}

		return formContext.handleSubmit(e);
	}

	/**
	 * Verwirft das Formular — samt der bereits hochgeladenen Dateien.
	 *
	 * `discardFormUploads` steht **vor** dem Aufräumen des Client-Zustands, und
	 * das ist keine Stilfrage: Danach ist `uploadedFiles` leer, und niemand weiß
	 * mehr, was zu löschen war. Die Dateien lägen dauerhaft unter
	 * `uploads/<referenceId>/` und als Zeile in `sichtungen_dateien`, ohne dass je
	 * eine Sichtung entsteht, zu der sie gehören.
	 *
	 * Es wird bewusst nicht gewartet: Warum, und warum der Medien-Store dabei ganz
	 * geleert wird, steht in `discardFormUploads.ts`.
	 */
	async function onReset() {
		logger.info('Resetting form:');

		discardFormUploads($form.uploadedFiles, formContext.mediaStore);

		// Lösche alle gespeicherten Daten
		clearFormDataOnly();
		clearStorage();
		currentStep = 0;
		// Stelle sicher, dass currentStep auch im localStorage zurückgesetzt wird
		saveToStorage(STORAGE_KEYS.CURRENT_STEP, 0);
		formContext.updateInitialValues(initialFormData);

		// B1: `onreset` schaltet in `+page.svelte` den Zweig zurück auf die
		// Auswahlseite (Spec §6.2: „Zurücksetzen → reportKind löschen → Seite
		// erscheint wieder"). `await tick()` zuerst, weil `updateInitialValues`
		// oben `$form` ändert — der `$effect` weiter unten, der `$form` nach
		// `FORM_DATA` spiegelt, läuft erst im nächsten Svelte-Flush. Ohne das
		// Warten läse der Aufrufer entweder noch die soeben gelöschten Daten,
		// oder der Effekt schriebe NACH dem Aufräumen dort unten ein frisches
		// `isDead: false` zurück, das ihm entginge.
		await tick();
		onreset();
	}

	// Lade currentStep aus localStorage oder starte bei 0
	let currentStep: number = $state(loadFromStorage(STORAGE_KEYS.CURRENT_STEP, 0));

	const form = $derived(formContext.form);

	/**
	 * Task 15: Keine Einwilligung ohne Gegenstand. Hält die Invariante „kein
	 * `mediaConsent: true` ohne mindestens eine abgeschlossen hochgeladene
	 * Aufnahme" durchgehend ein — nicht nur beim Entfernen der letzten
	 * Aufnahme, sondern auch für einen mit `mediaConsent: true`, aber ohne
	 * `uploadedFiles` gestarteten Formularzustand (z. B. Altbestand aus dem
	 * `localStorage`, von vor diesem Task). Sonst bliebe ein `true` stehen,
	 * das `Step4Contact.svelte` niemandem mehr zeigt (`hasMedia`-Bedingung
	 * dort) und das der Server dennoch stempeln würde, käme bis zum Absenden
	 * doch noch eine Aufnahme zustande.
	 *
	 * Geprüft über `hasUploadedMedia($form.uploadedFiles)` — dieselbe Funktion,
	 * die `hasMedia` in `Step4Contact.svelte` und der Riegel oben in `onSubmit`
	 * ebenfalls aufrufen — nicht gegen den client-seitigen Medien-Store, der
	 * nur gefüllt ist, solange eine Dropzone (Schritt 1 oder 2) gemountet ist.
	 */
	$effect(() => {
		if (!hasUploadedMedia($form.uploadedFiles) && $form.mediaConsent) {
			formContext.updateField('mediaConsent', false);
		}
	});

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
		<!-- Derselbe Kopf steht seit dem 2026-08-13 auch auf der Einstiegsseite
		     (`ReportKindChoice.svelte`) — Markup und Begründung in
		     `ReportHeading.svelte`. -->
		<ReportHeading />
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

	<FormActions {onCancel} {onReset} {onchangekind}></FormActions>

	<FormHelp />
</Form>
