<script lang="ts">
	/**
	 * Anonymisierung der Kontaktdaten: Status, Vorschau, Freischaltung, Lauf.
	 *
	 * Ablauf und Begründung: docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md („Freigabe
	 * des ersten Laufs", „Automatischer Betrieb danach"). Die Freischaltung ist
	 * einmalig und hat bewusst keinen Gegenknopf — der erste Lauf leert die
	 * Kontaktdaten des ganzen Bestands und lässt sich nicht umkehren.
	 *
	 * Die Regeln selbst prüft der Server (`/api/admin/anonymize/activate`); das
	 * Panel zeigt sie nur vorher an, damit niemand blind auf einen Knopf drückt.
	 */
	import { invalidateAll } from '$app/navigation';
	import Icon from '#lib/components/Icon.svelte';
	import ConfirmDialog from '#lib/components/ui/Dialog/ConfirmDialog.svelte';
	import type { AnonymizationStatus } from '#lib/server/privacy/anonymizationStatus.ts';
	import type { AnonymizationReport } from '#lib/server/privacy/anonymizeSightings.ts';
	import { ANONYMIZATION_STALE_RUN_HOURS } from '#lib/utils/privacy/anonymizationHealth.ts';
	import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';

	let {
		status,
		isSuperAdmin
	}: {
		status: AnonymizationStatus | null;
		isSuperAdmin: boolean;
	} = $props();

	/** Stapelgröße für „Jetzt ausführen" — das Maximum des Endpunkts. */
	const RUN_LIMIT = 2000;

	let preview = $state<AnonymizationReport | null>(null);
	let runResult = $state<AnonymizationReport | null>(null);
	let busy = $state(false);
	let errorMessage = $state<string | null>(null);
	let confirmInput = $state('');
	let confirmError = $state<string | null>(null);
	let zeigeLaufBestaetigung = $state(false);

	const activated = $derived(!!status?.activatedAt);
	const number = (value: number): string => value.toLocaleString('de-DE');

	const prerequisites = $derived(
		preview && status
			? {
					key: preview.keyConfigured,
					hashes: preview.pendingHashes === 0,
					spam: status.unscoredSpam === 0
				}
			: null
	);
	const prerequisitesMet = $derived(
		!!prerequisites && prerequisites.key && prerequisites.hashes && prerequisites.spam
	);

	const STATUS_PRESENTATION = {
		inactive: { label: 'Noch nicht freigeschaltet', badge: 'badge-ghost', icon: 'lucide:lock' },
		ok: { label: 'In Betrieb', badge: 'badge-success', icon: 'lucide:circle-check' },
		alert: { label: 'Handlungsbedarf', badge: 'badge-error', icon: 'lucide:circle-alert' }
	} as const;

	async function post(url: string, body?: unknown): Promise<Response> {
		return fetch(url, {
			method: 'POST',
			// Ohne Content-Type weist SvelteKit einen POST als Cross-Site-Formular ab.
			headers: { 'Content-Type': 'application/json' },
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		});
	}

	async function loadPreview(): Promise<void> {
		busy = true;
		errorMessage = null;
		try {
			const response = await post('/api/admin/anonymize');
			if (!response.ok) throw new Error(`Status ${response.status}`);
			preview = await response.json();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
		} finally {
			busy = false;
		}
	}

	async function activate(): Promise<void> {
		if (!preview) return;
		confirmError = null;
		const entered = confirmInput.replace(/[.\s]/g, '');
		if (entered !== String(preview.due)) {
			confirmError = `Die Anzahl stimmt nicht mit der Vorschau überein (${number(preview.due)}).`;
			return;
		}
		busy = true;
		try {
			const response = await post('/api/admin/anonymize/activate', { confirmedDue: preview.due });
			const body = await response.json().catch(() => ({}));
			if (response.status === 409 && body.code === 'COUNT_MISMATCH') {
				// Seit der Vorschau sind Meldungen fällig geworden — neu laden und neu
				// bestätigen lassen, statt die alte Zahl stillschweigend zu ersetzen.
				confirmError = `Die Anzahl hat sich seit der Vorschau geändert (jetzt ${number(body.due)}). Bitte Vorschau neu laden.`;
				return;
			}
			if (!response.ok) throw new Error(body.code ?? `Status ${response.status}`);
			confirmInput = '';
			await invalidateAll();
		} catch (error) {
			confirmError = error instanceof Error ? error.message : 'Unbekannter Fehler';
		} finally {
			busy = false;
		}
	}

	async function runNow(): Promise<void> {
		busy = true;
		errorMessage = null;
		try {
			const response = await post(`/api/admin/anonymize?mode=execute&limit=${RUN_LIMIT}`);
			if (!response.ok) throw new Error(`Status ${response.status}`);
			runResult = await response.json();
			await invalidateAll();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
		} finally {
			busy = false;
		}
	}
