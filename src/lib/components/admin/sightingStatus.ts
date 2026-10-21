/**
 * @fileoverview Bearbeitungsstand einer Sichtung — offen, freigegeben, abgelehnt.
 *
 * Eine Quelle für Wort, Farbe, Icon und Verdict der vier Anzeigestellen
 * (Eingang, Tabelle, Mobilkarte, Detailansicht), nach dem Vorbild von
 * `DEAD_FINDING_PRESENTATION` und `BALTIC_SEA_STATUS_PRESENTATION`.
 *
 * **Drei Bearbeitungszustände, weiterhin zwei Veröffentlichungszustände.**
 * Die Regel in `.claude/rules/api.md` verbietet einen dritten
 * *Veröffentlichungs*zustand („geprüft, aber nicht freigegeben"). Ein solcher
 * entsteht hier nicht: Der Status wird aus den zwei vorhandenen Spalten
 * abgeleitet, nicht gespeichert, und die öffentliche Grundmenge bleibt
 * `freigegeben_am IS NOT NULL`.
 *
 * **`geprueft` (`verified`) wird bewusst nicht gelesen.** Am 2026-08-07 wichen
 * im Bestand 31 Zeilen ab: 22 mit `geprueft = 1` ohne Freigabe (nicht
 * öffentlich, der alte Toggle zeigte sie als „geprüft") und 9 mit Freigabe ohne
 * `geprueft = 1` (öffentlich, der Toggle zeigte sie als ungeprüft). Wer die
 * Spalte hier wieder heranzieht, holt genau diesen Widerspruch zurück.
 *
 * Client-sicher: **kein** Import von `#lib/server/db/approvalFilter.js` oder
 * `#lib/server/db/schema.js` — die ziehen server-only Code, und der Bruch fällt
 * erst in `npm run build` auf, nicht in `npm run check`.
 */
import type { SightingVerdict } from '#lib/components/admin/sightingVerdict.ts';

export type SightingStatus = 'open' | 'approved' | 'rejected';

/**
 * Dauer des Undo-Fensters nach einem Statuswechsel — Eingangsseite (`/admin`,
 * Undo-Zeile einer Karte) und Tabelle (`/admin/sichtungen`, Toast-Action)
 * zeigen dieselbe Sekundenzahl, damit ein Wechsel des Werkzeugs sich nicht wie
 * ein Wechsel der Regel anfühlt. Eine gemeinsame Konstante statt zweier
 * Literale, die zufällig gleich lauten — sonst driften sie beim nächsten
 * Bearbeiten einer der beiden Stellen unbemerkt auseinander.
 */
export const SIGHTING_STATUS_UNDO_MS = 8000;

/**
 * Die Reihenfolge der Segmente im Bedienelement: vom unbearbeiteten zum
 * bearbeiteten Zustand, Freigabe vor Ablehnung (der häufigere Ausgang zuerst).
 */
export const SIGHTING_STATUS_ORDER = [
	'open',
	'approved',
	'rejected'
] as const satisfies readonly SightingStatus[];

/**
 * Nur die zwei Spalten, die den Status tragen — bewusst kein `SightingSelect`:
 * So lässt sich die Funktion auch über einer Teilauswahl aufrufen, und der Typ
 * sagt zugleich, dass mehr nicht gelesen wird.
 *
 * `string` neben `Date`, weil die Zeitstempel über `+page.server.ts` als JSON
 * serialisiert im Client ankommen können. `undefined` zusätzlich zu `null`,
 * weil `FrontendSighting` die beiden Felder optional führt (deshalb auch `?`:
 * unter `exactOptionalPropertyTypes` ist ein optionales Feld nicht einem
 * Pflichtfeld vom Typ `… | undefined` zuweisbar) — die
 * Truthiness-Prüfungen unten in `getSightingStatus` behandeln `undefined`
 * bereits wie `null`, ein `?? null` an den Aufrufstellen war deshalb
 * überflüssige Normalisierung.
 */
export interface SightingStatusSource {
	approvedAt?: Date | string | null | undefined;
	rejectedAt?: Date | string | null | undefined;
}

export interface SightingStatusPresentation {
	label: string;
	/**
	 * Die Handlung, die zu diesem Zustand führt — für Schaltflächen. Buttons
	 * benennen Handlungen, nicht Zustände: Im Eingang steht „Freigeben", nicht
	 * „Freigegeben". Das Segmented Control zeigt dagegen `label`, weil dort der
	 * Zustand selbst dargestellt wird.
	 */
	actionLabel: string;
	/** Das Verdict, das diesen Zustand herstellt (`PATCH /api/sightings/[id]/verify`). */
	verdict: SightingVerdict;
	/** Flächenfarbe — deshalb ohne `-strong`-Suffix (`.claude/rules/design-system.md`). */
	badgeClass: string;
	/** Icon-Name für `#lib/components/Icon.svelte`. */
	icon: string;
	/** Tooltip: was der Zustand bedeutet, nicht nur wie er heißt. */
	description: string;
}

export function getSightingStatus(source: SightingStatusSource): SightingStatus {
	if (source.approvedAt) return 'approved';
	if (source.rejectedAt) return 'rejected';
	return 'open';
}

/** Der Zustand, den ein Verdict herstellt — Umkehrung von `presentation.verdict`. */
export function verdictToStatus(verdict: SightingVerdict): SightingStatus {
	if (verdict === 'approve') return 'approved';
	if (verdict === 'reject') return 'rejected';
	return 'open';
}

export const SIGHTING_STATUS_PRESENTATION: Record<SightingStatus, SightingStatusPresentation> = {
	open: {
		label: 'Offen',
		actionLabel: 'Zurücksetzen',
		verdict: 'reset',
		badgeClass: 'badge-warning',
		icon: 'lucide:inbox',
		description: 'Noch nicht bearbeitet — nicht öffentlich sichtbar'
	},
	approved: {
		label: 'Freigegeben',
		actionLabel: 'Freigeben',
		verdict: 'approve',
		badgeClass: 'badge-success',
		icon: 'lucide:check',
		description: 'Geprüft und öffentlich sichtbar'
	},
	rejected: {
		/* `neutral` und nicht `error`: Eine Ablehnung ist ein abgeschlossener,
		   gewollter Vorgang, kein Fehlerzustand. Unterschieden wird zusätzlich
		   über das Icon — Farbe allein darf die Bedeutung nicht tragen. */
		label: 'Abgelehnt',
		actionLabel: 'Ablehnen',
		verdict: 'reject',
		badgeClass: 'badge-neutral',
		icon: 'lucide:x',
		description: 'Gesichtet und bewusst nicht veröffentlicht'
	}
};
