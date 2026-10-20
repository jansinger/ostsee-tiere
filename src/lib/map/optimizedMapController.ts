import * as m from '#lib/paraglide/messages.js';
import { createLogger } from '#lib/logger.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import { resolveDisplayLocale } from '#lib/utils/format/dateTime.ts';
import { Feature, Geolocation, Map, Overlay, View } from 'ol';
import type { Control } from 'ol/control';
import { defaults as defaultControls } from 'ol/control';
import type { EventsKey } from 'ol/events';
import { all, noModifierKeys, primaryAction } from 'ol/events/condition';
import * as olExtent from 'ol/extent';
import { defaults as defaultInteractions, DragPan, MouseWheelZoom } from 'ol/interaction';
import GeoJSON from 'ol/format/GeoJSON';
import type { Geometry } from 'ol/geom';
import { Point as OlPoint } from 'ol/geom';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { unByKey } from 'ol/Observable';
import { fromLonLat } from 'ol/proj';
import { OSM, XYZ } from 'ol/source';
import Cluster from 'ol/source/Cluster';
import VectorSource from 'ol/source/Vector';
import { Circle, Fill, Stroke, Style } from 'ol/style';
import { LocationControl } from './controls/LocationControl.js';
import { geolocationErrorMessage } from './controls/locationControlState.js';
import { ZoomAllControl } from './controls/ZoomAllControl.js';
import { getDefaultSightingYear } from '#lib/utils/date/defaultYear.ts';
import { isNotIFrame } from '#lib/utils/client/isNotIFrame.ts';
import { clampExtentToBaltic, type Extent } from './extentUtils';
import { areExtentsColocated, type MapTranslations } from './mapUtils';
import {
	aggregateClusterStatus,
	clearStyleCache,
	createClusterStyle,
	createFeatureStyle,
	getFeatureColorGroup
} from './styleUtils';
import { clusterDistanceForZoom, clusterMinDistanceFor } from './clusterConfig';
import { MAP_THEME } from './mapTokens';
import {
	createClusterInfoText,
	createClusterListContent,
	createInfoText,
	createSightingPopupContent,
	type SightingPopupProperties as SightingProperties
} from './popupContent';
import type { SightingStatus } from '#lib/components/admin/sightingStatus.ts';
import { buildSightingsQuery, DEFAULT_MAP_STATUSES } from './statusRequestParams';

const logger = createLogger('map:optimized-controller');

/**
 * Optionen für die Map-Klasse
 */
/**
 * Ausgang eines Statuswechsels. `superseded` ist kein Fehler, sondern der
 * Normalfall bei schnellem Umschalten: Ein neuerer Aufruf hat den laufenden
 * Request abgebrochen und ist ab dann zuständig.
 */
export type StatusChangeResult = 'applied' | 'superseded' | 'failed';

export interface MapOptions {
	translations: MapTranslations;
	target: string;
	yearSelectorId?: string;
	filterInputId?: string;
	sliderRangeId?: string;
	timeStartId?: string;
	timeEndId?: string;
	enableLocationControl?: boolean;
	/**
	 * Überschreibt das über `getDefaultSightingYear()` ermittelte Default-Jahr,
	 * z. B. mit dem Ergebnis von `pickDefaultYear()` (QW2b) sobald die
	 * verfügbaren Jahre vom Server geladen sind.
	 */
	initialYear?: number;
	/**
	 * Startet die Karte mit einem bereits gesetzten Suchbegriff (M4: aus der
	 * URL wiederhergestellt) — fließt in den ersten Daten-Fetch ein, statt
	 * nach dem Initial-Load einen zweiten Request auszulösen.
	 */
	initialSearchTerm?: string;
	/**
	 * Bearbeitungszustände, die geladen werden. Nur Admins dürfen davon
	 * abweichen — die API antwortet sonst mit 403.
	 */
	initialStatuses?: readonly SightingStatus[];
	onLoading?: (isLoading: boolean) => void;
	onError?: (error: Error) => void;
	/**
	 * N2: Geolocation-Fehler (verweigerte Berechtigung, Timeout, …) — erhält
	 * eine bereits nutzerverständliche deutsche Meldung für die Toast-Anzeige.
	 */
	onGeolocationError?: (message: string) => void;
}

/**
 * Interface für Custom Controls, um zirkuläre Type-Dependencies zu vermeiden.
 * Controls nutzen dieses Interface statt des konkreten SichtungenMap-Typs.
 */
export interface MapController {
	toggleGeolocation(): void;
	zoomAllFeatures(): void;
	/**
	 * N2: Registriert einen Listener für Tracking-Zustandswechsel — feuert auch,
	 * wenn der Controller das Tracking selbst stoppt (Geolocation-Fehler), damit
	 * die LocationControl ihren Toggle-Zustand zurücksetzen kann.
	 */
	onTrackingChange(callback: (isTracking: boolean) => void): void;
}

/**
 * Optimierte Hauptklasse für die Sichtungen-Karte
 */
export class SichtungenMap {
	private map: Map;
	private options: MapOptions;
	private reportsSource: VectorSource<Feature<Geometry>>;
	private clusterSource: Cluster;
	private reportsLayer: VectorLayer<Cluster>;
	private translations: MapTranslations;
	private timeFilter: { lower: number; upper: number };
	private hiddenSpecies: Record<string, boolean> = {};
	private hiddenColors: Record<string, boolean> = {};
	private displayedYear: number;
	private searchTerm: string = '';
	private statuses: readonly SightingStatus[] = DEFAULT_MAP_STATUSES;
	private legendUpdateCallback?: () => void;
	private yearChangeCallback?: (year: number) => void;
	private loadingCallback?: (isLoading: boolean) => void;
	private errorCallback?: (error: Error) => void;
	private activeAbortController: AbortController | null = null;
	private filterDebounceTimeout: number | null = null;
	private clusterDistance: number = 40; // Reduziert für bessere Performance
	// M3: Seezeichen-Ebene als Feld, damit die Legende sie umschalten kann
	private seamarkLayer: TileLayer<XYZ>;

