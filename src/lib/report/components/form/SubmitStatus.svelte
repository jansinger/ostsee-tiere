<!--
  Zustandsfläche direkt über der Schritt-Navigation, dort wo „Absenden" steht.

  Ersetzt den Submit-Fehler-Toast vollständig. Ein Toast ist für Flüchtiges da —
  eine bestätigende Randnotiz, die keine Handlung verlangt. Ein gescheitertes
  Absenden verlangt eine Handlung, und die gehört an den Ort der Handlung, nicht
  in eine Ecke, die nach fünf Sekunden leer ist.

  Drei Regeln, die diese Komponente durchhält:

  1. Sie verschwindet nie von selbst. Kein `setTimeout`, keine Dauer-Prop. Wer
     den Fehler wegbekommen will, sendet erneut oder korrigiert etwas.
  2. Jeder Fehlerzustand nennt das Schicksal der Daten. Die häufigste Sorge nach
     einem Fehlschlag ist „ist jetzt alles weg?" — und sie ist beantwortbar.
     Einzige Ausnahme ist `partial`: dort liegt die Aufnahme schon auf dem
     Server, das lässt sich nicht als „bleibt bei Ihnen" beschreiben.
  3. Die Referenz-ID steht im Fehlerfall im Text. Sie existiert bereits
     (`createId()` in `ModernReportForm`), wurde dem Nutzer aber nie gezeigt —
     ausgerechnet im Fehlerfall braucht er sie für die Rückfrage.
-->
<script module lang="ts">
	// Typ-Export gehört in den Modul-Block — der Instanz-Block kann in Svelte 5
	// keine Typen exportieren.
	export type SubmitState = 'idle' | 'submitting' | 'offline' | 'failed' | 'partial';
</script>

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { ORPHAN_RETENTION_HOURS } from '$lib/constants/uploadRetention';

	let {
		state = 'idle',
		attempt = 0,
		maxAttempts = 3,
		referenceId = '',
		title = 'Der Server hat nicht geantwortet',
		onRetry
	}: {
		/** Aktueller Zustand der Übermittlung. `idle` rendert nichts. */
		state?: SubmitState;
		/**
		 * Überschrift im Zustand `failed`. Voreinstellung ist der Serverausfall;
		 * eine inhaltliche Ablehnung oder ein Rate Limit setzt hier den eigenen
		 * Satz ein, während Datenzusage, Referenz und Wiederholen gleich bleiben.
		 */
		title?: string;
		/** Anzahl der bisherigen Versuche. 0 = noch keiner, blendet den Zähler aus. */
		attempt?: number;
		/** Bezugsgröße für den Zähler („Versuch 2 von 3"). */
		maxAttempts?: number;
		/** Referenz der Meldung — im Fehlerfall die Nummer für die Rückfrage. */
		referenceId?: string;
		/**
		 * Löst einen erneuten Versuch aus. Fehlt er, wird keine Schaltfläche gezeigt.
		 *
		 * Auch der Offline-Zustand trägt sie, sobald der Aufrufer sie übergibt: Der
		 * Zustand kann aus einem einzelnen gescheiterten Request abgeleitet sein
		 * und dann falsch liegen (siehe `connection.isInterfaceDown`). Ohne einen
		 * Weg heraus wäre der Nutzer in diesem Fall bis zum Neuladen gefangen.
		 */
		onRetry?: (() => void) | undefined;
	} = $props();

	/**
	 * Anlaufstelle bei anhaltenden Problemen.
	 *
	 * Bewusst die Kontaktseite des Museums und **keine E-Mail-Adresse**: Der
	 * Entwurf nannte `sichtungen@meeresmuseum.de`, wofür es im Bestand keinen
	 * Beleg gibt. Eine Adresse, die niemand liest, ist im Fehlerfall schlimmer
	 * als gar keine — dann läuft die Rückfrage ins Leere und der Nutzer hält es
	 * für erledigt.
	 *
	 * Diese URL ist belegt: `src/routes/about/+page.svelte:353` zeigt sie
	 * Nutzern bereits als „Kontakt aufnehmen". Die einzige weitere Adresse im
	 * Bestand ist `datenschutz@meeresmuseum.de` (`RequiredConsent.svelte`) —
	 * eine Datenschutz-Stelle, die für eine gescheiterte Übermittlung der
	 * falsche Adressat wäre.
	 */
	const CONTACT_URL = 'https://www.deutsches-meeresmuseum.de/kontakt';

	const showAttemptCounter = $derived(attempt > 0);
	const showReference = $derived(referenceId.length > 0);

	/**
	 * „Versuch 4 von 3" wäre Unsinn. Über der Bezugsgröße zählt die Komponente
	 * nur noch weiter, statt eine Grenze zu behaupten, die niemand durchsetzt —
	 * `ModernReportForm` begrenzt die Versuche nicht.
	 */
	const attemptLabel = $derived(
		attempt > maxAttempts
			? `Das war Versuch ${attempt}.`
			: `Das war Versuch ${attempt} von ${maxAttempts}.`
	);
</script>

