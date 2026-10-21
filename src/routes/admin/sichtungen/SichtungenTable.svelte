<!--
	Tabelle der Sichtungen — die weite Variante von `/admin/sichtungen`, samt
	Bulk-Leiste, Spaltenkonfiguration und fixiertem Status/Aktions-Bereich.

	Sie steht als eigene Komponente neben `SichtungenCards.svelte`, damit die
	Umschaltung zwischen beiden an genau einer Stelle hängt (`layoutSwitch.ts`).
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import StatusBlock from '#lib/components/StatusBlock.svelte';
	import { DEAD_FINDING_PRESENTATION, isDeadFinding } from '#lib/components/admin/deadFinding.ts';
	import SightingActionsMenu from '#lib/components/admin/SightingActionsMenu.svelte';
	import SightingStatusControl from '#lib/components/admin/SightingStatusControl.svelte';
	import {
		getSightingStatus,
		SIGHTING_STATUS_PRESENTATION,
		type SightingStatus
	} from '#lib/components/admin/sightingStatus.ts';
	import type { SightingVerdict } from '#lib/components/admin/sightingVerdict.ts';
	import {
		getSpamRisk,
		SPAM_RISK_PRESENTATION
	} from '#lib/components/admin/spamScorePresentation.ts';
	import { getAnimalBehaviorLabel } from '#lib/report/formOptions/animalBehavior.ts';
	import { getDistanceLabel } from '#lib/report/formOptions/distance.ts';
	import { getDistributionLabel } from '#lib/report/formOptions/distribution.ts';
	import { getSeaStateLabel } from '#lib/report/formOptions/seaState.ts';
	import { getSpeciesLabel } from '#lib/report/formOptions/species.ts';
	import { getVisibilityLabel } from '#lib/report/formOptions/visibility.ts';
	import { getWindStrengthLabel } from '#lib/report/formOptions/windStrength.ts';
	import type { SichtungenListRow } from './listColumns';
	import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
	import {
		BALTIC_SEA_STATUS_PRESENTATION,
		getBalticSeaStatus
	} from '#lib/utils/geo/balticSeaStatus.ts';
	import { setAllSelected, toggleSelection, type BulkHeaderState } from './bulkSelection';
	import type { ColumnVisibility } from './columns';
	import { describeEmptyList } from './emptyList';
	import { NUR_WEIT_BLOCK } from './layoutSwitch';
	import { naechsteRichtung, resolveSort, type SortColumn } from './sortParams';

	interface Props {
		sightings: SichtungenListRow[];
		/** Steuert nur das Bedienelement — das Gate steht zusätzlich am Endpunkt. */
		isSuperAdmin: boolean;
		columnVisibility: ColumnVisibility;
		/** Auswahl der aktuell sichtbaren Seite; die Bulk-Aktionen liegen beim Elternteil. */
		selectedIds: number[];
		headerState: BulkHeaderState;
		bulkPending: boolean;
		bulkProgress: { done: number; total: number } | null;
		/** Ids, deren Statuswechsel gerade läuft (je Zeile, nicht global). */
		statusPending: ReadonlySet<number>;
		/** Entscheidet den Wortlaut des Leer-Zustands (`emptyList.ts`). */
		hasActiveFilters: boolean;
		onresetfilters: () => void;
		onbulk: (verdict: SightingVerdict) => void;
		onview: (sighting: SichtungenListRow) => void;
		ontestemail: (id: number) => void;
		onspamcheck: (id: number) => void;
		ondelete: (sighting: SichtungenListRow) => void;
		onstatuschange: (id: number, verdict: SightingVerdict, previous: SightingStatus) => void;
	}

	let {
		sightings,
		isSuperAdmin,
		columnVisibility,
		selectedIds = $bindable(),
		headerState,
		bulkPending,
		bulkProgress,
		statusPending,
		hasActiveFilters,
		onresetfilters,
		onbulk,
		onview,
		ontestemail,
		onspamcheck,
		ondelete,
		onstatuschange
	}: Props = $props();

	let visibleIds = $derived(sightings.map((sighting) => sighting.id));

	let emptyText = $derived(describeEmptyList(hasActiveFilters));

	/* Zwei feste Spalten plus die eingeschalteten; Herleitung am `colspan` im Markup. */
	let spaltenAnzahl = $derived(2 + Object.values(columnVisibility).filter(Boolean).length);

	/* Gemessene Breite der Aktionsspalte — die Statusspalte rastet links davon
	   ein. Ein fester Wert ginge nicht: die Zahl der Aktions-Buttons hängt an
	   `isSuperAdmin`, und der Spaltenkopf trägt dieselbe Breite wie die Zellen
	   darunter (gleiche Tabellenspalte). Bleibt bewusst komponentenlokal — beide
	   Seiten der Messung stehen in dieser Datei. */
	let actionsColumnWidth = $state(0);
	/* Ohne Aktionsspalte gehört die Statusspalte selbst an den Rand — sonst
	   bliebe die zuletzt gemessene Breite als Lücke stehen. */
	let stickyStatusRight = $derived(columnVisibility.actions ? actionsColumnWidth : 0);

	/* `indeterminate` ist eine reine DOM-Eigenschaft ohne HTML-Attribut — als
	   `indeterminate={…}` im Markup wäre nicht verlässlich, dass Svelte sie als
	   Property und nicht als Attribut setzt. Deshalb explizit über eine
	   Referenz. */
	let headerCheckbox = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (headerCheckbox) headerCheckbox.indeterminate = headerState === 'partial';
	});

	/* Die wirksame Sortierung, nicht der rohe Query-Parameter: Beim ersten
	   Aufruf steht in der URL nichts, sortiert ist die Liste trotzdem
	   (`sortParams.ts`). */
	let sort = $derived(resolveSort(page.url.searchParams));

	function updateSort(column: SortColumn): void {
		const url = new URL(page.url.href);
		url.searchParams.set('sort', column);
		url.searchParams.set('order', naechsteRichtung(sort, column));
		/* Die Seitenzahl ist eine Position in *einer* Reihenfolge und überlebt
		   deren Wechsel nicht: Wer auf Seite 7 umsortiert, landete in der Mitte
		   der neuen Sortierung — an einer Stelle, die mit dem gerade Gesuchten
		   nichts zu tun hat. `perPage` bleibt dagegen stehen, das ist eine
		   Einstellung und keine Position. */
		url.searchParams.delete('page');
		goto(url);
	}
