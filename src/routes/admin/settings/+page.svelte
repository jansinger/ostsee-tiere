<script lang="ts">
	import { createLogger } from '#lib/logger.ts';
	import type { ConfigItem, ConfigValue } from '#lib/server/db/configRepository.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { untrack } from 'svelte';
	import CleanupPanel from './CleanupPanel.svelte';
	import ResetSettingsButton from './ResetSettingsButton.svelte';
	import { ACTIVE_CONFIG_KEYS, getConfigLabel } from './configLabels';
	import { buildSaveSummary } from './saveSummary';

	const logger = createLogger('admin:settings');

	let { data } = $props();
	let groupedConfigs = $state(untrack(() => data.groupedConfigs));
	let saveMessage = $state('');
	let errorMessage = $state(untrack(() => data.error || ''));
	let savingStates = $state<Record<string, boolean>>({});
	let changedConfigs = $state<Set<string>>(new Set());
	let showAllSettings = $state(false);
	let isSuperAdmin = $derived(data.isSuperAdmin || false);

	const categoryIcons: Record<string, string> = {
		email: 'lucide:mail',
		display: 'lucide:globe',
		security: 'lucide:lock',
		data: 'lucide:settings',
		integration: 'lucide:globe',
		mobile: 'lucide:smartphone'
	};

	const categoryLabels: Record<string, string> = {
		email: 'E-Mail Einstellungen',
		display: 'Anzeige-Einstellungen',
		security: 'Sicherheit & Validierung',
		data: 'Datenverarbeitung',
		integration: 'Integration',
		mobile: 'Mobile App'
	};

	const categoryDescriptions: Record<string, string> = {
		email:
			'Interne Benachrichtigung über neue Sichtungen und SMTP-Zugang. Meldende Personen erhalten derzeit keine E-Mail.',
		display: 'Anpassung der Benutzeroberfläche und Kartenansichten',
		security: 'Sicherheitseinstellungen und Upload-Beschränkungen',
		data: 'Einstellungen für Datenverarbeitung und Validierung',
		integration: 'APIs und externe Service-Integrationen',
		mobile: 'Mobile App-spezifische Einstellungen'
	};

	// Labels und die Liste der wirksamen Einstellungen liegen in configLabels.ts —
	// dort sind sie durch configLabels.test.ts gegen die Vorbelegungen abgeglichen.
	const activeConfigKeys = ACTIVE_CONFIG_KEYS;

	// Filter configurations to only show active ones
	function filterActiveConfigs(
		configs: Record<string, ConfigItem[]>
	): Record<string, ConfigItem[]> {
		const filtered: Record<string, ConfigItem[]> = {};

		for (const [category, configList] of Object.entries(configs)) {
			const activeConfigs = configList.filter((config) => activeConfigKeys.has(config.key));
			if (activeConfigs.length > 0) {
				filtered[category] = activeConfigs;
			}
		}

		return filtered;
	}

	// Apply filtering to the configurations
	$effect(() => {
		if (showAllSettings) {
			groupedConfigs = data.groupedConfigs;
		} else {
			groupedConfigs = filterActiveConfigs(data.groupedConfigs);
		}
	});

	function getValueDisplay(value: unknown): string {
		if (value === null || value === undefined) return '';
		if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
		if (Array.isArray(value)) return value.join(', ');
		if (typeof value === 'object') return JSON.stringify(value, null, 2);
		return String(value);
	}

	function getInputType(value: unknown): string {
		if (typeof value === 'boolean') return 'checkbox';
		if (typeof value === 'number') return 'number';
		if (Array.isArray(value)) return 'tags';
		if (typeof value === 'object') return 'json';
		if (typeof value === 'string' && value.length > 100) return 'textarea';
		return 'text';
	}

	/**
	 * Die vom Bearbeiter eingegebenen Werte — **neben** `data`, nicht darin.
	 *
	 * Vorher schrieb `handleInputChange` direkt `config.value`, also in ein
	 * Objekt aus `data.groupedConfigs`. Dass das nicht auffiel, lag an einem
	 * Zufall mit zwei Hälften:
	 *
	 * - Der Schreibvorgang erreichte `data` gar nicht. `groupedConfigs` ist ein
	 *   `$state`-Proxy; Svelte 5 hält die Werte in eigenen Signalen und schreibt
	 *   sie **nicht** in das Zielobjekt zurück. Die Eingabe lebte also im Proxy.
	 * - Genau deshalb ging sie verloren, sobald der Proxy ersetzt wurde. Der
	 *   „Alle Einstellungen anzeigen"-Toggle tut das (`groupedConfigs =
	 *   data.groupedConfigs` bzw. das gefilterte Ergebnis): Das Feld sprang auf
	 *   den Wert des Loaders zurück, `changedConfigs` meldete die Änderung aber
	 *   weiter — und „Speichern" schrieb den alten Wert in die Datenbank, ohne
	 *   dass irgendwo etwas rot geworden wäre.
	 *
	 * Ein `SvelteMap` über den **Schlüssel** hängt an nichts davon: Weder ein
	 * neues `data` noch ein neu gebautes gefiltertes Array berührt ihn.
	 *
	 * Er wird beim Speichern **nicht** geleert. Der Loader läuft dabei nicht
	 * erneut, `config.value` trüge also weiter den alten Stand — das Feld
	 * spränge nach dem Speichern sichtbar zurück. Geleert wird stattdessen
	 * `changedConfigs`: Das ist die Frage „ungespeichert?", und die ist eine
	 * andere als „was steht im Feld?".
	 */
	const eigeneWerte = new SvelteMap<string, ConfigValue>();

	/** Was im Feld steht: die Eingabe, sonst der Wert des Loaders. */
	function wertVon(config: ConfigItem): ConfigValue {
		return eigeneWerte.has(config.key)
			? (eigeneWerte.get(config.key) as ConfigValue)
			: config.value;
	}

	function handleInputChange(config: ConfigItem, newValue: unknown) {
		eigeneWerte.set(config.key, newValue as ConfigValue);
		changedConfigs = new SvelteSet(changedConfigs).add(config.key);
	}

	function handleArrayChange(config: ConfigItem, event: Event) {
		const target = event.target as HTMLInputElement;
		const value = target.value;

		// Split by comma and trim whitespace
		const arrayValue = value
			.split(',')
			.map((item) => item.trim())
			.filter((item) => item.length > 0);
		handleInputChange(config, arrayValue);
	}

	function handleJsonChange(config: ConfigItem, event: Event) {
		const target = event.target as HTMLTextAreaElement;
		try {
			const jsonValue = JSON.parse(target.value);
			handleInputChange(config, jsonValue);
		} catch (_error) {
			// Invalid JSON - keep as string for now
			handleInputChange(config, target.value);
		}
	}

	/**
	 * Speichert eine Einstellung.
	 *
	 * **Die Meldungstexte tragen kein Emoji.** Sie landen im Textknoten eines
	 * `alert-success`/`alert-error`, und dort trägt laut Alert-Regel
	 * (`design-system.md`) das **Icon** die Bedeutung — jede Variante hat eine
	 * eigene Form. Ein vorangestelltes „✅"/„❌" sagte dasselbe ein zweites Mal
	 * und wurde von Screenreadern als „Häkchensymbol" mitgelesen. Das gilt für
	 * alle Meldungen dieser Seite, auch die von `saveAllChanges`,
	 * `resetToDefaults` und den beiden Test-Aktionen.
	 *
	 * **Der Rückgabewert ist neu und der Kern des Fixes:** `saveAllChanges` hat
	 * den Ausgang vorher aus `changedConfigs.size` erschlossen und lag damit bei
	 * jedem Teilfehlschlag falsch (siehe `saveSummary.ts`). Ein Aufruf, der
	 * sagt, ob er funktioniert hat, ist die Voraussetzung dafür, dass die
	 * Zusammenfassung stimmt.
	 *
	 * `false` auch beim Doppelklick-Abbruch oben: Aus Sicht des Aufrufers ist
	 * „läuft schon" kein gespeicherter Wert.
	 *
	 * **`silent` unterdrückt Meldung UND Timer.** Im Bulk-Lauf meldet der
	 * Einzelaufruf nicht — gemeldet wird einmal am Ende über `buildSaveSummary`.
	 * Es geht dabei nicht nur um die Zahl der Meldungen: Jeder Aufruf plante ein
	 * `setTimeout` auf dieselbe Variable, in die `saveAllChanges` danach seine
	 * Zusammenfassung schreibt. Die stand damit in einem Feld, für das bereits
	 * ein fremder Löschauftrag lief, und verschwand nach fünf Sekunden — obwohl
	 * sie im Fehlerfall bewusst ohne eigenen Timer gesetzt wird. Gleiche
	 * Konstruktion und gleiche Begründung wie `submitVerdict(id, v, { silent:
	 * true })` beim Bulk-Verdict der Sichtungstabelle.
	 */
	async function saveConfig(config: ConfigItem, options?: { silent?: boolean }): Promise<boolean> {
		if (savingStates[config.key]) return false;
		const silent = options?.silent ?? false;

		savingStates[config.key] = true;

		try {
			const requestBody = {
				key: config.key,
				value: wertVon(config),
				description: config.description,
				category: config.category
			};

			const response = await fetch('/api/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				throw new Error('Failed to save configuration');
			}

			const newChangedConfigs = new SvelteSet(changedConfigs);
			newChangedConfigs.delete(config.key);
			changedConfigs = newChangedConfigs;

			if (silent) return true;

			// Special handling for maintenance mode
			if (config.key === 'display.maintenanceMode') {
				const isEnabled = Boolean(wertVon(config));
				saveMessage = `Wartungsmodus ${isEnabled ? 'aktiviert' : 'deaktiviert'} - Änderung ist sofort wirksam`;
			} else {
				saveMessage = `${config.key} gespeichert`;
			}

			errorMessage = '';

			setTimeout(() => (saveMessage = ''), 5000);
			return true;
		} catch (error) {
			logger.error({ error, config: config.key }, 'Failed to save configuration');
			if (silent) return false;
			errorMessage = `Fehler beim Speichern von ${config.key}`;
			setTimeout(() => (errorMessage = ''), 5000);
			return false;
		} finally {
			savingStates[config.key] = false;
		}
	}

	async function saveAllChanges() {
		const configsToSave = [];

		for (const [_category, configs] of Object.entries(groupedConfigs)) {
			for (const config of configs) {
				if (changedConfigs.has(config.key)) {
					configsToSave.push(config);
				}
			}
		}

		if (configsToSave.length === 0) {
			saveMessage = 'Keine Änderungen zu speichern';
			setTimeout(() => (saveMessage = ''), 3000);
			return;
		}

		/* Ausgänge zählen statt sie aus `changedConfigs.size` zu erschließen: Die
		   frühere Bedingung `=== 0` war bei jedem Teilfehlschlag falsch, und die
		   Einzelfehlermeldung aus `saveConfig` überschrieb sich dabei selbst — es
		   erschien am Ende gar nichts, während ein Wert nicht gespeichert war.
		   Begründung und Wortlaute in `saveSummary.ts`. */
		let saved = 0;
		let failed = 0;
		for (const config of configsToSave) {
			/* `silent`: Sonst schriebe jeder Einzelaufruf seine eigene Meldung in
			   dieselbe Variable — und plante einen Timer darauf, der die
			   Zusammenfassung unten wieder wegräumte (Docblock an `saveConfig`). */
			if (await saveConfig(config, { silent: true })) saved++;
			else failed++;
		}

		const summary = buildSaveSummary(saved, failed);
		/* Ein Teilerfolg gehört nicht in ein grünes Feld — sonst liest sich
		   „3 von 5 gespeichert" wie ein abgeschlossener Vorgang. Die
		   Erfolgsmeldung bekommt weiterhin ihren Timer; der Fehlerfall bleibt
		   stehen, bis der nächste Versuch ihn ersetzt. */
		if (summary.hasFailures) {
			errorMessage = summary.message;
			saveMessage = '';
		} else {
			saveMessage = summary.message;
			errorMessage = '';
			setTimeout(() => (saveMessage = ''), 5000);
		}
	}

	async function resetToDefaults() {
		try {
			const response = await fetch('/api/config/reset', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			/* Der `else`-Zweig fehlte: Bei 403 oder 500 passierte gar nichts — kein
			   Reload, keine Meldung. Für eine destruktive Aktion hinter einem
			   Bestätigungsdialog ist das die schlechteste Rückmeldung; sie sieht aus
			   wie ein Klick, der nicht angekommen ist. Der `catch` darunter fängt
			   nur Netzwerkfehler und hat den Fall nie erreicht. */
			if (!response.ok) {
				logger.error({ status: response.status }, 'Failed to reset configurations');
				errorMessage = `Zurücksetzen fehlgeschlagen (Fehler ${response.status}) — die Einstellungen sind unverändert`;
				setTimeout(() => (errorMessage = ''), 5000);
				return;
			}

			// Reload page to get fresh data
			window.location.reload();
		} catch (error) {
			logger.error({ error }, 'Failed to reset configurations');
			errorMessage = 'Fehler beim Zurücksetzen der Einstellungen';
			setTimeout(() => (errorMessage = ''), 5000);
		}
	}

	async function testEmailConfiguration(recipientEmail: string) {
		try {
			const response = await fetch('/api/config/test-email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipient: recipientEmail })
			});

			const result = await response.json();

			if (response.ok && result.success) {
				saveMessage = 'Test-E-Mail wurde erfolgreich gesendet';
				setTimeout(() => (saveMessage = ''), 5000);
			} else {
				errorMessage = result.message || 'Test-E-Mail konnte nicht gesendet werden';
				setTimeout(() => (errorMessage = ''), 5000);
			}
		} catch (error) {
			logger.error({ error }, 'Failed to send test email');
			errorMessage = 'Fehler beim Senden der Test-E-Mail';
			setTimeout(() => (errorMessage = ''), 5000);
		}
	}

	function handleTestEmail(_config: unknown) {
		/* `wertVon`, nicht `.value`: Wer die Empfängeradresse gerade korrigiert
		   hat und dann „Test-E-Mail" drückt, meint die neue. */
		const eintrag = groupedConfigs.email?.find((c) => c.key === 'notification.email.recipient');
		const recipient = eintrag && wertVon(eintrag);
		if (recipient && typeof recipient === 'string' && recipient.includes('@')) {
			testEmailConfiguration(recipient);
		} else {
			errorMessage = 'Bitte konfigurieren Sie zuerst eine gültige Empfänger-E-Mail-Adresse';
			setTimeout(() => (errorMessage = ''), 5000);
		}
	}

	async function testMaintenanceMode() {
		try {
			const response = await fetch('/api/maintenance-status', {
				method: 'GET',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = await response.json();

			if (response.ok) {
				const status = result.enabled ? 'aktiviert' : 'deaktiviert';
				saveMessage = `Wartungsmodus-Status: ${status} (${result.timestamp})`;
				setTimeout(() => (saveMessage = ''), 5000);
			} else {
				errorMessage = result.message || 'Wartungsmodus-Status konnte nicht abgerufen werden';
				setTimeout(() => (errorMessage = ''), 5000);
			}
		} catch (error) {
			logger.error({ error }, 'Failed to test maintenance mode');
			errorMessage = 'Fehler beim Testen des Wartungsmodus';
			setTimeout(() => (errorMessage = ''), 5000);
		}
	}
</script>

<svelte:head>
	<title>Einstellungen - Admin | Ostsee-Tiere</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-base-content text-display flex items-center gap-3 font-bold">
				<Icon
					icon="lucide:settings"
					width="32"
					height="32"
					class="text-primary"
					aria-hidden="true"
				/>
				Anwendungseinstellungen
			</h1>
			<p class="text-base-content/70 mt-2">
				Konfigurieren Sie alle Aspekte der Ostsee-Tiere Anwendung über diese zentrale Oberfläche.
			</p>
		</div>

		<div class="flex gap-3">
			<!-- Toggle for showing all/active settings - only visible to superadmins -->
			{#if isSuperAdmin}
				<div class="fieldset">
					<label class="flex cursor-pointer items-center gap-2">
						<span class="text-sm">Alle Einstellungen anzeigen</span>
						<input
							type="checkbox"
							class="toggle toggle-primary toggle-sm"
							bind:checked={showAllSettings}
							title={showAllSettings
								? 'Nur aktive Einstellungen anzeigen'
								: 'Alle Einstellungen anzeigen (inkl. geplante Features)'}
						/>
					</label>
				</div>
			{/if}

			{#if changedConfigs.size > 0}
				<button onclick={saveAllChanges} class="btn btn-success gap-2">
					<Icon icon="lucide:save" class="size-5" />
					Alle Änderungen speichern ({changedConfigs.size})
				</button>
			{/if}
		</div>
	</div>

	<!-- Messages -->
	{#if saveMessage}
		<div class="alert alert-success mb-6" role="status">
			<Icon icon="lucide:circle-check" class="shrink-0" aria-hidden="true" />
			<span>{saveMessage}</span>
		</div>
	{/if}

	{#if errorMessage}
		<div class="alert alert-error mb-6" role="alert">
			<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
			<span>{errorMessage}</span>
		</div>
	{/if}

	<!-- Info about filtered settings - only visible to superadmins -->
	{#if isSuperAdmin && !showAllSettings}
		{@const totalCategories = Object.keys(data.groupedConfigs).length}
		{@const activeCategories = Object.keys(groupedConfigs).length}
		{@const totalSettings = Object.values(data.groupedConfigs).flat().length}
		{@const activeSettings = Object.values(groupedConfigs).flat().length}

		<div class="alert alert-info mb-6">
			<div>
				<div class="flex items-center gap-2">
					<Icon icon="lucide:settings" class="size-5" />
					<span class="font-semibold">Nur aktiv genutzte Einstellungen werden angezeigt</span>
				</div>
				<p class="mt-1 text-sm">
					Angezeigt: {activeSettings} von {totalSettings} Einstellungen in {activeCategories} von {totalCategories}
					Kategorien. Schalten Sie den Toggle oben rechts um, um alle geplanten Einstellungen zu sehen.
				</p>
			</div>
		</div>
	{/if}

	<!-- Configuration Categories -->
	<div class="grid gap-8 lg:grid-cols-2">
		{#each Object.entries(groupedConfigs) as [category, configs] (category)}
			{@const iconName = categoryIcons[category] || 'lucide:settings'}
			<div class="card bg-base-100 shadow-raised">
				<div class="card-body">
					<h2 class="card-title mb-4 flex items-center gap-3">
						<Icon icon={iconName} class="text-primary size-7" />
						<div class="flex-1">
							<div class="text-xl">{categoryLabels[category] || category}</div>
							<div class="text-base-content/60 text-sm font-normal">
								{categoryDescriptions[category] || ''}
							</div>
						</div>

						<!-- Special actions for email category -->
						{#if category === 'email'}
							<button
								onclick={() => handleTestEmail(configs)}
								class="btn btn-outline btn-sm gap-1"
								title="Test-E-Mail senden"
							>
								<Icon icon="lucide:send" class="size-4" />
								Test-E-Mail
							</button>
						{/if}

						<!-- Special actions for display category (maintenance mode) -->
						{#if category === 'display'}
							<button
								onclick={testMaintenanceMode}
								class="btn btn-outline btn-sm gap-1"
								title="Wartungsmodus-Status testen"
							>
								<Icon icon="lucide:refresh-cw" class="size-4" />
								Status testen
							</button>
						{/if}
					</h2>

					<div class="space-y-6">
						{#each configs as config (config.key)}
							<!-- `config.value` und bewusst nicht `wertVon(config)`: Welches
						     Bedienelement eine Einstellung braucht, entscheidet ihr
						     gespeicherter Typ, nicht der halb getippte Zwischenstand. Bei
						     ungültigem JSON legt `handleJsonChange` den Rohtext ab — aus
						     der Eingabe gelesen wechselte das Feld dabei mitten im Tippen
						     von der JSON-Textarea auf ein einzeiliges Textfeld. -->
							{@const inputType = getInputType(config.value)}

							<div
								class="rounded-lg border p-4 {changedConfigs.has(config.key)
									? 'border-warning bg-warning/5'
									: activeConfigKeys.has(config.key)
										? 'border-base-300'
										: 'border-base-300 bg-base-200'}"
							>
								<!-- Config Header -->
								<div class="mb-3 flex items-start justify-between">
									<div class="flex-1">
										<div class="flex items-center gap-2">
											<div class="text-base-content text-sm font-semibold">
												{getConfigLabel(config.key)}
											</div>
											{#if changedConfigs.has(config.key)}
												<span class="badge badge-warning badge-sm">Geändert</span>
											{:else if showAllSettings && !activeConfigKeys.has(config.key)}
												<span class="badge badge-outline badge-sm text-base-content/60"
													>Geplant</span
												>
											{/if}
										</div>
										{#if config.description}
											<p class="text-base-content/70 mt-1 text-sm">{config.description}</p>
										{/if}
										<!-- Der technische Schlüssel bleibt sichtbar, nur nicht mehr als
										     Überschrift: er wird für Support-Rückfragen und beim Abgleich
										     mit .env / Logs gebraucht. -->
										<p class="text-base-content/70 text-support mt-1 font-mono">{config.key}</p>
									</div>

									{#if changedConfigs.has(config.key)}
										<button
											onclick={() => saveConfig(config)}
											disabled={savingStates[config.key]}
											class="btn btn-success btn-sm gap-1"
										>
											{#if savingStates[config.key]}
												<span class="loading loading-spinner loading-xs"></span>
											{:else}
												<Icon icon="lucide:check" class="size-4" />
											{/if}
											Speichern
										</button>
									{/if}
								</div>

								<!-- Config Input -->
								<div class="fieldset w-full">
									{#if inputType === 'checkbox'}
										<label class="flex cursor-pointer items-center justify-start gap-3">
											<input
												type="checkbox"
												class="checkbox checkbox-primary"
												checked={Boolean(wertVon(config))}
												onchange={(e) =>
													handleInputChange(config, (e.target as HTMLInputElement).checked)}
											/>
											<span>
												{wertVon(config) ? 'Aktiviert' : 'Deaktiviert'}
											</span>
										</label>
									{:else if inputType === 'number'}
										<input
											type="number"
											class="input w-full"
											value={Number(wertVon(config))}
											oninput={(e) =>
												handleInputChange(config, Number((e.target as HTMLInputElement).value))}
											placeholder="Numerischer Wert"
										/>
									{:else if inputType === 'tags'}
										<div>
											<input
												type="text"
												class="input w-full"
												value={Array.isArray(wertVon(config))
													? (wertVon(config) as string[]).join(', ')
													: ''}
												oninput={(e) => handleArrayChange(config, e)}
												placeholder="Werte durch Komma getrennt"
											/>
											<div class="label">
												<span class="text-base-content/60">
													Aktuelle Werte: {getValueDisplay(wertVon(config)) || 'Keine'}
												</span>
											</div>
										</div>
									{:else if inputType === 'json'}
										<textarea
											class="textarea h-24 font-mono text-sm"
											value={typeof wertVon(config) === 'object'
												? JSON.stringify(wertVon(config), null, 2)
												: String(wertVon(config))}
											oninput={(e) => handleJsonChange(config, e)}
											placeholder="JSON-Format"></textarea>
									{:else if inputType === 'textarea'}
										<textarea
											class="textarea h-32"
											value={String(wertVon(config))}
											oninput={(e) =>
												handleInputChange(config, (e.target as HTMLTextAreaElement).value)}
											placeholder="Mehrzeiliger Text"></textarea>
									{:else}
										<input
											type="text"
											class="input w-full"
											value={String(wertVon(config))}
											oninput={(e) =>
												handleInputChange(config, (e.target as HTMLTextAreaElement).value)}
											placeholder="Textwert"
										/>
									{/if}
								</div>

								<!-- Current Value Display (for complex types) -->
								{#if inputType === 'json' || inputType === 'tags'}
									<div class="bg-base-200 text-support mt-2 rounded p-2">
										<strong>Aktueller Wert:</strong>
										<pre class="mt-1 whitespace-pre-wrap">{getValueDisplay(wertVon(config))}</pre>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Summary -->
	{#if changedConfigs.size > 0}
		<div class="alert alert-info mt-8">
			<Icon icon="lucide:info" class="shrink-0" aria-hidden="true" />
			<div>
				<h3 class="text-lg font-semibold">Ungespeicherte Änderungen</h3>
				<p>
					Sie haben {changedConfigs.size} ungespeicherte Änderungen. Vergessen Sie nicht, diese zu speichern!
				</p>
				<div class="mt-2">
					<button onclick={saveAllChanges} class="btn btn-success btn-sm"> Alle speichern </button>
				</div>
			</div>
		</div>
	{/if}

	<div class="mt-6">
		<CleanupPanel />
	</div>

	<!-- Destruktive Aktion ans Seitenende, weg vom prominentesten Platz oben rechts
	     (X2 im Admin-Improvements-Spec): Bestätigungsdialog statt confirm(). -->
	<div class="mt-6 flex justify-end">
		<ResetSettingsButton onReset={resetToDefaults} />
	</div>
</div>
