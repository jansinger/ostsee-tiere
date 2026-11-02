/**
 * Die Identität eines Melders — kleingeschrieben und ohne Randweißraum.
 *
 * Dieselbe Normalisierung wie im E-Mail-Zweig von `duplicateCandidates.ts`,
 * plus `trim`: Eine Adresse mit angehängtem Leerzeichen wäre sonst ein zweiter
 * Melder. Mehr Normalisierung bewusst nicht — Punkte und `+tag` bei Gmail
 * zusammenzuziehen wäre eine Aussage über einen fremden Anbieter.
 *
 * Eigenes Modul, weil zwei Stellen darauf bauen und nicht auseinanderlaufen
 * dürfen: die Melder-Historie (`reporterHistory.ts`) und der Melder-Hash
 * (`reporterHash.ts`). Zählte die eine anders als die andere, wichen die
 * Zahlen nach der Anonymisierung von den heutigen ab.
 */
export function normalizeReporterKey(email: string | null | undefined): string | null {
	const key = email?.trim().toLowerCase() ?? '';
	return key.length > 0 ? key : null;
}
