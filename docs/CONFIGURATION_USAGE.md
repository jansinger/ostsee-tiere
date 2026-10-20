# Configuration Usage Guide

Diese Dokumentation beschreibt, wie die konfigurierten Werte in der Ostsee-Tiere Anwendung optimal genutzt werden.

## 🎯 Überblick

Das Konfigurationssystem ermöglicht es, das Verhalten der Anwendung zu steuern, ohne Code zu ändern. Alle Einstellungen haben sinnvolle Standardwerte, sodass die Anwendung auch ohne Datenbankeinstellungen vollständig funktionsfähig ist.

## 🏗️ Architektur

### ConfigService

Der zentrale `ConfigService` bietet verschiedene APIs für Server- und Client-seitige Nutzung:

```typescript
import {
	ServerConfigService,
	ClientConfigService,
	ConfigService
} from '#lib/services/configService.ts';

// Server-side (in +page.server.ts, API routes, etc.)
const maxFileSize = await ServerConfigService.getNumber('security.maxFileSize');

// Client-side (in .svelte components)
const dateFormat = await ClientConfigService.get<string>('display.dateFormat');

// Universal (automatische Erkennung)
const maintenanceMode = await ConfigService.get('display.maintenanceMode');
```

### Fallback-Mechanismus

Alle Konfigurationswerte haben Standardwerte in `DEFAULT_VALUES`:

```typescript
const DEFAULT_VALUES = {
	'display.maxSightingsPerPage': 50,
	'security.maxFileSize': 10,
	'display.dateFormat': 'DD.MM.YYYY'
	// ...
} as const;
```

## 📊 Implementierte Konfigurationsnutzung

### 1. **Admin-Sichtungsübersicht** (`/admin`)

- **Konfiguration**: `display.maxSightingsPerPage`
- **Nutzung**: Dynamische Paginierung basierend auf Admin-Einstellung
- **Fallback**: 50 Sichtungen pro Seite

```typescript
// src/routes/admin/sichtungen/+page.server.ts
const paginationConfig = await ServerConfigService.getPaginationConfig();
const perPage = Number(url.searchParams.get('perPage')) || paginationConfig.defaultPageSize;
```

### 2. **Datei-Uploads** (`/api/files/upload`)

- **Konfigurationen**:
  - `security.maxFileSize` - Maximale Dateigröße für Bilder in MB
  - `security.maxVideoFileSize` - Maximale Dateigröße für Videos in MB
  - `security.maxTotalUploadSize` - Gesamtgröße aller Dateien je Meldung in MB
  - `security.allowedFileTypes` - Erlaubte MIME-Typen
- **Nutzung**: Dynamische Validierung von hochgeladenen Dateien
- **Fallback**: 10 MB (Bilder) / 100 MB (Videos) / 250 MB (Gesamt je Meldung), Standard-Medientypen

`getUploadConfig()` liefert alle drei Größen (jeweils als MB-Zahl und als
`*Bytes`-Variante). Welche der beiden Einzelgrenzen für eine konkrete Datei
gilt, entscheidet `maxUploadSizeFor(mimeType, limits)` (`#lib/constants/uploadLimits.js`)
anhand des MIME-Typs — dieselbe Funktion speist sowohl `POST /api/files/upload`
als auch `GET /api/config/upload` und damit die Dropzone. `maxTotalUploadSize`
wird separat gegen die Summe aller Dateien einer Meldung geprüft. `BODY_SIZE_LIMIT`
(`docs/ENVIRONMENT.md`) muss oberhalb von `security.maxVideoFileSize` liegen, sonst
bricht der Upload auf Plattformebene ab, bevor diese Prüfung überhaupt läuft.

```typescript
// src/routes/api/files/upload/+server.ts
const uploadConfig = await ServerConfigService.getUploadConfig();
const maxSize = maxUploadSizeFor(file.type, {
	maxFileSize: uploadConfig.maxFileSizeBytes,
	maxVideoFileSize: uploadConfig.maxVideoFileSizeBytes
});
```

### 3. **E-Mail-Benachrichtigungen** (`/api/sightings`)

- **Konfigurationen**:
  - `notification.email.enabled` - E-Mail-Benachrichtigungen aktivieren
  - `notification.email.recipient` - Empfänger-E-Mail
  - `notification.email.template` - HTML-Template
