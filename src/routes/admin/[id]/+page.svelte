<script lang="ts">
	import { goto, invalidateAll, preloadData } from '$app/navigation';
	import { page } from '$app/state';
	import AdminSightingView from '#lib/components/admin/AdminSightingView.svelte';
	import { carryReturnParams, returnTarget } from './tableReturnUrl';
	import {
		deleteSighting,
		sendTestEmail,
		TEST_EMAIL_HINT
	} from '#lib/components/admin/sightingActions.ts';
	import { planAdvance } from '#lib/components/admin/queueAdvance.ts';
	import { queueHref } from '#lib/components/admin/sightingQueue.ts';
	import SightingQueueNav from '#lib/components/admin/SightingQueueNav.svelte';
	import {
		getSightingStatus,
		SIGHTING_STATUS_PRESENTATION,
		SIGHTING_STATUS_UNDO_MS,
		verdictToStatus
	} from '#lib/components/admin/sightingStatus.ts';
	import { submitVerdict, type SightingVerdict } from '#lib/components/admin/sightingVerdict.ts';
	import { createUndoMemory } from '#lib/components/admin/undoMemory.svelte.ts';
	import {
		resolveInboxShortcut,
		type InboxShortcutAction
	} from '#lib/components/admin/adminTriageShortcuts.ts';
	import InboxShortcutHelp from '#lib/components/admin/InboxShortcutHelp.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { onDestroy } from 'svelte';
	import DeleteDialog from '#lib/components/ui/Dialog/DeleteDialog.svelte';
	import { toast } from '#lib/stores/toastState.svelte.ts';
	import type { SpamCheckResponse } from '#lib/types/spam.ts';
	import SpamFinding from '#lib/components/admin/SpamFinding.svelte';
	import {
		getSpamDrift,
		getSpamRisk,
		getSpamRiskFromResult,
		SPAM_DRIFT_PRESENTATION,
		SPAM_RISK_PRESENTATION,
		type SpamRisk
	} from '#lib/components/admin/spamScorePresentation.ts';

	let { data } = $props();

	let sighting = $derived(data.sighting);
	let queue = $derived(data.queue);
	let queueFailed = $derived(data.queueFailed);
	let queueOrder = $derived(data.queueOrder);
	/**
	 * Ob die Seite gerade aus dem Warteschlangen-Modus heraus bedient wird —
	 * `SightingQueueNav` blendet sich zwar selbst aus, wenn `queue === null &&
	 * !queueFailed`, das reicht hier aber nicht: Der Wert entscheidet zusätzlich
	 * über den Toast-Text (Sichtungsname statt „Status: …") und wird von der
	 * Tastatursteuerung (Task 8) gebraucht — beides Stellen ohne eigenes
	 * Rendering, an denen die Selbstausblendung der Komponente nicht greift.
	 */
	let imArbeitsmodus = $derived(Boolean(queue) || queueFailed);

	/**
	 * Die letzte Entscheidung — einzige Quelle für „Rückgängig", gelesen sowohl
	 * vom Toast-Knopf (unten in `handleStatusChange`) als auch vom Tastenkürzel
	 * `U` (Task 8). Zwei Lesestellen auf denselben State statt zweier Kopien
	 * derselben Angabe — sonst sagt ein Test des einen Pfads nichts über den
	 * anderen.
	 *
	 * State und Verfalls-Timer stecken in `undoMemory.svelte.ts` (`createUndoMemory`),
	 * nicht hier direkt: `vergiss(id)` dort räumt nur, wenn `id` zur gemerkten
	 * Entscheidung passt — ein spät zurückkehrendes Undo (z. B. nach einer
	 * hängenden Anfrage in `zurueckNehmen`) darf eine inzwischen neuere
	 * Entscheidung nicht löschen.
	 */
	const undoMemory = createUndoMemory(SIGHTING_STATUS_UNDO_MS);

	onDestroy(() => {
		// Ohne dieses Aufräumen setzt ein noch laufender Timer nach dem Verlassen
		// der Seite die Entscheidung einer bereits zerstörten Komponente zurück.
		undoMemory.dispose();
	});

	let showDeleteDialog = $state(false);
	let emailPending = $state(false);
	let statusBusy = $state(false);
	let hilfeOffen = $state(false);
	/**
	 * Das Element, das den Fokus trug, bevor `?` das Kürzel-Overlay öffnete —
	 * Quelle für den Fokus-Rückweg in `hilfeSchliessen`, zusammen mit
	 * `ueberschrift` unten als Ersatzziel. Anders als im Eingang
	 * (`admin/+page.svelte`) gibt es hier kein Bedienelement, das nur eine
	 * begrenzte Auswahl bekannter Positionen kennt (dort die fokussierte
	 * Karte oder der Hinweis-Knopf): Wer per Tastatur arbeitet, kann beim
	 * Öffnen auf `body`, einem Link der Warteschlangen-Leiste oder einer
	 * Schaltfläche stehen.
	 *
	 * **`document.body` ist dabei kein Grenzfall, sondern der häufigste Fall**
	 * direkt nach einem `goto()` aus dem Eingang — der Browser setzt den Fokus
	 * dort automatisch zurück, wenn keine Seite ihn explizit setzt.
	 * `body.focus()` ist ein No-op (der `body` ist nicht fokussierbar), der
	 * Fokus bliebe also genau dort stehen, wo dieser Fix ihn nicht haben will.
	 * `hilfeSchliessen` weicht deshalb auf `ueberschrift` aus, sobald der
	 * gemerkte Fokus fehlt oder `document.body` ist — dasselbe Muster wie
	 * `hinweisKnopf?.focus()` im Eingang, nur mit der Überschrift als
	 * Ersatzziel statt eines Knopfes, weil diese Seite keinen Knopf hat, der
	 * das Overlay öffnet (nur die Taste `?`).
	 */
	let vorherigerFokus: HTMLElement | null = null;
	/** Ersatzziel für `hilfeSchliessen`, siehe Docblock an `vorherigerFokus`. */
	let ueberschrift = $state<HTMLHeadingElement | null>(null);

	async function handleStatusChange(verdict: SightingVerdict): Promise<void> {
		if (statusBusy) return;
		const previous = getSightingStatus(sighting);
		/* Die ID wird festgehalten, bevor irgendetwas navigiert: `sighting` ist
		   `$derived` und zeigt nach dem Sprung die nächste Meldung. Ein Undo,
		   der `sighting.id` erst beim Klick liest, träfe die falsche. */
		const entschiedeneId = sighting.id;
		/* Ebenso vor dem `await` festgehalten: `imArbeitsmodus` ist `$derived`
		   und könnte sich während des Requests ändern (z. B. wenn `queue` durch
		   ein `invalidateAll()` an anderer Stelle neu lädt). Die Toast-Aussage
		   soll den Modus zeigen, in dem entschieden wurde — nicht den, der beim
		   Auflösen des Requests zufällig gilt. */
		const warArbeitsmodus = imArbeitsmodus;
		const plan = planAdvance({
			sightingId: entschiedeneId,
			verdict,
			queue,
			queueFailed,
			order: queueOrder
		});
		statusBusy = true;
		try {
			const ok = await submitVerdict(entschiedeneId, verdict);
			if (!ok) return;

			/* Die letzte Entscheidung wird festgehalten, damit die Taste `U`
			   dasselbe tut wie der Toast-Knopf: die **letzte Entscheidung**
			   zurücknehmen — nicht den Status der gerade angezeigten Sichtung.
			   Nach dem Auto-Advance sind das zwei verschiedene Meldungen, und
			   die zweite Lesart würde eine unbeteiligte Sichtung anfassen. */
			undoMemory.merken({
				id: entschiedeneId,
				href: plan.undoHref,
				verdict: SIGHTING_STATUS_PRESENTATION[previous].verdict
			});

			const nach = SIGHTING_STATUS_PRESENTATION[verdictToStatus(verdict)];
			const meldung = warArbeitsmodus ? plan.toastMessage : `Status: ${nach.label}`;
			toast.success(meldung, {
				duration: SIGHTING_STATUS_UNDO_MS,
				/* Fester Key: Im Arbeitsmodus fällt ein Toast pro Meldung an, für
				   die Dauer von `SIGHTING_STATUS_UNDO_MS`. Ohne Dedupe stünden bei
				   zügiger Arbeit zwei bis drei „Rückgängig"-Knöpfe übereinander —
				   für verschiedene Sichtungen, ohne dass der oberste zur zuletzt
				   entschiedenen gehören muss. `addToast` entfernt den vorherigen
				   Toast mit demselben Key, es bleibt also immer genau der
				   aktuelle. */
				key: 'sighting-verdict-undo',
				action: {
					label: 'Rückgängig',
					onClick: () => {
						/* Liest denselben State wie die Taste `U` (siehe Docblock
						   an `undoMemory`) statt der lokalen `entschiedeneId`/`plan`
						   — ein Pfad statt zweier Kopien derselben Aussage. */
						const eintrag = undoMemory.current;
						if (!eintrag) return;
						void zurueckNehmen(eintrag.id, eintrag.href, eintrag.verdict);
					}
				}
			});

			/* Kein `invalidateAll()` im Advance-Pfad: Es lädt die Sichtung neu, die
			   man gerade verlässt — reine Wartezeit vor dem Sprung. Für „Status
			   zurückgesetzt" (kein Advance) bleibt es unten stehen. */
			if (plan.target.kind === 'sighting') {
				await goto(plan.target.href);
				return;
			}
			if (plan.target.kind === 'inbox') {
				toast.info('Keine weiteren offenen Meldungen');
				await goto(returnTarget(page.url).href);
				return;
			}
			await invalidateAll();
		} finally {
			statusBusy = false;
		}
	}

	async function zurueckNehmen(
		id: number,
		href: string | null,
		verdict: SightingVerdict
	): Promise<void> {
		/* Derselbe Wächter wie in `handleStatusChange`: Ohne ihn könnte während
		   einer hängenden Undo-Anfrage eine weitere Statusänderung anlaufen —
		   beide griffen dann parallel auf `sighting`/`imArbeitsmodus` zu, die
		   sich zwischenzeitlich per `invalidateAll()`/`goto()` ändern.
		   Bewusst VOR jedem unwiederbringlichen Schritt geprüft. */
		if (statusBusy) return;
		statusBusy = true;
		try {
			/* Der Verdict geht an die **gemerkte** ID und nicht an `sighting.id`:
			   Nach dem Auto-Advance zeigt die Seite eine andere Sichtung, und ein
			   `handleStatusChange()` hier würde den Status der falschen Meldung
			   ändern. Erst zurücksetzen, dann navigieren — in dieser Reihenfolge
			   hängt nichts an der Ladezeit der Seite. */
			if (await submitVerdict(id, verdict)) {
				/* Toast UND Erinnerung erst nach einem erfolgreichen Request räumen
				   — nicht davor. Ein früherer Stand rief `toast.removeByKey` schon
				   vor dem `submitVerdict`-Aufruf auf: Scheiterte die Anfrage (Netz-
				   werkfehler, 5xx), war der Toast mit dem einzigen sichtbaren
				   „Rückgängig"-Knopf danach weg, obwohl nichts zurückgesetzt wurde
				   — ein zweiter Versuch ging nur noch über die Taste `U`, die den
				   Callback direkt aus `undoMemory` liest statt über den Toast. Mit
				   dem Räumen erst hier überlebt die Erinnerung den Fehlschlag, und
				   `U` bleibt ein voller zweiter Versuch. Für den Mausweg gilt das
				   nicht: `Toast.runAction` (`components/Toast.svelte`) ruft nach
				   jedem Aktions-Klick `dismiss()` — unabhängig vom Ausgang. Wer
				   also klickt und dessen Undo scheitert, verliert den sichtbaren
				   Knopf trotzdem und muss auf `U` ausweichen. Das hier zu ändern
				   hieße, `Toast` einen Erfolgsbegriff beizubringen, den es bewusst
				   nicht hat.
				   `vergiss` ist zusätzlich an die ID gebunden und räumt deshalb nur
				   die eigene Entscheidung, auch wenn dieser aus irgendeinem Grund
				   verzögerte Aufruf erst zurückkehrt, nachdem bereits eine neuere
				   Entscheidung gemerkt wurde. */
				toast.removeByKey('sighting-verdict-undo');
				undoMemory.vergiss(id);
				/* `href` ist `null` außerhalb des Warteschlangen-Modus (Tabelle):
				   Dort hat kein Advance stattgefunden, man steht bereits auf der
				   entschiedenen Sichtung — ein `goto` wäre ein Sprung auf die
				   aktuelle Seite und schriebe die Herkunft auf `?from=inbox` um. */
				if (href) await goto(href);
				await invalidateAll();
			}
		} finally {
			statusBusy = false;
		}
	}

	/**
	 * Beim Schließen wandert der Fokus zurück auf `vorherigerFokus` — ohne das
	 * fällt er auf `<body>`, und wer gerade per Tastatur einen Stapel abarbeitet,
	 * verliert seine Position: Tab setzt danach am Seitenanfang fort statt an der
	 * Stelle, von der aus `?` gedrückt wurde. Übernommen aus `hilfeSchliessen` in
	 * `admin/+page.svelte` (dort mit Karten-Index statt Element-Referenz).
	 *
	 * Ist der gemerkte Fokus selbst `document.body` — der häufigste Fall direkt
	 * nach einem `goto()` aus dem Eingang, siehe Docblock an `vorherigerFokus`
	 * —, ist `body.focus()` ein wirkungsloser No-op und der Fokus bliebe genau
	 * dort stehen, wo dieser Fix ihn nicht haben will. Ersatzziel ist dann
	 * `ueberschrift`, analog zu `hinweisKnopf?.focus()` im Eingang.
	 */
	function hilfeSchliessen(): void {
		hilfeOffen = false;
		const ziel =
			vorherigerFokus && vorherigerFokus !== document.body ? vorherigerFokus : ueberschrift;
		ziel?.focus();
		vorherigerFokus = null;
	}

	/**
	 * Tastatur-Triage der Detailansicht (Task 8) — dieselbe Zuordnung wie im
	 * Eingang (`resolveInboxShortcut`), nur wandert nicht der Fokus, sondern die
	 * Seite: `focusNext`/`focusPrevious` springen über `queueHref` zum Nachbarn.
	 *
	 * Nur im Arbeitsmodus aktiv: Aus der Tabelle heraus gibt es keine
	 * Warteschlange, und ein „a" dort träfe zwar dieselbe Sichtung, aber ohne den
	 * Sprung-Kontext, den die restlichen Tasten voraussetzen.
	 */
	function aufTaste(event: KeyboardEvent): void {
		if (!imArbeitsmodus) return;
		const aktion: InboxShortcutAction | null = resolveInboxShortcut(event);
		if (!aktion) return;

		if (aktion === 'closeHelp') {
			// Nur schlucken, wenn es etwas zu schließen gab — sonst nimmt die Seite
			// Escape anderen Bedienelementen weg. Derselbe Wächter wie im Eingang.
			if (!hilfeOffen) return;
			event.preventDefault();
			hilfeSchliessen();
			return;
		}
		/* Ab hier bewirkt jede Aktion etwas an der Seite (Navigation, Statuswechsel,
		   Overlay) — `preventDefault()` unterbindet die Browser-Grundfunktion
		   derselben Taste (z. B. „/" als Adressleisten-Fokus in manchen Browsern).
		   Gleiche Stelle wie im Eingang (`admin/+page.svelte`), aus demselben Grund:
		   ohne erkennbare Fehlwirkung heute, aber die zwei Handler sollen nicht
		   grundlos auseinanderlaufen. */
		event.preventDefault();

		switch (aktion) {
			case 'toggleHelp':
				if (hilfeOffen) {
					hilfeSchliessen();
				} else {
					// Nur beim Öffnen merken: Schließt sich das Overlay über `closeHelp`
					// (Escape) oder den Knopf, ist `vorherigerFokus` bereits gesetzt.
					vorherigerFokus =
						document.activeElement instanceof HTMLElement ? document.activeElement : null;
					hilfeOffen = true;
				}
				return;
			case 'focusNext':
				if (queue?.next) void goto(queueHref(queue.next.id, queueOrder));
				return;
			case 'focusPrevious':
				if (queue?.prev) void goto(queueHref(queue.prev.id, queueOrder));
				return;
			case 'approve':
				void handleStatusChange('approve');
				return;
			case 'reject':
				void handleStatusChange('reject');
				return;
			case 'undo': {
				/* `U` nimmt die **letzte Entscheidung** zurück — dieselbe Bedeutung
				   wie im Eingang und dasselbe Ziel wie der Toast-Knopf. Ein
				   `handleStatusChange('reset')` hieße dagegen „setze die gerade
				   angezeigte Sichtung zurück", und das ist nach dem Auto-Advance eine
				   andere Meldung: eine, die nie entschieden wurde — oder schlimmer,
				   eine fremde Freigabe, die dabei verloren ginge. Gelesen wird
				   deshalb `undoMemory.current`, derselbe State wie der Toast-Knopf
				   (siehe Docblock dort), nicht der Status von `sighting`. */
				const eintrag = undoMemory.current;
				if (!eintrag) return;
				/* Weder `vergiss` noch das Toast-Entfernen stehen hier: Beides
				   erledigt `zurueckNehmen` selbst, und zwar erst, sobald der
				   `statusBusy`-Wächter dort tatsächlich grünes Licht gibt — siehe
				   Docblock dort. Ein Mausklick braucht diesen Umweg nicht, weil
				   `Toast.svelte` bei jedem Aktions-Klick selbst `dismiss()` aufruft;
				   ein Tastendruck hat dieses Signal nicht und muss es deshalb über
				   denselben Weg wie der Mausklick erhalten, statt es vorwegzunehmen. */
				void zurueckNehmen(eintrag.id, eintrag.href, eintrag.verdict);
			}
		}
	}

	/* Über den Href statt über `queue.next` derivieren: `queue` bekommt nach
	   jedem `invalidateAll()` (Reset- und Undo-Pfad) eine neue Objekt-Identität,
	   auch wenn der Nachbar derselbe bleibt. Ein Effect an `queue.next` liefe
	   dann bei jeder Neu-Identität erneut und lüde denselben Nachbarn nochmal —
	   `nextHref` ist dagegen wertgleich vergleichbar. */
	let nextHref = $derived(queue?.next ? queueHref(queue.next.id, queueOrder) : null);

	$effect(() => {
		if (nextHref) void preloadData(nextHref).catch(() => {});
	});

	function editSighting() {
		// Herkunft und Tabellenfilter reisen mit — sonst endet der Rückweg nach
		// „Bearbeiten" in der ungefilterten Tabelle statt dort, wo man herkam.
		goto(`/admin/${sighting.id}/edit${carryReturnParams(page.url)}`);
	}

	async function handleTestEmail() {
		// Wächter statt `disabled`: Die Schaltfläche bleibt fokussierbar, wer per
		// Tastatur arbeitet verliert seine Position nicht (design-system.md).
		if (emailPending) return;
		emailPending = true;
		try {
			await sendTestEmail(sighting.id);
		} finally {
			emailPending = false;
		}
	}

	async function handleDelete() {
		// Die Sichtung, die diese Seite anzeigt, existiert nach dem Löschen nicht
		// mehr — zurück, woher man kam, statt auf einen 404 zu warten. Ohne
		// `sighting.id`: Der Anker zeigte auf eine Karte, die es nicht mehr gibt.
		if ((await deleteSighting(sighting.id)).ok) {
			await goto(returnTarget(page.url).href);
		}
	}

	/**
	 * Flächen- und Icon-Farbe der Spam-Karte — bewusst hier und nicht in
	 * `spamScorePresentation.ts`, aus demselben Grund wie bei `deadFinding.ts`:
	 * Beide haben genau einen Leser, und ein gemeinsames Modul mit
	 * Ein-Leser-Konstanten wäre Indirektion ohne Nutzen. Die **Schwellen**
	 * driften dadurch nicht — die Aufschlüsselung geht über `SpamRisk`, nicht
	 * über den Score.
	 *
	 * `text-error` ist als Vordergrund zulässig (6,04:1 auf base-100), die
	 * übrigen Statusfarben nur in ihrer `-strong`-Variante
	 * (`.claude/rules/design-system.md`, „Statusfarben haben zwei Rollen").
	 */
	const SPAM_CARD_SURFACE: Record<SpamRisk, string> = {
		unrated: 'border-warning bg-warning/10',
		clean: 'border-base-300 bg-base-200',
		suspicious: 'border-warning bg-warning/10',
		high: 'border-error bg-error/10'
	};
	const SPAM_CARD_ICON: Record<SpamRisk, string> = {
		unrated: 'text-warning-strong',
		clean: 'text-base-content/70',
		suspicious: 'text-warning-strong',
		high: 'text-error'
	};

	interface SpamCheckState {
		/** Die Sichtung, zu der Ergebnis bzw. Fehler gehören. */
		sightingId: number;
		loading: boolean;
		result: SpamCheckResponse | null;
		error: string | null;
	}

	/**
	 * Ein beschreibbares `$derived`: Der Zustand gehört immer zu **einer**
	 * Sichtung und wird bei einem Wechsel verworfen.
	 *
	 * Im Arbeitsmodus springt die Detailansicht nach einer Entscheidung zur
	 * nächsten Meldung, ohne die Komponente neu zu erzeugen — Karte und
	 * Fehlermeldung der vorigen Prüfung blieben dabei stehen und lasen sich als
	 * Aussage über die neue Sichtung. Die Tabelle hatte gegen dieselbe Klasse
	 * von Fehler seit jeher einen Wächter (`spamCheckModal.sightingId`), hier
	 * fehlte er ganz.
	 *
	 * `$derived` und nicht `$state` + `$effect`: Der Rückfall auf den leeren
	 * Zustand ist genau das, was ein Derived beschreibt — und die Zuweisungen
	 * unten überschreiben ihn bis zum nächsten Wechsel. Zugewiesen wird deshalb
	 * immer das **ganze** Objekt; ein Derived ist kein Proxy, eine
	 * Feld-Mutation daran löste kein Rerendering aus.
	 */
	let spamCheck = $derived<SpamCheckState>({
		sightingId: sighting.id,
		loading: false,
		result: null,
		error: null
	});

	async function runSpamCheck() {
		/* Zweiter Teil desselben Problems: Eine bereits laufende Anfrage kommt
		   nach dem Sprung zurück und schriebe ihr Ergebnis auf den inzwischen
		   angezeigten Nachbarn. Das Derived oben kann sie nicht aufhalten. */
		const sightingId = sighting.id;
		spamCheck = { sightingId, loading: true, result: null, error: null };

		try {
			const response = await fetch(`/api/sightings/${sightingId}/spam-check`);
			if (spamCheck.sightingId !== sightingId) return;
			if (!response.ok) {
				throw new Error(`Fehler ${response.status}: ${response.statusText}`);
			}
			const result: SpamCheckResponse = await response.json();
			if (spamCheck.sightingId !== sightingId) return;
			spamCheck = { sightingId, loading: false, result, error: null };
		} catch (err) {
			if (spamCheck.sightingId !== sightingId) return;
			spamCheck = {
				sightingId,
				loading: false,
				result: null,
				error: err instanceof Error ? err.message : 'Unbekannter Fehler'
			};
		}
	}
