/**
 * @fileoverview Ampel der Anonymisierung und Fristhinweis im Eingang.
 *
 * Ein Cron, der still ausfällt, verletzt die Frist, ohne dass es jemand merkt
 * (docs/ANONYMISIERUNG_UMSETZUNGSPLAN.md, „Überwachung"). Rot heißt deshalb:
 * Meldungen liegen über der Frist, oder der letzte Lauf ist älter als
 * 48 Stunden. Vor der Freischaltung ist der Zustand „inaktiv" — dann liegt
 * erwartungsgemäß fast der ganze Bestand über der Frist.
 *
 * Steht nicht unter `#lib/server`: Panel und Eingang rechnen im Browser
 * dieselben Regeln wie die Hinweisleiste auf dem Server.
 */
import { anonymizationDueAt } from './anonymizationCutoff';

export const ANONYMIZATION_STALE_RUN_HOURS = 48;
/** Ab so vielen Tagen vor der Frist zeigt der Eingang „Rückfragen nur noch bis …". */
export const CONTACT_DEADLINE_NOTICE_DAYS = 14;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type AnonymizationHealthReason = 'overdue' | 'stale_run';

export interface AnonymizationHealth {
	level: 'inactive' | 'ok' | 'alert';
	reasons: AnonymizationHealthReason[];
}

export interface AnonymizationHealthInput {
	/** ISO-Zeitpunkt der Freischaltung, `null` = nicht freigeschaltet */
	activatedAt: string | null;
	/** ISO-Zeitpunkt des letzten ausgeführten Laufs */
	lastRunAt: string | null;
	/** Meldungen mit Eingang vor mehr als 3 Monaten, noch nicht anonymisiert */
	overdue: number;
}

export function evaluateAnonymizationHealth(
	input: AnonymizationHealthInput,
	now: Date
): AnonymizationHealth {
	if (!input.activatedAt) return { level: 'inactive', reasons: [] };

	const reasons: AnonymizationHealthReason[] = [];
	if (input.overdue > 0) reasons.push('overdue');

	// Ohne bisherigen Lauf zählt die Freischaltung als Bezugspunkt: Der erste
	// Cron-Lauf darf bis zu 48 Stunden auf sich warten lassen.
	const reference = new Date(input.lastRunAt ?? input.activatedAt).getTime();
	if (now.getTime() - reference > ANONYMIZATION_STALE_RUN_HOURS * HOUR_MS) {
		reasons.push('stale_run');
	}

	return { level: reasons.length > 0 ? 'alert' : 'ok', reasons };
}

export interface ContactDeadline {
	/** `soon`: Rückfragen nur noch bis `dueAt`; `expired`: Frist erreicht */
	kind: 'soon' | 'expired';
	dueAt: Date;
}

/**
 * Hinweis für eine Meldung im Eingang: Bis wann sind Rückfragen möglich?
 * `null`, solange mehr als 14 Tage Zeit bleiben.
 */
export function contactDeadline(created: Date, now: Date): ContactDeadline | null {
	const dueAt = anonymizationDueAt(created);
	const remaining = dueAt.getTime() - now.getTime();
	if (remaining <= 0) return { kind: 'expired', dueAt };
	if (remaining <= CONTACT_DEADLINE_NOTICE_DAYS * DAY_MS) return { kind: 'soon', dueAt };
	return null;
}
