import * as m from '#lib/paraglide/messages.js';
import { createLogger } from '#lib/logger.ts';
import type { Map } from 'ol';
import type { Coordinate } from 'ol/coordinate';
import type Feature from 'ol/Feature';
import type BaseLayer from 'ol/layer/Base';

// Direkte Importe für alle benötigten OpenLayers-Module

const logger = createLogger('utils:map:openLayersHelpers');

import Collection from 'ol/Collection';
import { Control, defaults as defaultControls } from 'ol/control';
import { all, noModifierKeys, primaryAction } from 'ol/events/condition';
import OLFeature from 'ol/Feature';
import OLPoint from 'ol/geom/Point';
import { defaults as defaultInteractions, DragPan } from 'ol/interaction';
import Translate from 'ol/interaction/Translate';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import OLMap from 'ol/Map';
import { fromLonLat, toLonLat, transform } from 'ol/proj';
import { OSM, Vector as VectorSource } from 'ol/source';
import { Icon, Style } from 'ol/style';
import OLView from 'ol/View';

/**
 * GPS-Positionierungs-Control für OpenLayers (vereinfacht für OLMap)
 * Verwendet das neue LocationControl-Design mit kontinuierlichem Tracking
 */
export class FormLocationControl extends Control {
	private onPositionCallback?: (position: Coordinate) => void;
	private button: HTMLButtonElement;
	private isTracking: boolean = false;
	private watchId: number | null = null;

	constructor(onPosition: (position: Coordinate) => void) {
		const button = document.createElement('button');
		button.innerHTML = '📍';
		button.title = m.map_controls_text_gps_position_anzeigen();
		button.className = 'gps-button';
		button.setAttribute('aria-pressed', 'false');

		const element = document.createElement('div');
		element.className = 'ol-control gps-control';
		element.appendChild(button);

		super({
			element: element
		});

		this.onPositionCallback = onPosition;
		this.button = button;

		button.addEventListener('click', () => {
			this.toggleGeolocation();
		});
	}

	private toggleGeolocation() {
		if (!navigator.geolocation) {
			alert(m.utils_map_openlayershelpers_text_geolocation_wird_von_ihrem_browser_nicht());
			return;
		}

		this.isTracking = !this.isTracking;

		if (this.isTracking) {
			// Starte GPS-Tracking
			this.startTracking();
		} else {
			// Stoppe GPS-Tracking
			this.stopTracking();
		}
	}

	private startTracking() {
		// Zustand über aria-pressed statt Inline-Farben — ein Zustand, eine Quelle.
		// Die Farben stehen in mapStyles.css (.gps-button[aria-pressed='true']);
		// der Button ist DOM, kein Canvas, und braucht deshalb keine Hex-Werte.
		this.button.setAttribute('aria-pressed', 'true');
		this.button.title = m.map_controls_text_gps_tracking_stoppen();

		// Kontinuierliche Positionsverfolgung starten
		this.watchId = navigator.geolocation.watchPosition(
			(position) => {
				const coords: Coordinate = [position.coords.longitude, position.coords.latitude];

				if (this.onPositionCallback) {
					this.onPositionCallback(coords);
				}
			},
			(error) => {
				logger.warn(
					{ error: error instanceof Error ? error.message : error },
					'GPS-Positionierung fehlgeschlagen'
				);
				this.stopTracking();
			},
			{
				enableHighAccuracy: true,
				timeout: 10000,
				maximumAge: 60000
			}
		);
	}

	private stopTracking() {
		// Position tracking stoppen
		if (this.watchId !== null) {
			navigator.geolocation.clearWatch(this.watchId);
			this.watchId = null;
		}

		this.isTracking = false;

		// Button-Erscheinungsbild zurücksetzen
		this.button.setAttribute('aria-pressed', 'false');
		this.button.title = m.map_controls_text_gps_position_anzeigen();
	}

	/**
	 * OpenLayers ruft disposeInternal() auf Controls auf wenn die Map disposed wird.
	 * Stoppt laufendes GPS-Tracking damit keine verwaisten watchPosition-Callbacks bleiben.
	 */
	override disposeInternal() {
		this.stopTracking();
		super.disposeInternal();
	}
}

/**
 * Optimiert Canvas für häufige getImageData-Operationen (OpenLayers)
 */
function optimizeCanvasForOpenLayers(): void {
	// Prüfe ob bereits gepatched
	if ((HTMLCanvasElement.prototype as unknown as Record<string, unknown>)._olOptimized) {
		return;
	}

	// Speichere die ursprüngliche getContext-Methode
	const originalGetContext = HTMLCanvasElement.prototype.getContext;

	// Überschreibe getContext für alle Canvas-Elemente
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(HTMLCanvasElement.prototype.getContext as any) = function (
		this: HTMLCanvasElement,
		contextType: string,
		contextAttributes?:
			| CanvasRenderingContext2DSettings
			| WebGLContextAttributes
			| ImageBitmapRenderingContextSettings
	) {
		// Für 2D-Kontext: setze willReadFrequently auf true
		if (contextType === '2d') {
			const attrs = (contextAttributes as CanvasRenderingContext2DSettings) || {};
			attrs.willReadFrequently = true;
			return originalGetContext.call(this, contextType, attrs);
		}
		return originalGetContext.call(this, contextType, contextAttributes);
	};

	// Markiere als gepatched
	(HTMLCanvasElement.prototype as unknown as Record<string, unknown>)._olOptimized = true;
}