	// Popup-related
	private popup!: Overlay;
	private popupElement!: HTMLDivElement;

	// Geolocation-related properties
	private geolocation!: Geolocation;
	private geolocationKeys: EventsKey[] = [];
	private viewResolutionKey: EventsKey | null = null;
	private locationSource!: VectorSource<Feature<Geometry>>;
	private locationLayer!: VectorLayer<VectorSource<Feature<Geometry>>>;
	private isTracking: boolean = false;
	private trackingChangeCallbacks: ((isTracking: boolean) => void)[] = [];
	// N2: Nur beim ersten Positionsfix pro Tracking-Sitzung zentrieren
	private hasCenteredOnFirstFix: boolean = false;

	constructor(options: MapOptions) {
		this.translations = options.translations;
		this.options = options;

		// Initialisiere die Karten-Komponenten
		this.reportsSource = new VectorSource({
			attributions: 'Reports © <a href="http://www.meeresmuseum.de/">Deutsches Meeresmuseum</a>'
		});

		// Initialisiere Location Layer
		this.locationSource = new VectorSource();
		this.locationLayer = new VectorLayer({
			source: this.locationSource,
			style: (feature) => {
				const type = feature.get('type');
				if (type === 'location') {
					return new Style({
						image: new Circle({
							radius: 8,
							fill: new Fill({ color: MAP_THEME.primary }),
							stroke: new Stroke({ color: MAP_THEME.primaryContent, width: 2 })
						})
					});
				} else if (type === 'accuracy') {
					return new Style({
						stroke: new Stroke({
							color: MAP_THEME.primary,
							width: 2
						}),
						fill: new Fill({
							// 10 % Deckkraft als 8-stelliges Hex — ol/color löst #RRGGBBAA auf,
							// eine zweite Konstante in mapTokens.ts wäre dafür nicht nötig.
							color: `${MAP_THEME.primary}1a`
						})
					});
				}
				return undefined;
			}
		});

		// Optimierte Cluster-Konfiguration — minDistance an die Distanz gekoppelt,
		// sonst überlappen Cluster bei niedrigen Zoomstufen fast vollständig (M2)
		this.clusterSource = new Cluster({
			distance: this.clusterDistance,
			minDistance: clusterMinDistanceFor(this.clusterDistance),
			source: this.reportsSource
		});

		// Vereinfachter Layer nur mit Clustering
		this.reportsLayer = new VectorLayer({
			source: this.clusterSource,
			style: (feature) => {
				const features = feature.get('features');
				if (features && features.length > 1) {
					const clusterStyle = this.createFilteredClusterStyle(
						feature as Feature<Geometry>,
						features
					);
					return clusterStyle || [];
				} else {
					const singleFeature = features ? features[0] : feature;
					// Verwende die originale Style-Funktion mit den aktuellen Filtern
					const styles = createFeatureStyle(
						singleFeature as Feature<Geometry>,
						this.hiddenSpecies,
						this.hiddenColors,
						this.timeFilter
					);
					// Return empty array if styles are null to make feature invisible
					return styles ?? [];
				}
			}
		});

		// OpenSeaMap-Seezeichen (Bojen, Tonnen, Leuchtfeuer) — per Legende
		// ein-/ausblendbar (M3), Default an
		this.seamarkLayer = new TileLayer({
			source: new XYZ({
				url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
				attributions: '© <a href="http://www.openseamap.org/">OpenSeaMap</a> contributors',
				maxZoom: 18,
				minZoom: 1,
				crossOrigin: 'anonymous',
				// Handle tile loading errors gracefully
				tileLoadFunction: (tile, src) => {
					const img = (tile as unknown as { getImage(): HTMLImageElement }).getImage();
					img.onerror = () => {
						// If tile fails to load, log for debugging and hide it
						logger.warn({ tileUrl: src }, 'OpenSeaMap tile failed to load');
						img.style.display = 'none';
					};
					img.src = src;
				}
			}),
			opacity: 0.8 // Slightly transparent to blend well with base map
		});

		// Erstelle Popup
		this.createPopup();

		// Standard-Koordinaten und Extent für die Ostsee
		const defaultLat = 54.5;
		const defaultLon = 12.0;
		const defaultZoom = 7;

		// Initialize the timeFilter with sensible defaults (zeige das ganze Jahr)
		this.displayedYear = options.initialYear ?? getDefaultSightingYear();
		this.searchTerm = options.initialSearchTerm ?? '';
		this.statuses = options.initialStatuses ?? DEFAULT_MAP_STATUSES;
		const yearStart = new Date(this.displayedYear, 0, 1).getTime();
		const yearEnd = new Date(this.displayedYear, 11, 31, 23, 59, 59).getTime();
		this.timeFilter = {
			lower: yearStart,
			upper: yearEnd
		};

		// Erstelle die Karte mit optimierter Konfiguration
		this.map = new Map({
			target: options.target,
			layers: [
				// Basis-Karte (OSM) mit Error-Handling
				new TileLayer({
					source: new OSM({
						attributions:
							'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
						tileLoadFunction: (tile, src) => {
							const img = (tile as unknown as { getImage(): HTMLImageElement }).getImage();
							img.onerror = () => {
								logger.warn({ tileUrl: src }, 'OSM tile failed to load');
							};
							img.src = src;
						}
					})
				}),
				// OpenSeaMap-Layer für maritime Informationen (Toggle in der Legende, M3)
				this.seamarkLayer,
				// Sichtungen-Layer (nur einer!)
				this.reportsLayer,
				// GPS-Position Layer
				this.locationLayer
			],
			view: new View({
				center: fromLonLat([defaultLon, defaultLat]),
				zoom: defaultZoom,
				projection: 'EPSG:3857',
				minZoom: 2,
				maxZoom: 18
			}),
			controls: defaultControls({
				rotate: false,
				zoomOptions: {
					zoomInTipLabel: 'Vergrößern',
					zoomOutTipLabel: 'Verkleinern'
				}
			}).extend(this.createCustomControls()),

			/**
			 * `DragPan` und `MouseWheelZoom` werden aus den Defaults herausgenommen und
			 * selbst gebaut — sie sind die beiden einzigen Interactions, auf die die
			 * Option `onFocusOnly` überhaupt wirkt (`ol/interaction/defaults.js`).
			 * Damit ist hier vollständig beschrieben, wer einen Fokus braucht und wer
			 * nicht; ein `onFocusOnly` an `defaults()` hätte keinen Adressaten mehr.
			 *
			 * Worum es geht: `onFocusOnly` schaltet `focusWithTabindex` vor die
			 * Condition. Das verlangt — **nur wenn das Map-Target ein `tabindex`
			 * trägt** — dass der Fokus im Target liegt. `SightingsMapView.svelte` setzt
			 * genau dieses `tabindex="0"` auf `#map`, damit KeyboardPan und KeyboardZoom
			 * greifen (Tastaturbedienung, Befund K3). Die Nebenwirkung war der
			 * wiederholt gemeldete Defekt „die Karte reagiert erst nach einem Klick":
			 * ohne Fokus lieferte `document.activeElement === <body>`, die Condition
			 * `false` und die Geste verpuffte — bei einwandfreien, trusted Events. Eine
			 * Barrierefreiheits-Verbesserung hatte damit die Maussteuerung gebrochen.
			 *
			 * Ziehen ist deshalb bedingungslos frei: eine eindeutige Absicht, die mit
			 * nichts konkurriert. Der eigene `DragPan` bekommt die Standard-Condition
			 * `all(noModifierKeys, primaryAction)` ohne Fokus-Prüfung. `kinetic` bleibt
			 * bewusst weg: `defaults()` setzt dort eine Schwung-Animation, die auf einer
			 * Datenkarte eher stört als hilft.
			 *
			 * Das Mausrad hängt dagegen an der Einbettung, nicht am Fokus:
			 *
			 * - **Eigene Seite** (`isNotIFrame`): Das Rad zoomt sofort. Die Karte ist der
			 *   Inhalt der Seite, und wer über ihr scrollt, will zoomen. Vorher scrollte
			 *   die Geste stattdessen die Seite zum Footer und schob die Karte aus dem
			 *   Bild. Der Preis: `/map` hat unterhalb der Karte rund 150 px Footer, und
			 *   der ist über der Karte nicht mehr per Rad erreichbar — nur noch über
			 *   Scrollbar, Tastatur oder die Navbar-Leiste. Bewusst in Kauf genommen;
			 *   wer Impressum und Datenschutz dort prominenter braucht, holt sie in die
			 *   Kartenleiste statt den Zoom wieder zu bremsen.
			 * - **Im iframe** (meeresmuseum.de): Der Fokus-Zwang bleibt. `MouseWheelZoom`
			 *   ruft `preventDefault()`; ohne die Bremse käme niemand mehr an der Karte
			 *   vorbei, weil sie den Rahmen füllt und das Scrollen nicht mehr an die
			 *   einbettende Seite durchgereicht würde. Ein Klick oder ein Tab in die
			 *   Karte schaltet den Zoom frei — wie bei eingebetteten Kartendiensten üblich.
			 *
			 * Beides ist in `e2e/map-pan-zoom.spec.ts` abgesichert, der iframe-Fall über
			 * eine eigene Rahmenseite. Wer `tabindex` an einem anderen OL-Target ergänzt,
			 * muss dieselbe Abwägung mitsetzen.
			 */
			interactions: defaultInteractions({ dragPan: false, mouseWheelZoom: false }).extend([
				new DragPan({ condition: all(noModifierKeys, primaryAction) }),
				new MouseWheelZoom({ onFocusOnly: !isNotIFrame })
			])
		});

		// Popup hinzufügen
		this.map.addOverlay(this.popup);

		// Initialisiere Filter-Elemente
		this.initializeControls(options);

		// Initialisiere Geolocation nach Map-Erstellung
		this.initializeGeolocation();

		// Optimierte Event-Handler
		this.initializeOptimizedEvents();

		// Loading- und Error-Callbacks vor initialem setYear setzen
		if (options.onLoading) {
			this.loadingCallback = options.onLoading;
		}
		if (options.onError) {
			this.errorCallback = options.onError;
		}

		// Lade Daten für das aktuelle Jahr
		void this.setYear(this.displayedYear).catch((err) => {
			logger.error({ err }, 'Initial sightings load failed');
			this.loadingCallback?.(false);
			this.errorCallback?.(err instanceof Error ? err : new Error(String(err)));
		});

		// Initialisiere Zeitraum-Anzeige
		this.updateTimeRange();
	}

