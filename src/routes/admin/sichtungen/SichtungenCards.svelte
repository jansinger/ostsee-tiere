<!--
	Kartenliste der Sichtungstabelle — die kompakte Variante von
	`/admin/sichtungen`.

	Sie steht als eigene Komponente neben `SichtungenTable.svelte`, damit die
	Umschaltung zwischen beiden an genau einer Stelle hängt (`layoutSwitch.ts`)
	statt an vier Utility-Klassen im Seiten-Markup. Genau daran ist Befund 12
	entstanden: Kopf und Inhaltsfläche schalteten an verschiedenen Grenzen.

	Bewusst ohne Bulk-Auswahl und ohne Spaltenkonfiguration: Beides gehört zur
	Tabelle. Die Karte zeigt die Felder, die für die Triage am Telefon zählen.
-->
<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import StatusBlock from '#lib/components/StatusBlock.svelte';
	import { DEAD_FINDING_PRESENTATION, isDeadFinding } from '#lib/components/admin/deadFinding.ts';
	import { describeEmptyList } from './emptyList';
	import SightingActionsMenu from '#lib/components/admin/SightingActionsMenu.svelte';
	import SightingStatusControl from '#lib/components/admin/SightingStatusControl.svelte';
	import { getSightingStatus, type SightingStatus } from '#lib/components/admin/sightingStatus.ts';
	import type { SightingVerdict } from '#lib/components/admin/sightingVerdict.ts';
	import { getSpeciesLabel } from '#lib/report/formOptions/species.ts';
	import type { SichtungenListRow } from './listColumns';
	import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
	import {
		BALTIC_SEA_STATUS_PRESENTATION,
		getBalticSeaStatus
	} from '#lib/utils/geo/balticSeaStatus.ts';
	import { NUR_KOMPAKT } from './layoutSwitch';

	interface Props {
		sightings: SichtungenListRow[];
		/** Steuert nur das Bedienelement — das Gate steht zusätzlich am Endpunkt. */
		isSuperAdmin: boolean;
		/** Ids, deren Statuswechsel gerade läuft (je Zeile, nicht global). */
		statusPending: ReadonlySet<number>;
		/** Entscheidet den Wortlaut des Leer-Zustands (`emptyList.ts`). */
		hasActiveFilters: boolean;
		onresetfilters: () => void;
		onview: (sighting: SichtungenListRow) => void;
		ontestemail: (id: number) => void;
		onspamcheck: (id: number) => void;
		ondelete: (sighting: SichtungenListRow) => void;
		onstatuschange: (id: number, verdict: SightingVerdict, previous: SightingStatus) => void;
	}

	let {
		sightings,
		isSuperAdmin,
		statusPending,
		hasActiveFilters,
		onresetfilters,
		onview,
		ontestemail,
		onspamcheck,
		ondelete,
		onstatuschange
	}: Props = $props();

	let emptyText = $derived(describeEmptyList(hasActiveFilters));
</script>