/**
 * Erstellt eine neue OpenLayers-Karte
 * @param target Das HTML-Element für die Karte
 * @param center Koordinaten für das Zentrum der Karte
 * @param zoom Zoomlevel
 * @param enableGPS Optional: GPS-Control hinzufügen
 * @param onGPSPosition Optional: Callback für GPS-Position
 * @returns Die erstellte Karte
 */
export function createMap(
	target: HTMLElement,
	center: Coordinate,
	zoom: number,
	enableGPS: boolean = false,
	onGPSPosition?: (position: Coordinate) => void
): Map {
	// Optimiere Canvas vor Map-Erstellung
	optimizeCanvasForOpenLayers();
	// OSM-Layer erstellen
	const osmLayer = new TileLayer({
		source: new OSM()
	});

	// Kartenansicht erstellen
	const view = new OLView({
		center: fromLonLat(center),
		zoom: zoom
	});

	// Controls erstellen
	const controls = defaultControls();

	// GPS-Control hinzufügen, wenn aktiviert
	if (enableGPS && onGPSPosition) {
		const gpsControl = new FormLocationControl(onGPSPosition);
		controls.push(gpsControl);
	}

	// Karte erstellen
	const map = new OLMap({
		target: target,
		layers: [osmLayer],
		view: view,
		controls: controls,

		/**
		 * Interactions wie OpenLayers sie selbst baut — **nur DragPan** ist vom
		 * Fokus-Zwang ausgenommen. Dieselbe Abwägung wie in
		 * `src/lib/map/optimizedMapController.ts`, dort aber mit einem anderen
		 * Ausgang für das Mausrad: Die Sichtungskarte nimmt `MouseWheelZoom`
		 * ebenfalls aus den Defaults und lässt es außerhalb des iframes frei
		 * zoomen (`onFocusOnly: !isNotIFrame`). Hier bleibt die Bremse — Begründung
		 * unten. Die beiden Stellen sind bewusst nicht gekoppelt.
		 *
		 * `onFocusOnly: true` ist kein Zusatz, sondern die Wiederherstellung des
		 * Verhaltens, das `ol/Map` beim Weglassen der Option verwendet: Map.js ruft
		 * `defaultInteractions({ onFocusOnly: true })` auf. Ruft man `defaults()`
		 * dagegen selbst auf, ist der Default `false` — wer das übersieht, hebt den
		 * Fokus-Schutz still für **alle** Interactions auf.
		 *
		 * Was `onFocusOnly` bewirkt: `DragPan` und `MouseWheelZoom` — und nur diese
		 * beiden — bekommen `all(focusWithTabindex, …)` vorgeschaltet.
		 * `focusWithTabindex` verlangt, **nur wenn das Ziel-Element ein `tabindex`
		 * trägt**, dass `document.activeElement` innerhalb des Ziels liegt.
		 *
		 * Genau dieses `tabindex="0"` setzt `OLMap.svelte` bewusst auf den
		 * Karten-Container, damit KeyboardPan und KeyboardZoom greifen. Nebenwirkung
		 * war der bekannte Defekt „die Karte reagiert erst nach einem Klick": ohne
		 * Fokus war `activeElement` der `<body>`, die Condition damit `false` und die
		 * Geste verpuffte — bei einwandfreien, trusted Events.
		 *
		 * **Auf dieser Karte wiegt das schwerer als auf der Sichtungskarte.** Der
		 * Klick, mit dem man das Ziehen freischalten müsste, ist hier kein neutraler
		 * Klick: `OLMap.svelte` hängt an `singleclick` den Handler `handleMapClick`
		 * → `applyPosition`, der die **gemeldete Position setzt**. Wer die Karte nur
		 * zurechtschieben wollte, hätte damit unbemerkt seine Sichtung verlegt.
		 * Ziehen ist deshalb bedingungslos frei — eine eindeutige Absicht, die mit
		 * nichts konkurriert. `kinetic` bleibt bewusst weg: `defaults()` setzt dort
		 * eine Schwung-Animation, die beim Setzen einer Position eher stört.
		 *
		 * **Das Mausrad behält den Fokus-Zwang** — und zwar aus einem Grund, den die
		 * Sichtungskarte nicht hat. Dort trägt die Bremse allein die iframe-
		 * Einbettung auf meeresmuseum.de, und außerhalb des Rahmens zoomt das Rad
		 * deshalb frei: Die Karte füllt dort die Seite. Hier ist sie ein 556×400
		 * Element mitten in einem langen, scrollbaren Formular. Ein bedingungsloser
		 * Rad-Zoom würde das Seiten-Scrollen auf halber Strecke abfangen
		 * (`MouseWheelZoom` ruft `preventDefault()`), und der Melder käme über der
		 * Karte nicht mehr zum nächsten Feld — unabhängig von jedem iframe.
		 *
		 * Vertretbar ist die Bremse, weil Zoomen im Gegensatz zum Schieben
		 * **Ersatzwege hat, die keinen Fokus brauchen**: die Zoom-Buttons oben links
		 * sind immer bedienbar. Und wer den Fokus doch will, kommt per Tab hinein —
		 * ohne den Klick, der eine Position setzen würde. Beim Schieben gab es diesen
		 * Ersatz nicht; das ist der ganze Unterschied.
		 *
		 * **Zur Reihenfolge:** `.extend()` hängt den eigenen DragPan ans Ende der
		 * Collection, und `Map.handleMapBrowserEvent` läuft sie rückwärts durch — er
		 * wird also zuerst gefragt. Das ist unkritisch, weil `addMarker()` seine
		 * `Translate`-Interaktion später per `addInteraction` anhängt und damit
		 * dahinter landet: Ein Zug, der auf dem Marker beginnt, verschiebt weiterhin
		 * den Marker und nicht die Karte. Wer `addMarker()` vor die Karten-Erzeugung
		 * zieht, dreht genau das um.
		 *
		 * Abgesichert in `e2e/form-map-pan-zoom.spec.ts` — beide Richtungen, also
		 * auch der Rad-Schutz als Gegenprobe.
		 */
		interactions: defaultInteractions({ onFocusOnly: true, dragPan: false }).extend([
			new DragPan({ condition: all(noModifierKeys, primaryAction) })
		])
	});

	// Wichtig: Karte neu rendern, wenn das Ziel-Element sichtbar ist
	map.updateSize();

	return map;
}

