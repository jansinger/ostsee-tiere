<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import {
		SIGHTING_STATUS_ORDER,
		SIGHTING_STATUS_PRESENTATION,
		type SightingStatus
	} from './sightingStatus';
	import type { SightingVerdict } from './sightingVerdict';

	interface Props {
		status: SightingStatus;
		/** Macht den Gruppennamen eindeutig — mehrere Controls je Seite. */
		sightingId: number;
		busy?: boolean;
		/** `sm` für die Tabellenspalte (nur Icons), `md` für Karten und Detailansicht. */
		size?: 'sm' | 'md';
		/**
		 * Zusätzliche Eindeutigkeit für den Gruppennamen, wenn dieselbe Sichtung
		 * gleichzeitig in zwei Layouts im DOM steht (`/admin/sichtungen`:
		 * Mobilkarte UND Desktop-Tabelle, nur per CSS getrennt). HTML-Radios mit
		 * demselben `name` bilden EINE Auswahlgruppe über das ganze Dokument,
		 * unabhängig vom umschließenden `fieldset` — ohne diesen Zusatz hob das
		 * später gerenderte Control (die Tabelle) den `checked`-Zustand der
		 * Mobilkarte silent auf. Aufgefallen an
		 * `statusColumn.svelte.test.ts`, das dieselbe Sichtung in beiden
		 * Bereichen prüft.
		 */
		groupSuffix?: string;
		onchange: (verdict: SightingVerdict) => void;
	}

	let {
		status,
		sightingId,
		busy = false,
		size = 'md',
		groupSuffix = '',
		onchange
	}: Props = $props();

	const groupName = $derived(`sighting-status-${sightingId}${groupSuffix}`);

	/**
	 * Lokaler, beschreibbarer Spiegel des `status`-Props für `bind:group`
	 * unten — nötig, weil `status` selbst als Prop nicht zuverlässig
	 * "ankommt". **Präzisierte Ursache (Review, siehe Docblock in
	 * `AdminSightingView.svelte` an der Aufrufstelle):** Der Aufrufer
	 * berechnet `status` über ein `{@const}`, das Svelte 5 zu einem
	 * `$derived` kompiliert. Ein `$derived` benachrichtigt seine Konsumenten
	 * nur, wenn sein **neuer Wert vom vorherigen abweicht** — beim Sprung
	 * von einer offenen auf eine andere offene Sichtung im
	 * Warteschlangen-Modus bleibt der Wert aber `'open'` → `'open'`. Die
	 * Write-Version wird nicht erhöht, also läuft weder der `status`-Prop
	 * dieser Komponente noch ein davon abhängiger `$effect` erneut — und
	 * zwar unabhängig davon, ob als Konsument ein `checked={active}` (das
	 * ursprüngliche, unkontrollierte Attribut) oder ein `bind:group` steht.
	 * `bind:group` allein löst das Problem also **nicht**; siehe die zweite
	 * Begründung unten, warum es trotzdem bleibt.
	 *
	 * **Widerlegt:** dass `currentSighting` in `AdminSightingView.svelte`
	 * hängen bliebe, oder dass der `{#await data.sighting}` in
	 * `+layout.svelte` beteiligt wäre — beide gemessen und ausgeschlossen.
	 * `sightingId` (ein garantiert unterschiedlicher Wert je Sichtung) kommt
	 * im DOM bereits korrekt an (`name`-Attribut), nur der wertgleiche
	 * `status` nicht.
	 *
	 * **Der Fix hängt deshalb bewusst NICHT an `status` selbst**, sondern
	 * erzwingt die Neusynchronisierung unten über zwei Signale, die niemals
	 * wertgleich "kollabieren" können:
	 *
	 * - `sightingId` ändert sich bei jedem Sprung garantiert. Ihn im Effekt
	 *   zu lesen erzwingt dessen erneuten Lauf, unabhängig davon, ob der
	 *   frisch gelesene `status` zufällig mit dem alten übereinstimmt.
	 * - Der Übergang von `busy: true` auf `busy: false` markiert das Ende
	 *   eines Verdict-Versuchs — Erfolg **und** Fehlschlag. Ohne dieses
	 *   zweite Signal bliebe `selected` nach einem gescheiterten
	 *   `submitVerdict` (kein Sprung, `sightingId` unverändert) auf dem
	 *   optimistisch angeklickten Wert stehen, obwohl der Server nichts
	 *   übernommen hat — die Fläche zeigte dann "Freigegeben" für eine
	 *   weiterhin offene Sichtung (siehe Test unten).
	 *
	 * Der Effekt reagiert bewusst NICHT auf die steigende Flanke von `busy`
	 * (`false` → `true`, der Moment des Klicks): Sonst überschriebe die
	 * Synchronisierung die gerade per `bind:group` gesetzte, optimistische
	 * Auswahl, noch bevor die Anfrage überhaupt losgeschickt wurde.
	 *
	 * **Warum `bind:group` + `$state` trotzdem bleibt, statt auf das
	 * ursprüngliche `checked={active}` zurückzugehen:** `bind:group`
	 * schreibt den DOM-Zustand beim Klick sofort und zweiwegig — das ist die
	 * einzige Stelle, an der die Komponente überhaupt "weiß", was der Nutzer
	 * gerade angeklickt hat (für die optimistische Anzeige während der
	 * laufenden Anfrage). Ein reines `checked={active}` hätte dafür keinen
	 * Mechanismus, unabhängig vom Gleichheits-Gate.
	 */
	let selected = $state(untrack(() => status));
	/** Zuletzt synchronisierte `sightingId` — Vergleichsbasis für den Effekt unten. */
	let letzteSyncSightingId = untrack(() => sightingId);
	/** Zuletzt gesehener `busy`-Wert — Vergleichsbasis, um nur die fallende Flanke zu erkennen. */
	let warZuvorBusy = untrack(() => busy);
	$effect(() => {
		const istBusy = busy;
		const aktuelleSightingId = sightingId;
		const verdictAbgeschlossen = warZuvorBusy && !istBusy;
		const sprungZuAndererSichtung = aktuelleSightingId !== letzteSyncSightingId;
		warZuvorBusy = istBusy;
		letzteSyncSightingId = aktuelleSightingId;
		/* Der dritte Zweig ist der Auffangfall und kein Beiwerk: Die beiden
		   ersten setzen voraus, dass jede Statusänderung entweder die Sichtung
		   wechselt oder durch `busy` läuft. Das trifft für die heutigen drei
		   Aufrufstellen zu — `busy` ist aber ein optionales Prop mit Default
		   `false`. Eine künftige Aufrufstelle, die es weglässt, bekäme sonst
		   ein Control, dessen Farbe nach dem ersten Klick dauerhaft von den
		   Daten abweicht, ohne dass irgendwo etwas bricht. Ausgenommen bleibt
		   die laufende Anfrage: Dort ist die Abweichung die beabsichtigte
		   optimistische Anzeige. */
		/* `selected` wird hier per `untrack` gelesen: Der Effekt schreibt es
		   selbst, eine Abhängigkeit darauf machte ihn von sich selbst abhängig. */
		const datenHabenSichGeaendert = !istBusy && status !== untrack(() => selected);
		if (sprungZuAndererSichtung || verdictAbgeschlossen || datenHabenSichGeaendert) {
			selected = status;
		}
	});

	function select(target: SightingStatus): void {
		/**
		 * Bewusst kein `target === status`-Vergleich: Ein erneuter Klick auf ein
		 * bereits gewähltes Radio feuert in keinem Browser ein `change` — die
		 * Wache wäre über den DOM nie erreichbar. Schlimmer, sie würde nach einem
		 * fehlgeschlagenen Wechsel genau die Korrektur verschlucken: Scheitert
		 * `submitVerdict`, lädt die aufrufende Seite nicht neu, das Radio steht
		 * im DOM auf dem neuen Wert, `status` bleibt auf dem alten — ein Klick auf
		 * das ursprüngliche Segment müsste dann durchgehen.
		 */
		if (busy) return;
		onchange(SIGHTING_STATUS_PRESENTATION[target].verdict);
	}

	/**
	 * Die Flächenfarbe des aktiven Segments. Vollständige Klassennamen statt
	 * `btn-${…}`: Tailwind 4 erzeugt eine Utility nur, wenn ihr Name als
	 * kompletter String im Quelltext steht (`.claude/rules/daisyui.md`).
	 */
	const ACTIVE_CLASS: Record<SightingStatus, string> = {
		open: 'btn-warning',
		approved: 'btn-success',
		rejected: 'btn-neutral'
	};