{#if state === 'submitting'}
	<!--
		Kein Alert und keine Statusfarbe: Ein Ladevorgang ist keine Warnung.
		Die sichtbare Rückmeldung trägt der Absenden-Button selbst; dieser Block
		existiert für die Ansage an Screenreader.
	-->
	<div
		class="border-base-300 bg-base-200/50 rounded-box mb-2 flex items-start gap-3 border p-4"
		role="status"
		aria-live="polite"
		data-testid="submit-status-submitting"
	>
		<span class="loading loading-spinner loading-sm text-primary mt-0.5"></span>
		<p class="text-base-content font-medium">Ihre Meldung wird gesendet …</p>
	</div>
{:else if state === 'offline'}
	<!--
		`role="status"`: Der Offline-Zustand entsteht von selbst, oft während der
		Nutzer noch tippt. Ein `role="alert"` würde den Screenreader mitten im
		Satz unterbrechen, ohne dass etwas passiert wäre.
	-->
	<div
		class="alert alert-warning mb-2 items-start"
		role="status"
		aria-live="polite"
		data-testid="submit-status-offline"
	>
		<Icon icon="lucide:wifi-off" class="mt-0.5 shrink-0" aria-hidden="true" />
		<div>
			<p class="text-base-content font-bold">Keine Internetverbindung</p>
			<p class="text-base-content mt-1 text-sm">
				Die Meldung kann gerade nicht abgeschickt werden.
				<strong>Ihre Eingaben bleiben vollständig gespeichert</strong> — auch wenn Sie diese Seite schließen.
				Sobald Sie wieder Empfang haben, können Sie hier absenden.
			</p>
			{#if onRetry}
				<!--
					Nur sichtbar, wenn der Aufrufer den Zustand nicht als sicher ansieht:
					Ist er aus einem einzelnen gescheiterten Request abgeleitet, kann er
					falsch sein — ohne diesen Weg bliebe der Nutzer bis zum Neuladen
					gefangen, denn ohne `online`-Ereignis hebt ihn nichts wieder auf.
				-->
				<button type="button" class="btn btn-primary btn-sm mt-3" onclick={onRetry}>
					<Icon icon="lucide:refresh-cw" width="16" class="shrink-0" aria-hidden="true" />
					Trotzdem versuchen
				</button>
			{/if}
		</div>
	</div>
{:else if state === 'failed'}
	<!--
		`role="alert"`, wie auch bei `partial`. Dieser Zustand ist die unmittelbare Folge
		einer Nutzeraktion („Absenden"), die Unterbrechung ist also erwartet und
		trägt Information.
	-->
	<div class="alert alert-error mb-2 items-start" role="alert" data-testid="submit-status-failed">
		<Icon icon="lucide:circle-alert" class="mt-0.5 shrink-0" aria-hidden="true" />
		<div>
			<p class="text-base-content font-bold">{title}</p>
			<p class="text-base-content mt-1 text-sm">
				<strong>Ihre Eingaben sind nicht verloren.</strong>
				{#if showAttemptCounter}
					{attemptLabel}
				{/if}
				{#if showReference}
					Bitte geben Sie bei einer Rückfrage die unten stehende Referenz an.
				{/if}
				Bei anhaltenden Problemen erreichen Sie uns über die
				<a class="link" href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
					Kontaktseite des Museums
				</a>.
			</p>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				{#if onRetry}
					<button type="button" class="btn btn-primary btn-sm" onclick={onRetry}>
						<Icon icon="lucide:refresh-cw" width="16" class="shrink-0" aria-hidden="true" />
						Erneut absenden
					</button>
				{/if}
				{#if showReference}
					<span
						class="text-base-content/70 font-mono text-sm"
						data-testid="submit-status-reference"
					>
						Referenz: {referenceId}
					</span>
				{/if}
			</div>
		</div>
	</div>
{:else if state === 'partial'}
	<!--
		Der einzige Zustand, der die Datenzusage nicht geben kann: Die Aufnahme
		liegt bereits auf dem Server. Die Frist kommt aus `ORPHAN_RETENTION_HOURS`
		— derselben Konstante, aus der `UPLOAD_NOTICE` an der Dropzone schöpft und
		nach der das Aufräum-Tool tatsächlich löscht. Eine hier hineingeschriebene
		Zahl könnte davon abweichen und wäre dann eine falsche Zusage.
	-->
	<!--
		`role="alert"` wie bei `failed`: `partial` entsteht, weil jemand
		„Absenden" gedrückt hat — es ist ein Unterfall des Fehlschlags und keine
		von selbst auflaufende Meldung. Die Unterbrechung ist damit erwartet und
		trägt Information. Zwei gleichzeitige Live-Regionen können dabei nicht
		entstehen: `failed` und `partial` schließen einander aus.
	-->
	<div
		class="alert alert-warning mb-2 items-start"
		role="alert"
		data-testid="submit-status-partial"
	>
		<Icon icon="lucide:triangle-alert" class="mt-0.5 shrink-0" aria-hidden="true" />
		<div>
			<p class="text-base-content font-bold">Aufnahme übertragen, Meldung nicht</p>
			<p class="text-base-content mt-1 text-sm">
				<!--
					Der Grund gehört auch hierhin. Vorher trug nur `failed` ihn, und eine
					Meldung mit angehängter Aufnahme landet immer in `partial` — eine
					abgelehnte Eingabe („E-Mail ungültig") verschwand damit spurlos hinter
					dem Aufbewahrungshinweis, und der Nutzer wiederholte ins Leere.
				-->
				{title}
				{#if showAttemptCounter}
					{attemptLabel}
				{/if}
			</p>
			<p class="text-base-content mt-1 text-sm">
				Ihre Aufnahme liegt bereits bei uns. Wir löschen sie automatisch, wenn die Meldung nicht
				innerhalb von {ORPHAN_RETENTION_HOURS} Stunden ankommt.
			</p>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				{#if onRetry}
					<button type="button" class="btn btn-primary btn-sm" onclick={onRetry}>
						<Icon icon="lucide:refresh-cw" width="16" class="shrink-0" aria-hidden="true" />
						Erneut absenden
					</button>
				{/if}
				{#if showReference}
					<span class="text-base-content/70 font-mono text-sm">Referenz: {referenceId}</span>
				{/if}
			</div>
		</div>
	</div>
{/if}