<div class="{NUR_KOMPAKT} container mx-auto space-y-3 px-4 md:px-6">
	{#each sightings as sighting (sighting.id)}
		{@const balticSea = BALTIC_SEA_STATUS_PRESENTATION[getBalticSeaStatus(sighting)]}
		{@const status = getSightingStatus({
			approvedAt: sighting.approvedAt,
			rejectedAt: sighting.rejectedAt
		})}
		<div class="bg-base-100 border-base-300 shadow-raised rounded-lg border p-4">
			<div class="mb-3 flex items-start justify-between">
				<div class="flex-1">
					<!-- Referenz und Kennzeichen als eigene Flex-Zeile: Nebeneinander,
					     solange der Platz reicht, und darunter, wenn nicht — ein
					     Inline-Badge mit `ml-2` stand nach dem Umbruch eingerückt da. -->
					<div class="flex flex-wrap items-center gap-2">
						{#if sighting.referenceId}
							<!-- `break-all`, weil `flex-wrap` nur zwischen Flex-Items umbricht und
							     eine Referenz-ID ein Wort ohne Umbruchgelegenheit ist: der Link hielt
							     ~202px Mindestbreite und schob die ganze Seite über den Viewport
							     (320px/375px, siehe admin-table-mobile-reference-overflow.spec.ts).
							     Nicht `truncate` — die Referenz-ID ist der Schlüssel zum Wiederfinden
							     einer Meldung und wäre abgeschnitten wertlos. -->
							<a
								href="/admin/ref/{sighting.referenceId}"
								class="link link-primary link-hover font-mono text-sm break-all"
							>
								{sighting.referenceId}
							</a>
						{:else}
							<span class="text-base-content/70 text-sm">Keine Referenz</span>
						{/if}
						<!-- In der Kopfzeile und nicht unten in der Badge-Reihe: Dort stand
						     der Totfund gleichrangig neben „Mit Aufnahme" und dem
						     Ostsee-Status und ging zwischen ihnen unter. Die Art der Meldung
						     ist keine Eigenschaft unter anderen. -->
						{#if isDeadFinding(sighting.isDead)}
							<span class="badge badge-sm {DEAD_FINDING_PRESENTATION.badgeClass} gap-1">
								<Icon
									icon={DEAD_FINDING_PRESENTATION.icon}
									class="h-3.5 w-3.5"
									aria-hidden="true"
								/>
								{DEAD_FINDING_PRESENTATION.label}
							</span>
						{/if}
					</div>
					<h3 class="mt-1 text-base font-semibold">{getSpeciesLabel(sighting.species)}</h3>
				</div>
				<div class="ml-2 flex gap-1">
					<button
						class="btn btn-ghost btn-sm"
						onclick={() => onview(sighting)}
						title="Details anzeigen"
						aria-label="Details anzeigen"
					>
						<Icon icon="lucide:eye" class="h-4 w-4" />
					</button>
					<!-- Dasselbe Overflow-Menü wie in der Tabellenzeile nebenan
					     (`SichtungenTable.svelte`): dieselben Aktionen, dieselbe Reihenfolge,
					     derselbe Wortlaut — unabhängig von der Ansicht. Das eigene
					     id-Präfix ist Pflicht: Beide Ansichten stehen gleichzeitig im DOM. -->
					<SightingActionsMenu
						menuId="aktionen-karte-{sighting.id}"
						label="Weitere Aktionen zu Sichtung {sighting.referenceId ?? sighting.id}"
						{isSuperAdmin}
						onspamcheck={() => onspamcheck(sighting.id)}
						ontestemail={() => ontestemail(sighting.id)}
						ondelete={() => ondelete(sighting)}
					/>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
				<div>
					<span class="text-base-content/70">Sichtung:</span>
					<span class="block">{formatLocalDateTime(sighting.sightingDate)}</span>
				</div>
				<div>
					<span class="text-base-content/70">Anzahl:</span>
					<span class="block">{sighting.totalCount}</span>
				</div>
				<div class="col-span-2">
					<span class="text-base-content/70">Email:</span>
					<a href="mailto:{sighting.email}" class="link link-primary link-hover block text-sm">
						{sighting.email}
					</a>
				</div>
			</div>

			<div class="mt-3 flex flex-wrap gap-2">
				{#if sighting.mediaUpload}
					<span class="badge badge-success badge-sm">Mit Aufnahme</span>
				{/if}
				<!-- Anders als die Aufnahme immer sichtbar: „außerhalb" und „ohne
				     Position" sind für die Triage genauso relevant wie „Ostsee", ein
				     fehlendes Badge wäre hier also keine Aussage. -->
				<span
					class="badge badge-sm {balticSea.badgeClass} whitespace-nowrap"
					title={balticSea.title}
				>
					{balticSea.label}
				</span>
			</div>

			<div class="mt-3 flex items-center justify-between">
				<span class="text-base-content/70 text-support">
					Gemeldet: {formatLocalDateTime(sighting.created)}
				</span>
				<!-- size="sm" statt "md": Gemessen bei 320px/375px lief die Karte mit den
				     drei beschrifteten Segmenten (`.btn` hat `flex-shrink: 0`, DaisyUI kann
				     die Gruppe also nicht stauchen) um bis zu 155px horizontal über —
				     `e2e/admin-table-mobile-status-overflow.spec.ts` hält das als
				     Regressionstest fest. "sm" zeigt wie die Desktop-Spalte nur Icons; die
				     Bedeutung tragen dann Icon-Form und Füllung plus das `aria-label` am
				     Radio-Input (`SightingStatusControl.svelte`) — das erreicht auch
				     Screenreader. Der `title` am Segment ist eine Zugabe nur für die Maus,
				     er wirkt bei Tastatur- und Touch-Bedienung nicht.
				     `groupSuffix="-mobile"`: Ohne ihn teilt sich dieses Control den
				     Radio-`name` mit dem gleich benannten Control der Tabelle — beide stehen
				     für dieselbe Sichtung gleichzeitig im DOM, nur per CSS getrennt, und HTML
				     gruppiert Radios über den ganzen Dokumentbaum, nicht pro `fieldset`
				     (siehe `SightingStatusControl.svelte`). Der Suffix überlebt den Schnitt
				     in zwei Komponenten deshalb unverändert. -->
				<SightingStatusControl
					{status}
					sightingId={sighting.id}
					size="sm"
					groupSuffix="-mobile"
					busy={statusPending.has(sighting.id)}
					onchange={(verdict) => onstatuschange(sighting.id, verdict, status)}
				/>
			</div>
		</div>
	{:else}
		<!-- Derselbe Block wie unter der Tabelle nebenan, mit demselben Wortlaut
		     aus `emptyList.ts`. Ein Ausweg steht nur da, wo es einen gibt: ohne
		     aktiven Filter hätte „Zurücksetzen" nichts zurückzusetzen. -->
		<StatusBlock
			variant="empty"
			title={emptyText.title}
			description={emptyText.description}
			action={emptyText.resetLabel
				? { label: emptyText.resetLabel, onClick: onresetfilters, icon: 'lucide:filter-x' }
				: undefined}
		/>
	{/each}
</div>
