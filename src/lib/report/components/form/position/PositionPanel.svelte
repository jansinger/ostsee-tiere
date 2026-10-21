<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { get } from 'svelte/store';
	import { getFormContext } from '#lib/report/formContext.ts';
	import { getUploadConfig } from '#lib/stores/configStore.ts';
	import type { ValidationPreset } from '#lib/types/index.ts';
	import Icon from '#lib/components/Icon.svelte';
	import UploadNotice from '#lib/report/components/form/UploadNotice.svelte';
	import DropzoneEnhanced from '#lib/report/components/form/fields/DropzoneEnhanced.svelte';
	import LocationInput from '#lib/report/components/form/LocationInput.svelte';
	import VerifyLocation from '#lib/report/components/form/VerifyLocation.svelte';
	import { hasCoordinates, toCoordinate } from '#lib/report/components/form/coordinateValue.ts';
	import { openAncestorDetails } from '#lib/utils/fieldNavigation.ts';
	import SectionCard from '#lib/report/components/sections/SectionCard.svelte';
	import LocationDescription from './LocationDescription.svelte';
	import { requestCurrentPosition } from './geolocation';
	import { photoStatus, shouldWarnAboutMissingGps } from './positionPanelState';
	import {
		mapHint,
		outsideBalticNotice,
		outsideBalticSeverity,
		positionQuestion
	} from '#lib/report/wording.ts';

	const { form, handleChange, mediaStore } = getFormContext();

	// `mediaStore` ist das `$state`-Objekt aus Form.svelte und wird über den
	// Context als derselbe Proxy weitergereicht. DropzoneEnhanced ersetzt die
	// Liste per Zuweisung (`updateMediaFiles`) — der Property-Write auf dem Proxy
	// weckt dieses `$derived`. Das geschieht zweimal je Upload: beim Drop
	// (synchron) und erneut, wenn die EXIF-Auswertung durch ist. Nur deshalb kann
	// `photoStatus` von `'analyzing'` auf sein Endergebnis wechseln.
	//
	// Der Store gehört dem ganzen Formular, nicht diesem Schritt; die Eingrenzung
	// auf die Dateien des Positions-Schritts steckt in `photoStatus`.
	const status = $derived(photoStatus(mediaStore.mediaFiles));

	const referenceId = $derived($form.referenceId);

	// Echte Koordinaten aus dem Formular — bleiben undefined, solange keine Position
	// gewählt wurde. Die Karte startet über einen separaten Anzeige-Mittelpunkt.
	const longitude = $derived(toCoordinate($form.longitude));
	const latitude = $derived(toCoordinate($form.latitude));

	// Nur für `shouldWarnAboutMissingGps`. Bewusst NICHT als Guard für
	// VerifyLocation: Ein separater Boolean verengt die Typen im Template nicht
	// (svelte-check kennt kein Aliased-Narrowing über `$derived`), VerifyLocation
	// bekäme also `number | undefined` und fiele still auf seine
	// Default-Koordinaten (54.5/13.5) zurück. Der Guard unten prüft deshalb
	// direkt auf `undefined`.
	const coordinatesPresent = $derived(latitude !== undefined && longitude !== undefined);

	/**
	 * Frage über der Positionsangabe und Marker-Erklärung auf der Karte — beide
	 * hängen am Totfund-Zweig (`wording.ts`). `enableGPS` ist hier immer `false`:
	 * `LocationInput` bekommt unten `enableMapGps={false}`, das Kartenhinweis-Wort
	 * muss dasselbe melden wie das tatsächlich gerenderte GPS-Control.
	 */
	const positionLabel = $derived(positionQuestion($form.isDead));
	const mapHintText = $derived(mapHint($form.isDead, coordinatesPresent, false));

	/**
	 * Ostsee-Hinweis von `VerifyLocation` (Review Task 6, Befund A): Nur dieser
	 * Bürger-Aufrufer übergibt Text und Dringlichkeit — der Admin-Pfad
	 * (`sections/Location.svelte`) tut das nicht und bleibt dadurch unverändert.
	 * Am Strand ist eine Position außerhalb der Ostsee der Normalfall (Totfund),
	 * die Dringlichkeit sinkt dort deshalb auf `info`.
	 */
	const outsideNoticeText = $derived(outsideBalticNotice($form.isDead));
	const outsideNoticeSeverity = $derived(outsideBalticSeverity($form.isDead));

	/**
	 * Pflicht-Markierung der Koordinatenfelder.
	 *
	 * Liest `hasPosition` und NICHT `coordinatesPresent`, obwohl beide in diesem
	 * Panel dasselbe bedeuten (`syncHasPosition`): Die Schema-Regel lautet
	 * `latitude.when('hasPosition', { is: true, … })`, und das Sternchen soll
	 * genau die Bedingung spiegeln, an der die Validierung hängt — sonst driften
	 * die beiden auseinander, sobald ein weiterer Schreiber des Flags dazukommt
	 * (die EXIF-Auswertung in `DropzoneEnhanced` ist bereits einer).
	 */
	const positionRequired = $derived($form.hasPosition === true);

	// GPS-Foto-Konfiguration: Server-Config, aber nur Bilder und genau eine Datei.
	let gpsPhotoConfig = $state<ValidationPreset | null>(null);
	$effect(() => {
		getUploadConfig().then((config) => {
			const maxFileSize = Math.min(config.maxFileSize, 30 * 1024 * 1024);
			gpsPhotoConfig = {
				allowedTypes: config.allowedTypes.filter((type) => type.startsWith('image/')),
				maxFileSize,
				maxVideoFileSize: maxFileSize,
				maxFiles: 1,
				accept: 'image/*'
			};
		});
	});

	/**
	 * Wurde die Aufnahmezeit des aktuellen Fotos wirklich ins Formular übernommen?
	 *
	 * Kommt als Meldung aus `DropzoneEnhanced` und nicht aus `$form.sightingDate`:
	 * Das Feld hat mit `berlinToday()` einen Schema-Default und ist damit IMMER
	 * gefüllt (`sightingSchema.ts`). Ein Gate darauf war immer wahr — genau
	 * deshalb musste der Satz „Datum und Uhrzeit konnten übernommen werden"
	 * vorher wieder entfernt werden.
	 */
	let exifDateTimeApplied = $state(false);

	/** Setzt ein Formularfeld über den synthetischen handleChange-Event-Pfad. */
	function setField(name: string, value: unknown): void {
		handleChange({ target: { name, value } } as unknown as Event);
	}

	/**
	 * Einziger Schreiber von `hasPosition` **in diesem Panel**: genau dann true,
	 * wenn Breiten- UND Längengrad im Formular als echte Zahlen vorliegen.
	 * Bewusst aus dem Store gelesen statt aus den gerade geschriebenen Werten —
	 * so gilt dieselbe Regel für Karte, Eingabefelder und GPS-Button.
	 *
	 * Es ist nicht der einzige Schreiber im Meldeformular. Die EXIF-Auswertung
	 * schreibt das Flag selbst, in `DropzoneEnhanced.svelte`:
	 * - `applyExifPosition` setzt `true`,
	 * - `resetExifPositionIfUnchanged` setzt `false`.
	 * (Die Admin-Maske hat mit `sections/Location.svelte` ein eigenes,
	 * nutzerbedientes Feld — anderes Formular, hier ohne Belang.)
	 *
	 * Die Invariante hält trotzdem: Jeder dieser Schreiber setzt
	 * `latitude`/`longitude` im selben Aufruf und leitet das Flag aus derselben
	 * Bedingung ab („beide Koordinaten sind echte Zahlen"). Wer einen weiteren
	 * Schreiber ergänzt, muss genau das mitbringen — sonst behauptet das
	 * Formular eine Position, die es nicht gibt, und `waterway` verliert seine
	 * konditionale Pflicht.
	 */
	function syncHasPosition(): void {
		const values = get(form);
		setField('hasPosition', hasCoordinates(values.latitude, values.longitude));
	}

	/** Koordinaten-Änderung aus Karte oder Eingabefeldern. */
	function handleLocationChange(event: Event): void {
		handleChange(event);
		syncHasPosition();
	}

	/**
	 * Springt zur Ortsbeschreibung und fokussiert das Fahrwasser-Feld.
	 *
	 * `data-testid` und NICHT `data-field`: Letzteres sitzt auf dem Wrapper-<div>
	 * von FormField (FormField.svelte:77), das nicht fokussierbar ist. Das Testid
	 * hängt am Input selbst (FieldRenderer.svelte:188 → BaseInput.svelte:84).
	 *
	 * `LocationDescription` ist immer ein `<details>`. Dessen Startzustand kommt
	 * einmalig aus `descriptionCollapsed`, danach gehört er dem Nutzer — das Feld
	 * kann also zugeklappt sein, sowohl beim Start (Koordinaten vorhanden, beide
	 * Beschreibungsfelder leer) als auch weil der Nutzer selbst zugeklappt hat.
	 * `.focus()` auf ein Element in einem geschlossenen <details> täte still
	 * nichts, deshalb vorher aufklappen.
	 *
	 * Das funktioniert nur, weil dort bewusst kein `bind:open` sitzt — ein
	 * gebundener Zustand schriebe das hier gesetzte `open` sofort zurück.
	 *
	 * Der Vorfahren-`<details>`-Loop steckt in `openAncestorDetails`
	 * (`#lib/utils/fieldNavigation.ts`) — `scrollToFirstError` dort braucht
	 * denselben Schritt für jedes Feld hinter einer Disclosure, nicht nur für
	 * `waterway`.
	 */
	function focusDescription(): void {
		const field = document.querySelector<HTMLElement>('[data-testid="field-waterway"]');
		if (!field) return;
		openAncestorDetails(field);
		field.focus();
		field.scrollIntoView({ block: 'center' });
	}

	let locating = $state(false);
	let locationError = $state<string | null>(null);

	/**
	 * Übernimmt den Gerätestandort ins Formular.
	 *
	 * Der Button bleibt währenddessen fokussierbar (nur `aria-disabled`), weil
	 * `disabled` ihn aus der Tab-Reihenfolge nimmt und der Browser den Fokus
	 * verwirft — ein Tastatur-Nutzer verlöre für die Dauer der Ortung seine
	 * Position. Den Doppelklick-Schutz übernimmt stattdessen dieser Wächter.
	 */
	async function useCurrentPosition(): Promise<void> {
		if (locating) return;
		locating = true;
		locationError = null;

		const result = await requestCurrentPosition(
			typeof navigator === 'undefined' ? undefined : navigator.geolocation
		);
		locating = false;

		if (!result.ok) {
			locationError = result.message;
			return;
		}

		setField('latitude', result.latitude);
		setField('longitude', result.longitude);
		syncHasPosition();
	}