	private createPopup(): void {
		// M6: Darstellung komplett über CSS-Klassen aus mapStyles.css —
		// keine Inline-Styles am Theme vorbei.
		this.popupElement = document.createElement('div');
		this.popupElement.className = 'ol-popup';
		this.popupElement.innerHTML = `
			<div class="ol-popup-content">
				<button class="ol-popup-closer" type="button" aria-label="${m.map_optimizedmapcontroller_text_popup_schliessen()}">×</button>
				<div class="popup-body"></div>
			</div>
		`;

		const closer = this.popupElement.querySelector('.ol-popup-closer') as HTMLButtonElement;
		closer.onclick = () => this.closePopup();

		this.popup = new Overlay({
			element: this.popupElement,
			autoPan: {
				animation: {
					duration: 250
				}
			}
		});
	}

	private initializeOptimizedEvents(): void {
		const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		// Hover-Event nur für Desktop (nicht Touch-Geräte)
		if (!isTouchDevice) {
			this.map.on('pointermove', (event) => {
				// Ab ol 10.11 typisiert als `HTMLElement | null | undefined`; ohne Ziel
				// gibt es weder Cursor noch Info-Element zu positionieren.
				const mapContainer = this.map.getTargetElement();
				if (!mapContainer) return;
				const infoElement = document.getElementById('info');

				// Hover ausblenden wenn ein Popup offen ist
				if (this.popup.getPosition()) {
					if (infoElement) infoElement.style.display = 'none';
					mapContainer.style.cursor = '';
					return;
				}

				const feature = this.map.forEachFeatureAtPixel(event.pixel, (feature) => feature);

				if (feature && infoElement) {
					const coordinates = event.coordinate;
					let infoText = '';

					// Prüfe ob es ein Cluster-Feature ist
					const features = feature.get('features');
					if (features && features.length > 1) {
						// Cluster-Info erstellen
						infoText = createClusterInfoText(this.getPropsList(features), this.translations);
					} else if (features && features.length === 1) {
						// Einzelnes Feature aus Cluster
						const singleFeature = features[0];
						const props = singleFeature.getProperties();
						infoText = createInfoText(props as SightingProperties, this.translations);
					} else {
						// Normales einzelnes Feature
						const props = feature.getProperties();
						infoText = createInfoText(props as SightingProperties, this.translations);
					}

					// Zeige Info-Element
					infoElement.innerHTML = infoText;
					infoElement.style.display = 'block';

					// Positioniere das Info-Element relativ zur Maus
					const pixel = this.map.getPixelFromCoordinate(coordinates);
					if (pixel && Array.isArray(pixel)) {
						this.positionInfoElement(mapContainer, pixel, infoElement);
					}

					// Ändere Cursor
					mapContainer.style.cursor = 'pointer';
				} else {
					const infoElement = document.getElementById('info');
					if (infoElement) {
						// Verstecke Info-Element
						infoElement.style.display = 'none';
					}
					mapContainer.style.cursor = '';
				}
			});
		}

		// Click-Event für Popup
		this.map.on('click', (event) => {
			const feature = this.map.forEachFeatureAtPixel(event.pixel, (feature) => feature);

			// Hover sofort ausblenden bei Klick
			const infoElement = document.getElementById('info');
			if (infoElement) infoElement.style.display = 'none';

			if (feature) {
				const features = feature.get('features');
				const zoom = this.map.getView().getZoom() || 7;

				if (features && features.length > 1 && zoom < 12 && !this.hasColocatedFeatures(features)) {
					// Zoom zu Cluster bei niedrigem Zoom (nur wenn Features an verschiedenen Positionen)
					this.zoomToCluster(features);
				} else {
					// Zeige Popup (Einzelfeature oder Liste bei co-located Features)
					this.showPopup(event.coordinate, feature as Feature<Geometry>);
				}
			} else {
				this.closePopup();
			}
		});

		// Zoom-optimierte Cluster-Distanz
		this.viewResolutionKey = this.map.getView().on('change:resolution', () => {
			this.updateClusterDistance();
		}) as EventsKey;
	}