</script>

<section
	id="anonymisierung"
	class="card bg-base-100 border-base-300 shadow-raised border"
	aria-labelledby="anonymisierung-titel"
>
	<div class="card-body">
		<h2 id="anonymisierung-titel" class="card-title">
			<Icon icon="lucide:user-x" width="20" class="text-primary" aria-hidden="true" />
			Anonymisierung der Kontaktdaten
		</h2>
		<p class="text-base-content/70 text-sm">
			Kontaktdaten werden 3 Monate nach Eingang geleert. Namen und Schiffsnamen bleiben nur mit
			Einwilligung; alle Meldungen einer Person bleiben über ein Kennzeichen verknüpft.
		</p>

		{#if !status}
			<!-- `status`, nicht `alert`: Ein fehlender Status ist ein Hinweis, keine
			     Unterbrechung — dringlich ist die Hinweisleiste, wenn der Status rot ist. -->
			<div class="alert alert-warning mt-4" role="status">
				<Icon icon="lucide:triangle-alert" class="shrink-0" aria-hidden="true" />
				<span class="text-sm">Status nicht ermittelbar — Datenbank prüfen.</span>
			</div>
		{:else}
			{@const presentation = STATUS_PRESENTATION[status.health.level]}
			<div class="mt-4 flex flex-wrap items-center gap-2">
				<span class="badge {presentation.badge} gap-1">
					<Icon icon={presentation.icon} width="14" aria-hidden="true" />
					{presentation.label}
				</span>
				{#if status.activatedAt}
					<span class="text-base-content/70 text-sm">
						freigeschaltet am {formatLocalDateTime(status.activatedAt, 'datetime')}
					</span>
				{/if}
			</div>

			{#if status.health.reasons.length > 0}
				<ul class="mt-2 list-inside list-disc text-sm">
					{#if status.health.reasons.includes('overdue')}
						<li>{number(status.overdue)} Meldungen liegen über der Frist</li>
					{/if}
					{#if status.health.reasons.includes('stale_run')}
						<li>
							Der letzte Lauf liegt mehr als {ANONYMIZATION_STALE_RUN_HOURS} Stunden zurück — Cron prüfen
						</li>
					{/if}
				</ul>
			{/if}

			<p class="mt-2 text-sm">
				{#if status.lastRun}
					Letzter Lauf: {formatLocalDateTime(status.lastRun.at, 'datetime')} —
					{#if status.lastRun.skipped === 'not_activated'}
						nur Vorschau (noch nicht freigeschaltet)
					{:else if status.lastRun.skipped === 'hash_backfill_incomplete'}
						abgebrochen: Kennzeichen-Nachtrag nicht fertig
					{:else}
						{number(status.lastRun.anonymized)} anonymisiert, {number(status.lastRun.remaining)} offen
					{/if}
				{:else}
					Noch kein Lauf
				{/if}
			</p>

			<div class="mt-4 flex flex-wrap gap-2">
				<button class="btn btn-outline" disabled={busy} onclick={loadPreview}>
					Vorschau laden
				</button>
				{#if activated}
					<button
						class="btn btn-primary"
						disabled={busy}
						onclick={() => (zeigeLaufBestaetigung = true)}
					>
						Jetzt ausführen
					</button>
				{/if}
			</div>

			{#if errorMessage}
				<div class="alert alert-error mt-4" role="alert">
					<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
					<span class="text-sm">Anfrage fehlgeschlagen: {errorMessage}</span>
				</div>
			{/if}

			{#if runResult}
				<div class="alert alert-info mt-4" role="status">
					<Icon icon="lucide:info" class="shrink-0" aria-hidden="true" />
					<span class="text-sm">
						{number(runResult.anonymized)} Meldungen anonymisiert, {number(runResult.remaining)} noch
						fällig.
						{#if !runResult.done}Erneut ausführen, um fortzusetzen.{/if}
					</span>
				</div>
			{/if}

			{#if preview}
				<div class="mt-4 space-y-3">
					<p class="text-sm">
						Fällig: <strong data-testid="anonymization-due">{number(preview.due)}</strong> Meldungen
						{#if preview.newestDueReceivedAt}
							(Eingang bis {formatLocalDateTime(preview.newestDueReceivedAt, 'date')})
						{/if}
					</p>

					{#if preview.byYear.length > 0}
						<div class="overflow-x-auto">
							<table class="table-sm table">
								<caption class="sr-only">Fällige Meldungen nach Eingangsjahr</caption>
								<thead>
									<tr>
										<th scope="col">Jahr</th>
										<th scope="col" class="text-right">Meldungen</th>
										<th scope="col" class="text-right">Namen geleert</th>
										<th scope="col" class="text-right">Namen behalten</th>
										<th scope="col" class="text-right">Schiffe geleert</th>
										<th scope="col" class="text-right">Schiffe behalten</th>
										<th scope="col" class="text-right">davon offen</th>
										<th scope="col" class="text-right">davon abgelehnt</th>
									</tr>
								</thead>
								<tbody>
									{#each preview.byYear as row (row.year)}
										<tr>
											<td>{row.year}</td>
											<td class="text-right">{number(row.total)}</td>
											<td class="text-right">{number(row.namesCleared)}</td>
											<td class="text-right">{number(row.namesKept)}</td>
											<td class="text-right">{number(row.shipsCleared)}</td>
											<td class="text-right">{number(row.shipsKept)}</td>
											<td class="text-right">{number(row.open)}</td>
											<td class="text-right">{number(row.rejected)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}

					{#if !activated && prerequisites}
						<div>
							<h3 class="text-sm font-semibold">Vorbedingungen der Freischaltung</h3>
							<ul class="mt-1 space-y-1 text-sm">
								<li class="flex items-center gap-2">
									<Icon
										icon={prerequisites.key ? 'lucide:circle-check' : 'lucide:circle-x'}
										class={prerequisites.key ? 'text-success-strong' : 'text-error'}
										aria-hidden="true"
									/>
									{prerequisites.key ? 'Schlüssel gesetzt' : 'Schlüssel fehlt (REPORTER_HASH_KEY)'}
								</li>
								<li class="flex items-center gap-2">
									<Icon
										icon={prerequisites.hashes ? 'lucide:circle-check' : 'lucide:circle-x'}
										class={prerequisites.hashes ? 'text-success-strong' : 'text-error'}
										aria-hidden="true"
									/>
									{prerequisites.hashes
										? 'Alle Adressen haben ein Kennzeichen'
										: `${number(preview.pendingHashes)} Adressen noch ohne Hash`}
								</li>
								<li class="flex items-center gap-2">
									<Icon
										icon={prerequisites.spam ? 'lucide:circle-check' : 'lucide:circle-x'}
										class={prerequisites.spam ? 'text-success-strong' : 'text-error'}
										aria-hidden="true"
									/>
									{prerequisites.spam
										? 'Spam-Nachbewertung abgeschlossen'
										: `${number(status.unscoredSpam)} Meldungen noch ohne Spam-Bewertung`}
								</li>
							</ul>
						</div>

						{#if isSuperAdmin && prerequisitesMet}
							<div class="border-base-300 rounded-box border p-4">
								<p class="text-sm">
									Die Freischaltung ist <strong>einmalig und nicht umkehrbar</strong>. Vorher:
									Backup ziehen und die schriftliche Freigabe des Museums zu genau dieser Anzahl
									einholen.
								</p>
								<label class="fieldset mt-2" for="anonymisierung-anzahl">
									<span class="fieldset-legend">Anzahl fälliger Meldungen zur Bestätigung</span>
									<input
										id="anonymisierung-anzahl"
										class="input"
										inputmode="numeric"
										autocomplete="off"
										bind:value={confirmInput}
										aria-invalid={confirmError ? 'true' : undefined}
										aria-describedby={confirmError ? 'anonymisierung-anzahl-fehler' : undefined}
									/>
								</label>
								{#if confirmError}
									<p id="anonymisierung-anzahl-fehler" class="text-error mt-1 text-sm" role="alert">
										{confirmError}
									</p>
								{/if}
								<button
									class="btn btn-outline btn-error btn-sm mt-3"
									disabled={busy}
									onclick={activate}
								>
									Freischalten
								</button>
							</div>
						{/if}
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</section>

<ConfirmDialog
	bind:show={zeigeLaufBestaetigung}
	title="Kontaktdaten anonymisieren"
	message={`Fällige Meldungen jetzt anonymisieren (höchstens ${number(RUN_LIMIT)} je Lauf)?`}
	detail="Geleerte Kontaktdaten lassen sich nicht wiederherstellen."
	confirmLabel="Anonymisieren"
	cancelLabel="Abbrechen"
	closeLabel="Dialog schließen"
	onConfirm={runNow}
/>
