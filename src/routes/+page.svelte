<!--
  OstseeSichtung - Hauptseite
  Meldeformular für Meerestier-Sichtungen in der Ostsee
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { pushState, replaceState } from '$app/navigation';
	import { tick } from 'svelte';
	import { createLogger } from '$lib/logger';
	import HreflangHead from '$lib/components/seo/HreflangHead.svelte';
	import ModernReportForm from '$lib/report/components/ModernReportForm.svelte';
	import ReportKindChoice from '$lib/report/components/ReportKindChoice.svelte';
	import SubmissionSuccess from '$lib/report/components/SubmissionSuccess.svelte';
	import {
		clearReportKind,
		readReportKind,
		REPORT_KIND_PARAM,
		reportKindToIsDead,
		reportKindToParam,
		resolveReportKind,
		writeReportKind,
		type ReportKind
	} from '$lib/report/reportKind';
	import { buildHomeQueryPath } from '$lib/report/homeQueryPath';
	import { loadFromStorage, saveToStorage, STORAGE_KEYS } from '$lib/storage/localStorage';
	import type { SightingFormValues } from '$lib/types/Form';
	import { isNotIFrame } from '$lib/utils/client/isNotIFrame';
	import { localizeHref } from '$lib/paraglide/runtime';

	const logger = createLogger('main:page');

	// Success state management
	let submissionSuccess = $state(false);
	let submittedData = $state<SightingFormValues | null>(null);

	// Komponenten-lokal, NICHT als globaler $state in einem .ts-Modul: dort
	// leckt er auf dem Server zwischen Requests.
	//
	// `page.url` steht auch im SSR zur Verfügung (aus der Request-URL) —
	// der Parameter wird deshalb auf Server und Client gleichermaßen
	// ausgewertet, und ein `?meldung=…`-Direktlink des Museums zeigt ohne
	// Umweg das richtige Formular. Nur die Storage-Quellen (gespeicherter
	// Zweig, gespeichertes `isDead`) bleiben hinter `browser`.
	//
	// Richtiggestellt (Abschlussreview B5, 2026-08-06): Der frühere Kommentar
	// hier behauptete, das Gatter verhindere einen kurzen Auswahlseiten-Flash
	// bei einem Direktlink. Das stimmt nicht — `sessionStorage` existiert im
	// SSR schlicht nicht, das Gatter verhindert nur einen Absturz beim
	// Zugriff, keinen Flash. Der Flash ist für Wiederkehrer OHNE `meldung` in
	// der URL real: Der Server kennt die Storage-Quellen nicht und rendert die
	// Auswahlseite, bis die Hydration den gespeicherten Zweig nachträgt.
	// Ungelöst bleibt das hier nicht — der `$effect` weiter unten trägt den
	// aufgelösten Zweig nachträglich in die URL nach, damit zumindest das
	// NÄCHSTE Reload serverseitig sofort richtig auflöst.
	let reportKind = $state<ReportKind | null>(
		resolveReportKind(
			page.url.searchParams.get(REPORT_KIND_PARAM),
			browser ? readReportKind() : null,
			browser
				? (loadFromStorage(STORAGE_KEYS.FORM_DATA, null) as { isDead?: unknown } | null)?.isDead
				: null
		)
	);

	/**
	 * B7 (Abschlussreview): Steuert, ob `ReportKindChoice` beim nächsten Mount
	 * ihre Auswahlfrage fokussiert. `false` bleibt es genau einmal — für den
	 * allerersten Aufruf dieser Seite, an dem die Auswahlseite kein „Wechsel"
	 * ist, sondern der normale Seiteneinstieg. Sobald einmal eine
	 * Formularansicht sichtbar war und der Melder über „Ändern", „Formular
	 * zurücksetzen" oder Browser-Zurück zur Auswahl zurückkehrt, wird `true`
	 * gesetzt und bleibt es — jeder weitere Rücksprung bekommt denselben
	 * Fokus-Sprung.
	 */
	let returnedToSelection = $state(false);

	function choose(kind: ReportKind) {
		reportKind = kind;
		writeReportKind(kind);
		// History-Eintrag, damit „Zurück" auf die Auswahl führt statt aus der App.
		//
		// Dasselbe Ziel wie im `href` der Karte, aus derselben Funktion: Der
		// JS-Pfad und der JS-lose Pfad müssen an derselben Stelle landen. Zwei
		// getrennte Aufbauten drifteten still auseinander — die Zusage „bestehende
		// Query-Parameter bleiben erhalten" (Kampagnen-Marker aus einem
		// Museums-Link) gälte dann nur noch auf einem der beiden Wege, ohne dass
		// ein Test rot würde.
		pushState(reportKindHref(kind), {});
	}

	/**
	 * Einziger Ort, der `/` + Query-String + `localizeHref` zusammensetzt.
	 *
	 * `localizeHref` um den fertigen Pfad herum, nicht um `/` allein: Die
	 * Funktion hängt Sprachpräfix und Query-String getrennt an
	 * (`localized.pathname + localized.search + localized.hash`, `runtime.js`),
	 * ein `localizeHref('/') + '?...'` verlöre also nichts — aber erst
	 * `params.toString()` in den fertigen Pfad zu bauen und danach zu
	 * lokalisieren hält den Query-String an genau einer Stelle, statt ihn ein
	 * zweites Mal zusammenzusetzen.
	 *
	 * Genutzt von `reportKindHref()` (Klick auf eine Zweig-Wahl),
	 * `returnToSelection()` (Rücksprung über „Ändern"/„Formular zurücksetzen")
	 * und dem `$effect` weiter unten, das den Zweig aus dem Storage nachträgt.
	 * Alle drei bauen `/?meldung=…` — als Review-Fund zu Task 8 lokalisierte
	 * ursprünglich nur `reportKindHref()`; die anderen beiden sprangen beim
	 * Schreiben der URL von `/en/…` zurück auf `/…`, und ab da blieb die
	 * Anwendung deutsch, ohne dass ein Klick das ausgelöst hätte. Eine
	 * gemeinsame Funktion statt drei einzelner `localizeHref`-Aufrufe, damit
	 * ein viertes Vorkommen nicht denselben Fehler wiederholt.
	 *
	 * Das `?` wird nur angehängt, wenn nach `toString()` überhaupt etwas übrig
	 * bleibt — `returnToSelection()` löscht `meldung` und übergibt hier leere
	 * `URLSearchParams`, wenn das der einzige Parameter war. Ohne die Prüfung
	 * entstünde der nicht-kanonische String `/?` (Review-Fund). Der
	 * Query-Erhalt im nicht-leeren Fall bleibt dabei unverändert — er hing
	 * schon dreimal als Critical-Fund an genau dieser Funktion. Die Prüfung
	 * selbst steckt in `buildHomeQueryPath` (`$lib/report/homeQueryPath.ts`),
	 * ausgelagert, damit sie ohne die restliche Seite unit-testbar ist — der
	 * eigentliche Effekt eines fehlenden `?` wäre über `localizeHref()` selbst
	 * nicht beobachtbar, siehe Kommentar dort.
	 */
	function localizedHomeHref(searchParams: URLSearchParams): string {
		return localizeHref(buildHomeQueryPath(searchParams));
	}

	/**
	 * Ziel der beiden Links auf der Einstiegsseite — der Weg, den ein Klick VOR
	 * der Hydration nimmt, und zugleich das Ziel, das `choose()` oben nach der
	 * Hydration per `pushState` setzt. Bestehende Query-Parameter (Kampagnen-
	 * Marker aus einem Museums-Link) bleiben dabei erhalten; nur `meldung` wird
	 * gesetzt. Das ist die Zusage, die der frühere native GET-Submit nicht
	 * einlösen konnte — er ersetzte die gesamte Query.
	 *
	 * `page.url` statt `window.location`: Diese Funktion läuft auch im SSR, wo es
	 * kein `window` gibt. Der ausgelieferte `href` ist damit von Anfang an
	 * richtig und nicht erst nach der Hydration.
	 */
	function reportKindHref(kind: ReportKind): string {
		// Wirft weg, keine Komponenten-Reaktivität nötig — dasselbe Muster wie in
		// ExportModal.svelte.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(page.url.searchParams);
		params.set(REPORT_KIND_PARAM, reportKindToParam(kind));
		return localizedHomeHref(params);
	}

	/**
	 * Gemeinsamer Kern von `changeKind()` und `resetReportKind()` (beide unten):
	 * Zweig auf „noch nicht gewählt" zurücksetzen, den Migrationspfad
	 * neutralisieren und die URL bereinigen, damit die Auswahlseite erscheint
	 * und auch ein Reload dort stehen bleibt.
	 *
	 * `resolveReportKind` hat DREI Quellen, nicht zwei: Query-Parameter,
	 * gespeicherter Zweig — UND `isDead` aus den persistierten Formulardaten
	 * (Migrationspfad für den Altbestand ohne `reportKind`). `clearReportKind()`
	 * räumt nur die zweite Quelle. `ModernReportForm` schreibt `isDead` aber
	 * bereits beim bloßen Öffnen des Formulars nach `FORM_DATA` (siehe dessen
	 * `$effect`, das `$form` verfolgt) — ohne die dritte Quelle ebenfalls zu
	 * neutralisieren, fiele ein Reload auf der frisch gezeigten Auswahlseite
	 * sofort in den verlassenen Zweig zurück, noch bevor eine neue Auswahl
	 * getroffen wurde. Neutralisiert wird deshalb NUR `isDead` selbst — die
	 * übrigen Formulardaten (Position, Datum, Medien, Kontakt) bleiben
	 * unangetastet, sie sind der aufwendigste Teil der Eingabe.
	 *
	 * Der Schlüssel wird dabei ENTFERNT, nicht auf `null` gesetzt:
	 * `sightingSchema.isDead` ist `yup.boolean().default(false)` und nicht
	 * nullable — der Default greift nur bei `undefined`, nicht bei `null`. Ein
	 * fehlender Schlüssel ergibt für `resolveReportKind`s `savedIsDead` über
	 * `?.isDead ?? null` denselben `null` wie ein explizites `null` — UND
	 * lässt `ModernReportForm.svelte` beim nächsten Laden (dortige
	 * `loadFromStorage`-Whitelist gegen `initialFormData`) den Schema-Default
	 * `false` wiederherstellen, statt ein `null` durchzureichen, das das Schema
	 * nicht kennt.
	 */
	function returnToSelection() {
		// B7: Dieser Rücksprung ist immer ein „Wechsel" — ausgelöst durch
		// „Ändern" (`changeKind()`) oder „Formular zurücksetzen"
		// (`resetReportKind()`), nie der allererste Seitenaufruf. `ReportKindChoice`
		// fokussiert deshalb bei ihrem nächsten Mount ihre Auswahlfrage.
		returnedToSelection = true;
		reportKind = null;
		clearReportKind();
		if (browser) {
			const savedFormData = loadFromStorage<Record<string, unknown> | null>(
				STORAGE_KEYS.FORM_DATA,
				null
			);
			if (savedFormData) {
				const { isDead, ...formDataWithoutIsDead } = savedFormData;
				saveToStorage(STORAGE_KEYS.FORM_DATA, formDataWithoutIsDead);
			}
		}
		// Bestehende Query-Parameter bleiben erhalten — nur `meldung` entfällt.
		// Gleiches Muster wie in `choose()`, über dieselbe `localizedHomeHref()`:
		// Auf `/en` sonst der Weg zurück in die deutsche Fassung, ohne dass der
		// Nutzer etwas angeklickt hätte, das nicht „Ändern" oder „Formular
		// zurücksetzen" hieße (Critical-Fund, Task-8-Review).
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(window.location.search);
		params.delete(REPORT_KIND_PARAM);
		pushState(localizedHomeHref(params), {});
	}

	/**
	 * Ausgelöst vom „Ändern"-Knopf in `ReportKindFeedback` — seit B6
	 * (Abschlussreview) an zwei Stellen im Formular verdrahtet (Schritt 1 über
	 * `Step1LocationTime`, Schritt 2 über `Step2SightingDetails` →
	 * `AnimalInfo`): zurück zur Auswahlseite. `history.back()` wäre hier keine
	 * Alternative — wer über den Storage direkt im Formular landet, hat keinen
	 * History-Eintrag dafür, und im meeresmuseum.de-iframe navigierte `back()`
	 * die Elternseite weg statt nur den Zweig zurückzusetzen.
	 */
	function changeKind() {
		returnToSelection();
	}

	/**
	 * Gegenstück zu `onReset()` in `ModernReportForm` („Formular zurücksetzen"),
	 * über dessen `onreset`-Prop verdrahtet (Abschlussreview B1). Der Klick dort
	 * räumt Storage und Formular-Zustand bereits auf, kann den Zweig-`$state`
	 * hier aber nicht selbst anfassen — ohne dieses Gegenstück bliebe die
	 * Auswahlseite unsichtbar, `isDead` fiele im Formular still auf den
	 * Schema-Default `false` zurück, während die URL weiter den alten Zweig
	 * trägt: ein Totfund liefe nach dem Reset lautlos als Lebendsichtung weiter.
	 *
	 * `await tick()`, bevor `returnToSelection()` liest: `onReset()` ruft
	 * `formContext.updateInitialValues(...)` auf, das `$form` ändert — der
	 * `$effect` dort, der `$form` nach `FORM_DATA` spiegelt, läuft aber erst im
	 * nächsten Svelte-Flush. Ohne das Warten läse `returnToSelection()`
	 * entweder noch die soeben gelöschten Daten, oder der Effekt schriebe NACH
	 * dem Aufräumen hier ein frisches `isDead: false` in den Storage zurück.
	 */
	async function resetReportKind() {
		await tick();
		returnToSelection();
	}

	// `popstate` statt `page.url`, weil `pushState` `page.url` nicht
	// aktualisiert (Shallow Routing). Läuft bidirektional durch denselben
	// Resolver wie die Initialisierung; `stored`/`savedIsDead` bleiben `null`,
	// sonst belebte der gespeicherte Zweig die Auswahl beim Zurückgehen wieder.
	$effect(() => {
		if (!browser) return;

		function onPopState() {
			const params = new URLSearchParams(window.location.search);
			const nextReportKind = resolveReportKind(params.get(REPORT_KIND_PARAM), null, null);
			// B7: Browser-Zurück auf die Auswahl ist derselbe „Wechsel" wie
			// „Ändern" — nur ausgelöst über die History statt über einen Klick.
			// Die Bedingung `reportKind !== null` grenzt das gegen den Fall ab, in
			// dem die Auswahlseite ohnehin schon sichtbar war (z. B. Vorwärts von
			// einem Zustand zum nächsten, der wieder auf null zeigt) — dort ist
			// kein Fokus-Sprung nötig, es hat sich nichts sichtbar geändert.
			if (nextReportKind === null && reportKind !== null) {
				returnedToSelection = true;
			}
			reportKind = nextReportKind;
		}

		window.addEventListener('popstate', onPopState);
		return () => window.removeEventListener('popstate', onPopState);
	});

	/**
	 * Abschlussreview B5: Zweig aus Storage/Migration nachträglich in die URL
	 * schreiben. `choose()` setzt `meldung` bereits beim Klick (Spec §6.8) —
	 * diese Stelle deckt die Fälle ab, in denen der Zweig NICHT über einen
	 * Klick, sondern über die Storage-Quellen aufgelöst wurde (Lesezeichen auf
	 * die bloße Startseite, iframe-Reload der Elternseite auf
	 * meeresmuseum.de). Ohne sie bliebe die URL dauerhaft ohne `meldung`, und
	 * JEDES Reload zeigte erneut kurz die Auswahlseite, bevor die Hydration den
	 * Zweig nachträgt.
	 *
	 * `replaceState`, nicht `pushState`: Das ist ein Nachtragen, kein
	 * Nutzer-Ereignis — es soll keinen eigenen History-Eintrag erzeugen. Der
	 * Vergleich gegen den aktuellen Parameter macht den Effekt zum No-op,
	 * sobald `choose()`/`changeKind()` die URL bereits selbst gesetzt haben.
	 *
	 * `await tick()`, bevor `replaceState` läuft: Löst sich der Zweig schon
	 * beim allerersten Rendern aus dem Storage auf (kein Klick), feuert dieser
	 * Effekt noch WÄHREND SvelteKit seine eigene Root-Komponente aufbaut
	 * (`client.js`: `root = new app.root(...)`) — die Zuweisung an `root` ist
	 * zu diesem Zeitpunkt noch nicht abgeschlossen, `replaceState` bricht
	 * dann mit einer nicht abgefangenen Rejection ab (`root.$set is not a
	 * function`, empirisch reproduziert). `tick()` verschiebt den Aufruf hinter
	 * den aktuellen Konstruktionsdurchlauf.
	 *
	 * `localizedHomeHref()`, nicht `` `/?${params}` `` direkt: Dieser Effekt
	 * feuert ohne jede Nutzeraktion, sobald der Zweig aus dem Storage aufgelöst
	 * wird — auf `/en` sprang die URL dadurch still auf `/…` zurück und
	 * `getLocale()` lieferte ab dann `de`, obwohl niemand geklickt hatte
	 * (Critical-Fund, Task-8-Review). Dieselbe Funktion wie in `choose()` und
	 * `returnToSelection()`, damit die drei Aufbauten nicht wieder auseinanderlaufen.
	 */
	$effect(() => {
		if (!browser || reportKind === null) return;
		const target = reportKindToParam(reportKind);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams(window.location.search);
		if (params.get(REPORT_KIND_PARAM) === target) return;
		tick().then(() => {
			params.set(REPORT_KIND_PARAM, target);
			replaceState(localizedHomeHref(params), {});
		});
	});

	/**
	 * Handle form submission
	 */
	async function handleSubmit(formData: SightingFormValues) {
		logger.info(formData, 'Submitting sighting report submitted successfully');
		// Simulate successful submission
		submissionSuccess = true;
		submittedData = formData;
	}

	/**
	 * Handle new submission after success
	 *
	 * Abschlussreview B2: Ohne `returnToSelection()` blieb der Zweig-`$state`
	 * über eine erfolgreiche Übermittlung hinaus stehen — wer gerade einen
	 * Kadaver gemeldet hatte, landete beim nächsten Schweinswal ungefragt
	 * wieder im Totfund-Formular. Spec §6.2 verlangt hier dieselbe Rückkehr zur
	 * Auswahlseite wie bei „Ändern" und beim Formular-Reset.
	 */
	function handleNewReport() {
		submissionSuccess = false;
		submittedData = null;
		returnToSelection();
	}
