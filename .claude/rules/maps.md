---
paths:
  - 'src/lib/map/**'
  - 'src/lib/components/map/**'
  - 'src/routes/map/**'
  - 'src/routes/api/map/**'
  - 'src/routes/api/geo/**'
---

# Karten & OpenLayers

Regeln für Karten-Integration mit OpenLayers und PostGIS.

---

## Tech Stack

| Bibliothek    | Zweck                |
| ------------- | -------------------- |
| OpenLayers    | Interaktive Karten   |
| PostGIS       | Geografische Queries |
| OpenStreetMap | Tile Layer           |

---

## Projektstruktur

```
src/lib/
├── map/                              # Map Utilities & Controller
│   ├── optimizedMapController.ts     # Performance-optimierter Controller
│   ├── styleUtils.ts                 # Style-Definitionen & Legenden
│   ├── countManager.ts               # Species/Color Count Management
│   ├── timeSliderManager.ts          # Zeitfilterung
│   ├── mapUtils.ts                   # GeoJSON-Konvertierung & Typen
│   ├── mapContext.ts                 # Svelte Context für Map-Instanz
│   ├── dateUtils.ts                  # Datums-Hilfen für Zeitfilter
│   ├── mapStyles.css                 # Karten-CSS
│   └── controls/                     # Custom OL-Controls (LocationControl, ZoomAllControl)
└── components/map/
    ├── OLMap.svelte                  # Haupt-Karten-Komponente
    ├── SightingsMapView.svelte       # Sichtungs-Kartenansicht
    ├── LazyMapWrapper.svelte         # Lazy Loading Wrapper
    ├── LoadingOverlay.svelte         # Lade-Overlay
    └── Panel/
        ├── MapPanel.svelte           # Gemeinsamer Panel-Rahmen (selbst-verwaltend)
        ├── FilterPanel.svelte        # Filter-Panel
        └── LegendPanel.svelte        # Legenden-Panel
```

---

## Karten-Komponente

```svelte
<script lang="ts">
	import Map from 'ol/Map';
	import View from 'ol/View';
	import TileLayer from 'ol/layer/Tile';
	import OSM from 'ol/source/OSM';
	import { fromLonLat, toLonLat } from 'ol/proj';

	let mapContainer: HTMLDivElement;
	let map: Map;

	$effect(() => {
		if (mapContainer && !map) {
			map = new Map({
				target: mapContainer,
				layers: [new TileLayer({ source: new OSM() })],
				view: new View({
					center: fromLonLat([11.5, 54.5]), // Ostsee
					zoom: 7
				})
			});
		}

		return () => map?.dispose();
	});
</script>

<div bind:this={mapContainer} class="h-96 w-full"></div>
```

---

## Coordinate Capture

```typescript
import { toLonLat } from 'ol/proj';

function setupClickHandler(map: Map, onSelect: (coords: [number, number]) => void) {
	map.on('click', (event) => {
		const [lng, lat] = toLonLat(event.coordinate);
		onSelect([lat, lng]);
	});
}
```

**Hinweis:** Kein Reverse Geocoding implementiert. Positionen werden nur als Koordinaten gespeichert.

---

## GeoJSON Layer

```typescript
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';

const sightingsLayer = new VectorLayer({
	source: new VectorSource({
		url: '/api/map/sightings',
		format: new GeoJSON()
	}),
	style: sightingStyle
});

map.addLayer(sightingsLayer);
```

### Styling

**Wichtig:** OpenLayers rendert über Canvas — CSS Custom Properties (`var(--color-info)`) werden dort **nicht** aufgelöst. Farben müssen als konkrete Werte übergeben werden. Hilfsfunktion zum Auslesen von DaisyUI-Theme-Farben:

```typescript
// Diese Hilfsfunktion zu src/lib/map/styleUtils.ts hinzufügen (existiert noch nicht dort):
export function getThemeColor(variable: string): string {
	if (typeof window === 'undefined') return '#000000';
	return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}
```