</script>

<fieldset class="join" aria-labelledby={`${groupName}-legend`} role="radiogroup">
	<legend id={`${groupName}-legend`} class="sr-only">Status</legend>
	{#each SIGHTING_STATUS_ORDER as option (option)}
		{@const presentation = SIGHTING_STATUS_PRESENTATION[option]}
		<!-- Gegen `selected`, nicht gegen `status`: `status` ist genau das
		     wertgleiche Prop, dessen Gleichheits-Gate den ganzen Fehler
		     verursacht (Docblock oben an `selected`) — dagegen zu vergleichen
		     brächte den ursprünglichen Advance-Bug zurück. `selected` ist die
		     Stelle, an der dieses Gate bereits aufgelöst ist: Der `$effect`
		     oben synchronisiert es zuverlässig bei jedem Sprung (`sightingId`)
		     UND nach jedem abgeschlossenen Verdict-Versuch, Erfolg wie
		     Fehlschlag (`busy`-Flanke) — Letzteres ist neu und schließt die
		     Regression, bei der ein gescheitertes `submitVerdict` die Fläche
		     auf dem optimistisch angeklickten Segment stehen ließ. -->
		{@const active = option === selected}
		<label
			class="btn join-item {size === 'sm' ? 'btn-sm' : ''} {active
				? ACTIVE_CLASS[option]
				: 'btn-ghost'}"
			title={presentation.description}
		>
			<input
				type="radio"
				class="sr-only"
				name={groupName}
				value={option}
				bind:group={selected}
				disabled={busy}
				aria-label={presentation.label}
				onchange={() => select(option)}
			/>
			<Icon icon={presentation.icon} width="16" height="16" aria-hidden="true" />
			{#if size === 'md'}
				<span>{presentation.label}</span>
			{/if}
		</label>
	{/each}
</fieldset>
