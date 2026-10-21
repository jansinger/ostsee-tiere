/**
 * Umgebungsvariablen als Objekt — in der Form, in der der Code sie seit jeher liest.
 *
 * Bis SvelteKit 2 kamen sie als `env` aus `$env/dynamic/private` bzw.
 * `$env/dynamic/public`. SvelteKit 3 liefert jede in `src/env.ts` deklarierte
 * Variable stattdessen als einzelnen benannten Export von `$app/env/private` und
 * `$app/env/public`. Der Namespace-Re-Export hier ergibt wieder ein Objekt mit
 * denselben Feldern; alle Aufrufstellen (`env.NODE_ENV ?? 'development'` usw.)
 * bleiben Zeichen für Zeichen unverändert.
 *
 * Der Umweg über dieses Modul ist Absicht und keine Bequemlichkeit: Die Tests
 * mocken es als `{ env: {...} }` und verändern das Objekt zur Laufzeit (Proxy,
 * Zuweisung, `delete`). Gegen `$app/env/private` direkt ginge das nicht — ein
 * Modul-Namespace ist unveränderlich.
 *
 * Welche Variablen es gibt, steht in `src/env.ts`. Eine dort fehlende Variable
 * ist hier `undefined`, auch wenn sie in der Umgebung gesetzt ist.
 */
export * as env from '$app/env/private';
export * as publicEnv from '$app/env/public';