</script>

<!-- Sortierbarer Spaltenkopf: <button> im <th> mit aria-sort für Screenreader.
     Der Pfeil steht an der aktiven Spalte auch dann, wenn sie nur die Vorgabe
     des Loaders ist — sonst sähe der erste Aufruf unsortiert aus. Die
     Richtungsangabe im aria-label wiederholt ihn für Screenreader: `aria-sort`
     am <th> wird von den Browsern nicht überall an den Knopf durchgereicht,
     und das Zeichen selbst ist als Vorlesetext nutzlos. -->
{#snippet sortableTh(label: string, key: SortColumn)}
	{@const isActive = sort.column === key}
	{@const isDesc = sort.order === 'desc'}
	<th class="p-0" aria-sort={isActive ? (isDesc ? 'descending' : 'ascending') : 'none'}>
		<button
			type="button"
			class="hover:bg-base-300 flex w-full items-center gap-1 px-4 py-3 text-left font-semibold"
			aria-label={isActive
				? `${label}, sortiert ${isDesc ? 'absteigend' : 'aufsteigend'} — Richtung umkehren`
				: `Nach ${label} sortieren`}
			onclick={() => updateSort(key)}
		>
			{label}
			{#if isActive}
				<span aria-hidden="true">{isDesc ? '↓' : '↑'}</span>
			{:else}
				<!-- Affordance im Ruhezustand: ohne sie war ein sortierbarer Kopf von
				     einem reinen Textkopf nicht zu unterscheiden — der Richtungspfeil
				     stand nur an der aktiven Spalte. -->
				<Icon
					icon="lucide:chevrons-up-down"
					class="text-base-content/70 h-3 w-3"
					aria-hidden="true"
				/>
			{/if}
		</button>
	</th>
{/snippet}

<div class="{NUR_WEIT_BLOCK} px-2 md:px-4">
	<!--
		Aktionsleiste der Bulk-Auswahl. Sie erscheint nur bei Auswahl > 0 und steht
		über der Tabelle, nicht als schwebender Balken: Bezugspunkt sind die
		Checkboxen darunter, und ein Overlay verdeckte auf kurzen Listen die
		erste Zeile.
		„Freigeben" ist hier `btn-primary`, obwohl „Export" im Seitenkopf ebenfalls
		primär ist — die Leiste ist ein eigener, temporärer Handlungsbereich mit
		genau einer Primäraktion (Button-Hierarchie: eine pro Bereich). „Ablehnen"
		bleibt `btn-outline`, „Auswahl aufheben" als reine Rücknahme `btn-ghost`.
		`disabled` und nicht `aria-disabled` während des Laufs — mit offenem
		Vorbehalt: Der Lauf ist bei vielen Zeilen NICHT kurz, Tastaturnutzer
		verlieren für seine Dauer den Fokus. Trotzdem `disabled`, weil ein frei
		fokussierbarer Knopf während eines Laufs, der gerade dutzende Zeilen
		schreibt, Bedienbarkeit behauptete, die es nicht gibt — der Wächter hinter
		`onbulk` wiese den Klick nur still ab; den Zustand erklärt die
		aria-live-Fortschrittsanzeige daneben. Ein Doppelklick hätte hier echte
		Folgen.
	-->
	{#if selectedIds.length > 0}
		<div
			class="bg-base-200 border-base-300 mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3"
			role="group"
			aria-label="Aktionen für die ausgewählten Sichtungen"
		>
			<span class="font-semibold">{selectedIds.length} ausgewählt</span>
			{#if bulkProgress}
				<span class="text-base-content/70 flex items-center gap-2 text-sm" aria-live="polite">
					<span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
					{bulkProgress.done}/{bulkProgress.total} verarbeitet
				</span>
			{/if}
			<div class="ml-auto flex flex-wrap items-center gap-2">
				<button
					class="btn btn-sm btn-primary"
					onclick={() => onbulk('approve')}
					disabled={bulkPending}
				>
					<Icon icon={SIGHTING_STATUS_PRESENTATION.approved.icon} class="mr-1 h-4 w-4" />
					Freigeben
				</button>
				<button
					class="btn btn-sm btn-outline"
					onclick={() => onbulk('reject')}
					disabled={bulkPending}
				>
					<Icon icon={SIGHTING_STATUS_PRESENTATION.rejected.icon} class="mr-1 h-4 w-4" />
					Ablehnen
				</button>
				<button
					class="btn btn-sm btn-ghost"
					onclick={() => (selectedIds = [])}
					disabled={bulkPending}
				>
					Auswahl aufheben
				</button>
			</div>
		</div>
	{/if}
	<div class="border-base-300 bg-base-100 shadow-raised w-full overflow-x-auto rounded-lg border">
		<table class="table-zebra table w-full">
			<thead class="bg-base-200 text-base-content">
				<tr>
					<!-- Die Totfund-Kante sitzt an DIESER Spalte, nicht mehr an der
					     Markerspalte daneben: Dort lag sie zwischen Checkbox und Icon und
					     las sich als Trennstrich der Auswahlspalte statt als Auszeichnung
					     der Zeile — eine „linke Kante", die seit Einführung der Auswahl
					     gar nicht mehr links war. Sie steht weiter an einer Zelle und
					     nicht am `<tr>`: unter `border-collapse` entscheidet dort sonst
					     die Konfliktauflösung der Nachbarkanten, ob sie gezeichnet wird.

					     `border-l-error` und nicht `border-error`: Letzteres färbt ALLE
					     vier Kanten. DaisyUIs Zeilentrenner steht in `:where()` ohne
					     Spezifität und verliert dagegen — die untere Zellkante lief damit
					     rot weiter und sah aus wie ein Rendering-Fehler.

					     Die 4px trägt jede Zeile, im Normalfall transparent. Sonst
					     wanderte die Spalte bei jeder Totfund-Zeile um 4px nach rechts.

					     Auswahlspalte, ganz links und wie die Markerspalte daneben fest:
					     Sie steht bewusst nicht in `AVAILABLE_COLUMNS`. Abschaltbar wäre die
					     Bulk-Funktion je nach gespeicherter Spaltenwahl unerreichbar — und
					     der gespeicherte Stand überlebt seit U2 den Reload.
					     Nicht `sticky-col`: Der fixierte Bereich liegt rechts (Status,
					     Aktionen); eine zweite fixierte Kante links stahl auf schmalen
					     Fenstern zusätzlich Platz vom scrollenden Mittelteil. -->
					<th class="select-col w-px border-l-4 border-l-transparent px-2 py-0">
						<label class="target-exempt flex cursor-pointer justify-center">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								bind:this={headerCheckbox}
								checked={headerState === 'all'}
								disabled={bulkPending}
								onchange={(e) =>
									(selectedIds = setAllSelected(visibleIds, e.currentTarget.checked))}
								aria-label="Alle Sichtungen auf dieser Seite auswählen"
							/>
						</label>
					</th>
					<!-- Feste Markerspalte, nicht in der Spaltenauswahl: Sie steht vor
					     allen konfigurierbaren Spalten und überlebt damit sowohl jede
					     Spaltenwahl als auch das horizontale Scrollen der Tabelle. -->
					<!-- „Tot" statt eines `sr-only`-Titels: Die Spalte war für Sehende
					     unbeschriftet, das Icon darunter musste sich damit selbst
					     erklären. Kurz gehalten, weil die Spalte nur ein 16px-Icon breit
					     ist — „Totfund" (die Beschriftung des Badges, `deadFinding.ts`)
					     verdoppelte ihre Breite für eine Spalte, die in den meisten Zeilen
					     leer bleibt. Das Wort im Klartext steht weiter am Icon selbst. -->
					<th class="w-px px-2 text-center">Tot</th>
					<!-- Kein `hover:bg-base-300` an den nicht sortierbaren Köpfen: Die
					     Aufhellung unter dem Zeiger versprach eine Sortierung, die es hier
					     nicht gibt — sortierbare Köpfe tragen sie am <button> in `sortableTh`. -->
					{#if columnVisibility.referenceId}
						<th>Referenz-ID</th>
					{/if}
					{#if columnVisibility.sightingDate}
						{@render sortableTh('Sichtungsdatum', 'sightingDate')}
					{/if}
					{#if columnVisibility.created}
						{@render sortableTh('Meldedatum', 'created')}
					{/if}
					{#if columnVisibility.email}
						{@render sortableTh('E-Mail', 'email')}
					{/if}
					{#if columnVisibility.species}
						{@render sortableTh('Tierart', 'species')}
					{/if}
					{#if columnVisibility.distance}
						{@render sortableTh('Entfernung', 'distance')}
					{/if}
					{#if columnVisibility.totalCount}
						{@render sortableTh('Anzahl', 'totalCount')}
					{/if}
					{#if columnVisibility.juvenileCount}
						{@render sortableTh('Jung', 'juvenileCount')}
					{/if}
					{#if columnVisibility.distribution}
						{@render sortableTh('Verteilung', 'distribution')}
					{/if}
					{#if columnVisibility.behavior}
						{@render sortableTh('Verhalten', 'behavior')}
					{/if}
					{#if columnVisibility.seaState}
						{@render sortableTh('Seegang', 'seaState')}
					{/if}
					{#if columnVisibility.wind}
						{@render sortableTh('Wind', 'wind')}
					{/if}
					{#if columnVisibility.visibility}
						{@render sortableTh('Sichtweite', 'visibility')}
					{/if}
					{#if columnVisibility.mediaUpload}
						<th>Aufnahme</th>
					{/if}
					{#if columnVisibility.spamScore}
						{@render sortableTh('Spam', 'spamScore')}
					{/if}
					{#if columnVisibility.balticSea}
						<th>Ostsee</th>
					{/if}
					<!-- Status und Aktionen bleiben beim horizontalen Scrollen stehen: Sie
					     sind der Grund, aus dem die Tabelle geöffnet wird, standen aber bei
					     vielen aktiven Spalten außerhalb des Viewports. Die Trennkante an der
					     linken Sticky-Zelle macht sichtbar, dass hier ein fixierter Bereich
					     beginnt — ohne sie sieht der Durchlauf darunter nach einem Fehler aus. -->
					{#if columnVisibility.verified}
						<th class="sticky-col sticky-edge" style="right: {stickyStatusRight}px">Status</th>
					{/if}
					{#if columnVisibility.actions}
						<th
							class="sticky-col {columnVisibility.verified ? '' : 'sticky-edge'}"
							style="right: 0"
							bind:clientWidth={actionsColumnWidth}
						>
							Aktionen
						</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each sightings as sighting (sighting.id)}
					<tr class="hover:bg-base-200" data-sighting-id={sighting.id}>
						<!-- Auswahl-Checkbox, Gegenstück zur Kopfspalte oben. Das `aria-label`
						     nennt die Referenz-ID und nicht nur „Zeile 3": Beim Vorlesen ist
						     die Nummer der Meldung das, woran die Zeile erkennbar ist. -->
						<td
							class="select-col w-px border-l-4 px-2 py-0 {isDeadFinding(sighting.isDead)
								? 'border-l-error'
								: 'border-l-transparent'}"
						>
							<label class="target-exempt flex cursor-pointer justify-center">
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={selectedIds.includes(sighting.id)}
									disabled={bulkPending}
									onchange={() => (selectedIds = toggleSelection(selectedIds, sighting.id))}
									aria-label="Sichtung {sighting.referenceId ?? sighting.id} auswählen"
								/>
							</label>
						</td>
						<!-- Nur noch das Icon: Die rote Kante sitzt seit dem Umbau eine
						     Zelle weiter links, an der Auswahlspalte (Begründung dort).
						     Das Icon bleibt trotzdem — Farbe allein wäre kein Merkmal
						     (WCAG 1.4.1). Der `sr-only`-Text benennt es, sonst bliebe die
						     Zelle für Screenreader leer. -->
						<td class="w-px p-0">
							{#if isDeadFinding(sighting.isDead)}
								<span class="flex items-center justify-center px-2">
									<Icon
										icon={DEAD_FINDING_PRESENTATION.icon}
										class="text-error h-4 w-4"
										aria-hidden="true"
									/>
									<span class="sr-only">{DEAD_FINDING_PRESENTATION.label}</span>
								</span>
							{/if}
						</td>
						{#if columnVisibility.referenceId}
							<td>
								{#if sighting.referenceId}
									<a
										href="/admin/ref/{sighting.referenceId}"
										class="link link-primary link-hover font-mono"
									>
										{sighting.referenceId}
									</a>
								{:else}
									<span class="text-base-content/70">—</span>
								{/if}
							</td>
						{/if}
						{#if columnVisibility.sightingDate}
							<td>{formatLocalDateTime(sighting.sightingDate)}</td>
						{/if}
						{#if columnVisibility.created}
							<td>{formatLocalDateTime(sighting.created)}</td>
						{/if}
						{#if columnVisibility.email}
							<td>
								<a
									href="mailto:{sighting.email}"
									class="link link-primary link-hover block max-w-32 truncate"
								>
									{sighting.email}
								</a>
							</td>
						{/if}
						{#if columnVisibility.species}
							<td>{getSpeciesLabel(sighting.species)}</td>
						{/if}
						{#if columnVisibility.distance}
							<td>{getDistanceLabel(sighting.distance)}</td>
						{/if}
						{#if columnVisibility.totalCount}
							<td>{sighting.totalCount}</td>
						{/if}
						{#if columnVisibility.juvenileCount}
							<td>{sighting.juvenileCount || '—'}</td>
						{/if}
						{#if columnVisibility.distribution}
							<td>{getDistributionLabel(sighting.distribution)}</td>
						{/if}
						{#if columnVisibility.behavior}
							<td>{getAnimalBehaviorLabel(sighting.behavior) || '—'}</td>
						{/if}
						{#if columnVisibility.seaState}
							<td>{getSeaStateLabel(sighting.seaState) || '—'}</td>
						{/if}
						{#if columnVisibility.wind}
							<td
								>{getWindStrengthLabel(
									sighting.windForce ? Number(sighting.windForce) : undefined
								) || '—'}</td
							>
						{/if}
						{#if columnVisibility.visibility}
							<td>{getVisibilityLabel(sighting.visibility) || '—'}</td>
						{/if}
						{#if columnVisibility.mediaUpload}
							<td class="text-center">
								{#if sighting.mediaUpload}
									<span class="badge badge-success badge-sm">Ja</span>
								{:else}
									<span class="badge badge-ghost badge-sm">Nein</span>
								{/if}
							</td>
						{/if}
						{#if columnVisibility.spamScore}
							{@const spam = SPAM_RISK_PRESENTATION[getSpamRisk(sighting.spamScore)]}
							{@const spamIndicators = Array.isArray(sighting.spamIndicators)
								? (sighting.spamIndicators as string[])
								: []}
							<td class="text-center">
								{#if !spam.badgeClass}
									<!-- NULL heißt „nie bewertet" (Altbestand, Legacy-Eingang) —
									     bewusst kein Badge, sonst läse es sich wie „geprüft, sauber".
									     Der Gedankenstrich allein sagt am Screenreader gar nichts, und
									     das `title` ist dort nicht verlässlich erreichbar — deshalb
									     trägt hier die sr-only-Fassung die ganze Aussage. -->
									<span class="text-base-content/70" title={spam.description} aria-hidden="true"
										>—</span
									>
									<span class="sr-only">{spam.label} — {spam.description}</span>
								{:else}
									<span
										class="badge badge-sm whitespace-nowrap {spam.badgeClass}"
										title={spamIndicators.length > 0 ? spamIndicators.join(', ') : spam.description}
									>
										<Icon icon={spam.icon} width="14" height="14" aria-hidden="true" />
										{sighting.spamScore}
										<!-- title ist nur per Maus erreichbar — derselbe Text
										     zusätzlich für Screenreader. -->
										<span class="sr-only">
											{spam.label}{spamIndicators.length > 0
												? ` — Spam-Indikatoren: ${spamIndicators.join(', ')}`
												: ''}
										</span>
									</span>
								{/if}
							</td>
						{/if}
						{#if columnVisibility.balticSea}
							{@const balticSea = BALTIC_SEA_STATUS_PRESENTATION[getBalticSeaStatus(sighting)]}
							<td class="text-center">
								<!-- whitespace-nowrap: „ohne Position" bricht in der schmalen Spalte sonst
								     um und läuft aus dem Badge heraus, der Rahmen schneidet durch den Text. -->
								<span
									class="badge badge-sm {balticSea.badgeClass} whitespace-nowrap"
									title={balticSea.title}
								>
									{balticSea.label}
								</span>
							</td>
						{/if}
						{#if columnVisibility.verified}
							{@const status = getSightingStatus({
								approvedAt: sighting.approvedAt,
								rejectedAt: sighting.rejectedAt
							})}
							<td class="sticky-col sticky-edge" style="right: {stickyStatusRight}px">
								<SightingStatusControl
									{status}
									sightingId={sighting.id}
									size="sm"
									busy={statusPending.has(sighting.id)}
									onchange={(verdict) => onstatuschange(sighting.id, verdict, status)}
								/>
							</td>
						{/if}
						{#if columnVisibility.actions}
							<td
								class="sticky-col w-px whitespace-nowrap {columnVisibility.verified
									? ''
									: 'sticky-edge'}"
								style="right: 0"
							>
								<!-- flex-nowrap: sonst brechen die 44px hohen Buttons um und ziehen die Zeile auf -->
								<div class="flex flex-nowrap items-center gap-1">
									<button
										class="btn btn-ghost btn-xs"
										onclick={() => onview(sighting)}
										title="Details anzeigen"
										aria-label="Details anzeigen"
									>
										<Icon icon="lucide:eye" class="h-4 w-4" />
									</button>
									<!-- Spam-Check, Test-Mail und Löschen stehen seit 2026-08-10 im
									     Overflow-Menü statt als eigene Buttons (Entscheidung Jan nach dem
									     UX-Review): 50 rot umrandete Löschen-Buttons pro Seite waren das
									     auffälligste Element der Tabelle — für die seltenste Aktion,
									     direkt neben dem täglich benutzten Status-Control. Sichtbar
									     bleiben Ansehen und der Statuswechsel. Begründung der
									     Popover-Technik im Kopf der Komponente. -->
									<SightingActionsMenu
										menuId="aktionen-tabelle-{sighting.id}"
										label="Weitere Aktionen zu Sichtung {sighting.referenceId ?? sighting.id}"
										{isSuperAdmin}
										size="xs"
										onspamcheck={() => onspamcheck(sighting.id)}
										ontestemail={() => ontestemail(sighting.id)}
										ondelete={() => ondelete(sighting)}
									/>
								</div>
							</td>
						{/if}
					</tr>
				{:else}
					<!-- Die Meldung steht IN der Tabelle und nicht darunter: Der
					     Spaltenkopf bleibt damit stehen, und die Aussage steht an der
					     Stelle, an der die Daten stünden (`StatusBlock`, Kopfkommentar).
					     Wortlaut aus `emptyList.ts`, gemeinsam mit der Kartenliste.

					     `spaltenAnzahl` sind die zwei festen Spalten (Auswahl,
					     Totfund-Marker) plus jede eingeschaltete konfigurierbare Spalte.
					     `ColumnVisibility` bildet die `<th>` des Kopfes eins zu eins ab —
					     eine neue Spalte dort zieht die Zahl mit, ohne dass hier etwas
					     nachgeführt werden muss. Ein zu kleines `colspan` ließe die
					     Meldung in einer Spalte klemmen. -->
					<tr>
						<td colspan={spaltenAnzahl} class="p-4">
							<StatusBlock
								variant="empty"
								title={emptyText.title}
								description={emptyText.description}
								action={emptyText.resetLabel
									? {
											label: emptyText.resetLabel,
											onClick: onresetfilters,
											icon: 'lucide:filter-x'
										}
									: undefined}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	/* Auswahlspalte: das Label ist hier eine einzeilige Zelle, kein Feld-Label.

	   `items-center` als Utility reicht dafür nicht. `app.css` setzt für jedes
	   `label:has(> .checkbox)` ungelayert `align-items: flex-start` und schlägt
	   damit Tailwinds `@layer utilities` — die Checkbox hing oben in der Zelle,
	   während die Nachbarzellen mittig standen. Die Regel dort ist richtig und
	   bleibt: Sie hält das Control bei mehrzeiligen Feld-Labels oben bündig.
	   Genau diesen Fall gibt es in einer Tabellenzeile aber nicht.

	   Die `min-height: var(--target-min)` aus derselben Regel bleibt
	   unangetastet — die 44px Trefferfläche trägt weiterhin das Label.

	   Die Breite kommt aus der Checkbox (28px, `--control-size`) plus `px-2` an
	   der Zelle statt am Label: 44px Spaltenbreite für ein 28px-Control war der
	   breiteste Teil einer Zeile, der nichts anzeigt. Ganz ohne Polsterung
	   klebte die Checkbox dagegen an der Außenkante der Tabelle und rechts am
	   Totfund-Icon. Die Polsterung sitzt an der Zelle und nicht am Label, damit
	   sie nicht Teil der Trefferfläche wird — ein Klick daneben soll die Zeile
	   nicht auswählen.

	   Damit ist das Ziel 44px hoch und 28px breit und unterschreitet das
	   Projekt-Mindestmaß von 44×44 in der Breite. Das Label trägt deshalb
	   `target-exempt` — die Klasse verlangt laut `design-system.md` eine
	   Begründung, und die ist dieser Absatz: Die Tabelle erscheint erst ab
	   768px (`layoutSwitch.ts`), die Auswahl ist auf einem Tablet im
	   Touch-Betrieb also die schmalere der beiden Achsen, nicht die einzige
	   Bedienform. Wer sie nicht trifft, verliert nichts — die Zeile bleibt
	   über die Aktionsspalte und den Statuswechsel voll bedienbar, und die
	   Bulk-Auswahl ist eine Abkürzung, kein einziger Weg. Wird die Spalte
	   wieder breiter gebraucht, gehört das `px-2` zurück und diese Ausnahme
	   weg — nicht die Regel aufgeweicht. */
	.select-col label {
		align-items: center;
	}

	/* Fixierte Spalten (Status, Aktionen) im horizontal scrollenden Container.
	   Warum die Hintergründe hier von Hand stehen: `table-zebra` und der
	   Zeilen-Hover färben das <tr>, nicht die Zellen — eine sticky-Zelle bliebe
	   damit durchsichtig, und der wegscrollende Inhalt liefe sichtbar darunter
	   durch. DaisyUIs Tabellenregeln setzen an `:where(th, td)` keinen
	   Hintergrund und stehen zudem in `:where()` ohne Spezifität; diese
	   ungelayerten Regeln gewinnen also. Farben nur als Theme-Token. */
	.sticky-col {
		position: sticky;
		background-color: var(--color-base-100);
	}

	/* Zebra: `tbody tr:nth-child(even)` trägt base-200 — die fixierte Zelle muss
	   dieselbe Fläche mitbringen, sonst blitzt sie beim Scrollen heller auf. */
	tbody tr:nth-child(even) .sticky-col {
		background-color: var(--color-base-200);
	}

	/* Zeilen-Hover (`hover:bg-base-200` am <tr>) — deckungsgleich für gerade und
	   ungerade Zeilen, weil beide Zustände auf base-200 laufen. */
	tbody tr:hover .sticky-col {
		background-color: var(--color-base-200);
	}

	/* Der Tabellenkopf steht auf `bg-base-200` (am <thead>, nicht an den Zellen). */
	thead .sticky-col {
		background-color: var(--color-base-200);
	}

	/* Trennkante an der linken Kante des fixierten Bereichs. */
	.sticky-edge {
		border-left: var(--border, 1px) solid var(--color-base-300);
	}
</style>