- **Nutzung**: Automatische E-Mails bei neuen Sichtungen
- **Fallback**: Keine E-Mails gesendet

```typescript
// src/routes/api/sightings/+server.ts
const emailConfig = await ServerConfigService.getEmailConfig();
if (emailConfig.enabled && emailConfig.recipient) {
	await EmailService.sendNewSightingNotification({
		sighting: formDataWithDefaults,
		referenceId,
		adminUrl
	});
}
```

### 4. **Wartungsmodus** (Global)

- **Konfiguration**: `display.maintenanceMode`
- **Nutzung**: Automatische Weiterleitung zur Wartungsseite
- **Fallback**: Wartungsmodus deaktiviert

```typescript
// src/lib/server/middleware/maintenanceMode.ts
const isMaintenanceEnabled = await ServerConfigService.isMaintenanceModeEnabled();
if (isMaintenanceEnabled) {
	throw redirect(503, '/maintenance');
}
```

### 5. **Karte — bewusst nicht konfigurierbar**

Die Karte ist **nicht** über den ConfigService steuerbar. Kartenzentrum, Zoom-Stufe
und Tile-Quellen sind in `src/lib/map/optimizedMapController.ts` fest verdrahtet
(OSM-Basislayer plus OpenSeaMap-Overlay, Startansicht 54.5 / 12.0 bei Zoom 7).

Die früheren Schlüssel `display.defaultMapCenter`, `display.defaultMapZoom` und
`integration.mapTileProvider` sowie beide `getMapConfig()`-Methoden wurden entfernt:
Sie wurden von keiner Route und keiner Komponente gelesen, wurden aber über
`/api/config/public` anonym ausgeliefert und bei jedem Aufruf von `/admin/settings`
in die Datenbank geschrieben. Wer die Karte konfigurierbar machen will, bindet
zuerst `optimizedMapController.ts` an — nicht umgekehrt.

Die Sichtbarkeit der öffentlichen Karte hängt ausschließlich am Datenbankfilter in
`src/routes/api/map/sightings/+server.ts`, nicht an einer Konfiguration.

## 🔧 Verwendungspatterns

### Server-Side Configuration Loading

**In +page.server.ts oder API routes:**

```typescript
import { ServerConfigService } from '#lib/services/configService.ts';

export const load: PageServerLoad = async () => {
	const config = await ServerConfigService.getPaginationConfig();
	return { config };
};
```

### Client-Side Configuration Loading

**In .svelte Komponenten:**

```typescript
import { ClientConfigService } from '#lib/services/configService.ts';

// Asynchron laden
onMount(async () => {
	const dateFormat = await ClientConfigService.get<string>('display.dateFormat');
	// Konfiguration verwenden
});
```

### Typed Configuration Access

```typescript
// Specific typed getters
const isEnabled = await ServerConfigService.getBoolean('notification.email.enabled');
const maxSize = await ServerConfigService.getNumber('security.maxFileSize');
const allowedTypes = await ServerConfigService.getArray<string>('security.allowedFileTypes');
```

### Grouped Configuration Access

```typescript
// Grouped configurations for specific functionality
const uploadConfig = await ServerConfigService.getUploadConfig();
const emailConfig = await ServerConfigService.getEmailConfig();
const securityConfig = await ServerConfigService.getSecurityConfig();
```

## 📋 Konfigurationskategorien & Nutzung

### 📧 E-Mail Einstellungen

| Schlüssel                      | Typ     | Verwendung                           | Fallback                    |
| ------------------------------ | ------- | ------------------------------------ | --------------------------- |
| `notification.email.enabled`   | boolean | E-Mail-Benachrichtigungen aktivieren | `false`                     |
| `notification.email.recipient` | string  | Empfänger für neue Sichtungen        | `""`                        |
| `notification.email.sender`    | string  | Absender-E-Mail                      | `"noreply@ostsee-tiere.de"` |
| `notification.email.template`  | string  | HTML-Template für E-Mails            | Standard-Template           |

### 🎨 Anzeige-Einstellungen

| Schlüssel                     | Typ     | Verwendung             | Fallback       |
| ----------------------------- | ------- | ---------------------- | -------------- |
| `display.maxSightingsPerPage` | number  | Admin-Paginierung      | `50`           |
| `display.dateFormat`          | string  | Datumsformat           | `'DD.MM.YYYY'` |
| `display.maintenanceMode`     | boolean | Wartungsmodus-Redirect | `false`        |

