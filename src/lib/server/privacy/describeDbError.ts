/**
 * @fileoverview Beschreibt einen Fehler aus einem Datenbanklauf ohne dessen Werte.
 *
 * Ein `DrizzleQueryError` nennt in seiner Meldung die Parameter der Anweisung —
 * beim Hash-Backfill und beim Löschersuchen sind das E-Mail-Adressen. Die
 * Log-Redaction (`#lib/logger/redaction.ts`) greift nur an Feldnamen, nicht in
 * Fließtext. Für die Fehlersuche reichen Typ und SQLSTATE; die Anweisung
 * selbst lässt sich aus dem Code ablesen.
 */
export interface DescribedDbError {
	errorName: string;
	/** SQLSTATE der Ursache, etwa `23505` */
	code: string | null;
}

function codeOf(value: unknown): string | null {
	if (typeof value !== 'object' || value === null || !('code' in value)) return null;
	return typeof value.code === 'string' ? value.code : null;
}

export function describeDbError(error: unknown): DescribedDbError {
	if (!(error instanceof Error)) return { errorName: typeof error, code: null };
	// `DrizzleQueryError` setzt `name` nicht — der Klassenname sagt mehr als „Error".
	const errorName = error.name !== 'Error' ? error.name : error.constructor.name || error.name;
	return { errorName, code: codeOf(error.cause) ?? codeOf(error) };
}
