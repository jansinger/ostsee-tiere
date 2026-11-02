/**
 * @fileoverview Melder-Hash: verknüpft die Meldungen einer Person ohne ihre Adresse.
 *
 * Kontaktdaten werden 3 Monate nach Eingang geleert (Vorgabe des
 * Landesdatenschutzbeauftragten MV). Damit Meldungen derselben Person danach
 * noch zusammengehören, bekommt jede Meldung beim Eingang einen Hash der
 * E-Mail-Adresse. Konzept: `docs/ANONYMISIERUNG_KONZEPT.md`, Abschnitt 3.
 *
 * **HMAC mit geheimem Schlüssel, kein einfaches SHA-256.** Ein ungesalzener
 * Hash lässt sich nicht zurückrechnen, aber nachrechnen: Wer eine Adresse
 * vermutet, hasht sie und vergleicht. Das Repository ist öffentlich, das
 * Verfahren also bekannt. Mit `REPORTER_HASH_KEY` außerhalb der Datenbank ist
 * ein Dump allein wertlos; nur die Anwendung kann zu einer *genannten* Adresse
 * den Hash bilden (Auskunfts- und Löschersuchen).
 *
 * **Der Schlüssel wird nie rotiert.** Nach der Anonymisierung gibt es keine
 * Adresse mehr, aus der sich mit einem neuen Schlüssel neu hashen ließe — ein
 * neuer Schlüssel trennt alle künftigen Meldungen von allen bisherigen.
 *
 * **Der Hash verlässt den Server nie** — nicht in Antworten, Exporten oder
 * URLs. `omitReporterIdentity` entfernt ihn an den Stellen, die ganze Zeilen
 * ausliefern.
 */
import { createHmac } from 'node:crypto';
import { env } from '#lib/server/env.ts';
import { normalizeReporterKey } from '#lib/server/privacy/reporterKey.ts';

/** Kürzere Schlüssel sind nicht brauchbar und gelten als nicht gesetzt. */
export const MIN_REPORTER_HASH_KEY_LENGTH = 32;

/**
 * Domains, deren Adressen dem Museum selbst gehören. Die Top-Beobachter der
 * Statistik schließen sie aus; nach der Anonymisierung ist die Domain weg,
 * deshalb wird die Zugehörigkeit beim Eingang als `melder_intern` festgehalten.
 */
const INTERNAL_REPORTER_DOMAINS: readonly string[] = ['meeresmuseum.de'];

/** Hash und Intern-Kennzeichen, wie sie in `sichtungen` stehen. */
export interface ReporterIdentity {
	reporterHash: string | null;
	reporterInternal: boolean | null;
}

/**
 * HMAC-SHA256 der normalisierten Adresse, hex.
 *
 * @returns `null` ohne Adresse
 * @throws bei einem Schlüssel unter `MIN_REPORTER_HASH_KEY_LENGTH` — ein
 *   schwacher Schlüssel darf nicht still einen dauerhaften Hash erzeugen
 */
export function computeReporterHash(email: string | null | undefined, key: string): string | null {
	if (key.length < MIN_REPORTER_HASH_KEY_LENGTH) {
		throw new Error(
			`REPORTER_HASH_KEY muss mindestens ${MIN_REPORTER_HASH_KEY_LENGTH} Zeichen haben`
		);
	}
	const normalized = normalizeReporterKey(email);
	if (!normalized) return null;
	return createHmac('sha256', key).update(normalized, 'utf8').digest('hex');
}

/** Ob die Adresse zum Museum gehört. `null` ohne Adresse. */
export function isInternalReporter(email: string | null | undefined): boolean | null {
	const normalized = normalizeReporterKey(email);
	if (!normalized) return null;
	const domain = normalized.slice(normalized.lastIndexOf('@') + 1);
	return INTERNAL_REPORTER_DOMAINS.includes(domain);
}

/** Der Schlüssel aus der Umgebung, oder `null`, wenn er fehlt oder zu kurz ist. */
export function getReporterHashKey(): string | null {
	const key = env.REPORTER_HASH_KEY;
	return key && key.length >= MIN_REPORTER_HASH_KEY_LENGTH ? key : null;
}

/**
 * Hash und Intern-Kennzeichen zu einer Adresse.
 *
 * Ohne Schlüssel bleibt der Hash `null`. Die Meldung wird trotzdem
 * gespeichert — ein abgewiesener Eingang kostete Meldungen, auch die der
 * Legacy-Clients, deren Nutzer von einem Fehlschlag nichts erfahren. Der
 * Backfill (`hashReporters.ts`) holt den Hash nach, solange die Adresse noch
 * vorhanden ist.
 */
export function reporterIdentityFor(
	email: string | null | undefined,
	key: string | null
): ReporterIdentity {
	return {
		reporterHash: key ? computeReporterHash(email, key) : null,
		reporterInternal: isInternalReporter(email)
	};
}

/** Entfernt Hash und Intern-Kennzeichen aus einer Zeile, bevor sie den Server verlässt. */
export function omitReporterIdentity<
	T extends {
		reporterHash?: string | null | undefined;
		reporterInternal?: boolean | null | undefined;
	}
>(row: T): Omit<T, keyof ReporterIdentity> {
	const { reporterHash: _reporterHash, reporterInternal: _reporterInternal, ...rest } = row;
	return rest;
}
