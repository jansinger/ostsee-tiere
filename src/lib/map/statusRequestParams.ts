/**
 * @fileoverview Query-String für GET /api/map/sightings und .../years.
 *
 * Eigene Datei, weil der Map-Controller ohne DOM und OpenLayers-Kontext nicht
 * instanziierbar ist — die eine Entscheidung, die schiefgehen kann (wird der
 * Statusparameter überhaupt gesendet?), soll ohne Karte prüfbar sein.
 *
 * Der Parameter geht nur mit, wenn die Auswahl von der öffentlichen abweicht.
 * Das ist kein Sparen an Bytes: Ein `status=approved` von einem nicht
 * angemeldeten Client beantwortet die API mit 403 (siehe statusFilter.ts) —
 * die Karte darf ihn also nicht ungefragt mitschicken.
 */
import type { SightingStatus } from '#lib/components/admin/sightingStatus.ts';

export const DEFAULT_MAP_STATUSES: readonly SightingStatus[] = ['approved'];

export function isPublicStatusSelection(statuses: readonly SightingStatus[]): boolean {
	return statuses.length === 1 && statuses[0] === 'approved';
}

export function buildSightingsQuery(
	year: number,
	searchTerm: string,
	statuses: readonly SightingStatus[]
): string {
	const params = new URLSearchParams({ year: year.toString() });
	if (searchTerm.trim()) params.set('search', searchTerm);
	if (!isPublicStatusSelection(statuses)) params.set('status', statuses.join(','));
	return params.toString();
}
