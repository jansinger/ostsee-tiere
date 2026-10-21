/**
 * Volumen-Bremse, zusätzlich zum Zähler-Rate-Limit — für zwei Pfade.
 *
 * Ursprünglich nur für Datei-Uploads: `FILE_UPLOAD_ANONYMOUS` begrenzt die
 * ANZAHL der Uploads (20/h). Solange eine Datei höchstens 10 MB groß sein
 * durfte, war damit auch das Volumen gedeckelt. Mit 100 MB je Video sind es
 * 2 GB pro IP und Stunde — mehr als der gesamte Medienbestand aus 13 Jahren.
 *
 * Seit dem Abschlussreview (Befund C1) bucht auch `GET /api/media/[...path]`
 * hier ab: Dort zählte das Rate-Limit bislang nur die ANZAHL der Abrufe
 * (`MEDIA_ACCESS_*`/`MEDIA_RANGE_*`), nicht ihr Volumen. `Range: bytes=0-` ist
 * ein erfüllbarer Bereich über die ganze Datei und bekam dabei sogar das
 * höhere Range-Limit (300/min statt 30/min) — bei 100-MB-Videos theoretisch
 * 30 GB pro Minute und IP. Daher der Name ohne `upload`-Präfix: Die Bremse ist
 * jetzt allgemein für „wie viele Bytes fließen über diese Kennung", nicht mehr
 * upload-spezifisch.
 *
 * Das Gesamtlimit je Meldung (`security.maxTotalUploadSize`) schützt beim
 * Upload-Pfad NICHT: Die `referenceId` liefert der Client, eine neue CUID je
 * Datei umgeht es vollständig. Diese Buchführung hängt dagegen an derselben
 * Kennung wie das Rate Limit (IP bzw. `sub`).
 *
 * In-Memory wie `rateLimit.ts` — bei mehreren Instanzen zählt jede für sich.
 * Das ist bewusst dieselbe Einschränkung wie beim bestehenden Rate Limit und
 * kein neuer Kompromiss.
 */
import { createLogger } from '#lib/logger.server.ts';

const logger = createLogger('middleware:byteBudget');

export interface ByteBudget {
	windowMs: number;
	maxBytes: number;
}

export interface ByteBudgetResult {
	allowed: boolean;
	usedBytes: number;
	remainingBytes: number;
	resetAt: number;
}

interface BudgetEntry {
	usedBytes: number;
	resetAt: number;
}

const budgets = new Map<string, BudgetEntry>();

// Wie rateLimit.ts: periodischer Cleanup statt Voll-Scan bei jedem Aufruf.
// `sweep()` lief ursprünglich synchron in JEDEM `consumeByteBudget()`-Aufruf —
// beim Upload-Pfad (20 Anfragen/h) unkritisch, bei `GET /api/media/[...path]`
// (300 Anfragen/min) ein unnötiger Voll-Scan der Map auf dem heißen Pfad.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten, wie rateLimit.ts

let cleanupTimer: NodeJS.Timeout | undefined;

/** Räumt abgelaufene Konten ab, damit die Map nicht unbegrenzt wächst. */
function sweep(now: number): void {
	for (const [key, entry] of budgets) {
		if (entry.resetAt <= now) {
			budgets.delete(key);
		}
	}
}

function scheduleCleanup(): void {
	cleanupTimer = setInterval(() => {
		const sizeBefore = budgets.size;
		sweep(Date.now());
		const removed = sizeBefore - budgets.size;
		if (removed > 0) {
			logger.debug({ removed }, 'Byte budget entries cleaned up');
		}
	}, CLEANUP_INTERVAL_MS);
	// Darf den Prozess nicht am Beenden hindern — anders als beim Upload-Limit
	// läuft dieses Budget jetzt auch im Media-Pfad, und der Timer soll einen
	// Testlauf oder ein sauberes Server-Shutdown nicht blockieren.
	cleanupTimer.unref?.();
}

scheduleCleanup();

export function consumeByteBudget(
	identifier: string,
	bytes: number,
	budget: ByteBudget
): ByteBudgetResult {
	const now = Date.now();

	const existing = budgets.get(identifier);
	const entry: BudgetEntry =
		existing && existing.resetAt > now
			? existing
			: { usedBytes: 0, resetAt: now + budget.windowMs };

	const wouldUse = entry.usedBytes + bytes;

	if (wouldUse > budget.maxBytes) {
		// Bewusst NICHT abbuchen: Sonst sperrt ein einzelner zu großer Versuch
		// die Kennung für den Rest des Fensters aus, obwohl nichts übertragen
		// wurde.
		budgets.set(identifier, entry);
		return {
			allowed: false,
			usedBytes: entry.usedBytes,
			remainingBytes: budget.maxBytes - entry.usedBytes,
			resetAt: entry.resetAt
		};
	}

	entry.usedBytes = wouldUse;
	budgets.set(identifier, entry);

	return {
		allowed: true,
		usedBytes: entry.usedBytes,
		remainingBytes: budget.maxBytes - entry.usedBytes,
		resetAt: entry.resetAt
	};
}

/**
 * Setzt alle Konten zurück und plant den Cleanup-Timer neu. Nur für Tests.
 *
 * Der Timer-Neustart ist nötig, damit Tests unter `vi.useFakeTimers()`
 * deterministisch bleiben: Der beim Modul-Import unter der echten Uhr
 * gestartete Timer würde sonst nie unter die Fake-Clock fallen, und
 * `vi.advanceTimersByTime()` könnte ihn nicht auslösen.
 */
export function resetByteBudgets(): void {
	budgets.clear();
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
	}
	scheduleCleanup();
}

/** Anzahl der aktuell im Speicher gehaltenen Konten. Nur für Tests. */
export function getByteBudgetEntryCountForTests(): number {
	return budgets.size;
}

/** Zugriff auf den Cleanup-Timer, um sein unref()-Verhalten zu prüfen. Nur für Tests. */
export function getByteBudgetCleanupTimerForTests(): NodeJS.Timeout | undefined {
	return cleanupTimer;
}
