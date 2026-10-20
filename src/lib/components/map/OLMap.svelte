<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Icon from '#lib/components/Icon.svelte';
	import { createLogger } from '#lib/logger.ts';
	import { untrack } from 'svelte';
	import type { Map, MapBrowserEvent } from 'ol';
	import type { Coordinate } from 'ol/coordinate';
	import type Feature from 'ol/Feature';
	import type { Point } from 'ol/geom';
	import type BaseLayer from 'ol/layer/Base';

	/**
	 * OpenLayers wird NICHT statisch importiert, sondern erst im Init-Effekt
	 * nachgeladen. Statisch hing die Bibliothek (~276 KB roh / ~80 KB gzip) im
	 * Initial-Bundle der Einstiegsseite, weil `LocationInput` diese Komponente
	 * einbindet — sichtbar wird die Karte dort aber erst weit später, und auf
	 * dem Totfund-Zweig unter Umständen nie.
	 *
	 * Der Umbau sitzt bewusst HIER und nicht bei den Aufrufern: So gewinnen
	 * alle drei Einsatzorte (Meldeformular, Admin-Ansicht, Foto-EXIF-Karte)
	 * ohne eigenes Zutun, und niemand kann den statischen Import versehentlich
	 * über einen vierten Aufrufer zurückholen.
	 *
	 * `fromLonLat`/`toLonLat` landen in Modul-lokalen Handles, weil sie aus
	 * synchronen Callbacks heraus gebraucht werden. Das ist gefahrlos: Jeder
	 * dieser Callbacks kann erst feuern, nachdem der Init-Effekt die Karte
	 * gebaut hat — `handleMapClick` hängt an einem Kartenevent, `moveMarkerTo`
	 * und `updateMarker` prüfen zusätzlich auf `markerFeature` bzw. `map`.
	 */
	type OLProj = typeof import('ol/proj');
	type OLHelpers = typeof import('#lib/utils/map/openLayersHelpers.ts');

	let fromLonLat: OLProj['fromLonLat'] | null = null;
	let toLonLat: OLProj['toLonLat'] | null = null;
	let setMapCenter: OLHelpers['setMapCenter'] | null = null;

	const logger = createLogger('components:map:OLMap');

	/** Solange `true`, steht der Ladehinweis anstelle der leeren Kartenfläche. */
	let loading = $state(true);

	/**
	 * Das Nachladen kann fehlschlagen — ein Deploy wechselt die Chunk-Namen unter
	 * einer offenen Seite, oder das Funknetz bricht weg (das Formular wird an
	 * Deck und am Strand ausgefüllt). Ohne eigenen Zustand bliebe in genau dem
	 * Fall der Ladehinweis für immer stehen: ein Spinner, der nie aufhört, ohne
	 * Erklärung und ohne Ausweg. Deshalb ein sichtbarer Fehlerzustand, der auf
	 * die Koordinatenfelder verweist — die funktionieren ohne Karte weiter.
	 */
	let loadError = $state(false);

	let {
		latitude = $bindable(54.5),
		longitude = $bindable(13.5),
		zoom = 8,
		readonly = false,
		enableGPS = false,
		hasPosition = true,
		hintOverride = undefined,
		onchange = () => {}
	}: {
		latitude?: number | undefined;
		longitude?: number | undefined;
		zoom?: number;
		readonly?: boolean;
		enableGPS?: boolean;
		/**
		 * Ob `latitude`/`longitude` eine bewusst gewählte Position sind oder nur
		 * ein Kartenmittelpunkt, den der Aufrufer setzen musste, damit die Karte
		 * nicht im Nullmeridian startet (siehe `LocationInput.svelte`).
		 *
		 * Default `true` — Aufrufer mit echten Koordinaten (Admin-Ansicht,
		 * Foto-EXIF-Karte) verhalten sich damit unverändert. Nur wo eine Position
		 * fehlen kann, muss `false` übergeben werden; dann bleibt der Marker aus,
		 * bis der Nutzer eine Stelle wählt.
		 */
		hasPosition?: boolean;
		/**
		 * Überschreibt die Marker-Erklärung. Ohne Wert bleibt der bisherige Wortlaut —
		 * Admin-Ansicht und Foto-EXIF-Karte ändern sich dadurch nicht.
		 */
		hintOverride?: string | undefined;
		onchange?: (longitude: number, latitude: number) => void;
	} = $props();

	let mapElement: HTMLElement;
	let map: Map | null = null;
	let markerFeature: Feature | null = null;
	/**
	 * `$state`, nicht `let`: Der Sichtbarkeits-Effekt weiter unten muss erneut
	 * laufen, sobald die Ebene existiert. Seit OpenLayers nachgeladen wird,
	 * entsteht sie erst nach einem `await` — also lange nach dem ersten
	 * Effektlauf.
	 */
	let markerLayer = $state<BaseLayer | null>(null);

	// Konvertiere Breiten- und Längengrad in OpenLayers-Koordinaten (lon, lat)
	let coordinates = $derived([longitude, latitude]) as Coordinate;
	let markerMoved = false;

	/**
	 * `hasPosition` ist die einzige Quelle für die Marker-Sichtbarkeit — bewusst
	 * kein zusätzliches „hier gerade getippt"-Flag. Der Aufrufer meldet über
	 * `onchange` und spiegelt das Ergebnis synchron in `hasPosition` zurück
	 * (`LocationInput.svelte`), sodass der Marker im selben Durchlauf erscheint.
	 * Ein eigenes Flag würde zusätzlich verhindern, dass der Marker wieder
	 * verschwindet, wenn der Melder die Koordinatenfelder später leert.
	 */
	let mapHint = $derived.by(() => {
		if (hintOverride !== undefined) return hintOverride;
		if (!hasPosition) {
			return m.components_map_olmap_text_noch_keine_position_gewaehlt_tippen_sie();
		}
		// Zwei GANZE Sätze statt Verkettung: Ein festes Fragment plus Anhang
		// zwingt jede Zielsprache in die deutsche Satzfolge (Protokoll, Muster C).
		return enableGPS
			? m.components_map_olmap_text_tippen_sie_auf_die_karte_gps()
			: m.components_map_olmap_text_tippen_sie_auf_die_karte_oder_ziehen_sie();
	});

	/** Verschiebt die Marker-Geometrie auf die übergebene Position. */
	function moveMarkerTo(coords: Coordinate): void {
		if (fromLonLat && markerFeature?.getGeometry()) {
			(markerFeature.getGeometry() as Point).setCoordinates(fromLonLat(coords));
		}
	}

	/**
	 * Übernimmt eine vom Nutzer gewählte Position (Ziehen, Tippen, GPS) und meldet
	 * sie nach außen.
	 *
	 * `recenter` unterscheidet die Gesten: Beim Ziehen und bei GPS rückt die Karte
	 * wie bisher auf die neue Position nach; beim Tippen bleibt der Ausschnitt
	 * stehen, sonst springt der getippte Punkt unter dem Finger weg.
	 */
	function applyPosition(coords: Coordinate, recenter: boolean): void {
		markerMoved = true;
		// Extrahiere lon und lat aus den Koordinaten
		const [lon, lat] = coords;
		longitude = lon ? parseFloat(lon.toFixed(4)) : 0;
		latitude = lat ? parseFloat(lat.toFixed(4)) : 0;
		moveMarkerTo(coords);
		if (recenter && map && setMapCenter) {
			setMapCenter(map, coords);
		}
		try {
			if (onchange) {
				onchange(longitude, latitude);
			}
		} catch (error) {
			console.error('Error occurred while handling map change:', error);
		}
	}

	// Marker verschoben (Translate-Interaktion)
	function updateMarkerPosition(coords: Coordinate): void {
		applyPosition(coords, true);
	}

	// GPS-Position Handler
	function handleGPSPosition(gpsCoords: Coordinate): void {
		applyPosition(gpsCoords, true);
	}

	/**
	 * Tippen/Klicken auf die Karte setzt die Position. Auf dem Telefon ist das die
	 * erwartete Geste; ohne sie war das Ziehen des Markers der einzige Weg — und
	 * solange kein Marker sichtbar ist, gäbe es gar nichts zu ziehen.
	 *
	 * `singleclick` statt `click`, damit ein Doppelklick (= Zoom) die Position
	 * nicht mitverschiebt.
	 */
	function handleMapClick(event: MapBrowserEvent): void {
		// `toLonLat` steht hier immer: Das Event kann es erst geben, nachdem der
		// Init-Effekt die Karte gebaut — und damit das Modul geladen — hat.
		if (!toLonLat) return;
		applyPosition(toLonLat(event.coordinate), false);
	}

	function updateMarker(coords: Coordinate) {
		if (map && coords && setMapCenter) {
			// Rufe setMapCenter als Async-Funktion auf
			setMapCenter(map, coords);
			map?.updateSize();
			// Aktualisiere die Markerposition, wenn markerFeature noch existiert
			moveMarkerTo(coords);
		}
	}

	// Modern $effect for map initialization and cleanup
	$effect(() => {
		if (!mapElement) return;

		// Diese drei bewusst SYNCHRON lesen, noch vor dem `await`: Sie sind die
		// Abhängigkeiten, an denen der Effekt hängen soll. Nach einem `await`
		// verfolgt Svelte keine Lesezugriffe mehr — stünden sie erst unten, wäre
		// der Effekt still auf `mapElement` allein zusammengeschrumpft und ein
		// Wechsel von `readonly` bliebe wirkungslos.
		const target = mapElement;
		const isReadonly = readonly;
		const wantsGPS = enableGPS;

		let cancelled = false;
		loading = true;
		loadError = false;

		void (async () => {
			const helpers = await import('#lib/utils/map/openLayersHelpers.ts');
			// Kein zweiter Netz-Roundtrip: `openLayersHelpers` importiert `ol/proj`
			// selbst, das Modul steckt also schon im Graphen des Imports darüber.
			const proj = await import('ol/proj');

			// Der Effekt kann während des Nachladens schon wieder aufgeräumt
			// worden sein (Schrittwechsel im Formular, Modal geschlossen). Dann
			// darf hier keine Karte mehr entstehen — sie hinge an einem Element,
			// das niemand mehr aufräumt.
			if (cancelled) return;

			fromLonLat = proj.fromLonLat;
			toLonLat = proj.toLonLat;
			setMapCenter = helpers.setMapCenter;

			// Karte genau einmal pro Ziel-Element aufbauen: `coordinates` und `zoom`
			// werden bewusst untracked gelesen. Sonst würde jede Koordinaten-
			// änderung — also jedes Tippen und jedes Ziehen — die komplette Karte
			// verwerfen und neu erzeugen (Kachel-Nachladen, verlorener Zoom).
			// Laufende Änderungen übernimmt der Effekt weiter unten.
			const initial = untrack(() => coordinates);
			const initialZoom = untrack(() => zoom);

			// Erstelle die Karte
			map = helpers.createMap(
				target,
				initial,
				initialZoom,
				!isReadonly && wantsGPS, // GPS nur wenn nicht readonly und explizit aktiviert
				isReadonly ? undefined : handleGPSPosition // GPS-Callback nur wenn nicht readonly
			);

			// Füge den initialen Marker hinzu
			const marker = helpers.addMarker(
				map,
				initial,
				!isReadonly, // Marker ist verschiebbar, wenn die Karte nicht schreibgeschützt ist
				isReadonly ? undefined : updateMarkerPosition
			);

			markerFeature = marker.feature;
			// Die Sichtbarkeit setzt der Effekt weiter unten — er läuft an, sobald
			// diese Zuweisung erfolgt. Hier stand früher ein eigenes
			// `setVisible(untrack(() => hasPosition))`; das ist mit `$state` doppelt
			// gemoppelt und wäre eine zweite Quelle für dieselbe Aussage.
			markerLayer = marker.layer;

			if (!isReadonly) {
				map.on('singleclick', handleMapClick);
			}

			loading = false;
		})().catch((error) => {
			// `void` allein hätte die Rejection verschluckt: Es gibt keinen
			// `hooks.client.ts`, der unbehandelte Rejections auffinge.
			if (cancelled) return;
			logger.error({ error }, 'OpenLayers konnte nicht nachgeladen werden');

			// Der Fehlschlag muss nicht der Import gewesen sein: Scheitert erst
			// `addMarker` oder ein Schritt danach, steht bereits eine
			// funktionsfähige Karte samt Listenern im DOM — unter dem
			// Fehler-Overlay, aber am Leben. Der Cleanup-Return läuft in diesem
			// Pfad nicht, also hier aufräumen.
			map?.dispose();
			map = null;
			markerFeature = null;
			markerLayer = null;

			loadError = true;
			loading = false;
		});

		// Cleanup function (replaces onDestroy)
		return () => {
			cancelled = true;
			if (map) {
				map.dispose();
				map = null;
				markerFeature = null;
				markerLayer = null;
			}
		};
	});

	/**
	 * Marker erst zeigen, wenn eine echte Position vorliegt.
	 *
	 * Beide Werte werden ABSICHTLICH erst in lokale Variablen gelesen. Die
	 * naheliegende Kurzform ist eine Falle:
	 *
	 *     markerLayer?.setVisible(hasPosition);   // ❌
	 *
	 * Ist `markerLayer` null, bricht der Optional-Chaining-Ausdruck ab, **bevor**
	 * `hasPosition` ausgewertet wird. Der Effekt liest die Abhängigkeit dann nie
	 * und läuft nie wieder — er ist ab dem ersten Durchlauf tot.
	 *
	 * Solange die Karte synchron entstand, fiel das nicht auf: Der Aufbau-Effekt
	 * läuft zuerst und hatte die Ebene bereits gesetzt. Seit dem Nachladen ist
	 * sie beim ersten Durchlauf null — der Marker blieb dadurch für immer
	 * unsichtbar, auch nachdem der Melder eine Stelle angetippt hatte
	 * (`e2e/form-map-pan-zoom.spec.ts` fing es als leeres Kartenbild).
	 */
	$effect(() => {
		const ebene = markerLayer;
		const sichtbar = hasPosition;
		ebene?.setVisible(sichtbar);
	});

	// Reactive effect for coordinate updates
	$effect(() => {
		if (!markerMoved) {
			updateMarker(coordinates);
		}
		markerMoved = false;
	});
