/**
 * @fileoverview Ausführung einer Bulk-Aktion über den bestehenden
 * verify-Endpunkt — Schleife plus Zusammenfassung.
 *
 * **Kein Bulk-Endpunkt.** `PATCH /api/sightings/[id]/verify` bleibt der einzige
 * Schreibweg für den Status (CLAUDE.md, `.claude/rules/api.md`); die Schleife
 * läuft deshalb im Client über dasselbe `submitVerdict` wie der Einzelwechsel.
 * `submit` wird injiziert statt importiert, damit die Schleife ohne Netz und
 * ohne Toast-Nebenwirkungen testbar bleibt.
 *
 * Sequentiell und nicht `Promise.all`: Jede Zeile ist ein eigener Schreibvorgang,
 * und eine Tabellenseite kann 100 Zeilen haben — eine Welle gleichzeitiger
 * PATCHes wäre eine Lastspitze ohne Gegenwert. Der Preis ist Wartezeit, die die
 * Fortschrittsanzeige sichtbar macht.
 */
import type { SightingVerdict } from '#lib/components/admin/sightingVerdict.ts';

export interface BulkVerdictOutcome {
	/** Die einzige Grundlage für „Rückgängig" — ein `reset` auf eine nie
	 *  geänderte Zeile überschriebe einen fremden Zustand. */
	succeeded: number[];
	failed: number[];
}

export interface RunBulkVerdictOptions {
	submit: (id: number, verdict: SightingVerdict) => Promise<boolean>;
	onProgress?: (done: number, total: number) => void;
}

export async function runBulkVerdict(
	ids: readonly number[],
	verdict: SightingVerdict,
	{ submit, onProgress }: RunBulkVerdictOptions
): Promise<BulkVerdictOutcome> {
	const succeeded: number[] = [];
	const failed: number[] = [];

	for (const id of ids) {
		let ok = false;
		try {
			ok = await submit(id, verdict);
		} catch {
			/* Ein Netzabbruch mitten in der Schleife darf die übrigen Zeilen nicht
			   mitreißen — sonst bliebe unklar, wo abgebrochen wurde. `submitVerdict`
			   fängt selbst schon und meldet `false`; das `catch` deckt den Fall ab,
			   dass eine andere Implementierung durchwirft. */
			ok = false;
		}
		(ok ? succeeded : failed).push(id);
		onProgress?.(succeeded.length + failed.length, ids.length);
	}

	return { succeeded, failed };
}

/**
 * Partizip je Verdict. Nicht aus `SIGHTING_STATUS_PRESENTATION` ableitbar: Dort
 * stehen Zustand („Freigegeben") und Handlung („Freigeben"), hier wird ein
 * abgeschlossener Vorgang berichtet — und für `reset` heißt das „zurückgesetzt"
 * und nicht „offen".
 */
const BULK_VERDICT_PARTICIPLE: Record<SightingVerdict, string> = {
	approve: 'freigegeben',
	reject: 'abgelehnt',
	reset: 'zurückgesetzt'
};

export interface BulkSummary {
	message: string;
	hasFailures: boolean;
}

/**
 * Ein Toast am Ende statt einem pro Zeile: Bei 40 gewählten Sichtungen wären 40
 * Toasts kein Feedback mehr, sondern eine Wand.
 */
export function buildBulkSummary(
	outcome: BulkVerdictOutcome,
	verdict: SightingVerdict,
	skipped = 0
): BulkSummary {
	const partizip = BULK_VERDICT_PARTICIPLE[verdict];
	const erfolge = outcome.succeeded.length;
	const fehler = outcome.failed.length;
	const gesamt = erfolge + fehler;

	let message: string;
	if (fehler === 0) {
		message = `${erfolge} ${erfolge === 1 ? 'Sichtung' : 'Sichtungen'} ${partizip}`;
	} else if (erfolge === 0) {
		message = `Keine Sichtung ${partizip} — ${fehler} fehlgeschlagen`;
	} else {
		message = `${erfolge} von ${gesamt} Sichtungen ${partizip} — ${fehler} fehlgeschlagen`;
	}

	/* Übersprungene Zeilen gehören genannt: Sonst zählt der Nutzer 12 Haken und
	   liest „10 freigegeben", ohne zu erfahren, was mit den beiden anderen war. */
	if (skipped > 0) {
		message += ` (${skipped} übersprungen — Einzelaktion lief noch)`;
	}

	return { message, hasFailures: fehler > 0 };
}