	/** Properties-Liste für die reinen Content-Builder aus popupContent.ts */
	private getPropsList(features: Feature<Geometry>[]): SightingProperties[] {
		return features.map((feature) => feature.getProperties() as SightingProperties);
	}

	private sortFeaturesByDate(features: Feature<Geometry>[]): Feature<Geometry>[] {
		return [...features].sort((a, b) => {
			const tsA = (a.getProperties() as SightingProperties).ts || 0;
			const tsB = (b.getProperties() as SightingProperties).ts || 0;
			return tsB - tsA;
		});
	}

	private showPopup(coordinate: number[], feature: Feature<Geometry>): void {
		const contentDiv = this.popupElement.querySelector('.popup-body') as HTMLDivElement;
		const features = feature.get('features');

		if (features && features.length > 1) {
			// Cluster - zeige Liste aller Sichtungen
			const sorted = this.sortFeaturesByDate(features);
			contentDiv.innerHTML = createClusterListContent(this.getPropsList(sorted), this.translations);
			this.attachClusterListHandlers(contentDiv, sorted, coordinate);
		} else {
			// Einzelfeature
			const singleFeature = features ? features[0] : feature;
			const props = singleFeature.getProperties() as SightingProperties;
			contentDiv.innerHTML = createSightingPopupContent(props, this.translations);
		}

		this.popup.setPosition(coordinate);
	}

	/**
	 * Prüft ob alle Features im Cluster identische oder sehr nahe Koordinaten haben.
	 * In dem Fall hilft Zoomen nicht weiter.
	 */
	private hasColocatedFeatures(features: Feature<Geometry>[]): boolean {
		const extents = features
			.map((f) => f.getGeometry()?.getExtent() as [number, number, number, number] | undefined)
			.filter((ext): ext is [number, number, number, number] => ext !== undefined);
		return areExtentsColocated(extents);
	}

