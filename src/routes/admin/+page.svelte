<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import InboxShortcutHelp from '#lib/components/admin/InboxShortcutHelp.svelte';
	import SightingInboxCard from '#lib/components/admin/SightingInboxCard.svelte';
	import { inboxAnchor } from '#lib/components/admin/adminReturn.ts';
	import { createInboxPoller } from '#lib/components/admin/inboxPoller.ts';
	import { navigiereZuSessionEnde } from './inboxSessionEnde';
	import {
		nextActionableIndex,
		resolveInboxShortcut,
		shiftFocusIndex
	} from '#lib/components/admin/adminTriageShortcuts.ts';
	import { submitVerdict, type SightingVerdict } from '#lib/components/admin/sightingVerdict.ts';
	import {
		SIGHTING_STATUS_PRESENTATION,
		SIGHTING_STATUS_UNDO_MS,
		verdictToStatus
	} from '#lib/components/admin/sightingStatus.ts';
	import { onDestroy, tick } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import ArrowDown from '~icons/lucide/arrow-down';
	import ArrowUp from '~icons/lucide/arrow-up';
	import Info from '~icons/lucide/info';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* Erledigte Sichtungen: id → Verdict. Die Karte bleibt 8 s als Undo-Zeile
	   stehen — billiger als ein Bestätigungsdialog vor jeder Aktion, und ein
	   Fehlklick ist folgenlos korrigierbar (reset stellt alle Spalten zurück). */
	let done = $state<Record<number, SightingVerdict>>({});
	let busy = $state<Record<number, boolean>>({});
	const timers = new SvelteMap<number, ReturnType<typeof setTimeout>>();
	/* Undo-Fenster abgelaufen, aber noch nicht durch einen Reload bestätigt.
	   Getrennt von `done`, weil ein Aufräumen von `done[id]` die Karte sofort
	   zurückholen würde — die Sichtung steht bis zum Reload weiter in
	   `data.open`. Erst nach dem Reload ist der Server die Wahrheit. */
	const abgelaufen = new SvelteSet<number>();

	/* Tastatur-Triage (Spec B1). Die Fokusposition ist ein Index und keine ID:
	   Nachrücken heißt „die nächste Karte in der Liste", und das ist eine Aussage
	   über Positionen. Die Zuordnung Taste → Aktion und die Fokusarithmetik
	   stehen in `adminTriageShortcuts.ts`.

	   **Sie folgt dem echten DOM-Fokus** (`onfocusin`/`onfocusout` an der Liste)
	   und nicht nur J und K. Sonst entschiede A über eine Karte, die niemand
	   sieht: Der Ring hängt am DOM-Fokus, und wer nach einem J per Tab oder Klick
	   in eine andere Karte wandert, hätte eine Freigabe an der ersten ausgelöst. */
	let fokusIndex = $state<number | null>(null);
	let hilfeOffen = $state(false);
	/* Die letzte Entscheidung für U. Sie wird auch beim Klick gesetzt — wer mit
	   der Maus freigibt und die Korrektur per Taste sucht, findet sie damit. */
	let letzteEntscheidungId = $state<number | null>(null);
	/* `$state` und nicht ein einfaches Array: `bind:this` in ein nicht-reaktives
	   Array schreibt zwar, warnt aber zur Laufzeit (`binding_property_non_reactive`)
	   — und die Zuweisung wäre nicht nachvollziehbar, wenn die Liste sich ändert. */
	let kartenElemente = $state<(HTMLLIElement | null)[]>([]);
	/** Ziel des Fokus-Rückwegs, wenn das Overlay ohne fokussierte Karte geöffnet wurde. */
	let hinweisKnopf = $state<HTMLButtonElement | null>(null);
	/** Steht ein Hinweis auf neu eingegangene Meldungen? Gesetzt vom Poller. */
	let neueMeldungen = $state(false);

	/* Erhöht sich bei jedem `neuLaden()` — noch vor dessen eigenem `await`. Ein
	   `entscheiden()`/`rueckgaengig()`, dessen PATCH zu diesem Zeitpunkt bereits
	   läuft, merkt sich den Stand vor seinem eigenen `await` und vergleicht danach
	   erneut: Weicht er ab, ist zwischenzeitlich neu geladen worden — `timers`,
	   `done` und `busy` sind dann bereits abgeräumt (oder ein Reload-Versuch läuft),
	   und ein nachträglicher Aufbau griffe auf eine Karte zu, die es in `data.open`
	   nach dem Reload gar nicht mehr gibt (oder deren Zustand nicht mehr zum
	   Undo-Fenster passt). Die Entscheidung selbst ist serverseitig bereits
	   passiert — nur ihre lokale Spiegelung entfällt, der Reload zeigt sie über
	   `data.open` ohnehin. Reine Buchhaltung, nicht Teil des Renderns — deshalb
	   kein `$state`. */
	let ladeGeneration = 0;

	/* Der Poller hängt an `data.maxOpenId`: Nach einem Reload liefert der Load
	   eine neue Baseline, der Effekt läuft erneut und startet mit ihr — der alte
	   wird über die Aufräumfunktion sauber gestoppt. */
	$effect(() => {
		/* Zurücksetzen gehört hierher und nicht nur in `neuLaden()`: Auch der
		   **automatische** Reload nach Ablauf des letzten Undo-Fensters (siehe
		   `entscheiden`) liefert eine neue Baseline. Ohne diese Zeile bliebe der
		   Hinweis danach stehen, obwohl die Liste die neuen Meldungen längst
		   enthält. */
		neueMeldungen = false;

		const poller = createInboxPoller({
			baseline: data.maxOpenId,
			// Der Endpunkt setzt `Cache-Control: private, no-store`, aber ohne
			// `Last-Modified`/`ETag` cachte ein Browser sonst heuristisch — `no-store`
			// hier verhindert das unabhängig vom Server-Header.
			fetchStatus: () => fetch('/api/admin/inbox-status', { cache: 'no-store' }),
			onNeueMeldungen: () => (neueMeldungen = true),
			/* Der Endpunkt antwortet mit 401, sobald die Auth0-Sitzung abgelaufen
			   ist — bei einem über Nacht offenen Tab der Regelfall. Statt still zu
			   verstummen, führt die Seite zurück zum Login (`inboxSessionEnde.ts`):
			   Ein Roundtrip durch Auth0 meldet oft still wieder an (SSO-Sitzung
			   bleibt bestehen, anders als beim Logout-Weg, der sie beendet und damit
			   jeden anderen offenen Admin-Tab mit abmeldete), und der Bearbeiter
			   landet wieder auf dem Eingang. Der Sprung dorthin ist gefahrlos, weil
			   Entscheidungen sofort per PATCH herausgehen und es keinen
			   ungespeicherten Zustand gibt. */
			onSessionEnde: navigiereZuSessionEnde
		});
		poller.start();
		return () => poller.stop();
	});

	async function neuLaden(): Promise<void> {
		// Zählt vor jedem anderen Schritt hoch — siehe Kommentar bei `ladeGeneration`.
		ladeGeneration += 1;

		/* Offene Undo-Fenster erst abräumen: Ihre Karten verschwinden durch den
		   Reload, und ein später zündender Timer griffe auf Einträge zu, die es
		   nicht mehr gibt. Die Entscheidungen selbst stehen bereits in der
		   Datenbank — nur das Zurücknehmen entfällt. Bewusst so entschieden:
		   Der Klick ist eine Handlung des Bearbeiters, kein automatischer Reload.
		   Das gilt unabhängig davon, ob der Reload gleich gelingt: Ein Timer, der
		   mitten in den `await` hinein feuert, griffe auf `data.open` zu, während
		   dessen Inhalt gerade unbestimmt ist. */
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
		abgelaufen.clear();

		try {
			await invalidateAll();
		} catch {
			/* Scheitert der Reload, bleibt `neueMeldungen` unverändert (also weiter
			   `true`) — der Hinweis steht dann weiter, und ein zweiter Klick ist der
			   Wiederholungsversuch. Genau deshalb dürfen `done`, `busy` und
			   `letzteEntscheidungId` erst NACH einem erfolgreichen `invalidateAll()`
			   zurückgesetzt werden, nicht davor: Ohne den Reload steht `data.open`
			   unverändert, und die noch angezeigten Undo-Zeilen entsprechen weiterhin
			   dem tatsächlichen Zustand. Der Poller selbst muss dafür nicht neu
			   starten — der Hinweis steht ja bereits, ein laufender Poller könnte
			   daran nichts verbessern. */
			return;
		}

		done = {};
		busy = {};
		letzteEntscheidungId = null;
		neueMeldungen = false;
	}

	/** Welche Positionen noch eine Entscheidung brauchen — Grundlage des Nachrückens. */
	const bedienbar = $derived(
		data.open.map((sighting) => !done[sighting.id] && !abgelaufen.has(sighting.id))
	);

	async function fokussiere(index: number | null) {
		fokusIndex = index;
		if (index === null) return;
		// Erst nach dem Rendern: Nach einer Entscheidung wechselt die Zielkarte
		// gerade ihren Inhalt, und ein Fokus davor landet am alten Knoten.
		await tick();
		kartenElemente[index]?.focus();
	}

	/** Der Fokus ist irgendwo in der Liste angekommen — welche Karte trägt ihn? */
	function fokusAufgenommen(event: FocusEvent) {
		const karte = (event.target as Element | null)?.closest('[data-inbox-index]');
		const index = Number(karte?.getAttribute('data-inbox-index'));
		if (Number.isInteger(index)) fokusIndex = index;
	}

	/**
	 * Verlässt der Fokus die Liste ganz, gibt es keine Karte mehr, auf die A oder
	 * R wirken dürften. `relatedTarget` ist das Element, das den Fokus bekommt —
	 * `null` heißt „gar keines" (Klick ins Leere, Wechsel des Fensters).
	 */
	function fokusAbgegeben(event: FocusEvent) {
		const ziel = event.relatedTarget as Node | null;
		if (ziel && event.currentTarget instanceof Node && event.currentTarget.contains(ziel)) return;
		// Nicht während das Overlay offen ist: Dessen Fokuswechsel darf die Position
		// nicht vergessen, sonst fällt der Fokus beim Schließen ins Nichts.
		if (hilfeOffen) return;
		fokusIndex = null;
	}

	async function entscheidenPerTaste(verdict: Exclude<SightingVerdict, 'reset'>) {
		const index = fokusIndex;
		if (index === null) return;
		const sichtung = data.open[index];
		if (!sichtung || !bedienbar[index]) return;
		await entscheiden(sichtung.id, verdict);
		/* Nachrücken erst nach dem Abschluss und über `bedienbar`: Scheitert der
		   Aufruf, ist die Karte weiter offen — `nextActionableIndex` liefert dann
		   dieselbe Position, und der Fokus bleibt, wo die Arbeit liegt. */
		await fokussiere(nextActionableIndex(bedienbar, index));
	}

	async function rueckgaengigPerTaste() {
		const id = letzteEntscheidungId;
		// Nur innerhalb des Undo-Fensters: Ist der Timer weg, ist die Zeile weg,
		// und ein `reset` würde einen Zustand herstellen, den niemand mehr sieht.
		if (id === null || !timers.has(id)) return;
		await rueckgaengig(id);
		const index = data.open.findIndex((sighting) => sighting.id === id);
		if (index >= 0) await fokussiere(index);
	}

	/**
	 * Beim Schließen wandert der Fokus zurück — auf die Karte, die ihn vorher
	 * hatte, sonst auf den Knopf, der das Overlay geöffnet hat. Ohne das fällt er
	 * auf `<body>`, und die J/K-Position wäre danach unsichtbar.
	 */
	function hilfeSchliessen() {
		hilfeOffen = false;
		if (fokusIndex !== null) void fokussiere(fokusIndex);
		else hinweisKnopf?.focus();
	}

	function aufTaste(event: KeyboardEvent) {
		const aktion = resolveInboxShortcut(event);
		if (!aktion) return;
		if (aktion === 'closeHelp') {
			// Nur schlucken, wenn es etwas zu schließen gab — sonst nimmt die Seite
			// Escape anderen Bedienelementen weg.
			if (!hilfeOffen) return;
			event.preventDefault();
			hilfeSchliessen();
			return;
		}
		event.preventDefault();
		switch (aktion) {
			case 'focusNext':
				void fokussiere(shiftFocusIndex(fokusIndex, data.open.length, 1));
				return;
			case 'focusPrevious':
				void fokussiere(shiftFocusIndex(fokusIndex, data.open.length, -1));
				return;
			case 'approve':
				void entscheidenPerTaste('approve');
				return;
			case 'reject':
				void entscheidenPerTaste('reject');
				return;
			case 'undo':
				void rueckgaengigPerTaste();
				return;
			case 'toggleHelp':
				if (hilfeOffen) hilfeSchliessen();
				else hilfeOffen = true;
				return;
		}
	}

	onDestroy(() => {
		// Ohne dieses Aufräumen feuert ein laufender Undo-Timer nach dem Verlassen
		// der Seite noch invalidateAll() und lädt fremde Routen neu.
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
	});

	async function entscheiden(id: number, verdict: Exclude<SightingVerdict, 'reset'>) {
		if (busy[id]) return;
		busy[id] = true;
		// Vor dem PATCH gemerkt — siehe Kommentar bei `ladeGeneration`.
		const generation = ladeGeneration;
		const ok = await submitVerdict(id, verdict);
		// `busy[id] = false` immer zuerst, unabhängig von der Generation: Ein
		// zurückbleibendes `busy[id] = true` sperrte die Karte dauerhaft, auch wenn
		// das dazwischengekommene `neuLaden()` selbst fehlschlug (Befund 1) und
		// `busy` deshalb NICHT geleert wurde. Den Key in einem frisch geleerten
		// `busy` erneut auf `false` zu setzen ist dagegen folgenlos — das ist von
		// „Key fehlt" nicht zu unterscheiden.
		busy[id] = false;
		if (generation !== ladeGeneration) {
			/* `neuLaden()` ist dazwischengekommen: `timers`/`done` sind bereits
			   abgeräumt (oder ein Reload-Versuch läuft gerade). Ab hier nichts mehr
			   aufbauen — die Entscheidung selbst steht längst auf dem Server, der
			   Reload zeigt sie über `data.open`. */
			return;
		}
		if (!ok) return;
		done[id] = verdict;
		letzteEntscheidungId = id;
		timers.set(
			id,
			setTimeout(async () => {
				timers.delete(id);
				abgelaufen.add(id);
				/* Nur nachladen, wenn kein Undo-Fenster mehr offen ist: `invalidateAll`
				   baut die Liste neu auf und schnitte sonst die noch laufenden Fenster
				   anderer Sichtungen ab (freigeben A, 3 s später B → bei t=8 s wäre
				   B's Undo-Zeile nach 5 s statt 8 s weg). Spart nebenbei die
				   Mehrfach-Reloads beim schnellen Abarbeiten. */
				if (timers.size > 0) return;
				// Endgültig aus der Liste — Server-Daten neu laden hält den Zähler frisch.
				await invalidateAll();
				/* Nach dem Reload sind die abgearbeiteten IDs aus `data.open` heraus;
				   die Merker dürfen weg. Taucht eine ID wider Erwarten wieder auf,
				   erscheint sie so als Karte und nicht als tote Undo-Zeile. */
				for (const erledigteId of abgelaufen) {
					delete done[erledigteId];
					delete busy[erledigteId];
				}
				abgelaufen.clear();
			}, SIGHTING_STATUS_UNDO_MS)
		);
	}

	async function rueckgaengig(id: number) {
		if (busy[id]) return;
		const timer = timers.get(id);
		if (timer) clearTimeout(timer);
		timers.delete(id);
		busy[id] = true;
		// Dieselbe Absicherung wie in `entscheiden()` — Begründung dort.
		const generation = ladeGeneration;
		const ok = await submitVerdict(id, 'reset');
		// Reihenfolge wie in `entscheiden()` — Begründung dort.
		busy[id] = false;
		if (generation !== ladeGeneration) return;
		if (!ok) return;
		delete done[id];
		// Zurückgenommen ist nichts mehr zurückzunehmen — ein zweites U darf nicht
		// dieselbe Sichtung erneut zurücksetzen.
		if (letzteEntscheidungId === id) letzteEntscheidungId = null;
	}

	function sortierungUmschalten() {
		const ziel = data.order === 'asc' ? 'desc' : 'asc';
		const url = new URL(page.url.href);
		url.searchParams.set('order', ziel);
		goto(url, { reset: false });
	}
