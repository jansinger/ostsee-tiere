<script lang="ts">
	/**
	 * Ein Spam-Befund — Überschrift, Risiko-Badge, Score, Beschreibung,
	 * Indikatoren.
	 *
	 * Vier Mal dieselbe Aussage: Erstbefund und Neuberechnung, je im
	 * Spam-Check-Modal der Tabelle und in der Karte der Detailansicht. Vorher
	 * hatte das Modal ein Snippet und die Detailansicht eine handgebaute
	 * zweite Fassung — mit abweichendem Wortlaut („Beim Eingang: 2" gegen
	 * „Heuristik-Score: 2"), ohne Risiko-Icon am Erstbefund und ohne den
	 * „Keine Indikatoren."-Zweig. Genau diese Divergenz zwischen
	 * Anzeigestellen ist der Befund, für den `spamScorePresentation.ts`
	 * existiert; sie eine Ebene höher zu wiederholen hätte ihn nur verschoben.
	 *
	 * Wort, Farbe, Icon und Schwelle kommen weiterhin von dort — diese
	 * Komponente ordnet sie nur an.
	 */
	import Icon from '#lib/components/Icon.svelte';
	import { SPAM_RISK_PRESENTATION, type SpamRisk } from './spamScorePresentation';

	interface Props {
		/** Zeitliche Einordnung — „Beim Eingang" bzw. „Jetzt nachgerechnet". */
		title: string;
		risk: SpamRisk;
		/**
		 * `null` heißt **„es gibt gar keine Zahl"** — der Fall `spam_score IS
		 * NULL`, also nie bewertet.
		 *
		 * Das unterscheidet ihn von der fehlgeschlagenen Prüfung, die sehr wohl
		 * eine Zahl mitbringt (Fail-Safe: Score 0 mit `isHighRisk: true`) und
		 * deshalb als solche benannt wird. Beide landen über
		 * `spamScorePresentation.ts` auf `risk === 'unrated'` und wären ohne
		 * diese Unterscheidung nicht auseinanderzuhalten — „nie geprüft" und
		 * „geprüft, aber gescheitert" sind für die Triage nicht dasselbe.
		 */
		score: number | null;
		indicators: readonly string[];
	}

	let { title, risk, score, indicators }: Props = $props();

	const spam = $derived(SPAM_RISK_PRESENTATION[risk]);
</script>

<p class="text-sm font-semibold">{title}</p>
<div class="mt-1 flex flex-wrap items-center gap-2">
	{#if spam.badgeClass}
		<span class="badge {spam.badgeClass}">
			<Icon icon={spam.icon} width="14" height="14" aria-hidden="true" />
			{spam.label}
		</span>
		<span class="badge badge-ghost">Heuristik-Score: {score}</span>
	{:else if score !== null}
		<!-- `failed: true` — Score 0 und `isHighRisk: true` zugleich. Weder
		     „Hochrisiko" noch „sauber" wäre wahr: geprüft wurde nichts. Die Zahl
		     bleibt deshalb weg, sie wäre eine Behauptung über eine Prüfung, die
		     nicht durchgelaufen ist. -->
		<span class="badge badge-warning">
			<Icon icon="lucide:triangle-alert" width="14" height="14" aria-hidden="true" />
			Prüfung fehlgeschlagen
		</span>
	{/if}
	<!-- Für „nie bewertet" bewusst gar kein Badge: Ein graues Etikett läse sich
	     wie ein Prüfergebnis und ist das Gegenteil der Aussage. Die Beschreibung
	     darunter trägt den Fall. -->
</div>
<p class="text-base-content/70 mt-2 text-sm">{spam.description}</p>
{#if indicators.length > 0}
	<ul class="mt-2 list-inside list-disc text-sm">
		{#each indicators as indicator (indicator)}
			<li>{indicator}</li>
		{/each}
	</ul>
{:else if score !== null}
	<!-- Nur wo tatsächlich gerechnet wurde. Ohne Bewertung wäre „Keine
	     Indikatoren." eine Aussage über ein Ergebnis, das es nicht gibt. -->
	<p class="text-base-content/70 mt-2 text-sm">Keine Indikatoren.</p>
{/if}