/**
 * Erstellt einen Marker auf der Karte
 * @param map Die OpenLayers-Karte
 * @param coordinates Die Koordinaten für den Marker [lon, lat]
 * @param draggable Ob der Marker ziehbar sein soll
 * @param onMove Callback-Funktion für Bewegungen des Markers
 * @returns Das erstellte Feature und die Vector-Layer
 */
export function addMarker(
	map: Map,
	coordinates: Coordinate,
	draggable: boolean = false,
	onMove?: (coordinates: Coordinate) => void
): { feature: Feature; layer: BaseLayer } {
	// Koordinaten transformieren
	const transformedCoords = fromLonLat(coordinates);

	// Feature mit Punkt-Geometrie erstellen
	const feature = new OLFeature({
		geometry: new OLPoint(transformedCoords)
	});

	// Stil für den Marker erstellen
	const markerStyle = new Style({
		image: new Icon({
			anchor: [0.5, 1],
			src: draggable ? '/marker-icon-2x.png' : '/marker-icon.png', // Größeres Icon für verschiebbare Marker
			scale: draggable ? 0.8 : 1,
			// Spezielle Stile für verschiebbare Marker
			opacity: draggable ? 0.9 : 1,
			crossOrigin: 'anonymous'
		})
	});

	feature.setStyle(markerStyle);

	// Vektorquelle mit dem Feature erstellen
	const vectorSource = new VectorSource({
		features: [feature]
	});

	// Vector Layer erstellen und zur Karte hinzufügen
	const vectorLayer = new VectorLayer({
		source: vectorSource
	});

	map.addLayer(vectorLayer);

	// Drag-and-Drop-Funktionalität hinzufügen, wenn draggable ist true
	if (draggable) {
		// Feature-Collection für Translate erstellen
		const features = new Collection([feature]);

		// Translate-Interaktion erstellen für das Verschieben von Features
		const translate = new Translate({
			features: features
		});

		map.addInteraction(translate);

		if (onMove) {
			// Event beim Verschieben auslösen
			translate.on('translateend', () => {
				const geometry = feature.getGeometry() as OLPoint;
				const internalCoords = geometry.getCoordinates();
				// Konvertiere zurück in Längen- und Breitengrad
				const lonLatCoords = toLonLat(internalCoords);
				onMove(lonLatCoords);
			});
		}
	}

	return { feature, layer: vectorLayer };
}

/**
 * Konvertiert Koordinaten zwischen WGS84 (EPSG:4326) und Web Mercator (EPSG:3857)
 * @param coordinates Die zu konvertierenden Koordinaten
 * @param source Das Quell-Projektionssystem
 * @param destination Das Ziel-Projektionssystem
 * @returns Die konvertierten Koordinaten
 */
export function transformCoordinates(
	coordinates: Coordinate,
	source: string = 'EPSG:4326',
	destination: string = 'EPSG:3857'
): Coordinate {
	return transform(coordinates, source, destination);
}

/**
 * Setzt das Zentrum der Karte
 * @param map Die OpenLayers-Karte
 * @param coordinates Die Koordinaten für das Zentrum [lon, lat]
 * @param zoom Optional: Zoomlevel
 */
export function setMapCenter(map: Map, coordinates: Coordinate, zoom?: number): void {
	const view = map.getView();
	view.setCenter(fromLonLat(coordinates));
	if (zoom !== undefined) {
		view.setZoom(zoom);
	}
}