```typescript
import { Style, Circle, Fill, Stroke } from 'ol/style';
import { getThemeColor } from '#lib/map/styleUtils.ts';

// Farben beim Initialisieren auslesen (nach DOM-Mount in $effect)
const sightingStyle = new Style({
	image: new Circle({
		radius: 8,
		fill: new Fill({ color: getThemeColor('--color-info') }),
		stroke: new Stroke({ color: getThemeColor('--color-primary'), width: 2 })
	})
});
// Hinweis: Bei Theme-Wechsel muss der Style neu erstellt werden
```

---

## Performance: Viele Features (>500 Punkte)

### WebGLPointsLayer (GPU-beschleunigt)

Für große Datensätze `WebGLPointsLayer` statt `VectorLayer` verwenden:

```typescript
import WebGLPointsLayer from 'ol/layer/WebGLPoints';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { getThemeColor } from '#lib/map/styleUtils.ts';

// CSS vars via getThemeColor auflösen — WebGL akzeptiert keine var(...)
const pointsLayer = new WebGLPointsLayer({
	source: new VectorSource({
		url: '/api/map/sightings',
		format: new GeoJSON()
	}),
	style: {
		'circle-radius': 6,
		'circle-fill-color': getThemeColor('--color-info'),
		'circle-stroke-color': getThemeColor('--color-primary'),
		'circle-stroke-width': 1.5
	}
});
```

### Cluster Source (Gruppen nahestehender Features)

```typescript
import Cluster from 'ol/source/Cluster';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Circle, Fill, Text, Stroke } from 'ol/style';
import { getThemeColor } from '#lib/map/styleUtils.ts';

const clusterSource = new Cluster({
	distance: 40, // Pixel-Abstand für Clustering
	source: new VectorSource({ url: '/api/map/sightings', format: new GeoJSON() })
});

// Farben einmalig auflösen (in $effect nach DOM-Mount)
const primary = getThemeColor('--color-primary');
const primaryContent = getThemeColor('--color-primary-content');

const clusterLayer = new VectorLayer({
	source: clusterSource,
	style: (feature) => {
		const size = feature.get('features').length;
		return new Style({
			image: new Circle({
				radius: size > 1 ? 14 : 8,
				fill: new Fill({ color: primary }),
				stroke: new Stroke({ color: primaryContent, width: 1 })
			}),
			text:
				size > 1
					? new Text({ text: String(size), fill: new Fill({ color: primaryContent }) })
					: undefined
		});
	}
});
```

**Faustregel:** `VectorLayer` bis ~500 Features, `Cluster` oder `WebGLPointsLayer` darüber.

---

## Ostsee-Grenzen

### Bounding Box

```typescript
// src/lib/utils/geo/checkBalticSea.ts
// Abgeleitet aus der Geometrie, nicht von Hand gepflegt — siehe geo.md
export const BALTIC_SEA_BBOX: BoundingBox = {
	minLongitude: 9.4,
	maxLongitude: 30.25,
	minLatitude: 53.55,
	maxLatitude: 65.95
};

export function isInBalticArea(longitude: number, latitude: number): boolean {
	return (
		longitude >= BALTIC_SEA_BBOX.minLongitude &&
		longitude <= BALTIC_SEA_BBOX.maxLongitude &&
		latitude >= BALTIC_SEA_BBOX.minLatitude &&
		latitude <= BALTIC_SEA_BBOX.maxLatitude
	);
}
```

### View Constraint

```typescript
import { boundingExtent } from 'ol/extent';
import { fromLonLat } from 'ol/proj';

// Die Werte nicht abschreiben — BALTIC_SEA_BBOX importieren, sonst laufen
// Karten-Extent und Geometrie auseinander (vgl. src/lib/map/extentUtils.ts).
const balticExtent = boundingExtent([
	fromLonLat([BALTIC_SEA_BBOX.minLongitude, BALTIC_SEA_BBOX.minLatitude]),
	fromLonLat([BALTIC_SEA_BBOX.maxLongitude, BALTIC_SEA_BBOX.maxLatitude])
]);

new View({
	extent: balticExtent,
	constrainOnlyCenter: true
});
```

---

## PostGIS Integration

### API Endpoint für GeoJSON

