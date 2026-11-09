/**
 * @fileoverview Freischaltung und letzter Lauf des Anonymisierungs-Jobs.
 *
 * Beides liegt in `app_config`, aber nicht im `ConfigRepository`:
 *
 * - **Kein Cache.** `ConfigRepository.get` hält Werte eine Minute vor. Für die
 *   Sperre vor einem nicht umkehrbaren Lauf zählt der Stand der Datenbank.
 * - **Einmal setzen.** Die Freischaltung wird mit `ON CONFLICT DO NOTHING`
 *   geschrieben; ein zweiter Aufruf ändert den ersten Eintrag nicht. Über die
 *   Einstellungs-API sind beide Schlüssel gesperrt
 *   (`RESERVED_CONFIG_KEY_PREFIXES` in `accessControl.ts`).
 *
 * Zurücknehmen ließe sich die Freischaltung nur direkt in der Datenbank; das
 * Panel (PR 5) zeigt dann rot (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md,
 * „Freigabe des ersten Laufs").
 */
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { appConfig } from '#lib/server/db/schema.ts';

export const ACTIVATED_AT_KEY = 'privacy.anonymization.activatedAt';
export const LAST_RUN_KEY = 'privacy.anonymization.lastRun';

const CATEGORY = 'security';

/** Wer, wann, bei welcher bestätigten Anzahl fälliger Meldungen. */
export interface AnonymizationActivation {
	at: string;
	by: string;
	confirmedDue: number;
}

export type AnonymizationTrigger = 'session' | 'token' | 'cli';

export type AnonymizationSkipReason = 'not_activated' | 'hash_backfill_incomplete';

/** Ergebnis eines ausgeführten Laufs, ohne personenbezogene Werte. */
export interface AnonymizationLastRun {
	at: string;
	trigger: AnonymizationTrigger;
	skipped: AnonymizationSkipReason | null;
	hashed: number;
	anonymized: number;
	remaining: number;
}

async function readValue(key: string): Promise<unknown> {
	const [row] = await db
		.select({ value: appConfig.value })
		.from(appConfig)
		.where(eq(appConfig.key, key))
		.limit(1);
	return row?.value ?? null;
}

/** `null`, solange nicht freigeschaltet — auch bei einem unlesbaren Eintrag. */
export async function getActivatedAt(): Promise<Date | null> {
	const value = await readValue(ACTIVATED_AT_KEY);
	if (typeof value !== 'object' || value === null || !('at' in value)) return null;
	const at = new Date(String(value.at));
	return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Schaltet den Job frei. `activated: false` heißt: Es gab schon eine
 * Freischaltung, sie bleibt unverändert.
 */
export async function activateAnonymization(input: {
	by: string;
	confirmedDue: number;
	now: Date;
}): Promise<{ activated: boolean }> {
	const value: AnonymizationActivation = {
		at: input.now.toISOString(),
		by: input.by,
		confirmedDue: input.confirmedDue
	};
	const written = await db
		.insert(appConfig)
		.values({
			key: ACTIVATED_AT_KEY,
			value,
			category: CATEGORY,
			description:
				'Freischaltung der Anonymisierung (einmalig, nicht über die Oberfläche änderbar)',
			updatedBy: input.by
		})
		.onConflictDoNothing({ target: appConfig.key })
		.returning({ id: appConfig.id });
	return { activated: written.length > 0 };
}

export async function recordLastRun(run: AnonymizationLastRun): Promise<void> {
	await db
		.insert(appConfig)
		.values({
			key: LAST_RUN_KEY,
			value: run,
			category: CATEGORY,
			description: 'Letzter ausgeführter Lauf der Anonymisierung',
			updatedBy: 'system'
		})
		.onConflictDoUpdate({
			target: appConfig.key,
			set: { value: run, updatedAt: new Date(), updatedBy: 'system' }
		});
}

export async function getLastRun(): Promise<AnonymizationLastRun | null> {
	const value = await readValue(LAST_RUN_KEY);
	return typeof value === 'object' && value !== null ? (value as AnonymizationLastRun) : null;
}
