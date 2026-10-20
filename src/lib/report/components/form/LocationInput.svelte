<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { ddToDm, ddToDms, dmsToDd, dmToDd } from '$lib/utils/geo/coordinateConversion';
	import { untrack } from 'svelte';

	import OLMap from '$lib/components/map/OLMap.svelte';

	type DmsParts = { deg: number | null; min: number | null; sec: number | null };
	type DmParts = { deg: number | null; min: number | null };

	let {
		mode = 'dd',
		latitude = $bindable(),
		longitude = $bindable(),
		defaultCenter = { latitude: 54.5, longitude: 13.5 },
		collapsibleCoordinates = false,
		enableMapGps = true,
		coordinatesHint = null,
		required = false,
		mapHintOverride = undefined,
		onchange = () => {}
	}: {
		mode?: 'dms' | 'dm' | 'dd';
		/** Echter Formularwert — bleibt undefined, solange keine Position gewählt wurde. */
		latitude?: number | undefined;
		/** Echter Formularwert — bleibt undefined, solange keine Position gewählt wurde. */
		longitude?: number | undefined;
		/** Nur für die Kartenansicht: Startpunkt, solange keine echte Position vorliegt. */
		defaultCenter?: { latitude: number; longitude: number };
		/**
		 * Legt Formatwahl und Eingabefelder in einen Collapse-Container.
		 * Default `false` — beide Einsatzorte zeigen die Koordinaten inzwischen
		 * direkt an (Meldeformular seit dem Museumswunsch „Koordinaten-Eingabe
		 * dauerhaft sichtbar").
		 */
		collapsibleCoordinates?: boolean;
		/**
		 * Schaltet das OpenLayers-GPS-Control der Karte.
		 *
		 * Bewusst ein EIGENER Schalter und nicht mehr `!collapsibleCoordinates`:
		 * Diese Kopplung hielt nur, solange „Felder sichtbar" und „eigenes
		 * GPS-Control" dasselbe bedeuteten. Das Meldeformular braucht seit der
		 * dauerhaft sichtbaren Koordinaten-Eingabe die Kombination „Felder
		 * sichtbar, aber KEIN Control" — es stellt mit „Mein aktueller Standort"
		 * einen eigenen Button, und zwei Bedienelemente für dieselbe Aktion
		 * verstoßen gegen „gleiche Aktion = gleiche Variante"
		 * (`.claude/rules/design-system.md`).
		 *
		 * Default `true`, damit die Admin-Maske (`sections/Location.svelte`)
		 * unverändert bleibt.
		 */
		enableMapGps?: boolean;
		/**
		 * Optionaler Hinweis über den Koordinatenfeldern. Nur das Meldeformular
		 * setzt ihn — in der Admin-Maske gibt es die Karten-Übernahme nicht,
		 * auf die der Satz sich bezieht.
		 */
		coordinatesHint?: string | null;
		/**
		 * Sind die Koordinaten hier Pflichtfelder?
		 *
		 * Im Yup-Schema hängt das an `hasPosition`
		 * (`latitude.when('hasPosition', { is: true, … })`) — eine konditionale
		 * Regel, die aus `describe()` nicht ableitbar ist. Diese Felder laufen
		 * zudem als einzige des Formulars nicht über `FormField` →
		 * `FieldRenderer`, das Sternchen und `aria-required` sonst zentral aus
		 * EINER Variablen erzeugt. Das Prop ist deshalb hier die eine Quelle für
		 * beides (`.claude/rules/design-system.md`, „Formularfeld-Muster");
		 * gesetzt wird es an den Aufrufstellen aus `hasPosition`.
		 *
		 * Default `false`: Ohne Aussage über `hasPosition` behauptet die
		 * Komponente keine Pflicht.
		 */
		required?: boolean;
		/**
		 * Reicht `OLMap`s `hintOverride` durch. Nur `PositionPanel` setzt ihn (Totfund-
		 * Wortlaut auf Schritt 1) — die Admin-Maske (`sections/Location.svelte`) lässt
		 * ihn weg und bekommt damit unverändert den bisherigen Marker-Text.
		 */
		mapHintOverride?: string;
		onchange?: EventListener | null;
	} = $props();

	// Hydrations-sichere id für die Verknüpfung Hinweis ↔ Koordinaten-Gruppe.
	// `$props.id()` liefert auf Server und Client denselben Wert; ein selbst
	// gewürfelter Wert würde beim Hydrieren auseinanderlaufen, ein fester
	// Literal-Wert bräche, sobald zwei Karten auf einer Seite stehen.
	const hintId = $props.id();

	// Kartenansicht ist von den Eingabefeldern getrennt: Die Karte braucht immer
	// konkrete Zahlen (sonst startet sie im Nullmeridian), die Zahlenfelder bleiben
	// leer, solange der Nutzer keine Position gewählt hat.
	let mapLatitude = $state(untrack(() => latitude ?? defaultCenter.latitude));
	let mapLongitude = $state(untrack(() => longitude ?? defaultCenter.longitude));

	// Nur wenn beide Formularwerte gesetzt sind, gibt es eine echte Position. Die
	// Karte zeigt sonst zwar `defaultCenter`, aber keinen Marker — ein Marker auf
	// dem Startpunkt wäre von einer bewusst gewählten Position nicht zu
	// unterscheiden und würde als „Position steht schon" gelesen.
	let hasPosition = $derived(latitude !== undefined && longitude !== undefined);

	// Echte Position von außen (EXIF-GPS, Formular-Restore) auf die Karte spiegeln.
	$effect(() => {
		if (latitude === undefined) return;
		if (untrack(() => mapLatitude) !== latitude) mapLatitude = latitude;
	});
	$effect(() => {
		if (longitude === undefined) return;
		if (untrack(() => mapLongitude) !== longitude) mapLongitude = longitude;
	});

	let dms: { latitude: DmsParts; longitude: DmsParts } = $state({
		latitude: { deg: null, min: null, sec: null },
		longitude: { deg: null, min: null, sec: null }
	});
	let dm: { latitude: DmParts; longitude: DmParts } = $state({
		latitude: { deg: null, min: null },
		longitude: { deg: null, min: null }
	});

	// Dezimalgrad-Felder: schreibbares $derived, damit ein geleertes Feld (null) nicht
	// als Koordinate durchgereicht wird und externe Änderungen trotzdem ankommen.
	let ddLatitude: number | null = $derived(latitude ?? null);
	let ddLongitude: number | null = $derived(longitude ?? null);

	const EMPTY_DMS: DmsParts = { deg: null, min: null, sec: null };
	const EMPTY_DM: DmParts = { deg: null, min: null };

	$effect(() => {
		dms.longitude = longitude === undefined ? { ...EMPTY_DMS } : ddToDms(longitude);
		dms.latitude = latitude === undefined ? { ...EMPTY_DMS } : ddToDms(latitude);
		dm.longitude = longitude === undefined ? { ...EMPTY_DM } : ddToDm(longitude);
		dm.latitude = latitude === undefined ? { ...EMPTY_DM } : ddToDm(latitude);
	});

	/** Leere Eingabefelder als NaN weiterreichen — die Konverter behandeln NaN bereits als 0. */
	function part(value: number | null): number {
		return value ?? Number.NaN;
	}

	/** Vorzeichen aus dem Grad-Feld; NaN (leeres Feld) bedeutet Nord/Ost. */
	function signOf(deg: number): 1 | -1 {
		return isNaN(deg) || deg >= 0 ? 1 : -1;
	}

	/**
	 * Meldet eine Koordinatenänderung an das Formular. Bewusst über synthetische
	 * Events statt über DOM-Referenzen: Die Dezimalgrad-Felder existieren in den
	 * Modi "dm"/"dms" gar nicht, ein Marker-Verschieben würde dort sonst nie im
	 * Formular ankommen.
	 */
	function notifyChange() {
		if (!onchange) return;
		emitField('latitude', latitude);
		emitField('longitude', longitude);
	}

	/**
	 * `createForm.handleChange` übernimmt `target.value` unverändert in den
	 * Formular-State. Ein leerer String würde dort als Koordinate liegen bleiben
	 * und beim Validieren zu `NaN` casten ("Breitengrad must be a number type"),
	 * obwohl die Koordinate ohne GPS-Position optional ist. Deshalb wird eine
	 * fehlende Koordinate als `undefined` und eine vorhandene als `number`
	 * gemeldet — nie als String.
	 */
	function emitField(name: 'latitude' | 'longitude', value: number | undefined) {
		onchange?.({
			target: { id: name, name, value }
		} as unknown as Event);
	}

	function updateFromFields() {
		try {
			if (mode === 'dms') {
				const latDeg = part(dms.latitude.deg);
				const lonDeg = part(dms.longitude.deg);
				latitude = dmsToDd(latDeg, part(dms.latitude.min), part(dms.latitude.sec), signOf(latDeg));
				longitude = dmsToDd(
					lonDeg,
					part(dms.longitude.min),
					part(dms.longitude.sec),
					signOf(lonDeg)
				);
			} else if (mode === 'dm') {
				const latDeg = part(dm.latitude.deg);
				const lonDeg = part(dm.longitude.deg);
				latitude = dmToDd(latDeg, part(dm.latitude.min), signOf(latDeg));
				longitude = dmToDd(lonDeg, part(dm.longitude.min), signOf(lonDeg));
			}
		} catch (error) {
			console.error('Fehler beim Aktualisieren der Felder:', error);
		}
		notifyChange();
	}

	/** Marker verschoben oder GPS-Button genutzt → Kartenposition wird zur echten Position. */
	function onMapChange() {
		latitude = mapLatitude;
		longitude = mapLongitude;
		notifyChange();
	}

	/**
	 * Direkte Eingabe in die Dezimalgrad-Felder: leeres Feld ⇒ keine Position.
	 *
	 * Meldet bewusst über `notifyChange()` statt das DOM-Event weiterzureichen:
	 * Das Original-Event trägt nur das gerade bearbeitete Feld und dessen
	 * String-Wert (leer beim Löschen) — die andere Koordinate bliebe im Formular
	 * stehen. `notifyChange()` meldet beide normalisiert aus dem Komponenten-State.
	 */
	function onDecimalChange() {
		latitude = ddLatitude ?? undefined;
		longitude = ddLongitude ?? undefined;
		notifyChange();
	}