</script>

<svelte:head>
	<title>{m.routes_page_text_ostsee_tiere_meerestiere_melden()}</title>
	<meta name="description" content={m.routes_page_meta_description()} />
	<meta name="keywords" content={m.routes_page_meta_keywords()} />

	<!-- Open Graph -->
	<meta property="og:title" content={m.routes_page_meta_og_title()} />
	<meta property="og:description" content={m.routes_page_meta_og_description()} />
	<meta property="og:type" content="website" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={m.routes_page_meta_og_title()} />
	<meta name="twitter:description" content={m.routes_page_meta_og_description()} />
</svelte:head>
<HreflangHead />

<div
	class="bg-base-100 mx-auto p-6"
	class:max-w-[600px]={!isNotIFrame}
	class:max-w-2xl={isNotIFrame}
>
	<div class="mb-8">
		<!-- Form Content -->
		{#if reportKind === null}
			<ReportKindChoice
				onchoose={choose}
				autofocusHeading={returnedToSelection}
				buildHref={reportKindHref}
			/>
		{:else if submissionSuccess && submittedData}
			<SubmissionSuccess {submittedData} {handleNewReport} />
		{:else}
			<ModernReportForm
				onSubmit={handleSubmit}
				initialIsDead={reportKindToIsDead(reportKind)}
				onchangekind={changeKind}
				onreset={resetReportKind}
			/>
		{/if}
	</div>
</div>
