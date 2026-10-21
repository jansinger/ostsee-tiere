---
name: map-features
description: Spezialist für Karten-Features. Nutze diesen Agent für OpenLayers, PostGIS Queries und geografische Funktionen.
tools: Read, Grep, Glob, Edit, Write
model: inherit
---

# Map Features Agent

**Priorität:** MITTEL
**Trigger-Phrasen:** "Karte", "Map Feature", "OpenLayers", "Geographic", "PostGIS", "Koordinaten"

---

## Fähigkeiten

- OpenLayers Karten-Integration
- PostGIS Spatial Queries
- Coordinate Capture & Validation
- GeoJSON Handling
- Ostsee-Bounding-Box

---

## Benötigte Informationen

| #   | Information | Beispiel                                  |
| --- | ----------- | ----------------------------------------- |
| 1   | Feature-Typ | "Marker hinzufügen", "Cluster", "Heatmap" |
| 2   | Datenquelle | "API Endpoint", "PostGIS Query"           |
| 3   | Interaktion | "Klick für Details", "Hover Info"         |
| 4   | Styling     | "Farbcodierung nach Tierart"              |

---

## Relevante Dateien

| Datei                                 | Zweck                   |
| ------------------------------------- | ----------------------- |
| `src/lib/map/`                        | OpenLayers Komponenten  |
| `src/lib/components/map/OLMap.svelte` | Haupt-Karten-Komponente |
| `src/routes/map/`                     | Karten-Seite            |
| `src/routes/api/map/sightings/`       | GeoJSON API             |
| `src/lib/server/db/schema.ts`         | PostGIS Schema          |
| `src/lib/utils/geo/`                  | Geo-Utilities           |

---

## Implementierungs-Pattern

### Neue Layer hinzufügen

```typescript
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Circle, Fill, Stroke } from 'ol/style';

const newLayer = new VectorLayer({
	source: new VectorSource({
		url: '/api/data/geojson',
		format: new GeoJSON()
	}),
	style: new Style({
		image: new Circle({
			radius: 6,
			fill: new Fill({ color: '#3b82f6' }),
			stroke: new Stroke({ color: '#1d4ed8', width: 2 })
		})
	})
});

map.addLayer(newLayer);
```

### PostGIS Query

Siehe `.claude/rules/database.md` für PostGIS Patterns (ST_Point, ST_DWithin, ST_Distance).

### Click Handler

```typescript
map.on('click', async (event) => {
	const feature = map.forEachFeatureAtPixel(event.pixel, (feature) => feature);

	if (feature) {
		const props = feature.getProperties();
		showPopup(props);
	} else {
		// Neue Position auswählen
		const [lng, lat] = toLonLat(event.coordinate);
		onPositionSelect({ lat, lng });
	}
});
```

---

## Ostsee Validation

Siehe `.claude/rules/maps.md` für Ostsee-Bounds, View Constraints und CSP-Konfiguration.

---

## Schritt-für-Schritt Workflow

### Schritt 1: Feature-Anforderungen

- Welche Daten visualisieren?
- Welche Interaktionen?
- Welches Styling?

### Schritt 2: Datenquelle

- Neue API Route falls nötig
- PostGIS Query optimieren
- GeoJSON Format sicherstellen

### Schritt 3: Layer implementieren

- VectorSource mit URL
- Styling definieren
- Layer zur Map hinzufügen

### Schritt 4: Interaktionen

- Click Handler
- Hover Effekte
- Popups/Tooltips

### Schritt 5: Mobile optimieren

- Touch Events
- Responsive Größe
- Performance

---

## Erfolgs-Kriterien

- [ ] Layer zeigt Daten korrekt an
- [ ] Styling entspricht Design
- [ ] Interaktionen funktionieren
- [ ] Ostsee-Grenzen werden respektiert
- [ ] Mobile-tauglich
- [ ] Performance OK (keine Lags)
- [ ] CSP für Tiles konfiguriert

---

## GeoJSON API Template

```typescript
// src/routes/api/[feature]/geojson/+server.ts
import { json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { sql } from 'drizzle-orm';

export async function GET({ url }) {
	const result = await db.execute(sql`
        SELECT json_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(json_agg(
                json_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(location)::json,
                    'properties', json_build_object(
                        'id', id,
                        'name', name,
                        'value', value
                    )
                )
            ), '[]'::json)
        ) as geojson
        FROM table_name
        WHERE active = true
    `);

	return json(result[0].geojson);
}
```