</script>

<!-- Pflicht-Markierung für die beschrifteten Koordinatenfelder.

     Bewusst EIN Snippet für alle drei Eingabeformate: Jedes Format rendert
     eigene Labels, und ein Sternchen, das nur im Dezimalgrad-Zweig steht, wäre
     für jeden weg, der auf „Grad, Minute, Sekunde" umstellt. Markup und
     `aria-label` sind absichtlich identisch mit `FieldRenderer.svelte` — für
     Nutzer wie für Tests darf sich die Pflicht hier nicht anders anfühlen als
     an jedem anderen Feld, auch wenn die Pipeline eine andere ist.

     Zwei Punkte, an denen die Nachbildung bewusst genau bleibt bzw. bewusst
     abweicht:

     - `aria-required={required || undefined}` lässt das Attribut im Nein-Fall
       ganz weg statt `aria-required="false"` zu schreiben — genau wie
       `BaseInput.svelte` es für jedes andere Feld tut.
     - Das NATIVE `required`-Attribut setzen wir hier absichtlich NICHT, obwohl
       `FieldRenderer` es durchreicht. Es aktivierte die Constraint-Validierung
       des Browsers, und die verweigert das Absenden lautlos — dieselbe Falle,
       an der `step="0.0001"` an diesen Feldern schon einmal hing (Kommentar am
       Dezimalgrad-Feld unten). Ob eine Koordinate fehlt, entscheidet Yup. -->
{#snippet requiredMark()}
	{#if required}
		<span
			class="text-error ml-1 text-sm"
			role="img"
			aria-label={m.report_components_form_locationinput_aria_label_pflichtfeld()}>*</span
		>
	{/if}
{/snippet}

{#snippet coordinateFields()}
	<!-- Unterhalb `md` stehen Beschriftung und Auswahl untereinander, darüber
	     nebeneinander. Als einzeilige Flex-Zeile setzte dieser Block die
	     Mindestbreite der ganzen Seite: Ein `<select>` ist so breit wie seine
	     längste Option („Grad, Minute, Sekunde (z.B. 54° 30' 15\" N)"), und als
	     Flex-Item mit `min-width: auto` schrumpft es nicht darunter. Zusammen mit
	     dem Label ergab das rund 420 px — auf einem 360-px-Telefon lief das
	     Dokument dadurch um gut 100 px über und die ganze Seite ließ sich seitlich
	     schieben (`e2e/footer-layout.spec.ts`).

	     Aufgefallen ist es erst, als die Koordinateneingabe dauerhaft sichtbar
	     wurde. Vorher lag sie in einem zugeklappten `<details>` und hatte gar
	     keine Layout-Box — der Überlauf war die ganze Zeit da, nur unsichtbar.

	     `min-w-0` gehört zwingend dazu: Ohne das Aufheben von `min-width: auto`
	     bleibt das Select auch in der gestapelten Fassung zu breit. -->
	<div class="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
		<label class="label" for="gps-format"
			>{m.report_components_form_locationinput_text_gps_eingabeformat()}</label
		>
		<select id="gps-format" class="select w-full min-w-0 md:ml-auto md:w-auto" bind:value={mode}>
			<option value="dd">{m.report_components_form_locationinput_text_dezimalgrad()}</option>
			<option value="dm">{m.report_components_form_locationinput_text_grad_dezimalminute()}</option>
			<option value="dms"
				>{m.report_components_form_locationinput_text_grad_minute_sekunde()}</option
			>
		</select>
	</div>

	{#if mode === 'dms'}
		<!-- `aria-required` sitzt nur am Grad-Feld, nicht an Minuten und Sekunden:
		     Das Label mit dem Sternchen gehört über `for` genau zu diesem Feld, und
		     die beiden anderen dürfen leer bleiben — `part()` reicht sie als NaN
		     weiter, die Konverter lesen das als 0. Eine Pflicht-Ansage dort wäre
		     eine falsche Aussage. Gilt genauso im Format „Grad, Dezimalminute". -->
		<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
			<div>
				<label class="label" for="dms-lat-deg"
					>{m.report_components_form_locationinput_text_breite_n()}{@render requiredMark()}</label
				>
				<div class="flex gap-2">
					<div>
						<input
							id="dms-lat-deg"
							class="input w-16"
							type="number"
							min="0"
							max="90"
							placeholder={m.report_components_form_locationinput_placeholder_grad()}
							aria-required={required || undefined}
							bind:value={dms.latitude.deg}
							onchange={updateFromFields}
						/>
					</div>
					<input
						class="input w-16"
						type="number"
						min="0"
						max="59"
						placeholder={m.report_components_form_locationinput_placeholder_min()}
						aria-label={m.report_components_form_locationinput_aria_label_breite_minuten()}
						bind:value={dms.latitude.min}
						onchange={updateFromFields}
					/>
					<input
						class="input w-16"
						type="number"
						min="0"
						max="59"
						placeholder={m.report_components_form_locationinput_placeholder_sek()}
						aria-label={m.report_components_form_locationinput_aria_label_breite_sekunden()}
						bind:value={dms.latitude.sec}
						onchange={updateFromFields}
					/>
				</div>
			</div>
			<div>
				<label class="label" for="dms-lon-deg"
					>{m.report_components_form_locationinput_text_laenge_e()}{@render requiredMark()}</label
				>
				<div class="flex gap-2">
					<div>
						<input
							id="dms-lon-deg"
							class="input w-16"
							type="number"
							min="0"
							max="180"
							placeholder={m.report_components_form_locationinput_placeholder_grad_2()}
							aria-required={required || undefined}
							bind:value={dms.longitude.deg}
							onchange={updateFromFields}
						/>
					</div>
					<input
						class="input w-16"
						type="number"
						min="0"
						max="59"
						placeholder={m.report_components_form_locationinput_placeholder_min_2()}
						aria-label={m.report_components_form_locationinput_aria_label_laenge_minuten()}
						bind:value={dms.longitude.min}
						onchange={updateFromFields}
					/>
					<input
						class="input w-16"
						type="number"
						min="0"
						max="59"
						placeholder={m.report_components_form_locationinput_placeholder_sek_2()}
						aria-label={m.report_components_form_locationinput_aria_label_laenge_sekunden()}
						bind:value={dms.longitude.sec}
						onchange={updateFromFields}
					/>
				</div>
			</div>
		</div>
	{:else if mode === 'dm'}
		<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
			<div>
				<label class="label" for="dm-lat-deg"
					>{m.report_components_form_locationinput_text_breite_n_2()}{@render requiredMark()}</label
				>
				<div class="flex gap-2">
					<div>
						<input
							id="dm-lat-deg"
							class="input w-16"
							type="number"
							min="0"
							max="90"
							placeholder={m.report_components_form_locationinput_placeholder_grad_3()}
							aria-required={required || undefined}
							bind:value={dm.latitude.deg}
							onchange={updateFromFields}
						/>
					</div>
					<input
						class="input w-24"
						type="number"
						min="0"
						max="59.9999"
						step="0.01"
						placeholder={m.report_components_form_locationinput_placeholder_dezimalmin()}
						aria-label={m.report_components_form_locationinput_aria_label_breite_dezimalminuten()}
						bind:value={dm.latitude.min}
						onchange={updateFromFields}
					/>
				</div>
			</div>
			<div>
				<label class="label" for="dm-lon-deg"
					>{m.report_components_form_locationinput_text_laenge_e_2()}{@render requiredMark()}</label
				>
				<div class="flex gap-2">
					<div>
						<input
							id="dm-lon-deg"
							class="input w-16"
							type="number"
							min="0"
							max="180"
							placeholder={m.report_components_form_locationinput_placeholder_grad_4()}
							aria-required={required || undefined}
							bind:value={dm.longitude.deg}
							onchange={updateFromFields}
						/>
					</div>
					<input
						class="input w-24"
						type="number"
						min="0"
						max="59.9999"
						step="0.01"
						placeholder={m.report_components_form_locationinput_placeholder_dezimalmin_2()}
						aria-label={m.report_components_form_locationinput_aria_label_laenge_dezimalminuten()}
						bind:value={dm.longitude.min}
						onchange={updateFromFields}
					/>
				</div>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
			<div>
				<label class="label" for="latitude"
					>{m.report_components_form_locationinput_text_breite_n_3()}{@render requiredMark()}</label
				>
				<!-- step deckt die volle Spaltengenauigkeit ab: `gps_breite` ist
				     numeric(8,6). Mit dem früheren step="0.0001" wies die
				     Constraint-Validierung des Browsers jede Bestandskoordinate mit
				     mehr als vier Nachkommastellen ab — und zwar lautlos: Das
				     Formular sendet dann nicht, ohne dass die App einen Fehler
				     anzeigt, weil das submit-Ereignis gar nicht erst entsteht. -->
				<input
					id="latitude"
					class="input w-full"
					type="number"
					min="-90"
					max="90"
					step="0.000001"
					placeholder={m.report_components_form_locationinput_placeholder_dezimalgrad()}
					aria-required={required || undefined}
					bind:value={ddLatitude}
					onchange={onDecimalChange}
				/>
			</div>
			<div>
				<label class="label" for="longitude"
					>{m.report_components_form_locationinput_text_laenge_e_3()}{@render requiredMark()}</label
				>
				<input
					id="longitude"
					class="input w-full"
					type="number"
					min="-180"
					max="180"
					step="0.000001"
					placeholder={m.report_components_form_locationinput_placeholder_dezimalgrad_2()}
					aria-required={required || undefined}
					bind:value={ddLongitude}
					onchange={onDecimalChange}
				/>
			</div>
		</div>
	{/if}
{/snippet}

<div class="w-full">
	<div class="border-base-300 mb-4 overflow-hidden rounded-lg border">
		<!--
			Das OpenLayers-GPS-Control (`FormLocationControl`) bleibt nur dort, wo es
			die einzige Standort-Bedienung ist — also in der Admin-Maske
			(`sections/Location.svelte`, Default `enableMapGps={true}`).

			Im Meldeformular liefert `PositionPanel` bereits einen eigenen Button
			„Mein aktueller Standort" über der Karte. Beide schreiben dieselbe
			Koordinate ins Formular; zwei Bedienelemente für dieselbe Aktion
			verstoßen gegen „gleiche Aktion = gleiche Variante" (design-system.md).
		-->
		<OLMap
			bind:latitude={mapLatitude}
			bind:longitude={mapLongitude}
			readonly={false}
			enableGPS={enableMapGps}
			{hasPosition}
			hintOverride={mapHintOverride}
			onchange={onMapChange}
		/>
	</div>

	{#if collapsibleCoordinates}
		<details class="bg-base-100 collapse" data-testid="coordinate-fields">
			<summary class="collapse-title min-h-11 py-3 text-sm font-medium">
				{m.report_components_form_locationinput_text_koordinaten_eingeben()}
			</summary>
			<div class="collapse-content">
				{@render coordinateFields()}
			</div>
		</details>
	{:else if coordinatesHint}
		<!-- Der Hinweis gilt für die ganze Koordinaten-Gruppe, nicht für ein
		     einzelnes Feld — je nach Format sind es zwei bis sechs Eingaben.
		     Deshalb `role="group"` mit `aria-describedby` statt sechs einzelner
		     Verweise: So wird er beim Betreten der Gruppe einmal angesagt.

		     Ohne diese Verknüpfung wäre der Satz nur optisch vorhanden — die
		     Felder hier sind rohe Inputs und laufen nicht über `FormField`,
		     das `aria-describedby` sonst zentral setzt (`design-system.md`). -->
		<div
			role="group"
			aria-label={m.report_components_form_locationinput_aria_label_koordinaten()}
			aria-describedby={hintId}
		>
			<p id={hintId} class="text-base-content/70 text-support mb-2" data-testid="coordinates-hint">
				{coordinatesHint}
			</p>
			{@render coordinateFields()}
		</div>
	{:else}
		{@render coordinateFields()}
	{/if}
</div>