</script>

<svelte:head>
	<title>Sichtung #{data.sighting?.id} - Details - Admin - Ostsee-Tiere</title>
	<meta
		name="description"
		content="Detailansicht der Sichtung #{data.sighting
			?.id}. Vollständige Informationen zur gemeldeten Meerestier-Sichtung."
	/>
	<meta
		name="keywords"
		content="Sichtung, Details, Admin, {data.sighting?.species ?? 'Meerestier'}, Ostsee, Verwaltung"
	/>

	<!-- Open Graph -->
	<meta property="og:title" content="Sichtung #{data.sighting?.id} - Details - Admin" />
	<meta
		property="og:description"
		content="Detailansicht einer Meerestier-Sichtung im Admin-Bereich"
	/>
	<meta property="og:type" content="website" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Sichtung #{data.sighting?.id} - Details - Admin" />
	<meta
		name="twitter:description"
		content="Detailansicht einer Meerestier-Sichtung im Admin-Bereich"
	/>
</svelte:head>

<!-- Tastatur-Triage (Task 8): dieselbe Zuordnung wie im Eingang, `aufTaste`
     wirkt nur im Arbeitsmodus und schweigt in Eingabefeldern und Dialogen
     (`MediaModal`, `DeleteDialog`) — siehe `adminTriageShortcuts.ts`. -->
