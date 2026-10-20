/**
 * Die Quelltransformation: Fundstellen durch Botschaftsaufrufe ersetzen.
 *
 * **Auch diese Datei schreibt nichts.** Sie baut nur die geänderte Quelle als
 * Zeichenkette; ob und wann etwas auf die Platte kommt, entscheidet eine
 * spätere Aufgabe. Eigenes Modul (statt Teil von `render.ts`), weil das hier
 * die eigentliche Schreiblogik ist, die eine spätere Aufgabe tatsächlich
 * anwenden wird — `render.ts` bleibt reine Berichtsformatierung.
 */
import type { ExtractionSite } from './collect';

/** Der Aufruf, der an die Stelle des Literals tritt. */
function messageCall(key: string): string {
	return `m.${key}({}, { locale })`;
}

/**
 * Ersetzt alle Fundstellen einer Datei.
 *
 * **Von hinten nach vorn.** Jede Ersetzung ändert die Länge des Textes; würde
 * vorn begonnen, zeigten alle späteren Offsets ins Leere. Das ist auch der
 * Grund, warum `collect.ts` Offsets liefert und keine Suchtexte: Bei 19
 * Dubletten träfe ein Suchen-und-Ersetzen die falsche Stelle.
 */
export function applySitesToSource(source: string, sites: ExtractionSite[]): string {
	const ordered = [...sites].sort((a, b) => b.start - a.start);
	let result = source;
	for (const site of ordered) {
		result = result.slice(0, site.start) + messageCall(site.key) + result.slice(site.end);
	}
	return result;
}

/**
 * Die Ersetzungsform für eine Svelte-Markup-Fundstelle — je Position anders
 * (Auftrag, Aufgabe 2.2, Schritt 4):
 *
 *  - Textknoten: `{m.key()}` — der Knoten trägt bereits nur den reinen Text,
 *    keine Anführungszeichen zu ersetzen.
 *  - Attribut: `attr={m.key()}`, **einschließlich** der Anführungszeichen —
 *    `attr="{m.key()}"` wäre eine Zeichenketten-Interpolation, nicht der Wert
 *    selbst (Auftrag).
 *
 * **Kein `{ locale }`-Argument**, anders als `messageCall()` oben für Schicht
 * A/B: In Komponenten gibt es kein `locale`-Argument, Paraglide löst über die
 * aktive Locale auf — eine Komponente rendert immer in der Sprache der
 * Anfrage (Auftrag).
 *
 * **Mit Parametern**, wenn `site.params` welche trägt (mechanisierte
 * dynamische Attribute, Gruppe 2 in `allowlist.ts` bei `dynamic-attribute`):
 * `m.key({ name: ausdruck, … })` — derselbe JS-Ausdruck, der vorher im
 * Attribut stand, wandert unverändert als Argumentwert weiter.
 */
function svelteMessageCall(key: string, params?: ExtractionSite['params']): string {
	if (!params || params.length === 0) {
		return `m.${key}()`;
	}
	const args = params.map((p) => `${p.name}: ${p.expression}`).join(', ');
	return `m.${key}({ ${args} })`;
}

function svelteReplacement(site: ExtractionSite): string {
	if (site.aspect === 'text') {
		return `{${svelteMessageCall(site.key, site.params)}}`;
	}
	// Jeder andere Aspekt ist ein Attributname (siehe `SVELTE_TARGET_ATTRIBUTES`
	// in `collect.ts`) — `site.start`/`site.end` decken bei Attribut-Fundstellen
	// die GESAMTE Attributzuweisung ab (`name="wert"`), nicht nur den Wert.
	return `${site.aspect}={${svelteMessageCall(site.key, site.params)}}`;
}

const PARAGLIDE_IMPORT = `import * as m from '#lib/paraglide/messages';`;

/**
 * Öffnendes `<script>`-Tag des INSTANZ-Blocks — bewusst nicht `<script
 * module …>`. Ein `<script module>`-Block kann in Svelte 5 keine
 * Laufzeitwerte für die Vorlage exportieren (nur Typen, siehe
 * `SubmitStatus.svelte`), der Import gehört deshalb in den ersten
 * Skript-Block OHNE `module`-Attribut.
 *
 * `[^>]*?` non-greedy, damit ein `module`-Attribut irgendwo im Tag (nicht nur
 * direkt nach `script`) den Block trotzdem ausschließt — negative Lookahead
 * auf das ganze Tag statt nur auf den ersten Attributnamen.
 */
const INSTANCE_SCRIPT_TAG = /<script(?![^>]*\bmodule\b)[^>]*>/;

/**
 * Stellt sicher, dass `#lib/paraglide/messages` als `m` importiert ist —
 * direkt nach dem öffnenden Instanz-`<script>`-Tag, sofern noch nicht
 * vorhanden.
 *
 * Ohne diesen Schritt referenziert jede Ersetzung eine Bezeichnung, die es in
 * der Datei nicht gibt: Anders als bei Schicht A/B (Schema, formOptions), wo
 * `import * as m from '#lib/paraglide/messages'` schon vor der Extraktion
 * vorhanden war, hatten die meisten Markup-Dateien `m` bisher nie importiert.
 * svelte-check meldet das erst beim Typ-Check ("Cannot find name 'm'") — ein
 * reines Neu-Parsen (Aufgabe 2.2) findet das nicht, weil `m.foo()` ohne
 * Import syntaktisch gültiges JS bleibt.
 */
function ensureParaglideImport(source: string): string {
	if (source.includes(PARAGLIDE_IMPORT)) {
		return source;
	}
	const match = INSTANCE_SCRIPT_TAG.exec(source);
	if (!match) {
		// Kein Instanz-Skript-Block — kommt im Umfang dieses Werkzeugs nicht
		// vor (jede Zieldatei ist eine Komponente mit `<script lang="ts">`),
		// aber unverändert lassen ist die sichere Richtung, keine kaputte Datei.
		return source;
	}
	const insertAt = match.index + match[0].length;
	return `${source.slice(0, insertAt)}\n\t${PARAGLIDE_IMPORT}${source.slice(insertAt)}`;
}

/**
 * Ersetzt alle Svelte-Fundstellen einer Datei — von hinten nach vorn, aus
 * demselben Grund wie `applySitesToSource` — und ergänzt danach bei Bedarf
 * den `m`-Import (siehe `ensureParaglideImport`). Ohne Fundstellen bleibt die
 * Quelle unverändert, auch ohne Import — es gibt dann nichts, das ihn braucht.
 */
export function applySvelteSitesToSource(source: string, sites: ExtractionSite[]): string {
	if (sites.length === 0) {
		return source;
	}
	const ordered = [...sites].sort((a, b) => b.start - a.start);
	let result = source;
	for (const site of ordered) {
		result = result.slice(0, site.start) + svelteReplacement(site) + result.slice(site.end);
	}
	return ensureParaglideImport(result);
}
