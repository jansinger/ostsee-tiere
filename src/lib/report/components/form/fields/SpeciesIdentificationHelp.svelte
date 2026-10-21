<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import type { InfoVariant } from '#lib/components/info/variant.ts';
	import { speciesGroups } from '#lib/report/formOptions/species.ts';
	import {
		getFrequencyLabels,
		getObservabilityLabels,
		speciesIdentification,
		type FrequencyLevel,
		type Observability
	} from '#lib/report/formOptions/speciesIdentification.ts';
	import type { SightingFormData } from '#lib/types/index.ts';
	import { sanitizeHtml } from '#lib/utils/sanitize.ts';

	let {
		currentValue = undefined,
		variant = 'inline'
	}: {
		currentValue?: SightingFormData[keyof SightingFormData];
		/**
		 * `inline` ist die eingebettete Hilfe im Sichtungsformular: zugeklappt
		 * hinter einem Toggle, Überschriften ab h4, kompakte Schrift.
		 * `page` ist die eigenständige Route `/bestimmungshilfe`: sofort sichtbar,
		 * Überschriften ab h2 (die h1 gehört der Route) und Schriftgrößen aus den
		 * Typografie-Rollen statt 12px.
		 *
		 * Bewusst EINE Prop statt `defaultExpanded` + `headingLevel`: die beiden
		 * kippen immer gemeinsam, zwei Props ließen die sinnlose Kombination
		 * „aufgeklappt, aber h4" zu.
		 *
		 * Derselbe Typ wie an `DeadFindingNotice`/`DataUsageNotice` — die drei
		 * erscheinen immer gemeinsam und dürfen nicht auseinanderlaufen.
		 */
		variant?: InfoVariant;
	} = $props();

	const isPage = $derived(variant === 'page');

	/*
	 * Alle variantenabhängigen Tags und Klassen an einer Stelle statt als
	 * `{#if}`-Streuung im Markup. Die Klassennamen stehen ausgeschrieben, weil
	 * Tailwind Utilities nur aus vollständigen Strings im Quelltext erzeugt —
	 * zusammengesetzte Namen landen nicht im Build (siehe .claude/rules/daisyui.md).
	 */
	const INLINE_STYLE = {
		sectionTag: 'h5',
		subTag: 'h6',
		groupHeading: 'text-primary mb-2 text-sm font-medium',
		panelHeading: 'text-base-content mb-1 flex items-center gap-1 text-xs font-semibold',
		subHeading: 'text-base-content mb-1 text-xs font-medium',
		subHeadingWithIcon: 'text-base-content mb-1 flex items-center gap-1 text-xs font-medium',
		body: 'text-base-content/80 text-xs',
		list: 'text-base-content/80 ml-3 list-disc space-y-0.5 text-xs',
		support: 'text-base-content/70 text-xs',
		/* `/70`, nicht `/60`: Die Grunddaten (Größe, Gewicht, wissenschaftlicher
		   Name) sind Sekundärtext, und der gehört laut design-system.md auf `/70`
		   — `/60` ist die Untergrenze für Dekoratives, nicht der Normalwert. Beim
		   Bündeln in diese Konstante war der richtige Moment, das zu ziehen. */
		muted: 'text-base-content/70 text-xs',
		/* `min-h-[var(--target-min)]` statt `min-h-11`: WCAG 2.5.5 will die ganze
		   Zusammenfassungszeile als Ziel, und der zentrale Touch-Target-Block in
		   `app.css` greift hier nicht — er zielt auf `.btn`, ein
		   `summary.collapse-title` ist keiner. Über den Token nimmt die Zeile die
		   56px des Feldmodus mit, ein fester Pixelwert täte das nicht. */
		summary: 'collapse-title min-h-[var(--target-min)] py-3 text-sm font-medium',
		iconWidth: '14'
	} as const;

	const PAGE_STYLE = {
		sectionTag: 'h2',
		subTag: 'h3',
		groupHeading: 'text-primary mt-8 mb-3 text-2xl font-bold',
		panelHeading: 'text-base-content mb-2 flex items-center gap-2 text-lg font-semibold',
		subHeading: 'text-base-content mb-1 text-lg font-semibold',
		subHeadingWithIcon: 'text-base-content mb-1 flex items-center gap-2 text-lg font-semibold',
		body: 'text-base-content/80 text-base',
		list: 'text-base-content/80 ml-4 list-disc space-y-1 text-base',
		support: 'text-base-content/70 text-support',
		muted: 'text-base-content/70 text-support',
		/* Siehe INLINE_STYLE.summary — der Token gilt in beiden Varianten. */
		summary: 'collapse-title min-h-[var(--target-min)] py-3 text-lg font-medium',
		iconWidth: '20'
	} as const;

	const styles = $derived(isPage ? PAGE_STYLE : INLINE_STYLE);

	// Die Komponente wird mehrfach gerendert (Tierart-Feld und generisches
	// Hilfe-Panel). Feste IDs wären im DOM doppelt und würden `aria-controls` und
	// `aria-labelledby` unbrauchbar machen.
	//
	// `$props.id()` darf pro Komponente nur EINMAL aufgerufen werden (Svelte:
	// `props_duplicate`) — der Rückgabewert ist das Instanz-Präfix, aus dem alle
	// weiteren IDs abgeleitet werden.
	const uid = $props.id();
	const helpContentId = `${uid}-content`;
	// WCAG 2.1 4.1.2: Ohne Namen meldet der Screenreader das Bild-Modal nur als
	// „Dialog". Den Namen trägt die Überschrift im Dialog, nicht ein zweiter,
	// eigenständig alternder `aria-label`-Text.
	const modalTitleId = `${uid}-modal-title`;

	// Auf der eigenen Seite gibt es nichts aufzuklappen — der Inhalt IST die Seite.
	let isExpanded = $state(false);
	const showContent = $derived(isPage || isExpanded);
	let modalImageSrc = $state<string | null>(null);
	let modalImageAlt = $state<string>('');
	let modalImageCopyright = $state<string | null>(null);
	let modalElement = $state<HTMLDialogElement | null>(null);
	let modalCloseTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		return () => {
			if (modalCloseTimer !== null) clearTimeout(modalCloseTimer);
		};
	});

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	function openImageModal(src: string, alt: string, copyright: string | null = null) {
		if (modalCloseTimer !== null) {
			clearTimeout(modalCloseTimer);
			modalCloseTimer = null;
		}
		modalImageSrc = src;
		modalImageAlt = alt;
		modalImageCopyright = copyright;
		modalElement?.showModal();
	}

	function closeImageModal() {
		modalElement?.close();
		// deferred state reset is handled by handleDialogClose (onclose event)
	}

	function handleDialogClose() {
		// Fires for ALL close paths: button, backdrop click, and native Escape key.
		// State is cleared after the DaisyUI animation completes to avoid flicker
		// (the close event fires synchronously, before the animation ends).
		if (modalCloseTimer !== null) clearTimeout(modalCloseTimer);
		modalCloseTimer = setTimeout(() => {
			modalImageSrc = null;
			modalImageAlt = '';
			modalImageCopyright = null;
			modalCloseTimer = null;
		}, 250);
	}

	const frequencyBadge: Record<FrequencyLevel, string> = {
		resident: 'badge-success',
		regular: 'badge-info',
		rare: 'badge-warning',
		vagrant: 'badge-error'
	};

	const observabilityBadge: Record<Observability, string> = {
		distance: 'badge-success',
		closeup: 'badge-warning',
		background: 'badge-ghost'
	};

	// Reihenfolge bewusst: zuerst das, was man im Feld tatsächlich sieht.
	const observabilityOrder: Observability[] = ['distance', 'closeup', 'background'];

	const groupedData = Object.entries(speciesGroups).map(([groupName, species]) => ({
		groupName,
		species: species.map((s) => ({ enum: s, ...speciesIdentification[s] }))
	}));

	function featuresFor(
		features: (typeof speciesIdentification)[keyof typeof speciesIdentification]['distinguishing'],
		observability: Observability
	) {
		return features.filter((f) => f.observability === observability);
	}
