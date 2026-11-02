/**
 * @fileoverview Welche Seiten im iframe ihre Höhe aus dem Inhalt beziehen
 *
 * Eingebettet meldet die App ihre Höhe an die Museumsseite, und der iframe
 * passt sich an (`embedMessages.ts`). Das setzt voraus, dass keine Seite eine
 * Mindesthöhe aus der Fensterhöhe ableitet — im iframe ist das Fenster der
 * iframe selbst, und die Höhe schaukelte sich mit jeder Meldung weiter auf.
 *
 * Seiten, die das Fenster füllen sollen, statt mit dem Inhalt zu wachsen,
 * stehen hier. Sie behalten ihre Fenster-Mindesthöhen und melden keine Höhe;
 * der iframe bleibt dort, wie er ist.
 */

/** Routen-IDs, deren Inhalt die Fensterhöhe füllt. */
const FILLS_VIEWPORT: ReadonlySet<string> = new Set(['/map']);

/** `routeId` ist `page.route.id` — `null` auf Fehlerseiten ohne Route. */
export function growsWithContent(routeId: string | null): boolean {
	return routeId === null || !FILLS_VIEWPORT.has(routeId);
}