</script>

<SectionCard
	title={m.report_components_form_position_positionpanel_title_positionsangabe()}
	icon="lucide:map-pin"
	variant="inset"
>
	<!-- Nur noch die Frage: „Ein Foto mit GPS-Daten ist der schnellste Weg" stand
	     zwei Zeilen später in der Hero-Karte fast wörtlich noch einmal. -->
	<p class="text-base-content/70 mb-4 text-sm">{positionLabel}</p>

	<!-- Der Standort-Button steht bewusst ganz oben: Er ist der schnellste Weg
	     für alle, die vor Ort melden, und braucht anders als die Karte darunter
	     keine Feinarbeit mit dem Finger.

	     Eigener Button statt des OpenLayers-GPS-Controls: Beschriftung und
	     Fehlerpfad liegen so in unserer Hand — beides ist im Karten-Control nicht
	     erreichbar. (Der frühere Grund, die zugeklappte Karte hätte im
	     Startzustand gar keinen sichtbaren GPS-Button, ist mit der dauerhaft
	     sichtbaren Karte entfallen; der Rest der Begründung trägt weiterhin.)

	     NICHT `btn-primary`: Die einzige Primäraktion des Schritts ist „Weiter"
	     (Button-Hierarchie, `.claude/rules/design-system.md`). Die Betonung
	     kommt über Fläche und volle Breite — `btn-lg` statt handgeschriebener
	     Maße, damit Höhe und Schriftgröße aus dem Theme kommen und nicht aus
	     `py-4`/`text-base` an dieser einen Aufrufstelle. -->
	<button
		type="button"
		class="btn btn-outline btn-lg w-full"
		onclick={useCurrentPosition}
		aria-disabled={locating}
		data-testid="use-current-position"
	>
		{#if locating}
			<span aria-hidden="true" class="loading loading-spinner loading-sm"></span>
		{:else}
			<Icon aria-hidden="true" icon="lucide:crosshair" width="22" />
		{/if}
		<!-- Der Spinner ist rein dekorativ; die Beschriftung trägt den Ladezustand,
		     damit er auch angesagt wird und nicht nur zu sehen ist. -->
		{locating ? 'Standort wird ermittelt …' : 'Mein aktueller Standort'}
	</button>
	<p class="text-base-content/70 text-support mt-2 mb-3">
		{m.report_components_form_position_positionpanel_text_uebernimmt_den_standort_ihres_geraets()}
	</p>

	{#if locationError}
		<div
			class="alert alert-warning mb-3"
			role="alert"
			aria-live="polite"
			data-testid="geolocation-error"
		>
			<Icon aria-hidden="true" icon="lucide:circle-alert" width="20" class="shrink-0" />
			<span class="text-sm">{locationError}</span>
		</div>
	{/if}

	<!-- „oder" trennt hier zwei gleichrangige Wege zur Position: den Standort des
	     Geräts darüber und die Karte darunter. Der Trenner hieß bis zum Umbau
	     „oder Position auf der Karte setzen" — das war eine Ankündigung dessen,
	     was hinter der zugeklappten Disclosure lag. Die Karte steht jetzt offen
	     darunter und kündigt sich selbst an; übrig bleiben muss nur noch das
	     „oder". -->
	<div class="divider text-base-content/70 text-support mt-6 mb-3">
		{m.report_components_form_position_positionpanel_text_oder()}
	</div>

	<!--
		Karte und Koordinatenfelder stehen dauerhaft offen — auf Wunsch des
		Museums ist die Karte das Haupt-Bedienelement dieses Schritts und liegt
		nicht mehr hinter einer Disclosure.

		Damit entfällt auch der frühere Grund für das Lazy-Mounting: Solange die
		Karte zugeklappt startete, sparte das `if`-Gate auf `mapOpen` für die
		Mehrheit die OpenLayers-Instanz und die Kacheln. Jetzt baut jeder Aufruf
		von Schritt 1 die Karte auf, auch auf Mobilfunk. Das ist die Konsequenz des
		Wunsches, kein Versehen — falls die Last auffällt, ist der nächste Schritt
		ein Mount beim ersten Sichtbarwerden (`IntersectionObserver`) und nicht
		die Rückkehr zur Disclosure.
	-->
	<!-- `collapsibleCoordinates={false}`: Die Koordinaten-Eingabe lag bis
	     zum 2026-07-31 hinter einer zweiten Disclosure („Koordinaten eingeben")
	     und war damit zwei Klicks tief. Auf Wunsch des Museums steht sie
	     offen unter der Karte.

	     `enableMapGps={false}` muss dabei ausdrücklich mit: Beides hing
	     früher an `collapsibleCoordinates`, ein `false` allein brächte
	     also das Karten-GPS-Control zurück — neben dem Button „Mein
	     aktueller Standort" oben wären das zwei Bedienelemente für
	     dieselbe Aktion (design-system.md). -->
	<LocationInput
		{latitude}
		{longitude}
		collapsibleCoordinates={false}
		enableMapGps={false}
		required={positionRequired}
		coordinatesHint={m.report_components_form_position_positionpanel_coordinateshint_bitte_tragen_sie_die()}
		mapHintOverride={mapHintText}
		onchange={handleLocationChange}
	/>

	{#if latitude !== undefined && longitude !== undefined}
		<VerifyLocation
			{longitude}
			{latitude}
			noticeOverride={outsideNoticeText}
			severityOverride={outsideNoticeSeverity}
		/>
	{/if}

	<!-- Der Foto-Weg bleibt, aber eingeklappt: Er ist für die Position ein
	     Sonderfall (nur Bilder mit GPS-EXIF liefern etwas), stand aber als
	     Hero-Karte über allem anderen.

	     Bewusst KEIN `bind:open` — ein gebundener Zustand schriebe ein von außen
	     gesetztes `open` sofort zurück, und die Disclosure ließe sich später
	     nicht mehr aufklappen (dieselbe Begründung wie bei `LocationDescription`,
	     siehe `focusDescription`). -->
	<!-- `collapse-arrow`: Ohne den Pfeil ist die zugeklappte Zeile eine graue
	     Fläche mit Text und sieht nicht nach Bedienelement aus. Die alte
	     Karten-Disclosure kam ohne aus, weil sie sich bei jeder neu entstandenen
	     Position selbst öffnete — dieser Aufklapper tut das nicht und muss
	     deshalb von sich aus als bedienbar erkennbar sein. -->
	<details class="bg-base-100 collapse-arrow collapse mt-6" data-testid="photo-position-disclosure">
		<!-- `<summary>` ist nativ fokussierbar — kein `tabindex` nötig. -->
		<summary class="collapse-title min-h-11 py-3 text-sm font-medium">
			{m.report_components_form_position_positionpanel_text_gps_position_und_zeit_aus_einem()}
		</summary>
		<div class="collapse-content">
			<!-- `data-testid="photo-position-card"` bleibt: `form-position-photo.spec.ts`
			     grenzt darüber den File-Input gegen die Medien-Dropzone aus Schritt 2
			     ab. Die Hero-Optik (`border-primary bg-primary/5`) ist dagegen weg —
			     der Foto-Weg ist nicht mehr die Hauptaktion. -->
			<div class="text-base-content" data-testid="photo-position-card">
				<p class="text-base-content/70 mb-3 text-sm">
					{m.report_components_form_position_positionpanel_text_wenn_ihr_foto_gps_daten()}
				</p>

				{#if gpsPhotoConfig}
					<!-- `showNoGpsWarning={false}`: Der Fall wird unten ausführlicher erklärt
					     (Zustand C). Ohne das Abschalten stünden zwei Warn-Alerts mit
					     derselben Aussage direkt übereinander.

					     `compact` + leerer `additionalText`: Die Beschriftung der Disclosure
					     und der Satz darüber sagen bereits, worum es geht und dass GPS
					     ausgelesen wird — ein Zusatz an der Dropzone wäre die dritte
					     Formulierung derselben Aussage. Bleibt explizit stehen, obwohl der
					     Default seit dem 2026-08-04 ebenfalls leer ist: Diese Stelle ist die
					     einzige, die GPS wirklich übernimmt, und soll ihren Text selbst
					     bestimmen statt ihn von einem Default zu erben. -->
					<DropzoneEnhanced
						{referenceId}
						maxFiles={1}
						config={gpsPhotoConfig}
						enableGPSExtraction={true}
						showNoGpsWarning={false}
						showPositionMap={false}
						onExifDateTimeApplied={(applied) => (exifDateTimeApplied = applied)}
						actionLabel={m.report_components_form_position_positionpanel_actionlabel_foto_auswaehlen()}
						compact={true}
						additionalText=""
					/>
				{:else}
					<div class="skeleton h-32 w-full"></div>
				{/if}

				<!-- Zustand C: Foto ohne EXIF-GPS.

				     Bewusst `'no-gps'` und nicht „kein GPS im Formular": Während der
				     Auswertung meldet `photoStatus` `'analyzing'` und hier steht nichts.
				     Sonst würde ein Foto MIT GPS im Moment des Drops für GPS-los erklärt
				     und die Behauptung Sekundenbruchteile später zurückgenommen — mit
				     `role="status"` sagt ein Screenreader sie inzwischen an.

				     Die zweite Bedingung (`coordinatesPresent`) steckt in
				     `shouldWarnAboutMissingGps`: Solange das Panel Koordinaten anzeigt,
				     darf es ihr Fehlen nicht behaupten. -->
				{#if shouldWarnAboutMissingGps(status, coordinatesPresent)}
					<div class="alert alert-warning mt-4" role="status" data-testid="photo-no-gps">
						<Icon aria-hidden="true" icon="lucide:circle-alert" width="20" class="shrink-0" />
						<div>
							<p class="text-sm">
								{m.report_components_form_position_positionpanel_text_in_diesem_foto_sind_keine()}
							</p>
							<!-- Nur wenn es wirklich passiert ist: `exifDateTimeApplied` kommt aus
							     DropzoneEnhanced. Ein Gate auf `$form.sightingDate` wäre immer wahr
							     (Schema-Default `berlinToday()`). -->
							{#if exifDateTimeApplied}
								<p class="mt-2 text-sm" data-testid="photo-datetime-applied">
									{m.report_components_form_position_positionpanel_text_datum_und_uhrzeit_konnten_uebernommen()}
								</p>
							{/if}
							<!-- Nur noch ein Ausweg: „Auf Karte wählen" führte in eine Disclosure,
							     die es nicht mehr gibt — die Karte steht sichtbar darüber, der
							     Button hätte nichts mehr bewirkt (design-system.md). -->
							<div class="mt-3">
								<button
									type="button"
									class="btn btn-outline btn-sm min-h-11"
									onclick={focusDescription}
									data-testid="exit-to-description"
								>
									{m.report_components_form_position_positionpanel_text_seegebiet_beschreiben()}
								</button>
							</div>
						</div>
					</div>
				{/if}

				<!-- BEWUSST unter der Dropzone und bewusst als Auslöser statt als Alert:
				     Der Wortlaut ist unverkürzt eine Ebene tiefer erreichbar
				     (`UploadNotice.svelte`) und kostet hier nur noch eine Zeile —
				     ausgeschrieben standen an dieser Stelle ~150 px Datenschutz-Prosa. -->
				<div class="mt-2">
					<UploadNotice />
				</div>
			</div>
		</div>
	</details>
</SectionCard>

<LocationDescription />
