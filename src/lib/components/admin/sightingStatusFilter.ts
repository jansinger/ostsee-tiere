/**
 * Alias-Mapping des Statusfilters — geteilt von Tabelle, Export und
 * `ExportModal.svelte`, damit Tabelle, CSV und Filter-Beschriftung nie
 * verschiedene Mengen meinen.
 *
 * **Warum nicht mehr `eq(sichtungen.geprueft, …)`:** Der Filter las bis
 * 2026-08 eine andere Spalte als die Öffentlichkeit. Im Bestand wichen dadurch
 * 31 Zeilen ab — „Geprüft" lieferte 22 nicht veröffentlichte Meldungen und
 * unterschlug 9 veröffentlichte (gemessen 2026-08-07). Seither filtert auch
 * die Tabelle über `freigegeben_am`/`abgelehnt_am`.
 *
 * Der URL-Parameter heißt weiterhin `verified` — Lesezeichen und verlinkte
 * Filteransichten sollen nicht brechen. Sein alter Wert `0` meinte
 * „nicht geprüft" **inklusive** der abgelehnten und liefert als `open` jetzt
 * etwas weniger Zeilen; das ist die gewollte Korrektur.
 *
 * Client-sicher, weil `ExportModal.svelte` die Filter-Beschriftung daraus
 * baut — ein Import aus `#lib/server` bräche dort den Build.
 */
export type SightingStatusFilter = 'open' | 'approved' | 'rejected';

const ALIASES: Record<string, SightingStatusFilter> = {
	open: 'open',
	approved: 'approved',
	rejected: 'rejected',
	'1': 'approved',
	'0': 'open'
};

export function normalizeStatusParam(param: string | null): SightingStatusFilter | undefined {
	if (!param) return undefined;
	return ALIASES[param];
}
