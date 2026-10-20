# Architektur & Clean Code

Diese Regeln gelten für **jede** Code-Änderung im Projekt.

---

## Technology Stack

| Bereich   | Technologie                                                    |
| --------- | -------------------------------------------------------------- |
| Framework | SvelteKit 5 mit TypeScript                                     |
| Datenbank | PostgreSQL + PostGIS                                           |
| ORM       | Drizzle (type-safe)                                            |
| Styling   | TailwindCSS + DaisyUI (Theme: `meeresmuseum`)                  |
| Karten    | OpenLayers                                                     |
| Forms     | Eigene `createForm`-Impl. (`src/lib/form/createForm.ts`) + Yup |
| Logging   | Pino                                                           |
| Icons     | unplugin-icons (lucide)                                        |

---

## Projektstruktur

Der vollständige Verzeichnisbaum steht in `.claude/README.md` — er ist
Navigations-Referenz, keine Regel.

---

## Clean Code Prinzipien

### SOLID Grundlagen

- **DRY**: Wiederverwendbare Logik in Utility-Funktionen extrahieren
- **Single Responsibility**: Eine Funktion = ein Zweck
- **KISS**: Einfache Lösungen bevorzugen
- **YAGNI**: Keine Funktionen "auf Vorrat"

### TypeScript Standards

- **Keine `any` Typen** - immer typisieren
- **Explizite Return Types** für Funktionen
- **Type Guards** für Runtime-Sicherheit
- **Pure Functions** wo möglich

### Namenskonventionen

| Element          | Konvention       | Beispiel              |
| ---------------- | ---------------- | --------------------- |
| Components       | PascalCase       | `MediaGallery.svelte` |
| Funktionen       | camelCase        | `loadSightingFiles`   |
| Konstanten       | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`       |
| Types/Interfaces | PascalCase       | `SightingFormData`    |

---

## Svelte 5 Runes - PFLICHT

```typescript
// State
let count = $state(0);
let user = $state({ name: 'Max' });

// Derived - für berechnete Werte (pure, returns value)
let doubled = $derived(count * 2);
let fullName = $derived.by(() => `${user.firstName} ${user.lastName}`);

// Effects - für Side Effects (impure, no return value)
$effect(() => {
	console.log('Count changed:', count);
	return () => cleanup();
});

// Props
let { items, onSelect }: Props = $props();
```

### Event Handling

```svelte
<!-- Svelte 5 -->
<button onclick={handleClick}>Klick</button>

<!-- NICHT Svelte 4 -->
<button on:click={handleClick}>Klick</button>
```

### SSR-sicheres State Management

**KRITISCH:** Globaler `$state` auf dem Server führt zu Datenlecks zwischen Usern!

```typescript
// ❌ FALSCH - Shared State auf Server
// globals.svelte.ts
export const userState = $state({ name: '' }); // Leakt zwischen Requests!

// ✅ RICHTIG - Context API für SSR
// +layout.svelte
import { setContext } from 'svelte';
const state = $state({ name: '' });
setContext('app-state', state);

// Komponente
import { getContext } from 'svelte';
const state = getContext('app-state');
```

Weitere Patterns — `$bindable()`, Snippets, `.svelte.ts`-Stores, `$effect`-Best-Practices
und `$app/state` — stehen in `svelte-patterns.md`. Diese Datei lädt automatisch,
sobald eine `.svelte`- oder `.svelte.ts`-Datei bearbeitet wird.

---

## TypeScript 5.x — `satisfies`

Der `satisfies`-Operator prüft den Typ, ohne ihn zu widening — nützlich für Drizzle-Configs und Yup-Schemas:

```typescript
// satisfies: Typ prüfen, aber literal types behalten
const windDirections = ['N', 'NW', 'W', 'SW', 'S', 'SO', 'O', 'NO'] satisfies string[];
// windDirections ist string[], NICHT ('N' | 'NW' | ...)[] — für Vergleiche

// Drizzle Insert-Objekte typsicher machen
const newSighting = {
	species: 0,
	totalCount: 1,
	sightingDate: new Date()
} satisfies typeof sightings.$inferInsert;
// → TypeScript-Fehler wenn Feld nicht im Schema, OHNE Typ zu weiten
```

---

## Imports

Immer `#lib` mit vollständigem Pfad **und der tatsächlichen Dateiendung** verwenden:

```typescript
// Korrekt
import { formatDate } from '#lib/utils/date.ts';
import { sightingSchema } from '#lib/form/validation/sightingSchema.ts';
import * as m from '#lib/paraglide/messages.js'; // generiert, echte .js-Datei

// Falsch
import { formatDate } from '$lib/utils/date'; // $lib gibt es seit SvelteKit 3 nicht mehr
import { formatDate } from '#lib/utils/date.js'; // .js auf eine .ts-Datei, s. u.
import { formatDate } from '../../../lib/utils/date';
```

`#lib` ist seit SvelteKit 3 ein Node-Subpath-Import (`imports` in `package.json`).
Die Endung muss die der **Zieldatei** sein: Vite und TypeScript lösen `.js` → `.ts`
zwar stillschweigend auf, Node selbst aber nicht. Playwright lädt die E2E-Specs samt
der importierten `src/lib`-Module über Node — mit `.js` auf eine `.ts`-Datei bricht dort
das Laden aller Specs ab („Cannot find module …/localeMemo.js"). Das
Migrationswerkzeug `sv migrate sveltekit-3` schreibt `.js`; das wurde beim Umstieg
korrigiert.

Gleiches gilt für `vi.mock('#lib/…')`: Der Pfad muss exakt dem Import entsprechen.

---

## Accessibility (WCAG 2.1 AA)

- Alle interaktiven Elemente mit Keyboard bedienbar
- Aussagekräftige Labels für Form-Elemente
- ARIA-Attribute wo nötig
- Farbkontrast mindestens 4.5:1
- Focus-States sichtbar

---

## Icons

### unplugin-icons (Standard)

```svelte
<script>
	import MapPin from '~icons/lucide/map-pin';
	import Calendar from '~icons/lucide/calendar';
</script>

<MapPin width="20" height="20" class="text-primary" />
```

### Weather Icons (CSS-basiert)

```html
<i class="wi wi-day-sunny"></i> <i class="wi wi-wind towards-n"></i>
```

---

## Context7 - IMMER verwenden

Vor der Arbeit mit Libraries context7 MCP Server nutzen für:

- DaisyUI v5 Patterns
- Svelte 5 Best Practices
- SvelteKit Routing
- Drizzle ORM Patterns
- OpenLayers Integration
