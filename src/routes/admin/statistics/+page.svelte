<script lang="ts">
	import BarChart from '#lib/components/charts/BarChart.svelte';
	import { getEntryChannelLabel } from '#lib/report/formOptions/entryChannel.ts';
	import { getSpeciesLabel } from '#lib/report/formOptions/species.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { WEEKDAY_LABELS, buildActivityHeatmap, type HeatmapStep } from './activityHeatmap';
	import { formatNumber, formatPercentage } from './statisticsFormat';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* Die Zahlformatierer kommen aus `statisticsFormat.ts` (Import oben) —
	   die früheren Inline-Helfer hatten den Dezimalpunkt-Bruch („9.2%" neben
	   „19.284") und rendeten nicht-numerische Eingaben als „NaN". */

	/** Kurzformen für die Achse — „September" passt bei zwölf Balken nicht. */
	const monthLabelsShort = [
		'Jan',
		'Feb',
		'Mär',
		'Apr',
		'Mai',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Okt',
		'Nov',
		'Dez'
	];

	/**
	 * Saisonalität über alle zwölf Monate.
	 *
	 * Monate ohne Meldung kommen aus der Datenbank gar nicht zurück. Als Balken
	 * der Höhe 0 gehören sie trotzdem hin: Eine Lücke im Jahreslauf ist eine
	 * Aussage, ein stillschweigend übersprungener Monat verfälscht die Kurve.
	 */
	const seasonalityData = $derived(
		monthLabelsShort.map((label, index) => ({
			label,
			value: Number(data.monthlyStats.find((m) => Number(m.month) === index + 1)?.sightings ?? 0)
		}))
	);

	/**
	 * Bezugsgröße der Kanal-Balken.
	 *
	 * Die Summe der Kanäle und nicht die Kopfzahl `approved.totalSightings`:
	 * Beide zählen zwar dieselbe Grundmenge, aber wenn eine der beiden Abfragen
	 * einmal abweicht, ergäben die Anteile hier nicht mehr 100 %. Der Balken
	 * bezieht sich damit auf genau die Zahlen, die daneben stehen.
	 */
	const channelTotal = $derived(
		data.channelStats.reduce((summe, kanal) => summe + Number(kanal.count), 0) || 1
	);

	/** Jahrestrends über alle Jahre; das gewählte Jahr ist hervorgehoben. */
	const yearlyData = $derived(
		data.yearlyStats.map((year) => ({
			label: String(year.year),
			value: Number(year.sightings),
			highlighted: Number(year.year) === data.selectedYear
		}))
	);

	/** Zusatz für Überschriften, damit keine Zahl ohne ihren Zeitraum dasteht. */
	const yearSuffix = $derived(data.selectedYear === null ? '' : ` ${data.selectedYear}`);

	/**
	 * Wochenraster der Eingangs-Heatmap.
	 *
	 * Steht bewusst hier und nicht als `{@const}`-Kette in der Schleife: Maximum
	 * und Kalenderarithmetik liefen dort 30-mal identisch durch, und ein
	 * Wochentagsraster braucht Leerzellen am Anfang, die eine Zählschleife nicht
	 * erzeugen kann. Begründung und Tests in `activityHeatmap.ts`.
	 */
	const heatmapWeeks = $derived(buildActivityHeatmap(data.recentActivity, new Date()));

	/**
	 * Flächen- und Textfarbe je Intensitätsstufe — im Browser gemessen
	 * (`e2e/helpers/contrast.ts`, Backdrop `base-100`, 2026-08-09):
	 *
	 * | Stufe | Klassen                                | Kontrast    | WCAG 1.4.3 |
	 * | ----- | -------------------------------------- | ----------- | ---------- |
	 * | 1     | `bg-primary/25` + `base-content`       | 10,54:1     | ✅         |
	 * | 2     | `bg-primary/50` + `base-content`       | 6,24:1      | ✅         |
	 * | 3     | `bg-primary/75` + `primary-content`    | 5,79:1      | ✅         |
	 * | 4     | `bg-primary` + `primary-content`       | 11,00:1     | ✅         |
	 *
	 * Stufe 3 trug bis 2026-08-09 `text-base-content` und maß damit **3,39:1** —
	 * unter AA. `primary` ist dunkel (als Textfarbe auf `base-100` 9,22:1),
	 * dunkler Text auf 75 % davon hat keinen Kontrast mehr. Der Kipppunkt liegt
	 * zwischen `/60` (4,95:1) und `/65` (4,35:1); ab `/75` ist heller Text die
	 * einzig richtige Wahl — genau wie es die Vollstufe schon tat.
	 *
	 * Stufe 0 trug bis 2026-08-09 zusätzlich `text-base-content/30`. Die Klasse war
	 * als Ausnahme von der Deckkraft-Untergrenze notiert („die Zelle ist ohne
	 * Meldung leer", Docblock von `BannedRule.textOnly` in
	 * `e2e/helpers/bannedClasses.ts`) — und **genau diese Prämisse** hebt die
	 * `sr-only`-Beschriftung unten auf: Die Zelle trägt jetzt auch ohne Meldung
	 * Text. Zu färben hatte die Klasse dabei ohnehin nichts, denn das sichtbare
	 * Span bleibt bei `count === 0` leer. Sie ist deshalb ersatzlos entfallen,
	 * statt die Regel für sie aufzuweichen.
	 */
	const HEATMAP_STEP_CLASSES: Record<HeatmapStep, string> = {
		0: 'bg-base-200',
		1: 'bg-primary/25 text-base-content',
		2: 'bg-primary/50 text-base-content',
		3: 'bg-primary/75 text-primary-content',
		4: 'bg-primary text-primary-content'
	};

	// Die Ableitung `scientificInsights` ist 2026-07-30 entfallen; die Begründung
	// steht an ihrer Anzeigestelle in der Vorlage unten.
</script>

<svelte:head>
	<title>Statistiken - Admin - Ostsee-Tiere</title>
	<meta
		name="description"
		content="Wissenschaftliche Statistiken und Auswertungen der Meerestier-Sichtungen. Detaillierte Analysen für Forschung und Monitoring."
	/>
	<meta
		name="keywords"
		content="Statistiken, Wissenschaft, Analyse, Meerestiere, Ostsee, Forschung, Daten, Admin"
	/>

	<!-- Open Graph -->
	<meta property="og:title" content="Sichtungsstatistiken - Admin - Ostsee-Tiere" />
	<meta
		property="og:description"
		content="Wissenschaftliche Statistiken und Auswertungen der Meerestier-Sichtungen"
	/>
	<meta property="og:type" content="website" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Sichtungsstatistiken - Admin - Ostsee-Tiere" />
	<meta
		name="twitter:description"
		content="Wissenschaftliche Statistiken und Auswertungen der Meerestier-Sichtungen"
	/>
</svelte:head>
<div class="container mx-auto p-4">
	<div class="space-y-8 pt-2">
		<!-- Header -->
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<h1 class="text-base-content text-display font-bold">
					Statistiken{yearSuffix}
				</h1>
				<p class="text-base-content/70 mt-2">
					Analyse von {formatNumber(data.basicStats?.approved.totalSightings || 0)} freigegebenen Meerestier-Sichtungen{yearSuffix}
					<!-- „noch offen" und nicht „noch nicht freigegeben": Die Zahl zählt seit
					     2026-08-08 über `openOnly()`, also ohne die abgelehnten Sichtungen —
					     dieselbe Menge wie der Eingang auf `/admin`. Wer hier „nicht
					     freigegeben" schreibt, verspricht die Gegenmenge der Freigabe und
					     weicht damit wieder um die Abgelehnten vom Eingang ab. -->
					<!-- Der Trennpunkt trägt keine Bedeutung und gehört deshalb nicht in die
					     Vorlesereihenfolge (`design-system.md`, Abschnitt „Beim Beheben nicht
					     mechanisch ersetzen"). Ohne `aria-hidden` liest der Screenreader
					     zwischen den Zahlen „Mittelpunkt". Gilt für beide Zahlen. -->
					<span class="text-base-content/70">
						<span aria-hidden="true">·</span>
						{formatNumber(data.basicStats?.open.totalSightings || 0)} noch offen
					</span>
					<!-- Die dritte Zahl steht auch bei 0 da. Wegzulassen, was gerade leer ist,
					     macht das Fehlen zweideutig: Wer „5 abgelehnt" kennt und es beim
					     nächsten Jahr nicht sieht, kann nicht unterscheiden, ob keine
					     abgelehnt wurden oder ob die Anzeige die Zahl nicht mehr führt. -->
					<span class="text-base-content/70">
						<span aria-hidden="true">·</span>
						{formatNumber(data.basicStats?.rejected || 0)} abgelehnt
					</span>
				</p>
			</div>

			<!-- Jahresauswahl als GET-Formular: Sie funktioniert damit ohne JavaScript,
			     das gewählte Jahr steht in der Adresszeile und ist teilbar. Kein
			     Auto-Absenden beim Ändern der Auswahl — wer per Tastatur durch die
			     Optionen geht, löste damit bei jedem Zwischenschritt einen Ladevorgang
			     aus und käme nie am gewünschten Jahr an. -->
			<form method="GET" class="flex items-end gap-2">
				<div class="fieldset">
					<label class="label py-0" for="statistik-jahr">
						<span class="text-support">Zeitraum</span>
					</label>
					<select id="statistik-jahr" name="jahr" class="select select-sm">
						<option value="alle" selected={data.selectedYear === null}>Alle Jahre</option>
						{#each data.availableYears as jahr (jahr)}
							<option value={jahr} selected={data.selectedYear === jahr}>{jahr}</option>
						{/each}
					</select>
				</div>
				<button type="submit" class="btn btn-outline btn-sm">Anzeigen</button>
			</form>
		</div>

		<!--
			Hier stand bis 2026-07-30 ein Block „Wissenschaftliche Erkenntnisse".
			Er ist ersatzlos entfernt, weil seine Aussagen aus dieser Datenbasis
			grundsätzlich nicht ableitbar sind:

			- „Erhöhte Mortalitätsrate" rechnete Totfund-Meldungen / alle Meldungen.
			  Das ist der Anteil der Meldungen über tote Tiere, keine Mortalitätsrate —
			  dafür bräuchte es eine Population und einen bekannten Beobachtungsaufwand.
			  Der Zusatz „deutlich über dem erwarteten Niveau" erfand zusätzlich ein
			  Erwartungsniveau ohne Quelle.
			- „Starke Saisonalität … deutliche Wanderungsmuster erkennbar" deutete die
			  Verteilung der Meldungen als Verhalten der Tiere. Die Tabelle enthält nur
			  Positivmeldungen ohne Aufwand, die Verteilung spiegelt daher primär den
			  Rhythmus der Beobachtenden.
			- „Kritische Mortalität: <Art> … erfordert sofortige wissenschaftliche
			  Aufmerksamkeit" feuerte ab 30 % Totfundanteil ohne Mindest-Stichprobe. Es
			  traf zuletzt „Unbekannte Robbenart" (145 von 317) — eine Kategorie, die
			  überwiegend aus Totfunden besteht, weil verweste Tiere oft nicht mehr
			  bestimmbar sind. Das Ergebnis war ein Artefakt der Kategoriedefinition.

			Genau diese Art unbelegter Zahlenaussagen verbietet
			`.claude/rules/design-system.md` („Zahlen in Nutzertexten nur mit Quelle",
			Abschnitt „Grenze der eigenen Datenbasis"). Eine belastbare Auswertung
			gehört in eine fachliche Analyse mit Aufwandsdaten, nicht in eine
			Übersichtsseite.
		-->

		<!-- Key Metrics Grid -->
		<!-- Spaltenzahl bewusst < 5: `.stat` setzt `white-space: nowrap` auf Titel, Wert und
		     Beschreibung (daisyui stat.css) und kann deshalb nie umbrechen; `.stats` selbst ist
		     `inline-grid` mit `overflow-x: auto`. Bei lg:grid-cols-5 war jede Spalte nur ~175px
		     breit, die Karte scrollte intern, und das rechts sitzende stat-figure-Icon lag außerhalb
		     des sichtbaren Bereichs. Nachgerechnet (Container = min(Viewport, Breakpoint) minus
		     `p-4`, gap-6 = 24px, .stat-Padding 24px je Seite, Icon 32px, Spalten-Gap 16px): die
		     breiteste Karte „Unique Nutzer" („… Wiederholungs-Nutzer (12,3%)") braucht ~320-335px.
		     Bei 5 Spalten liefert selbst 2xl (Container 1536px − 32px Padding = 1504px Inhalt) nur
		     ~282px/Spalte — 5 Spalten passen bei keinem Standard-Breakpoint verlustfrei. Deshalb
		     2 Spalten ab md (356px/Spalte) und 3 ab xl. Bei xl bleiben 400px/Spalte, ab 2xl 485px
		     (der Container ist ohne eigenen 3xl-Breakpoint bei 1536px gedeckelt, breiter wird es
		     also nicht). Bei 3 Spalten ordnen sich die fünf Karten als 3+2 an — gegenüber 4+1 die
		     ruhigere Aufteilung, deshalb keine vierte Spalte ab 2xl. -->
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
			<div class="stats shadow-raised w-full">
				<div class="stat">
					<div class="stat-figure text-primary">
						<Icon icon="lucide:users" class="h-8 w-8" />
					</div>
					<div class="stat-title">Freigegebene Sichtungen</div>
					<div class="stat-value text-primary">
						{formatNumber(data.basicStats?.approved.totalSightings || 0)}
					</div>
					<div class="stat-desc">
						<span class="text-warning-strong"
							>{formatNumber(data.basicStats?.open.totalSightings || 0)} noch offen</span
						>
					</div>
				</div>
			</div>

			<div class="stats shadow-raised w-full">
				<div class="stat">
					<div class="stat-figure text-secondary-strong">
						<Icon icon="lucide:activity" class="h-8 w-8" />
					</div>
					<div class="stat-title">Ø Gruppengröße</div>
					<div class="stat-value text-secondary-strong">
						{formatNumber(
							parseFloat(String(data.basicStats?.approved.avgGroupSize || 0)).toFixed(1)
						)}
					</div>
					<div class="stat-desc">
						Max: {data.basicStats?.approved.maxGroupSize || 0} Tiere · freigegeben
					</div>
				</div>
			</div>

			<div class="stats shadow-raised w-full">
				<div class="stat">
					<div class="stat-figure text-warning-strong">
						<Icon icon="lucide:trending-up" class="h-8 w-8" />
					</div>
					<div class="stat-title">Totfunde</div>
					<div class="stat-value text-warning-strong">
						{formatNumber(data.basicStats?.approved.deadAnimals || 0)}
					</div>
					<div class="stat-desc">
						{formatPercentage(
							((data.basicStats?.approved.deadAnimals || 0) /
								(data.basicStats?.approved.totalSightings || 1)) *
								100
						)} der freigegebenen
						<br />
						<span class="text-warning-strong"
							>{formatNumber(data.basicStats?.open.deadAnimals || 0)} noch offen</span
						>
					</div>
				</div>
			</div>

			<div class="stats shadow-raised w-full">
				<div class="stat">
					<div class="stat-figure text-accent-strong">
						<Icon icon="lucide:calendar" class="h-8 w-8" />
					</div>
					<div class="stat-title">Mit Medien</div>
					<div class="stat-value text-accent-strong">
						{formatNumber(data.basicStats?.approved.withMedia || 0)}
					</div>
					<div class="stat-desc">
						{formatPercentage(
							((data.basicStats?.approved.withMedia || 0) /
								(data.basicStats?.approved.totalSightings || 1)) *
								100
						)} der freigegebenen
					</div>
				</div>
			</div>

			<div class="stats shadow-raised w-full">
				<div class="stat">
					<div class="stat-figure text-info-strong">
						<Icon icon="lucide:users" class="h-8 w-8" />
					</div>
					<div class="stat-title">Unique Nutzer</div>
					<div class="stat-value text-info-strong">
						{formatNumber(data.userStats?.uniqueUsers || 0)}
					</div>
					<div class="stat-desc">
						{formatNumber(data.userStats?.repeatUsers || 0)} Wiederholungs-Nutzer ({formatPercentage(
							data.userStats?.repeatUserPercentage || 0
						)})
					</div>
				</div>
			</div>
		</div>

		<!-- Species Distribution -->
		<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<!-- „freigegeben", nicht „verifiziert" — und mit Jahreszusatz, weil der
					     Loader `mitJahr(approvedOnly())` filtert. Dieselbe Regel wie beim
					     „Eingang der letzten 30 Tage" weiter unten: Eine Überschrift darf
					     keine andere Menge versprechen, als die Zahl darunter zählt. „Verifiziert"
					     holte zusätzlich die abgeschaffte Vokabel zurück: `geprueft` wird seit
					     2026-08 nicht mehr gelesen (CLAUDE.md), und die Oberfläche kennt die
					     drei Zustände Offen/Freigegeben/Abgelehnt. Gilt auch für die beiden
					     folgenden Überschriften. -->
					<h2 class="card-title">
						<Icon icon="lucide:chart-pie" class="h-6 w-6" />
						Artenverteilung (freigegebene Sichtungen{yearSuffix})
					</h2>
					<div class="overflow-x-auto">
						<table class="table-zebra table">
							<thead>
								<tr>
									<th>Art</th>
									<th>Sichtungen</th>
									<th>Anteil</th>
									<th>Ø Gruppe</th>
									<!-- „Totfund-Anteil", nicht „Mortalität": die Kennzahl ist der Anteil der
									     Totfund-MELDUNGEN an allen Meldungen einer Art, keine Mortalitätsrate —
									     dafür fehlen Population und Beobachtungsaufwand. Begründung im großen
									     Kommentar oben in dieser Datei. Die Schwellwerte (30 %/15 %) bleiben. -->
									<th>Totfund-Anteil</th>
								</tr>
							</thead>
							<tbody>
								{#each data.speciesStats as species (species.species)}
									{@const deadPerc =
										typeof species.deadPercentage === 'string'
											? parseFloat(species.deadPercentage)
											: species.deadPercentage || 0}
									<tr class={deadPerc > 30 ? 'bg-error/10' : deadPerc > 15 ? 'bg-warning/10' : ''}>
										<td class="font-medium">{getSpeciesLabel(species.species)}</td>
										<td>{formatNumber(species.count)}</td>
										<td>{formatPercentage(species.percentage)}</td>
										<td>{formatNumber(parseFloat(String(species.avgGroupSize || 0)).toFixed(1))}</td
										>
										<td
											class={deadPerc > 30
												? 'text-error font-bold'
												: deadPerc > 15
													? 'text-warning-strong font-semibold'
													: ''}
										>
											{formatPercentage(species.deadPercentage)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			<!-- Monthly Seasonality -->
			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title">
						<Icon icon="lucide:calendar" class="h-6 w-6" />
						Saisonalität (freigegebene Sichtungen{yearSuffix})
					</h2>
					<!-- Die Balken standen bis 2026-08-08 als `progress`-Elemente
					     untereinander. Ein Fortschrittsbalken sagt „so weit von einem Ziel"
					     — hier gibt es kein Ziel, sondern zwölf vergleichbare Werte. Als
					     Diagramm mit gemeinsamer Achse ist der Jahreslauf ablesbar, statt
					     zwölfmal denselben Anteil am Maximum zu behaupten. -->
					<!-- Leerer Zeitraum: kein Diagramm. `niceAxisMax` liefert für eine leere
					     Reihe eine Achse mit dem Maximum 1 — zwölf Balken der Höhe 0 unter einer
					     erfundenen Skala sehen nach einer Aussage aus, wo keine ist. Der Satz
					     sagt stattdessen, was der Fall ist. -->
					{#if seasonalityData.every((monat) => monat.value === 0)}
						<p class="text-base-content/70">
							Für diesen Zeitraum liegen keine freigegebenen Sichtungen vor.
						</p>
					{:else}
						<BarChart
							data={seasonalityData}
							caption={`Saisonalität: freigegebene Sichtungen je Monat${yearSuffix}`}
							categoryLabel="Monat"
							valueLabel="Sichtungen"
							formatValue={formatNumber}
						/>
					{/if}
				</div>
			</div>

			<!-- Meldekanal -->
			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title">
						<Icon icon="lucide:inbox" class="h-6 w-6" />
						Meldekanal (freigegebene Sichtungen{yearSuffix})
					</h2>
					<!-- Anteil statt bloßer Anzahl als führende Aussage: Web und App tragen
					     zusammen über 90 %, die absoluten Zahlen der kleinen Kanäle sagen
					     ohne diesen Bezug wenig. Balken statt Diagramm, weil sechs
					     benannte Kategorien in eine Tabelle passen und die Bezeichnung
					     („Fax") neben der Zahl stehen soll — anders als bei zwölf Monaten
					     auf einer Achse.

					     Dass hier wieder `progress` steht, ist kein Rückfall hinter die
					     Umstellung der Saisonalität (Begründung weiter oben an ihrem
					     Diagramm): Dort waren es zwölf gleichrangige Werte ohne
					     Bezugsgröße, ein Fortschrittsbalken behauptete ein Ziel, das es
					     nicht gab. Ein Anteil am Ganzen hat dieses Ziel — 100 % —, und
					     genau dafür stehen die Balken der Datenqualität darunter seit
					     jeher. -->
					{#if data.channelStats.length === 0}
						<p class="text-base-content/70">
							Für diesen Zeitraum liegen keine freigegebenen Sichtungen vor.
						</p>
					{:else}
						<div class="overflow-x-auto">
							<table class="table-zebra table">
								<thead>
									<tr>
										<th>Kanal</th>
										<th>Sichtungen</th>
										<th>Anteil</th>
									</tr>
								</thead>
								<tbody>
									{#each data.channelStats as kanal (kanal.channel)}
										<tr>
											<td class="font-medium">{getEntryChannelLabel(kanal.channel)}</td>
											<td>{formatNumber(kanal.count)}</td>
											<td>
												<div class="flex items-center gap-3">
													<!-- Der Balken wiederholt nur die Prozentzahl daneben und hat
													     keinen eigenen Namen — als `progressbar` ohne Beschriftung
													     läse ihn ein Screenreader als zweite, unbenannte Angabe
													     derselben Zahl. Gleiche Auszeichnung wie an den beiden
													     Balken der Datenqualität weiter unten. -->
													<progress
														class="progress progress-primary w-24"
														value={kanal.count}
														max={channelTotal}
														aria-hidden="true"
													></progress>
													<span class="min-w-16">{formatPercentage(kanal.percentage)}</span>
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			</div>

			<!-- Data Quality & User Engagement -->
			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title">
						<Icon icon="lucide:users" class="h-6 w-6" />
						Nutzerengagement & Datenqualität (freigegebene Sichtungen{yearSuffix})
					</h2>

					<!-- User Engagement Stats -->
					<div class="stats stats-vertical lg:stats-horizontal shadow-raised mb-4">
						<div class="stat">
							<div class="stat-title">Eindeutige Nutzer</div>
							<div class="stat-value text-primary">
								{formatNumber(data.userStats?.uniqueUsers || 0)}
							</div>
						</div>
						<div class="stat">
							<div class="stat-title">Wiederkehrer</div>
							<div class="stat-value text-secondary-strong">
								{formatNumber(data.userStats?.repeatUsers || 0)}
							</div>
							<div class="stat-desc">
								{formatPercentage(data.userStats?.repeatUserPercentage || 0)} Quote
							</div>
						</div>
						<div class="stat">
							<div class="stat-title">Eindeutige Schiffsnamen</div>
							<div class="stat-value text-accent-strong">
								{formatNumber(data.shipStats?.uniqueShips || 0)}
							</div>
							<div class="stat-desc">
								{formatNumber(data.shipStats?.totalWithShipName || 0)} mit Namen
							</div>
						</div>
					</div>

					<!-- Data Quality Indicators -->
					<div class="space-y-2">
						<h3 class="font-semibold">Datenqualität</h3>
						{#if data.qualityStats}
							{@const total = data.qualityStats?.total || 1}
							<div class="flex items-center gap-3">
								<div class="w-24 text-sm">Koordinaten</div>
								<div class="flex-1">
									<progress
										class="progress progress-primary w-full"
										value={data.qualityStats?.withCoordinates || 0}
										max={total}
										aria-hidden="true"
									></progress>
								</div>
								<span class="min-w-16 text-sm font-medium">
									{formatPercentage(((data.qualityStats?.withCoordinates || 0) / total) * 100)}
								</span>
							</div>
							<div class="flex items-center gap-3">
								<div class="w-24 text-sm">Verhalten</div>
								<div class="flex-1">
									<progress
										class="progress progress-accent w-full"
										value={data.qualityStats?.withBehavior || 0}
										max={total}
										aria-hidden="true"
									></progress>
								</div>
								<span class="min-w-16 text-sm font-medium">
									{formatPercentage(((data.qualityStats?.withBehavior || 0) / total) * 100)}
								</span>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Top Observers -->
		{#if data.topObservers && data.topObservers.length > 0}
			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title">
						<Icon icon="lucide:trending-up" class="h-6 w-6" />
						Top Beobachter (freigegebene Sichtungen{yearSuffix}, ohne meeresmuseum.de)
					</h2>
					<div class="overflow-x-auto">
						<table class="table">
							<thead>
								<tr>
									<th>E-Mail</th>
									<th>Sichtungen</th>
									<th>Ø Gruppengröße</th>
									<th>Zeitraum</th>
									<th>Aktivität</th>
								</tr>
							</thead>
							<tbody>
								{#each data.topObservers as observer, index (observer.email)}
									{@const daysDiff =
										Math.ceil(
											(new Date(observer.lastSighting).getTime() -
												new Date(observer.firstSighting).getTime()) /
												(1000 * 3600 * 24)
										) + 1}
									<tr>
										<td class="font-mono text-sm">
											<span class="badge badge-ghost">#{index + 1}</span>
											{observer.email}
										</td>
										<td>
											<span class="font-semibold">{formatNumber(observer.sightingCount)}</span>
										</td>
										<td>{formatNumber(parseFloat(String(observer.avgGroupSize)).toFixed(1))}</td>
										<td class="text-sm">
											<!-- Bereits Berliner Kalendertag-Strings (berlinCalendarDate im Loader) —
											     Jahr direkt abschneiden, kein Date-Umweg nötig. -->
											{observer.firstSighting.slice(0, 4)} -
											{observer.lastSighting.slice(0, 4)}
										</td>
										<td>
											<div class="text-support">
												{Math.round(daysDiff)} Tage aktiv
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		{/if}

		<!-- Yearly Trends -->
		<div class="card bg-base-100 shadow-raised">
			<div class="card-body">
				<h2 class="card-title">
					<Icon icon="lucide:trending-up" class="h-6 w-6" />
					Jahrestrends (freigegebene Sichtungen, alle Jahre)
				</h2>
				<!-- Bewusst NICHT auf das gewählte Jahr gefiltert: Der Trend ist der
				     Kontext, aus dem heraus gewählt wird — auf ein Jahr eingedampft
				     bliebe ein einzelner Balken übrig. Das gewählte Jahr ist stattdessen
				     hervorgehoben (Loader-Kommentar an der Abfrage). -->
				{#if data.selectedYear !== null}
					<p class="text-support text-base-content/70">
						Der Trend zeigt weiterhin alle Jahre; {data.selectedYear} ist hervorgehoben.
					</p>
				{/if}
				<BarChart
					data={yearlyData}
					caption="Jahrestrends: freigegebene Sichtungen je Jahr"
					categoryLabel="Jahr"
					valueLabel="Sichtungen"
					highlightNote="ausgewähltes Jahr"
					formatValue={formatNumber}
				/>
				<div class="overflow-x-auto">
					<table class="table">
						<thead>
							<tr>
								<th>Jahr</th>
								<th>Sichtungen</th>
								<th>Entwicklung</th>
							</tr>
						</thead>
						<tbody>
							{#each data.yearlyStats as year, index (year.year)}
								{@const prevYear = index > 0 ? data.yearlyStats[index - 1] : null}
								{@const change = prevYear
									? ((year.sightings - prevYear.sightings) / prevYear.sightings) * 100
									: 0}
								<tr class={Number(year.year) === data.selectedYear ? 'bg-base-200' : ''}>
									<td class="font-medium">{year.year}</td>
									<td>{formatNumber(year.sightings)}</td>
									<td>
										{#if prevYear}
											<span
												class={change > 0
													? 'text-success-strong'
													: change < 0
														? 'text-error'
														: 'text-base-content'}
											>
												{change > 0 ? '+' : ''}{formatPercentage(change)}
											</span>
										{:else}
											<span class="text-base-content/70">-</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<!-- Recent Activity -->
		{#if data.recentActivity.length > 0}
			{@const totalRecentSightings = data.recentActivity.reduce(
				(sum, a) => sum + Number(a.count),
				0
			)}
			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title">
						<Icon icon="lucide:calendar" class="h-6 w-6" />
						Eingang der letzten 30 Tage (freigegebene Sichtungen, alle Jahre)
					</h2>
					<!-- Zwei Korrekturen an dieser Zeile, beide aus derselben Regel: Eine
					     Überschrift darf keine andere Menge versprechen, als die Zahl
					     darunter zählt.
					     1. Sie sagte bis 2026-08-08 „unabhängig vom Freigabestatus", während
					        der Loader längst über `approvedOnly()` filtert.
					     2. Sie trug kurzzeitig die Jahresauswahl mit — „letzte 30 Tage 2025"
					        liest sich als „die letzten 30 Tage des Jahres 2025" und meinte in
					        Wahrheit den Schnitt aus laufendem Fenster und Sichtungsjahr.
					        Dieser Abschnitt bringt seinen Zeitraum selbst mit und ist von der
					        Auswahl deshalb ausgenommen (Begründung an der Abfrage). -->

					<!-- Activity Heatmap -->
					<!-- Als Tabelle und nicht als `grid-cols-7`: Das alte Raster hatte sieben
					     Spalten über 30 Tage, war aber nicht an Wochentagen ausgerichtet — die
					     Spalten bedeuteten nichts. Jetzt ist eine Spalte ein Wochentag (mit
					     Leerzellen am Anfang), und Screenreader können das Raster zellenweise
					     lesen, ohne 30 Tabulator-Stopps zu erzeugen.
					     Das Datum stand vorher ausschließlich im `data-tip` und war damit
					     mausgebunden; Tage ohne Meldung rendeten eine komplett leere Zelle. Die
					     Beschriftung steht deshalb zusätzlich als `sr-only`-Text in jeder Zelle —
					     auch in denen ohne Meldung. Der Tooltip bleibt als Zeigegerät-Komfort. -->
					<div class="mb-4 overflow-x-auto">
						<table class="border-separate border-spacing-1">
							<caption class="text-support text-base-content/70 mb-1 text-left">
								30 Tage bis heute; eine Spalte ist ein Wochentag, eine Zeile eine Woche.
							</caption>
							<thead>
								<tr>
									{#each WEEKDAY_LABELS as wochentag (wochentag)}
										<th scope="col" class="text-support text-base-content/70 w-8 font-normal"
											>{wochentag}</th
										>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each heatmapWeeks as woche, wocheIndex (wocheIndex)}
									<tr>
										{#each woche as tag, spalte (spalte)}
											<td class="p-0">
												{#if tag}
													<div class="tooltip" data-tip={tag.label}>
														<div
															class="border-base-300 flex h-8 w-8 items-center justify-center rounded-sm border text-xs {HEATMAP_STEP_CLASSES[
																tag.step
															]}"
														>
															<span class="sr-only">{tag.label}</span>
															<span aria-hidden="true">{tag.count > 0 ? tag.count : ''}</span>
														</div>
													</div>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<!-- Summary Stats -->
					<div class="stats stats-vertical lg:stats-horizontal shadow-raised">
						<div class="stat">
							<div class="stat-title">Neue Sichtungen</div>
							<div class="stat-value text-primary">{formatNumber(totalRecentSightings)}</div>
							<div class="stat-desc">in den letzten 30 Tagen</div>
						</div>
						<div class="stat">
							<div class="stat-title">Durchschnitt</div>
							<div class="stat-value text-secondary-strong">
								{formatNumber((totalRecentSightings / 30).toFixed(1))}
							</div>
							<div class="stat-desc">Sichtungen pro Tag</div>
						</div>
						<div class="stat">
							<div class="stat-title">Aktivste Tage</div>
							<div class="stat-value text-accent-strong">{data.recentActivity.length}</div>
							<div class="stat-desc">Tage mit Meldungen</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