```typescript
// src/routes/api/map/sightings/+server.ts
import { json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { sightings as sightingsTable } from '#lib/server/db/schema.ts';
import { sightingsToGeoJSON } from '#lib/map/mapUtils.ts';
import { eq } from 'drizzle-orm';

export async function GET() {
	const sightingsFromDB = await db
		.select({
			id: sightingsTable.id,
			sightingDate: sightingsTable.sightingDate,
			longitude: sightingsTable.longitude,
			latitude: sightingsTable.latitude,
			species: sightingsTable.species,
			totalCount: sightingsTable.totalCount,
			juvenileCount: sightingsTable.juvenileCount,
			isDead: sightingsTable.isDead
		})
		.from(sightingsTable)
		// Grundmenge NICHT hier zusammenbauen: mapSightingConditions() aus
		// publicMapConditions.ts liefert sie, und der Jahres-Endpunkt benutzt
		// dieselbe Funktion. Zwei eigene Filter laufen auseinander, und dann
		// zeigt das Jahres-Dropdown Zahlen, die auf der Karte fehlen.
		// Ohne Argument ist das die öffentliche Menge (approvedAt IS NOT NULL);
		// mit Argument die Admin-Sicht — siehe .claude/rules/api.md,
		// Abschnitt „Der Statusfilter der Karte".
		.where(and(...mapSightingConditions()))
		.orderBy(sightingsTable.sightingDate);

	return json(sightingsToGeoJSON(sightingsFromDB));
}
```

### Nearby Query (Pattern)

```typescript
// Beispiel-Pattern für Umkreissuche (nicht als fertige Funktion im Projekt vorhanden)
const nearby = await db.execute(sql`
    SELECT *, ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    ) / 1000 as distance_km
    FROM sichtungen
    WHERE ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
    )
    ORDER BY distance_km
`);
```

---

## CSP für Tiles

In `sveltekit.options.ts` (seit SvelteKit 3 Schlüsselwörter ohne eigene Anführungszeichen):

```javascript
csp: {
    directives: {
        'img-src': ['self', 'data:', 'blob:',
            'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org',
            'https://tiles.openseamap.org',
            'https://4i7mo0wwc3lp8d1e.public.blob.vercel-storage.com',
            'https://blob.vercel-storage.com'],
        'connect-src': ['self',
            'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org',
            'https://api.openstreetmap.org', 'https://archive-api.open-meteo.com',
            'https://4i7mo0wwc3lp8d1e.public.blob.vercel-storage.com',
            'https://blob.vercel-storage.com']
    }
}
```

**Hinweis:** Auszug der kartenrelevanten CSP-Einträge. Vollständige Konfiguration in `sveltekit.options.ts`.

---

## Mobile Optimierung

```svelte
<div class="relative">
	<div bind:this={mapContainer} class="h-[50vh] w-full touch-none md:h-96"></div>

	<!-- Mobile: Fullscreen Button -->
	<button class="btn btn-circle btn-sm absolute top-2 right-2 md:hidden" onclick={toggleFullscreen}>
		<ExpandIcon />
	</button>
</div>
```

---

## Best Practices

### Do's

- Ostsee-Grenzen validieren vor Speichern
- Cluster für viele Marker verwenden
- Touch-Events auf Mobile optimieren
- Loading State während GeoJSON-Laden

### Don'ts

- Keine externen Tile-Server ohne CSP
- Keine synchronen API-Calls in Map Events
- Kein direkter PostGIS-Zugriff aus Frontend

---

## Dokumentation nachschlagen

Für OpenLayers-APIs **Context7** verwenden (`/openlayers/openlayers`). Der GitMCP-Server
zum OpenLayers-Repo wurde entfernt: er liefert keine API-Doku, weil OpenLayers sein
apidoc generiert auf openlayers.org veröffentlicht und nicht als Markdown im Repository
hält.

Die Context7-Abdeckung ist bei OpenLayers dünner als bei anderen Libraries (751
Snippets). Diese Rule ist deshalb die primäre Quelle für alles Projektspezifische —
Ostsee-Grenzen, PostGIS-Endpunkte, WebGL-vs-Cluster-Schwelle, CSP für Tiles. Nutze
Context7 für reine OL-API-Fragen, nicht für Architekturentscheidungen.
