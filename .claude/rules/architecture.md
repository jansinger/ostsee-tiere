# Architektur & Clean Code

Diese Regeln gelten für **jede** Code-Änderung im Projekt.

---

## Projektstruktur

Der vollständige Verzeichnisbaum steht in `.claude/README.md` — er ist
Navigations-Referenz, keine Regel.

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

## Context7 - IMMER verwenden

Vor der Arbeit mit Libraries den Context7 MCP Server (`resolve-library-id`, dann `query-docs`) nutzen für:

- DaisyUI v5 Patterns
- Svelte 5 Best Practices
- SvelteKit Routing
- Drizzle ORM Patterns
- OpenLayers Integration
