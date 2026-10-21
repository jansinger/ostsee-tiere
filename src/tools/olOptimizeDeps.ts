/**
 * Die `ol/*`-Unterpfade, die Vite vorab bündeln muss.
 *
 * WARUM DIESE LISTE EXISTIERT
 *
 * `OLMap.svelte` lädt `#lib/utils/map/openLayersHelpers` per `await import(...)`
 * nach, damit OpenLayers nicht im Initial-Bundle der Einstiegsseite liegt. Damit
 * sind die `ol/*`-Unterpfade dieser Datei für Vites Dependency-Scanner nicht
 * mehr statisch erreichbar — er findet sie erst, wenn der Browser sie zur
 * Laufzeit anfordert.
 *
 * Genau das ist in den Browser-Tests fatal. Vite optimiert dann mitten im Lauf
 * nach und lädt den Modulgraphen neu:
 *
 *     [vite] optimized dependencies changed. reloading
 *     [vitest] Vite unexpectedly reloaded a test.
 *
 * Danach existiert die Svelte-Laufzeit zweimal — einmal vorgebündelt, einmal aus
 * dem Quelltext. Effekte, die in der einen Instanz erzeugt werden, finden den
 * Kontext der anderen nicht und brechen mit `effect_orphan` ab. Der Fehler
 * erscheint dabei in Komponenten, die mit der Karte nichts zu tun haben
 * (`DropzoneEnhanced`, `FilterPanel`), und sieht deshalb wie ein Defekt an
 * ihnen aus.
 *
 * **Nur mit kaltem Cache sichtbar.** Lokal liegt in `node_modules/.vite` fast
 * immer schon ein Ergebnis von früheren Läufen, in dem die Unterpfade enthalten
 * sind — dort läuft die Suite grün durch, während CI auf frischem Checkout
 * rot wird. Wer das nachstellen will: `rm -rf node_modules/.vite` vor dem Lauf.
 *
 * `'ol'` allein genügt nicht: Das deckt nur den Paket-Einstieg ab, nicht
 * `ol/proj`, `ol/layer` und die übrigen Unterpfade.
 *
 * Die Liste wird von `olOptimizeDeps.test.ts` gegen die tatsächlichen Importe
 * von `openLayersHelpers.ts` abgeglichen — ein dort ergänzter Import fällt also
 * im Test auf und nicht erst als `effect_orphan` in CI.
 */
export const OL_OPTIMIZE_DEPS = [
	'ol',
	'ol/Collection',
	'ol/control',
	'ol/events/condition',
	'ol/Feature',
	'ol/geom/Point',
	'ol/interaction',
	'ol/interaction/Translate',
	'ol/layer',
	'ol/Map',
	'ol/proj',
	'ol/source',
	'ol/style',
	'ol/View'
] as const;
