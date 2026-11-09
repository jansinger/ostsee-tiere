/**
 * @fileoverview Status der Anonymisierung für Hinweisleiste und Panel.
 *
 * Eine Abfrage, zwei Leser: Das Admin-Layout zeigt bei rotem Status die
 * Hinweisleiste, das Einstellungs-Panel zeigt dieselben Werte im Detail
 * (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, „Überwachung"). Bewertet wird mit
 * `evaluateAnonymizationHealth` — derselben Regel, die auch der Browser kennt.
 *
 * Enthält nur Zahlen und Zeitpunkte, keine personenbezogenen Werte.
 */
import { count } from 'drizzle-orm';
import { createLogger } from '#lib/logger.server.ts';
import { db } from '#lib/server/db/index.ts';
import { sightings } from '#lib/server/db/schema.ts';
import { unscoredRows } from '#lib/server/spam/rescoreSightings.ts';
import {
	evaluateAnonymizationHealth,
	type AnonymizationHealth
} from '#lib/utils/privacy/anonymizationHealth.ts';
import { overdueForAnonymization } from './anonymizationQueries';
import { getActivatedAt, getLastRun, type AnonymizationLastRun } from './anonymizationState';

const logger = createLogger('privacy:anonymization-status');

export interface AnonymizationStatus {
	activatedAt: string | null;
	lastRun: AnonymizationLastRun | null;
	/** Eingang vor mehr als 3 Monaten, noch nicht anonymisiert */
	overdue: number;
	/** Noch ohne Spam-Score, nicht anonymisiert — Vorbedingung der Freigabe */
	unscoredSpam: number;
	health: AnonymizationHealth;
}

async function countWhere(condition: ReturnType<typeof unscoredRows>): Promise<number> {
	const [row] = await db.select({ count: count() }).from(sightings).where(condition);
	return Number(row?.count ?? 0);
}

export async function getAnonymizationStatus(now = new Date()): Promise<AnonymizationStatus> {
	const [activated, lastRun] = await Promise.all([getActivatedAt(), getLastRun()]);
	const overdue = await countWhere(overdueForAnonymization());
	const unscoredSpam = await countWhere(unscoredRows());
	const activatedAt = activated?.toISOString() ?? null;

	return {
		activatedAt,
		lastRun,
		overdue,
		unscoredSpam,
		health: evaluateAnonymizationHealth(
			{ activatedAt, lastRunAt: lastRun?.at ?? null, overdue },
			now
		)
	};
}

/** Was die Hinweisleiste im Admin-Layout braucht — nicht mehr. */
export interface AnonymizationBanner extends AnonymizationHealth {
	overdue: number;
}

/**
 * Für das Admin-Layout. Scheitert die Abfrage, bleibt die Leiste aus: Eine
 * Statusanzeige darf den Admin-Bereich nicht unbenutzbar machen. Der Fehler
 * steht im Log.
 */
export async function loadAnonymizationBanner(now = new Date()): Promise<AnonymizationBanner | null> {
	try {
		const { health, overdue } = await getAnonymizationStatus(now);
		return { ...health, overdue };
	} catch (error) {
		logger.error(
			{ errorName: error instanceof Error ? error.name : typeof error },
			'Anonymisierungs-Status nicht ermittelbar'
		);
		return null;
	}
}