	/**
	 * Fügt Click-Handler für die Cluster-Listeneinträge hinzu.
	 * Erwartet bereits sortierte Features (via sortFeaturesByDate).
	 */
	private attachClusterListHandlers(
		contentDiv: HTMLDivElement,
		sortedFeatures: Feature<Geometry>[],
		coordinate: number[]
	): void {
		contentDiv.querySelectorAll<HTMLButtonElement>('[data-cluster-index]').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const index = parseInt(btn.dataset.clusterIndex || '0', 10);
				const feature = sortedFeatures[index];
				if (!feature) return;
				const props = feature.getProperties() as SightingProperties;

				// Zeige Detail-Ansicht mit Zurück-Button
				contentDiv.innerHTML = `
					<div>
						<button type="button" class="cluster-back-btn">
							&#8592; ${m.map_optimizedmapcontroller_text_alle_count_sichtungen({ count: sortedFeatures.length })}
						</button>
						${createSightingPopupContent(props, this.translations)}
					</div>
				`;
				this.popup.setPosition(coordinate);

				// Zurück-Button Handler
				const backBtn = contentDiv.querySelector('.cluster-back-btn');
				backBtn?.addEventListener('click', (e) => {
					e.stopPropagation();
					contentDiv.innerHTML = createClusterListContent(
						this.getPropsList(sortedFeatures),
						this.translations
					);
					this.attachClusterListHandlers(contentDiv, sortedFeatures, coordinate);
					this.popup.setPosition(coordinate);
				});
			});
		});
	}

	private zoomToCluster(features: Feature<Geometry>[]): void {
		const view = this.map.getView();
		const extent = olExtent.createEmpty();

		features.forEach((feature) => {
			const geom = feature.getGeometry();
			if (geom) {
				olExtent.extend(extent, geom.getExtent());
			}
		});

		view.fit(extent, {
			duration: 500,
			padding: [20, 20, 20, 20],
			maxZoom: 14
		});
	}

	private updateClusterDistance(): void {
		const zoom = this.map.getView().getZoom() || 7;

		// M2: minDistance mitführen — sonst fällt es auf den Konstruktor-Wert
		// zurück und Cluster überlappen bei niedrigen Zoomstufen erneut
		const distance = clusterDistanceForZoom(zoom);
		this.clusterSource.setDistance(distance);
		this.clusterSource.setMinDistance(clusterMinDistanceFor(distance));
	}

	/**
	 * Schließt ein offenes Popup, falls eines geöffnet ist.
	 *
	 * QW3: Ein Popup bleibt sonst über Jahres-/Filterwechsel hinweg sichtbar
	 * und zeigt Stammdaten eines Features, das nach dem Wechsel gar nicht
	 * mehr in der aktuellen Auswahl enthalten ist ("stale popup"). Wird daher
	 * am Anfang jeder Methode aufgerufen, die die sichtbare Feature-Menge
	 * ändert, und zusätzlich von der Escape-Kaskade in SightingsMapView.
	 *
	 * @returns `true` wenn ein Popup offen war (und geschlossen wurde), sonst `false`.
	 */
	public closePopup(): boolean {
		const wasOpen = this.popup.getPosition() !== undefined;
		this.popup.setPosition(undefined);
		return wasOpen;
	}

	public setYearChangeCallback(callback: (year: number) => void): void {
		this.yearChangeCallback = callback;
	}

	public setLoadingCallback(callback: (isLoading: boolean) => void): void {
		this.loadingCallback = callback;
	}

	// Behalte alle bestehenden Public-Methoden für Kompatibilität
	public async setYear(year: number): Promise<void> {
		this.closePopup();
		this.displayedYear = year;
		this.yearChangeCallback?.(year);
		this.loadingCallback?.(true);

		try {
			await this.loadSightings(year, this.searchTerm);

			// timeFilter erst nach erfolgreichem Fetch setzen, damit während des Ladens
			// keine alten Features mit dem neuen Jahres-Zeitraum gefiltert werden
			const yearStart = new Date(year, 0, 1).getTime();
			const yearEnd = new Date(year, 11, 31, 23, 59, 59).getTime();
			this.timeFilter = {
				lower: yearStart,
				upper: yearEnd
			};
			// Redraw und Zeitraum-Anzeige aktualisieren nachdem timeFilter gesetzt wurde
			this.reportsLayer.changed();
			this.updateTimeRange();
			// Counts mit korrektem timeFilter neu berechnen (loadSightings hat sie mit dem alten berechnet)
			this.legendUpdateCallback?.();
			this.loadingCallback?.(false);
		} catch (error) {
			// Abgebrochene Requests nicht als Fehler behandeln — ein neuerer Request übernimmt
			if (error instanceof DOMException && error.name === 'AbortError') return;
			this.loadingCallback?.(false);
			console.error('Error loading sightings:', error);
			throw error;
		}
	}

	/**
	 * Wechselt die geladenen Bearbeitungszustände und lädt neu. Analog zu
	 * setYear(): Der Zeitfilter bleibt unberührt, die Legende aktualisiert der
	 * Aufrufer über den CountManager.
	 *
	 * Anders als setYear() wird ein Fehler hier nicht weitergeworfen, sondern
	 * ausschließlich über errorCallback gemeldet: Der Aufrufer ist ein
	 * Event-Handler ohne eigenes catch, ein Rethrow würde dort als unhandled
	 * promise rejection auflaufen statt den Fehler nutzbar zu machen.
	 *
	 * Der Rückgabewert sagt dem Aufrufer trotzdem, was passiert ist — ohne ihn
	 * zog die Oberfläche Chip und URL auf eine Auswahl, die die Karte gar nicht
	 * geladen hatte (Review PR #872). Die drei Fälle sind bewusst getrennt:
	 * `superseded` heißt, ein neuerer Wechsel hat übernommen und ist jetzt
	 * zuständig — dort darf der Aufrufer NICHT zurückrollen, sonst überschriebe
	 * er die neuere Auswahl.
	 */
	public async setStatuses(statuses: readonly SightingStatus[]): Promise<StatusChangeResult> {
		this.closePopup();
		const previous = this.statuses;
		this.statuses = statuses;
		this.loadingCallback?.(true);
		try {
			await this.loadSightings(this.displayedYear, this.searchTerm);
			this.reportsLayer.changed();
			this.legendUpdateCallback?.();
			this.loadingCallback?.(false);
			return 'applied';
		} catch (error) {
			/* Abbruch: Der neuere Aufruf besitzt jetzt sowohl den Ladezustand als
			   auch `this.statuses` — hier weder den Spinner ausschalten noch
			   zurückrollen. */
			if (error instanceof DOMException && error.name === 'AbortError') return 'superseded';
			/* Fehlschlag: `loadSightings` leert `reportsSource` erst nach der
			   Antwort, die Karte zeigt also weiterhin den alten Bestand. Damit
			   `getStatuses()` nicht etwas anderes behauptet als zu sehen ist,
			   wird die Auswahl mit zurückgenommen. */
			this.statuses = previous;
			this.loadingCallback?.(false);
			this.errorCallback?.(error instanceof Error ? error : new Error(String(error)));
			return 'failed';
		}
	}

	public getStatuses(): readonly SightingStatus[] {
		return this.statuses;
	}

	private async loadSightings(year: number, searchTerm?: string): Promise<void> {
		// Vorherigen laufenden Request abbrechen (verhindert Race Conditions bei schnellem Wechsel)
		if (this.activeAbortController) {
			this.activeAbortController.abort();
		}
		const abortController = new AbortController();
		this.activeAbortController = abortController;

		const query = buildSightingsQuery(year, searchTerm ?? '', this.statuses);

		const response = await fetch(`/api/map/sightings?${query}`, {
			signal: abortController.signal
		});
		if (!response.ok) {
			throw new Error(
				`HTTP ${response.status}: ${m.map_optimizedmapcontroller_text_fehler_beim_laden_der_sichtungen()}`
			);
		}
		const geoJsonData = await response.json();

		// Nur verarbeiten wenn dieser Request noch der aktive ist (nicht abgebrochen)
		if (abortController.signal.aborted) return;

		const format = new GeoJSON();
		const features = format.readFeatures(geoJsonData, {
			featureProjection: 'EPSG:3857'
		});

		this.reportsSource.clear();
		this.reportsSource.addFeatures(features);

		// Kein legendUpdateCallback hier — Caller (setYear, applyFilter) sind dafür zuständig,
		// damit Counts erst nach korrektem timeFilter-Update berechnet werden.

		// Aktiven Controller aufräumen
		if (this.activeAbortController === abortController) {
			this.activeAbortController = null;
		}
	}

	public setHiddenSpecies(species: Record<string, boolean>): void {
		this.hiddenSpecies = species;
		this.reportsLayer.changed();
	}

	public setHiddenColors(colors: Record<string, boolean>): void {
		this.hiddenColors = colors;
		this.reportsLayer.changed();
	}

	public getMap(): Map {
		return this.map;
	}

	/** M3: Seezeichen-Ebene (OpenSeaMap) ein-/ausblenden — Toggle in der Legende. */
	public setSeamarkVisibility(visible: boolean): void {
		this.seamarkLayer.setVisible(visible);
	}

	public getSeamarkVisibility(): boolean {
		return this.seamarkLayer.getVisible();
	}

	private createCustomControls(): Control[] {
		const controls: Control[] = [];

		if (this.options.enableLocationControl) {
			controls.push(new LocationControl(this));
		}

		controls.push(new ZoomAllControl(this));
		return controls;
	}

	private initializeControls(options: MapOptions): void {
		// Jahr-Selector
		if (options.yearSelectorId) {
			const yearSelect = document.getElementById(options.yearSelectorId) as HTMLSelectElement;
			if (yearSelect) {
				// Setze das Default-Jahr im Dropdown
				yearSelect.value = this.displayedYear.toString();

				yearSelect.addEventListener('change', (event) => {
					const target = event.target as HTMLSelectElement;
					const year = parseInt(target.value, 10);
					if (!isNaN(year)) {
						void this.setYear(year).catch((err) => {
							logger.error({ err }, 'Year change load failed');
							this.loadingCallback?.(false);
							this.errorCallback?.(err instanceof Error ? err : new Error(String(err)));
						});
					}
				});
			}
		}

		// Filter-Input
		if (options.filterInputId) {
			const filterInput = document.getElementById(options.filterInputId) as HTMLInputElement;
			if (filterInput) {
				filterInput.addEventListener('input', () => {
					if (this.filterDebounceTimeout !== null) clearTimeout(this.filterDebounceTimeout);
					this.filterDebounceTimeout = window.setTimeout(() => {
						this.filterDebounceTimeout = null;
						this.applyFilter(filterInput.value);
					}, 300);
				});
			}
		}
	}

	private initializeGeolocation(): void {
		// Datenschutz: Die Positionsdaten bleiben rein lokal im Browser — sie
		// werden ausschließlich im locationLayer gerendert; es wird kein Request
		// mit Koordinaten an den Server oder Dritte ausgelöst.
		this.geolocation = new Geolocation({
			trackingOptions: {
				enableHighAccuracy: true
			},
			projection: this.map.getView().getProjection()
		});

		this.geolocationKeys.push(
			this.geolocation.on('change:position', () => {
				const coordinates = this.geolocation.getPosition();
				if (coordinates) {
					this.replaceLocationFeature('location', new OlPoint(coordinates));

					// N2: Beim ersten Fix einer Tracking-Sitzung auf die Position
					// zentrieren — danach nicht mehr (kein Auto-Follow), damit der
					// Nutzer die Karte frei verschieben kann.
					if (!this.hasCenteredOnFirstFix) {
						this.hasCenteredOnFirstFix = true;
						const view = this.map.getView();
						view.animate({
							center: coordinates,
							zoom: Math.max(view.getZoom() ?? 0, 10),
							duration: 800
						});
					}
				}
			}) as EventsKey
		);

		this.geolocationKeys.push(
			this.geolocation.on('change:accuracyGeometry', () => {
				const accuracy = this.geolocation.getAccuracyGeometry();
				if (accuracy) {
					this.replaceLocationFeature('accuracy', accuracy);
				}
			}) as EventsKey
		);

		// N2: Fehlerpfad — verweigerte Berechtigung, Timeout etc. Tracking
		// stoppen (setzt via onTrackingChange auch die LocationControl zurück)
		// und eine verständliche Meldung an die View geben.
		this.geolocationKeys.push(
			this.geolocation.on('error', (event) => {
				logger.warn({ code: event.code, message: event.message }, 'Geolocation error');
				this.stopTracking();
				this.options.onGeolocationError?.(geolocationErrorMessage(event.code));
			}) as EventsKey
		);
	}

	/**
	 * Ersetzt genau das Feature des angegebenen Typs im Location-Layer.
	 * Positions- und Genauigkeits-Feature dürfen sich nicht gegenseitig
	 * löschen — ein pauschales clear() ließ sonst immer nur das zuletzt
	 * aktualisierte Feature übrig.
	 */
	private replaceLocationFeature(type: 'location' | 'accuracy', geometry: Geometry): void {
		this.locationSource
			.getFeatures()
			.filter((feature) => feature.get('type') === type)
			.forEach((feature) => this.locationSource.removeFeature(feature));
		this.locationSource.addFeature(new Feature({ geometry, type }));
	}

	private applyFilter(searchTerm: string): void {
		this.closePopup();
		this.searchTerm = searchTerm;
		this.loadingCallback?.(true);
		void this.loadSightings(this.displayedYear, searchTerm)
			.then(() => {
				this.reportsLayer.changed();
				this.legendUpdateCallback?.();
				this.loadingCallback?.(false);
			})
			.catch((error) => {
				// Abgebrochene Requests nicht als Fehler behandeln
				if (error instanceof DOMException && error.name === 'AbortError') return;
				this.loadingCallback?.(false);
				this.errorCallback?.(error instanceof Error ? error : new Error(String(error)));
			});
	}

	public startTracking(): void {
		this.isTracking = true;
		this.hasCenteredOnFirstFix = false;
		this.geolocation.setTracking(true);
		this.notifyTrackingChange();
	}

	public stopTracking(): void {
		this.isTracking = false;
		this.geolocation.setTracking(false);
		this.locationSource.clear();
		this.notifyTrackingChange();
	}

	public onTrackingChange(callback: (isTracking: boolean) => void): void {
		this.trackingChangeCallbacks.push(callback);
	}

	private notifyTrackingChange(): void {
		this.trackingChangeCallbacks.forEach((callback) => callback(this.isTracking));
	}

	public isCurrentlyTracking(): boolean {
		return this.isTracking;
	}

	public getExtent(): number[] | null {
		const extent = this.reportsSource.getExtent();
		return extent && extent.some((val) => isFinite(val)) ? extent : null;
	}

	public zoomAllFeatures(): void {
		// Extent immer auf die Ostsee klemmen: Datensätze mit ungültigen
		// Koordinaten (z. B. Null Island) ließen den Feature-Extent sonst auf
		// Weltgröße anwachsen, und "Z" zoomte auf die Weltansicht. Ist der
		// Feature-Extent leer/unendlich, wird stattdessen auf die Ostsee gezoomt
		// statt gar nicht zu reagieren.
		const extent = clampExtentToBaltic(this.reportsSource.getExtent() as Extent);
		this.map.getView().fit(extent, {
			padding: [50, 50, 50, 50],
			duration: 1000,
			maxZoom: 12
		});
	}

	public toggleGeolocation(): void {
		if (this.isTracking) {
			this.stopTracking();
		} else {
			this.startTracking();
		}
	}

	/**
	 * Räumt alle Map-Ressourcen auf: Geolocation, Overlay, Event-Listener, Map.
	 * MUSS beim Unmount der Komponente aufgerufen werden.
	 */
	public dispose(): void {
		// Ausstehenden Filter-Debounce abbrechen
		if (this.filterDebounceTimeout !== null) {
			clearTimeout(this.filterDebounceTimeout);
			this.filterDebounceTimeout = null;
		}

		// Laufende Requests abbrechen
		if (this.activeAbortController) {
			this.activeAbortController.abort();
			this.activeAbortController = null;
		}

		// Geolocation stoppen und internen Tracking-Status zurücksetzen
		this.stopTracking();

		// Geolocation Event-Listener entfernen und Geolocation disposen
		this.geolocationKeys.forEach((k) => unByKey(k));
		this.geolocationKeys = [];
		this.geolocation.dispose();
		this.trackingChangeCallbacks = [];

		// View resolution listener entfernen
		if (this.viewResolutionKey) {
			unByKey(this.viewResolutionKey);
			this.viewResolutionKey = null;
		}

		// Style-Cache leeren
		clearStyleCache();

		// Popup entfernen
		this.popup.setPosition(undefined);
		this.map.removeOverlay(this.popup);

		// Map disposen (entfernt alle Layer, Controls, Event-Listener)
		this.map.dispose();
	}

	public getHidden(): { species: Record<string, boolean>; colors: Record<string, boolean> } {
		return {
			species: this.hiddenSpecies,
			colors: this.hiddenColors
		};
	}

	public getTimeFilter(): { lower: number; upper: number } {
		return this.timeFilter;
	}

	public getSearchTerm(): string {
		return this.searchTerm;
	}

	public getFeatures(): Feature<Geometry>[] {
		return this.reportsSource.getFeatures();
	}

	public setLegendUpdateCallback(callback: () => void): void {
		this.legendUpdateCallback = callback;
	}

	public setSpeciesVisibility(speciesId: string, visible: boolean): void {
		this.closePopup();
		this.hiddenSpecies[speciesId] = !visible;
		this.reportsLayer.changed();
		if (this.legendUpdateCallback) {
			this.legendUpdateCallback();
		}
	}

	public setColorVisibility(colorGroup: string, visible: boolean): void {
		this.closePopup();
		this.hiddenColors[colorGroup] = !visible;
		this.reportsLayer.changed();
		if (this.legendUpdateCallback) {
			this.legendUpdateCallback();
		}
	}

	public setFilter(start?: number, end?: number): void {
		this.closePopup();
		if (start !== undefined) this.timeFilter.lower = start;
		if (end !== undefined) this.timeFilter.upper = end;
		this.reportsLayer.changed();
		if (this.legendUpdateCallback) {
			this.legendUpdateCallback();
		}
		this.updateTimeRange();
	}

	public getDisplayedYear(): number {
		return this.displayedYear;
	}

	private updateTimeRange(): void {
		const timeStartElement = document.getElementById('time-start');
		const timeEndElement = document.getElementById('time-end');

		// M5: timeZone explizit setzen, sonst bestimmt die Browser-Zone das Datum.
		// Locale kommt aus resolveDisplayLocale, nicht aus einem hartcodierten
		// Sprach-Tag, sonst bleibt die Anzeige unter /en deutsch formatiert.
		//
		// Bewusste Testlücke (i18n-Review, M10-Befund): `SichtungenMap` instanziiert
		// im Konstruktor echte OpenLayers-Map/View/Layer/Canvas-Objekte und braucht
		// dafür ein reales DOM + WebGL — deshalb ist diese Datei explizit aus der
		// Coverage ausgenommen (`vitest.config.ts`, Kommentar „need real
		// DOM+WebGL") und liegt außerhalb des node-`server`-Projekts. Das
		// `client`-Browser-Projekt wiederum sammelt nur `*.svelte.{test,spec}.ts`
		// ein — eine `.test.ts`-Datei für eine reine `.ts`-Klasse würde dort nicht
		// laufen. Ein Test für genau diese zwei Zeilen wäre also entweder eine
		// künstlich aufgebohrte Browser-Testdatei nur für dieses eine Feld, oder
		// er müsste `SichtungenMap` durch einen DOM/WebGL-Mock genug vortäuschen,
		// dass am Ende nicht mehr die echte Klasse getestet würde.
		//
		// Ein Rückfall auf hartcodiertes `'de-DE'` fällt trotzdem auf:
		// `hardcodedDisplayLocaleScan.test.ts` meldet das Literal, und
		// `resolveDisplayLocale`/`getLocale` selbst sind über
		// `dateUtils.test.ts`/`popupContent.test.ts`/`listViewUtils.test.ts`
		// mit echten `de`/`en`-Zusicherungen abgedeckt — nur die Verdrahtung
		// genau hier (wird das Ergebnis tatsächlich durchgereicht?) bleibt
		// ungetestet. E2E-Abdeckung für `/map` unter `?lang=en` wäre der nächste
		// Schritt, sobald die Karten-Tests eine Sprachumschaltung kennen.
		const displayLocale = resolveDisplayLocale(getLocale());

		if (timeStartElement) {
			timeStartElement.innerText = new Date(this.timeFilter.lower).toLocaleDateString(
				displayLocale,
				{
					day: '2-digit',
					month: '2-digit',
					timeZone: 'Europe/Berlin'
				}
			);
		}

		if (timeEndElement) {
			timeEndElement.innerText = new Date(this.timeFilter.upper).toLocaleDateString(displayLocale, {
				day: '2-digit',
				month: '2-digit',
				timeZone: 'Europe/Berlin'
			});
		}
	}

	private positionInfoElement(
		mapContainer: HTMLElement,
		pixel: number[],
		infoElement: HTMLElement
	): void {
		const mapRect = mapContainer.getBoundingClientRect();
		const infoRect = infoElement.getBoundingClientRect();

		if (!mapRect || !infoRect || !pixel || pixel.length < 2) return;

		// Use destructuring to satisfy TypeScript's null checks
		const [pixelX, pixelY] = pixel;
		if (pixelX === undefined || pixelY === undefined) return;

		let left = pixelX + 10;
		let top = pixelY - infoRect.height - 10;

		// Prüfe ob das Element über den rechten Rand hinausragt
		if (left + infoRect.width > mapRect.width) {
			left = pixelX - infoRect.width - 10;
		}

		// Prüfe ob das Element über den oberen Rand hinausragt
		if (top < 0) {
			top = pixelY + 10;
		}

		infoElement.style.left = Math.max(0, left) + 'px';
		infoElement.style.top = Math.max(0, top) + 'px';
	}

	private createFilteredClusterStyle(
		_clusterFeature: Feature<Geometry>,
		features: Feature<Geometry>[]
	): Style | null {
		// Zähle nur die sichtbaren Features im Cluster
		let visibleCount = 0;
		// Bearbeitungsstand nur der sichtbaren Features — ein durch den Filter
		// ausgeblendetes Feature darf den Ring des Clusters nicht mitbestimmen.
		const visibleStatuses: SightingStatus[] = [];

		features.forEach((feature) => {
			const properties = feature.getProperties() as SightingProperties;
			const speciesId = properties.ta?.toString() || '0';
			// Convert ta to number for getFeatureColorGroup
			const colorGroupProperties = {
				...properties,
				ta: typeof properties.ta === 'string' ? parseInt(properties.ta, 10) : properties.ta || 0,
				tf: properties.tf || false, // Provide default value for required tf property
				ts: properties.ts || 0 // Provide default value for required ts property
			};
			const colorGroup = getFeatureColorGroup(colorGroupProperties);
			const timestamp = (properties.ts || 0) * 1000;

			// Prüfe Sichtbarkeit basierend auf aktuellen Filtern
			const isHiddenBySpecies = this.hiddenSpecies[speciesId];
			const isHiddenByColor = this.hiddenColors[colorGroup];
			const isHiddenByTime = timestamp < this.timeFilter.lower || timestamp > this.timeFilter.upper;

			if (!isHiddenBySpecies && !isHiddenByColor && !isHiddenByTime) {
				visibleCount++;
				visibleStatuses.push(properties.st ?? 'approved');
			}
		});

		// Wenn keine Features sichtbar sind, zeige den Cluster nicht an
		if (visibleCount === 0) {
			return null;
		}

		// Gemeinsame Cluster-Skala aus styleUtils — identisch mit der Legende
		return createClusterStyle(visibleCount, aggregateClusterStatus(visibleStatuses));
	}
}