</script>

<svelte:head>
	<title>Eingang – Verwaltung</title>
</svelte:head>

<svelte:window onkeydown={aufTaste} />

<div class="container mx-auto max-w-3xl px-4 py-6">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-display font-bold">
			Eingang
			<span class="badge badge-outline align-middle">{data.openTotal} offen</span>
		</h1>
		<button type="button" class="btn btn-ghost btn-sm" onclick={sortierungUmschalten}>
			{#if data.order === 'asc'}
				<ArrowUp width="16" height="16" aria-hidden="true" /> Älteste zuerst
			{:else}
				<ArrowDown width="16" height="16" aria-hidden="true" /> Neueste zuerst
			{/if}
		</button>
	</div>

	<!-- `role="status"`/`aria-live="polite"` sitzen am äußeren Container und NICHT
	     am `{#if}` — eine Live-Region muss im Accessibility-Tree stehen, BEVOR sich
	     ihr Inhalt ändert. Entstehen Region und Inhalt gleichzeitig (Container erst
	     mit `neueMeldungen`), bekommen Screenreader die Ansage je nach Browser gar
	     nicht mit, weil es nichts zu beobachten gab, als der Knoten erschien. Der
	     Container bleibt deshalb immer im DOM, nur sein Inhalt ist bedingt. `polite`
	     und nicht `assertive` — die Meldung ist nicht dringend. Bewusst ohne
	     Autofokus: Der Bearbeiter navigiert per J und K, ein Fokussprung würde ihn
	     aus der Arbeit werfen. -->
	<div role="status" aria-live="polite">
		{#if neueMeldungen}
			<div class="alert alert-info mb-4">
				<Info width="20" height="20" class="shrink-0" aria-hidden="true" />
				<span class="grow">Neue Meldungen im Eingang.</span>
				<button type="button" class="btn btn-sm" onclick={neuLaden}>Neu laden</button>
			</div>
		{/if}
	</div>

	<!-- Der Hinweis steht über der Liste und nicht in einem Tooltip: Ein Kürzel,
	     das man erst durch Ausprobieren findet, benutzt niemand. Die Taste selbst
	     ist die Beschriftung des Knopfes, damit Hinweis und Overlay dieselbe
	     Bedienung nennen. -->
	<p class="text-base-content/70 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
		<span>
			Tastatur: <kbd class="kbd kbd-sm">J</kbd> / <kbd class="kbd kbd-sm">K</kbd> blättern,
			<kbd class="kbd kbd-sm">A</kbd> freigeben, <kbd class="kbd kbd-sm">R</kbd> ablehnen
		</span>
		<button
			type="button"
			class="btn btn-ghost btn-xs"
			bind:this={hinweisKnopf}
			onclick={() => (hilfeOffen = true)}
		>
			alle Kürzel <kbd class="kbd kbd-xs">?</kbd>
		</button>
	</p>

	{#if data.pendingPhotoAnnouncements > 0}
		<div class="alert alert-info mb-4">
			<Info width="20" height="20" class="shrink-0" aria-hidden="true" />
			<span>
				{data.pendingPhotoAnnouncements} Meldung(en) mit angekündigtem, noch fehlendem Foto —
				<a class="link" href="/admin/sichtungen?mediaUpload=announced_missing">zur Tabelle</a>
			</span>
		</div>
	{/if}

	{#if data.open.length === 0}
		<div class="border-base-300 rounded-lg border border-dashed p-10 text-center">
			<p class="text-lg font-medium">Alles erledigt</p>
			<p class="text-base-content/70 mt-1 text-sm">Keine offenen Sichtungen.</p>
		</div>
	{:else}
		<!-- Die Fokus-Handler sitzen an der Liste und nicht an jeder Karte: `focusin`
		     und `focusout` steigen auf, und nur hier ist entscheidbar, ob der Fokus
		     die Liste ganz verlassen hat. -->
		<ul class="flex flex-col gap-3" onfocusin={fokusAufgenommen} onfocusout={fokusAbgegeben}>
			{#each data.open as sighting, index (sighting.id)}
				{@const verdict = done[sighting.id]}
				{#if !abgelaufen.has(sighting.id)}
					<!-- Zwei Zusagen an derselben Stelle: `id` ist das Sprungziel für den
					     Rückweg aus der Detailansicht (wer eine Karte öffnet und zurückgeht,
					     steigt an derselben Stelle wieder ein), `tabindex="-1"` macht die
					     Karte für J/K anfokussierbar, ohne sie in die Tab-Reihenfolge zu
					     hängen — dort stehen die Schaltflächen darin, und ein zusätzlicher
					     Halt vor jeder Karte verdoppelte den Weg für alle, die ohne die
					     Kürzel arbeiten. -->
					<li
						bind:this={kartenElemente[index]}
						id={inboxAnchor(sighting.id)}
						data-inbox-index={index}
						tabindex="-1"
						class="inbox-card"
					>
						{#if verdict}
							{@const status = SIGHTING_STATUS_PRESENTATION[verdictToStatus(verdict)]}
							<div class="alert py-2" role="status">
								<span>
									Sichtung #{sighting.id}
									<span class="badge {status.badgeClass}">
										{status.label}
									</span>
								</span>
								<button
									type="button"
									class="btn btn-ghost btn-sm"
									disabled={busy[sighting.id]}
									onclick={() => rueckgaengig(sighting.id)}
								>
									Rückgängig
								</button>
							</div>
						{:else}
							<SightingInboxCard
								{sighting}
								images={data.imagesBySighting[sighting.id] ?? []}
								duplicates={data.duplicatesBySighting[sighting.id] ?? []}
								order={data.order}
								reporterHistory={data.reporterHistoryBySighting[sighting.id] ?? null}
								busy={busy[sighting.id] ?? false}
								onApprove={() => entscheiden(sighting.id, 'approve')}
								onReject={() => entscheiden(sighting.id, 'reject')}
							/>
						{/if}
					</li>
				{/if}
			{/each}
		</ul>
		{#if data.openTotal > data.open.length}
			<p class="text-base-content/70 mt-4 text-center text-sm">
				{data.open.length} von {data.openTotal} offenen Sichtungen angezeigt — die Liste füllt sich beim
				Abarbeiten nach.
			</p>
		{/if}
	{/if}
</div>

{#if hilfeOffen}
	<!-- `hilfeSchliessen` und nicht `hilfeOffen = false`: Knopf und Hintergrund
	     brauchen denselben Fokus-Rückweg wie Escape. Sonst bliebe die gemerkte
	     Position gesetzt, ohne dass eine Karte den Fokus sichtbar trägt — A und R
	     wirkten dann auf eine Karte, die niemand sieht. -->
	<InboxShortcutHelp onClose={hilfeSchliessen} />
{/if}

<style>
	/* Der Fokus-Ring gehört an die Karte selbst: Bei J/K ist sie das bewegte
	   Element, und ohne sichtbaren Ring wüsste niemand, welche Meldung ein
	   folgendes A entscheidet. Maße und Farbe aus den Tokens.

	   `:has(:focus-visible)` gehört dazu, weil der Fokus per Tab auch auf einer
	   Schaltfläche *innerhalb* der Karte landet — A wirkt dann auf diese Karte,
	   und der Ring muss das zeigen. */
	.inbox-card:focus-visible,
	.inbox-card:has(:global(:focus-visible)) {
		outline: 3px solid var(--color-primary);
		outline-offset: 3px;
		border-radius: var(--radius-box);
	}
</style>