</script>

<!-- Karte ist ein interaktives Application-Widget (OpenLayers-Tastatursteuerung); tabindex bewusst gesetzt -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={mapElement}
	class="ol-map-container z-base h-full w-full overflow-hidden"
	role="application"
	data-position={hasPosition ? 'set' : 'unset'}
	aria-label={readonly
		? m.components_map_olmap_aria_label_interaktive_karte_der_sichtungen()
		: m.components_map_olmap_aria_label_interaktive_karte_zur_position()}
	tabindex="0"
>
	{#if loading}
		<!--
			Der Ladehinweis liegt INNERHALB des Kartenziels, nicht daneben:
			`.ol-map-container` ist bereits `position: relative` und hat eine feste
			Höhe (`--map-height`, Default 400px) — ein Wrapper wäre also nur ein
			zusätzlicher Kasten ohne Wirkung. OpenLayers hängt sein `.ol-viewport`
			per `appendChild` an, räumt vorhandene Kinder also nicht ab; Svelte
			entfernt hier umgekehrt nur die eigenen Knoten. Beide kommen sich nicht
			ins Gehege.

			`role="status"` statt eines rein visuellen Spinners: Ohne Textmeldung
			bliebe für Screenreader-Nutzer 400 px Leerfläche ohne jede Erklärung.
		-->
		<div
			class="bg-base-200/60 text-base-content absolute inset-0 flex items-center justify-center gap-2 text-sm"
			role="status"
			data-testid="map-loading"
		>
			<span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
			<span>{m.components_map_olmap_text_karte_wird_geladen()}</span>
		</div>
	{:else if loadError}
		<!--
			`role="alert"` statt `status`: Der Melder muss das hier mitbekommen,
			ohne die Kartenfläche abzusuchen — ohne Karte ist die Positionsangabe
			nur noch über die Koordinatenfelder möglich.

			`text-base-content` auf der getönten Fläche, NICHT `*-content`: Das
			gehört laut design-system.md ausschließlich auf Vollton-Flächen.
		-->
		<div
			class="bg-warning/10 text-base-content absolute inset-0 flex items-center justify-center gap-2 p-4 text-center text-sm"
			role="alert"
			data-testid="map-load-error"
		>
			<Icon icon="lucide:triangle-alert" class="h-5 w-5 shrink-0" aria-hidden="true" />
			<span>{m.components_map_olmap_text_karte_konnte_nicht_geladen_werden()}</span>
		</div>
	{/if}
</div>

{#if !readonly}
	<div class="alert mt-2 mb-0" role="status">
		<Icon icon="lucide:info" class="h-6 w-6 shrink-0" aria-hidden="true" />
		<span data-testid="map-hint">{mapHint}</span>
	</div>
{/if}

<!-- OpenLayers styles sind jetzt global in app.css über mapStyles.css importiert -->