### 🔒 Sicherheit & Validierung

| Schlüssel                     | Typ    | Verwendung                        | Fallback             |
| ----------------------------- | ------ | --------------------------------- | -------------------- |
| `security.maxFileSize`        | number | Upload-Begrenzung für Bilder (MB) | `10`                 |
| `security.maxVideoFileSize`   | number | Upload-Begrenzung für Videos (MB) | `100`                |
| `security.maxTotalUploadSize` | number | Gesamtgröße je Meldung (MB)       | `250`                |
| `security.allowedFileTypes`   | array  | Erlaubte MIME-Typen               | Standard-Medientypen |
| `security.rateLimitPerIP`     | number | API Rate-Limit                    | `10`                 |

### 📊 Datenverarbeitung

| Schlüssel                   | Typ    | Verwendung                | Fallback                        |
| --------------------------- | ------ | ------------------------- | ------------------------------- |
| `data.duplicateCheckRadius` | number | Duplikatsprüfung (km)     | `1`                             |
| `data.exportFormats`        | array  | Verfügbare Export-Formate | `['csv', 'json', 'kml', 'xml']` |

## 🚀 Erweiterung des Systems

### Neue Konfiguration hinzufügen

1. **Standardwert definieren** in `DEFAULT_VALUES`:

```typescript
const DEFAULT_VALUES = {
	// ... existing values
	'myCategory.newSetting': 'defaultValue'
} as const;
```

2. **In `configInitializer.ts` hinzufügen**:

```typescript
{
  key: 'myCategory.newSetting',
  value: 'defaultValue',
  description: 'Beschreibung der neuen Einstellung',
  category: 'myCategory'
}
```

3. **Nutzung implementieren**:

```typescript
const newSetting = await ServerConfigService.getString('myCategory.newSetting');
```

### Client-seitige Konfigurationen

Für Client-seitige Nutzung muss die Konfiguration in `PUBLIC_CONFIG_KEYS` hinzugefügt werden:

```typescript
// src/routes/api/config/public/+server.ts
const PUBLIC_CONFIG_KEYS = [
	// ... existing keys
	'myCategory.newSetting'
] as const;
```

## ⚡ Performance & Caching

### Server-Side Caching

- **ConfigRepository**: 1-Minute In-Memory Cache
- **Automatische Cache-Invalidierung** bei Updates

### Client-Side Caching

- **ClientConfigService**: 5-Minuten Cache
- **HTTP Cache-Headers**: 5-Minuten Browser-Cache

### Best Practices

1. **Server-side für kritische Pfade**: Verwenden Sie `ServerConfigService` für wichtige Entscheidungen
2. **Client-side für UI-Präferenzen**: Verwenden Sie `ClientConfigService` für Anzeigeoptionen
3. **Fallbacks immer definieren**: Stellen Sie sicher, dass DEFAULT_VALUES alle möglichen Schlüssel enthält
4. **Typisierte Zugriffe nutzen**: Verwenden Sie `getString()`, `getNumber()` etc. für Typsicherheit

## 🔧 Debugging & Monitoring

### Logging

Alle Konfigurationszugriffe werden geloggt:

```typescript
logger.debug({ key, value }, 'Configuration accessed');
logger.error({ error, key }, 'Failed to get config, using default');
```

### Admin-Interface

- Live-Konfiguration unter `/admin/settings`
- Sofortige Änderungen möglich
- Änderungsprotokoll verfügbar

### Cache-Management

```typescript
// Cache leeren
ConfigRepository.clearCache();
EmailService.clearTemplateCache();
```

## 🎯 Fazit

Das Konfigurationssystem bietet:

✅ **Vollständige Funktionalität ohne Setup** - Intelligente Fallbacks  
✅ **Flexible Laufzeit-Konfiguration** - Keine Code-Änderungen nötig  
✅ **Typsichere APIs** - Compile-Zeit-Validierung  
✅ **Performance-optimiert** - Multi-Level Caching  
✅ **Admin-freundlich** - Benutzerfreundliche Verwaltung  
✅ **Produktions-bereit** - Umfassendes Error-Handling

Die Anwendung funktioniert vollständig mit Standardwerten und kann schrittweise über die Admin-Oberfläche konfiguriert werden.