<svelte:window onkeydown={aufTaste} />

{#if hilfeOffen}
	<!-- `hilfeSchliessen` und nicht `hilfeOffen = false`: Knopf und Hintergrund
	     brauchen denselben Fokus-Rückweg wie Escape, sonst bliebe der Fokus nach
	     einem Maus-Klick auf „Schließen" auf `<body>` — dasselbe Muster wie im
	     Eingang (`admin/+page.svelte`). -->
	<InboxShortcutHelp onClose={hilfeSchliessen} />
{/if}

{#if imArbeitsmodus}
	<!-- Eigener Außenabstand hier: `SightingQueueNav` trägt seit dem Umbau kein
	     `mb-4` mehr, und ohne Bedingung stünde bei `queue === null &&
	     !queueFailed` ein leerer Abstands-Wrapper, obwohl die Komponente selbst
	     nichts rendert. Aus der Tabelle heraus (kein Arbeitsmodus) gibt es
	     ohnehin keine Warteschlange — eine Leiste behauptete dort einen Stapel,
	     den es nicht gibt. -->
	<div class="mb-4">
		<SightingQueueNav {queue} {queueFailed} order={queueOrder} />
	</div>
{/if}

<div class="mb-0 flex flex-wrap items-center justify-between gap-2">
	<!-- Die ID im Text statt eines separaten `aria-live`: SvelteKit kündigt eine
	     Client-Navigation selbst an (über `<title>`, das in `svelte:head` oben
	     bereits die ID trägt) — eine zusätzliche Live-Region an dieser
	     Überschrift bekäme dasselbe Problem, an dem der Zähler in
	     `SightingQueueNav` bereits gescheitert ist: Nach dem `goto()` steht hier
	     ein neu eingefügter Knoten, keine Aktualisierung eines bestehenden, und
	     eine frisch eingefügte Live-Region wird von Screenreadern nicht
	     zuverlässig vorgelesen. Der Text selbst bleibt aber die Quelle für alle
	     — auch für Sehende, die nach dem Sprung sonst nur „Sichtung Details"
	     ohne Bezug zur vorherigen Karte sähen. -->
	<!-- `tabindex="-1"` macht die Überschrift programmatisch fokussierbar, ohne
	     sie in die Tab-Reihenfolge aufzunehmen — Ersatzziel für
	     `hilfeSchliessen`, siehe Docblock an `vorherigerFokus`. -->
	<!-- `h1` und nicht `h2`: Das Root-Layout bringt keine Überschrift mit, die
	     Struktur dieser Seite begann damit auf Ebene 2 — wer per Screenreader
	     über Überschriften navigiert, fand hier keinen Einstieg (WCAG 1.3.1).
	     **Die Größe bleibt `text-xl` und wird bewusst nicht `text-display`.**
	     Die übrigen Admin-Seitentitel sind mit Befund 9 auf die Rolle `display`
	     (32px) vereinheitlicht worden; Detailansicht und Bearbeiten-Maske sind
	     davon ausgenommen (Entscheidung Jan, 2026-08-09). Sie sind
	     Arbeitsflächen, keine Titelblätter: Der Kopf steht hier direkt über der
	     Aktionsleiste, mit der entschieden wird, und ein 32px-Titel schöbe im
	     Warteschlangen-Modus genau die Knöpfe nach unten, die man Meldung für
	     Meldung braucht. Abgesichert in `adminPageHeadings.test.ts`. -->
	<h1 class="text-xl font-bold" tabindex="-1" bind:this={ueberschrift}>
		Sichtung Details #{sighting.id}
	</h1>
	<div class="flex flex-wrap gap-2">
		<button
			class="btn btn-ghost btn-sm"
			onclick={runSpamCheck}
			disabled={spamCheck.loading}
			title="Spam-Check durchführen"
			aria-label="Spam-Check für diese Sichtung durchführen"
		>
			{#if spamCheck.loading}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<Icon icon="lucide:shield-alert" class="mr-1 h-4 w-4" />
			{/if}
			Spam-Check
		</button>
		<!-- Nur Superadmins: Der Klick erzeugt im Team-Postfach eine Mail, die von
		     einer echten Neu-Meldung nicht zu unterscheiden ist. Das Gate steht
		     zusätzlich am Endpunkt — hier verschwindet nur das Bedienelement. -->
		{#if data.isSuperAdmin}
			<button
				class="btn btn-ghost btn-sm"
				onclick={handleTestEmail}
				aria-disabled={emailPending}
				title={TEST_EMAIL_HINT}
				aria-label="Benachrichtigung zu dieser Sichtung an das Team senden"
			>
				{#if emailPending}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<Icon icon="lucide:mail" class="mr-1 h-4 w-4" />
				{/if}
				Benachrichtigung an Team
			</button>
		{/if}
		<button
			class="btn btn-outline btn-error btn-sm"
			onclick={() => (showDeleteDialog = true)}
			title="Eintrag löschen"
			aria-label="Sichtung löschen"
		>
			<Icon icon="lucide:trash-2" class="mr-1 h-4 w-4" />
			Löschen
		</button>
		<button
			class="btn btn-primary btn-sm"
			onclick={editSighting}
			title="Bearbeiten"
			aria-label="Sichtung bearbeiten"
		>
			<Icon icon="lucide:pen-line" class="mr-1 h-4 w-4" />
			Bearbeiten
		</button>
	</div>
</div>

<DeleteDialog
	bind:show={showDeleteDialog}
	onConfirm={handleDelete}
	onCancel={() => (showDeleteDialog = false)}
/>
<div class="text-base-content/70 mb-4 text-sm">
	Referenz-ID: {sighting.referenceId}
</div>

{#if spamCheck.error}
	<div class="alert alert-error mb-4">
		<Icon icon="lucide:alert-circle" class="h-4 w-4" />
		<span>Spam-Check fehlgeschlagen: {spamCheck.error}</span>
	</div>
{/if}

{#if spamCheck.result}
	{@const response = spamCheck.result}
	{@const stored = response.stored}
	{@const recomputed = response.recomputed}
	{@const drift = SPAM_DRIFT_PRESENTATION[getSpamDrift(response)]}
	<!-- Die Karte richtet Farbe und Überschrift nach dem **Erstbefund**: Er ist
	     die Zahl, die in Tabelle und Eingang steht, und die für die Triage
	     maßgebliche. Nur wo es keinen gibt (Altbestand, `stored === null`),
	     führt die Neuberechnung. Vorher führte sie immer — und widersprach dann
	     der Liste, aus der man kam (`SpamCheckResponse`). -->
	{@const risk = stored ? getSpamRisk(stored.score) : getSpamRiskFromResult(recomputed)}
	<!-- Wort, Farbe, Icon und Schwelle kommen aus `spamScorePresentation.ts`,
	     die Anordnung der beiden Befunde aus `SpamFinding.svelte` — dieselben
	     Quellen wie im Modal der Tabelle. Vorher stand hier eine zweite,
	     handgebaute Fassung mit abweichendem Wortlaut; das war genau die
	     Divergenz zwischen Anzeigestellen, gegen die beide Module existieren.

	     Die Karte trägt nur noch die Fläche: Farbe und Icon der **führenden**
	     Stufe, dazu ein neutraler Titel. Stünde hier zusätzlich deren Label,
	     wiederholte es das Badge des ersten Befunds direkt darunter. -->
	<div class="card mb-4 border {SPAM_CARD_SURFACE[risk]}">
		<div class="card-body p-4">
			<div class="flex items-center gap-2">
				<Icon
					icon={SPAM_RISK_PRESENTATION[risk].icon ?? 'lucide:shield-alert'}
					class="h-5 w-5 {SPAM_CARD_ICON[risk]}"
					aria-hidden="true"
				/>
				<h3 class="card-title text-base">Spam-Bewertung</h3>
			</div>

			<SpamFinding
				title="Beim Eingang"
				risk={stored ? getSpamRisk(stored.score) : 'unrated'}
				score={stored?.score ?? null}
				indicators={stored?.indicators ?? []}
			/>

			<div class="divider my-2"></div>

			<SpamFinding
				title="Jetzt nachgerechnet"
				risk={getSpamRiskFromResult(recomputed)}
				score={recomputed.score}
				indicators={recomputed.indicators}
			/>

			{#if drift.note}
				<p class="text-base-content/70 mt-2 text-sm">{drift.note}</p>
			{/if}
		</div>
	</div>
{/if}

<AdminSightingView
	{sighting}
	onStatusChange={handleStatusChange}
	{statusBusy}
	statusLog={data.statusLog}
	statusLogFailed={data.statusLogFailed}
	reporterHistory={data.reporterHistory}
	reporterHistoryFailed={data.reporterHistoryFailed}
/>