</script>

<div class={isPage ? 'help-page' : 'help-inline mt-2'}>
	<!-- Toggle Button — auf der eigenen Seite gibt es nichts aufzuklappen -->
	{#if !isPage}
		<button
			type="button"
			class="btn btn-ghost btn-sm flex w-full justify-start gap-2 text-left"
			onclick={toggleExpanded}
			aria-expanded={isExpanded}
			aria-controls={helpContentId}
		>
			<Icon icon={isExpanded ? 'lucide:chevron-down' : 'lucide:chevron-right'} width="16" />
			<Icon icon="lucide:circle-help" width="16" />
			<span
				>{m.report_components_form_fields_speciesidentificationhel_text_hilfe_bei_der_tiererkennung()}</span
			>
		</button>
	{/if}

	{#if showContent}
		<div
			id={helpContentId}
			class={isPage ? '' : 'bg-base-100 border-base-300 mt-2 rounded-lg border p-4'}
		>
			<!-- Titel und Einführung stellt im Seitenmodus die Route: sonst stünde
			     unter der h1 sofort eine zweite Überschrift mit demselben Inhalt. -->
			{#if !isPage}
				<div class="mb-4">
					<h4 class="text-base-content mb-2 text-sm font-semibold">
						{m.report_components_form_fields_speciesidentificationhel_text_bestimmungshilfe_fuer_meerestiere()}
					</h4>
					<p class="text-base-content/70 text-xs">
						{m.report_components_form_fields_speciesidentificationhel_text_klicken_sie_auf_eine_tierart()}
					</p>
				</div>
			{/if}

			<!-- Wichtigste Regel zuerst -->
			<div class="bg-warning/10 border-warning/30 mb-4 rounded-lg border p-3">
				<svelte:element this={styles.sectionTag} class={styles.panelHeading}>
					<Icon
						icon="lucide:triangle-alert"
						width={styles.iconWidth}
						class="text-warning-strong shrink-0"
						aria-hidden="true"
					/>
					{m.report_components_form_fields_speciesidentificationhel_text_im_zweifel_nicht_raten()}
				</svelte:element>
				<p class={styles.body}>
					{m.report_components_form_fields_speciesidentificationhel_text_waehlen_sie_unbekannte_walart_oder()}
				</p>
			</div>

			{#each groupedData as group (group.groupName)}
				<div class="mb-4">
					<svelte:element this={styles.sectionTag} class={styles.groupHeading}
						>{group.groupName}</svelte:element
					>
					<div class="grid grid-cols-1 gap-2">
						{#each group.species as species (species.enum)}
							<details class="collapse-arrow border-base-300 bg-base-100 collapse border">
								<summary class={styles.summary}>
									<div class="flex flex-wrap items-center gap-2">
										{#if species.images.length > 0 && species.images[0]}
											<!-- Benannte Gruppe: Das Artfoto weiter unten ist ebenfalls eine
											     `group`, und die Kontrast-Regel im scoped CSS zielt auf `.group`. -->
											<div class="avatar group/avatar">
												<div
													class="mask duration-quick h-6 w-6 mask-circle transition-transform group-hover/avatar:scale-105"
												>
													<img
														src={species.images[0].src}
														alt=""
														class="object-cover"
														loading="lazy"
													/>
												</div>
											</div>
										{/if}
										<span class={currentValue == species.enum ? 'text-primary font-semibold' : ''}>
											{species.name}
										</span>
										<!-- Ohne Häufigkeitsstufe kein Abzeichen: Die beiden Platzhalter
										     („Unbekannte Walart"/„Unbekannte Robbenart") trugen sonst
										     dasselbe „Heimisch" wie der Schweinswal — eine Einordnung,
										     die niemand vornehmen kann, der die Art nicht bestimmt hat
										     (Anmerkung des Meeresmuseums). Der erklärende Text darunter
										     bleibt. -->
										{#if species.frequency.level}
											<span class="badge badge-xs {frequencyBadge[species.frequency.level]}">
												{getFrequencyLabels()[species.frequency.level]}
											</span>
										{/if}
									</div>
								</summary>
								<div class="collapse-content px-4 pb-3">
									<div class="space-y-3">
										<!-- Häufigkeit einordnen -->
										<p class="{styles.body} italic">
											{species.frequency.text}
										</p>

										<!-- Bilder (klickbar für Vollbildansicht) -->
										{#if species.images.length > 0}
											<div
												class="grid grid-cols-1 gap-3"
												class:md:grid-cols-2={species.images.length > 1}
											>
												{#each species.images as image (image.src)}
													<div class="text-center">
														<!-- `contrast-more:hover:outline-2` statt eines @media-Blocks im
														     Style-Block: eine reine Utility, und die Variante erzeugt
														     `prefers-contrast: more`. Bis 2026-08-09 stand die Regel unter
														     `prefers-contrast: high` — dem Entwurfsnamen des Merkmals, den
														     keine Engine auswertet (gemessen in Chromium 151 und WebKit 26.5,
														     Beleg in e2e/helpers/bannedMediaFeatures.ts). -->
														<button
															type="button"
															class="group shadow-raised hover:shadow-floating duration-instant relative cursor-pointer overflow-hidden rounded-lg transition-all contrast-more:hover:outline-2"
															onclick={() => openImageModal(image.src, image.alt, image.copyright)}
															aria-label={m.report_components_form_fields_speciesidentificationhel_aria_label_alt_in_originalgroesse_anzeigen(
																{ alt: image.alt }
															)}
														>
															<img
																src={image.src}
																alt={image.alt}
																class="duration-instant h-32 w-full object-cover transition-all group-hover:brightness-110"
																loading="lazy"
															/>
															<!-- Schleier über dem Artfoto, kein Theme-Ton: bg-scrim/<n>
															     und text-on-scrim (--scrim-surface in tokens.css). -->
															<div
																class="bg-scrim/60 absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
															>
																<Icon icon="lucide:zoom-in" width="24" class="text-on-scrim" />
															</div>
														</button>
														<p class="{styles.support} mt-1">{image.alt}</p>
														{#if image.copyright}
															<p class={styles.support}>
																<!-- eslint-disable-next-line svelte/no-at-html-tags -->
																{@html sanitizeHtml(image.copyright)}
															</p>
														{/if}
													</div>
												{/each}
											</div>
										{/if}

										<!-- So sieht es an der Oberfläche aus: das Wichtigste zuerst -->
										<div class="bg-info/10 rounded-lg p-3">
											<svelte:element this={styles.subTag} class={styles.subHeadingWithIcon}>
												<Icon
													icon="lucide:eye"
													width={styles.iconWidth}
													class="text-info-strong shrink-0"
													aria-hidden="true"
												/>
												{m.report_components_form_fields_speciesidentificationhel_text_so_sieht_es_an_der()}
											</svelte:element>
											<ul class={styles.list}>
												{#each species.surfacing as item (item)}
													<li>{item}</li>
												{/each}
											</ul>
										</div>

										<!-- Erkennungsmerkmale, nach Beobachtbarkeit gruppiert -->
										<div>
											<svelte:element this={styles.subTag} class={styles.subHeading}
												>{m.report_components_form_fields_speciesidentificationhel_text_erkennungsmerkmale()}</svelte:element
											>
											<div class="space-y-2">
												{#each observabilityOrder as level (level)}
													{@const features = featuresFor(species.distinguishing, level)}
													{#if features.length > 0}
														<div>
															<span class="badge badge-xs {observabilityBadge[level]} mb-1">
																{getObservabilityLabels()[level]}
															</span>
															<ul class={styles.list}>
																{#each features as feature (feature.text)}
																	<li>{feature.text}</li>
																{/each}
															</ul>
														</div>
													{/if}
												{/each}
											</div>
										</div>

										<!-- Verwechslungsgefahr -->
										{#if species.confusion.length > 0}
											<div>
												<svelte:element this={styles.subTag} class={styles.subHeadingWithIcon}>
													<Icon
														icon="lucide:git-compare-arrows"
														width={styles.iconWidth}
														class="shrink-0"
														aria-hidden="true"
													/>
													{m.report_components_form_fields_speciesidentificationhel_text_haeufig_verwechselt_mit()}
												</svelte:element>
												<ul class={styles.list}>
													{#each species.confusion as item (item)}
														<li>{item}</li>
													{/each}
												</ul>
											</div>
										{/if}

										<!-- Typisches Verhalten -->
										<div>
											<svelte:element this={styles.subTag} class={styles.subHeading}
												>{m.report_components_form_fields_speciesidentificationhel_text_typisches_verhalten()}</svelte:element
											>
											<ul class={styles.list}>
												{#each species.behavior as behaviorItem (behaviorItem)}
													<li>{behaviorItem}</li>
												{/each}
											</ul>
										</div>

										<!-- Merkregel -->
										{#if species.fieldTip}
											<p class="border-primary/40 {styles.body} border-l-2 pl-2 font-medium italic">
												{species.fieldTip}
											</p>
										{/if}

										<!-- Grunddaten: bewusst zuletzt, weil im Feld nicht schätzbar -->
										<div class="border-base-300 border-t pt-2">
											<div class="{styles.muted} grid grid-cols-1 gap-1">
												<div>
													<span class="font-medium"
														>{m.report_components_form_fields_speciesidentificationhel_text_groesse()}</span
													>
													<span class="ml-1">{species.size}</span>
												</div>
												<div>
													<span class="font-medium"
														>{m.report_components_form_fields_speciesidentificationhel_text_gewicht()}</span
													>
													<span class="ml-1">{species.weight}</span>
												</div>
												{#if species.scientificName !== '—'}
													<div>
														<span class="font-medium"
															>{m.report_components_form_fields_speciesidentificationhel_text_wissenschaftlich()}</span
														>
														<span class="ml-1 italic">{species.scientificName}</span>
													</div>
												{/if}
											</div>
										</div>
									</div>
								</div>
							</details>
						{/each}
					</div>
				</div>
			{/each}

			<!-- Übergreifende Unterscheidungshilfen.
			     Sie stehen auf der Sektionsebene, nicht darunter: inhaltlich sind sie
			     Geschwister der Artgruppen („Wale", „Robben"), keine Unterpunkte. -->
			<div class="space-y-3">
				<div class="bg-base-200 rounded-lg p-3">
					<svelte:element this={styles.sectionTag} class={styles.panelHeading}>
						<Icon
							icon="lucide:circle-help"
							width={styles.iconWidth}
							class="shrink-0"
							aria-hidden="true"
						/>
						{m.report_components_form_fields_speciesidentificationhel_text_wal_oder_robbe_die_haeufigste()}
					</svelte:element>
					<div class="{styles.body} space-y-1">
						<p>
							<strong
								>{m.report_components_form_fields_speciesidentificationhel_text_robbe()}</strong
							>
							{m.report_components_form_fields_speciesidentificationhel_text_der_runde_kopf_steht_senkrecht()}
						</p>
						<p>
							<strong
								>{m.report_components_form_fields_speciesidentificationhel_text_schweinswal()}</strong
							>
							{m.report_components_form_fields_speciesidentificationhel_text_kein_kopf_zu_sehen_nur()}
						</p>
					</div>
				</div>

				<div class="bg-base-200 rounded-lg p-3">
					<svelte:element this={styles.sectionTag} class={styles.panelHeading}>
						<Icon
							icon="lucide:circle-help"
							width={styles.iconWidth}
							class="shrink-0"
							aria-hidden="true"
						/>
						{m.report_components_form_fields_speciesidentificationhel_text_robben_unterscheiden_erst_das_kopfprofil()}
					</svelte:element>
					<div class="{styles.body} space-y-1">
						<p>
							<strong
								>{m.report_components_form_fields_speciesidentificationhel_text_kegelrobbe()}</strong
							>
							{m.report_components_form_fields_speciesidentificationhel_text_langer_kopf_gerade_linie_von()}
						</p>
						<p>
							<strong
								>{m.report_components_form_fields_speciesidentificationhel_text_seehund()}</strong
							>
							{m.report_components_form_fields_speciesidentificationhel_text_kurze_schnauze_mit_deutlichem_absatz()}
						</p>
						<p>
							<strong
								>{m.report_components_form_fields_speciesidentificationhel_text_ringelrobbe()}</strong
							>
							{m.report_components_form_fields_speciesidentificationhel_text_kleinste_art_helle_ringe_im()}
						</p>
						<p class="text-base-content/70">
							{m.report_components_form_fields_speciesidentificationhel_text_kopfprofil()}
						</p>
					</div>
				</div>

				<div class="bg-base-200 rounded-lg p-3">
					<svelte:element this={styles.sectionTag} class={styles.panelHeading}>
						<Icon
							icon="lucide:camera"
							width={styles.iconWidth}
							class="shrink-0"
							aria-hidden="true"
						/>
						{m.report_components_form_fields_speciesidentificationhel_text_was_der_forschung_am_meisten()}
					</svelte:element>
					<ul class={styles.list}>
						<li>
							{m.report_components_form_fields_speciesidentificationhel_text_ein_foto_auch_unscharf()}
						</li>
						<li>
							{m.report_components_form_fields_speciesidentificationhel_text_genaue_position_und_uhrzeit()}
						</li>
						<li>
							{m.report_components_form_fields_speciesidentificationhel_text_groesse_im_vergleich_zu_ihrem()}
						</li>
						<li>
							{m.report_components_form_fields_speciesidentificationhel_text_bei_unsicherheit_unbekannte_wal_bzw()}
						</li>
						<li>
							{m.report_components_form_fields_speciesidentificationhel_text_halten_sie_abstand_besonders_zu()}
						</li>
					</ul>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Image Modal für Vollbildansicht -->
<!-- `aria-labelledby` nur, solange der Titel auch im DOM steht: Der Dialogtitel
     hängt an `modalImageSrc`, DaisyUI lässt den geschlossenen Dialog aber stehen
     (`visibility: hidden`, siehe .claude/rules/daisyui.md). Unbedingt gesetzt
     zeigte das Attribut nach dem 250-ms-Reset in `handleDialogClose` auf eine
     nicht existierende ID — ein ungültiger ARIA-IDREF. Ohne Bild hat der Dialog
     tatsächlich keinen Namen, und er ist dann auch nicht offen.
     Das `data-testid` ist deshalb kein Beiwerk: `e2e/modal-overflow.spec.ts`
     benennt Dialoge über `data-testid ?? aria-labelledby ?? dialog[i]` und misst
     den Ruhezustand — ohne es stünde diese Position dort wieder als `dialog[0]`. -->
<dialog
	bind:this={modalElement}
	class="modal"
	aria-labelledby={modalImageSrc ? modalTitleId : undefined}
	data-testid="species-image-dialog"
	onclose={handleDialogClose}
>
	<!-- `w-[95%]` ohne Breakpoint: Die Breite stand vorher auf DaisyUIs 11/12 und
	     wurde unterhalb 640px per Media-Query auf 95% gehoben. Oberhalb von rund
	     1077px deckelt ohnehin `max-w-5xl`, dazwischen sind es 3,3 Prozentpunkte
	     — zu wenig für eine dritte Layout-Grenze neben `md` und `lg`
	     (Breakpoint-Vertrag in .claude/rules/design-system.md). Das `max-w-95%`
	     der alten Regel entfällt ersatzlos: `max-w-5xl` liegt mit 64rem überall
	     über 95% und deckelt die Breite nie nach unten.

	     `contrast-more:border-2` trägt den Rahmen bei erhöhtem Kontrast — die
	     Begründung steht am Artfoto-Knopf oben. -->
	<div class="modal-box shadow-floating w-[95%] max-w-5xl p-0 contrast-more:border-2">
		{#if modalImageSrc}
			<div class="relative">
				<!-- Modal Header -->
				<div class="bg-base-200 flex items-center justify-between p-4">
					<h3 id={modalTitleId} class="text-base-content text-lg font-bold">{modalImageAlt}</h3>
					<button
						type="button"
						class="btn btn-circle btn-ghost btn-sm"
						onclick={closeImageModal}
						aria-label={m.report_components_form_fields_speciesidentificationhel_aria_label_schliessen()}
					>
						<Icon icon="lucide:x" width="24" />
					</button>
				</div>

				<!-- Modal Image.
				     Die Höhe schaltet bei `md`, nicht mehr bei 640px: Kopf- und Fußzeile
				     des Dialogs belegen zusammen rund 160px, mit 70vh Bild passt das auf
				     einem Telefon nicht in den Viewport. `md` ist laut Breakpoint-Vertrag
				     (design-system.md) die Grenze zwischen kompakt und weit. -->
				<div class="flex flex-col items-center p-4">
					<img
						src={modalImageSrc}
						alt={modalImageAlt}
						class="shadow-raised max-h-[60vh] max-w-full rounded-lg object-contain md:max-h-[70vh]"
					/>
					{#if modalImageCopyright}
						<p class="text-base-content/60 mt-3 text-sm">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html sanitizeHtml(modalImageCopyright)}
						</p>
					{/if}
				</div>

				<!-- Modal Footer -->
				<div class="bg-base-200 p-4 text-center">
					<p class="text-base-content/70 text-sm">
						{m.report_components_form_fields_speciesidentificationhel_text_klicken_sie_ausserhalb_des_bildes()}
					</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Backdrop, Klick schließt. Schleier über der Seite dahinter, kein
	     Theme-Ton: bg-scrim/<n> (--scrim-surface in tokens.css). Deckkraft an
	     der Aufrufstelle, Farbton im Token — und /60, weil der Schleier den
	     Schließen-Bereich trägt. Stand vorher als oklch(0% 0 0 / 0.6) im
	     scoped <style> und umging das Theme damit vollständig.

	     Der Weichzeichner wird dabei von 4px auf 8px angehoben: `backdrop-blur-sm`
	     ist unter Tailwind 4 acht Pixel (4px hieße `backdrop-blur-xs`). Das ist
	     Absicht — MediaModal.svelte fährt denselben Wert, und zwei
	     Modal-Schleier derselben App sollen nicht unterschiedlich weich sein. -->
	<div
		class="modal-backdrop bg-scrim/60 cursor-pointer backdrop-blur-sm"
		onclick={closeImageModal}
		onkeydown={(e) => e.key === 'Escape' && closeImageModal()}
		role="button"
		tabindex="0"
		aria-label={m.report_components_form_fields_speciesidentificationhel_aria_label_modal_schliessen()}
	></div>
</dialog>

<style>
	/* Was hier NICHT mehr steht — vier daisyUI-Komponentenklassen wurden lokal
	   neu definiert, obwohl daisyUI ausdrücklich zuerst zu Modifier-Klassen und
	   Tailwind-Utilities rät. Sie sind ins Markup gewandert bzw. entfallen:

	   `.collapse-content { transition: all .2s }` — ersatzlos. Die Kurzschreibweise
	     ersetzte daisyUIs eigene Eigenschaftsliste für dieselbe Dauer und verlor
	     dabei deren `allow-discrete` für `overflow`, `content-visibility`,
	     `visibility` und `min-height` sowie das `padding .1s` (nachgelesen in
	     node_modules/daisyui/components/collapse.css, 5.7.4). Genau der Fehler,
	     den design-system.md unter „Dauer" beschreibt — hier ohne Gegenwert.
	   `.collapse-title { min-height }` — als `min-h-[var(--target-min)]` in
	     INLINE_STYLE/PAGE_STYLE, Begründung dort.
	   `.modal-box { box-shadow }` — als `shadow-floating` am Element.
	   `.avatar .mask { transition/hover }` — als `transition-transform
	     duration-quick group-hover/avatar:scale-105` am Element.

	   Ebenfalls entfallen: `button.group { border/background/padding }` (Tailwinds
	   Preflight setzt alle drei bereits zurück; übrig blieb `cursor-pointer`, das
	   Tailwind 4 für Buttons nicht mehr mitbringt), `.modal img` (jetzt
	   `rounded-lg shadow-raised` am Bild), der 640px-Block (siehe Markup) und der
	   `prefers-reduced-motion`-Block — den entschärft app.css global für alle
	   Übergänge (`.claude/rules/daisyui.md`, „Vorhandene Overrides respektieren"). */

	/* Copyright-Links stammen aus {@html} und brauchen daher globale Selektoren.
	   `/70` ist die Deckkraft der Bildunterschriften, `/60` die des
	   Modal-Copyrights. Ein dritter Zweig für `/50` stand hier ohne Fundstelle —
	   entfernt, weil ein Selektor ohne Ziel nicht prüfbar ist und beim nächsten
	   Leser den Eindruck erweckt, es gäbe irgendwo Text auf `/50` (was die
	   Deckkraft-Untergrenze aus design-system.md verletzen würde). */
	:global(.text-base-content\/60 a),
	:global(.text-base-content\/70 a) {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: opacity 0.2s ease;
	}
	:global(.text-base-content\/60 a:hover),
	:global(.text-base-content\/70 a:hover) {
		opacity: 0.8;
	}
</style>
