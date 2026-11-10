/**
 * Aufbewahrungsfrist des Legacy-Posteingangs auf dem Plesk-Server.
 *
 * Der Posteingang hält jede Meldung roh als JSON, samt Name, E-Mail, Telefon
 * und Anschrift. In der Datenbank werden diese Angaben 3 Monate nach Eingang
 * geleert (docs/ANONYMISIERUNG_KONZEPT.md) — die Kopie auf hawking lag bis
 * hierher unbefristet daneben.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ANONYMIZE_AFTER_MONTHS } from '#lib/constants/reporterDataRetention.ts';
import { anonymizationDueAt } from '#lib/utils/privacy/anonymizationCutoff.ts';
import {
	ABGEWIESEN_MONATE,
	IMPORTIERT_TAGE,
	abgewiesenFaelligAb,
	empfangenAm,
	raeumeAuf
} from './prune-legacy-inbox.js';

const JETZT = new Date('2026-11-10T03:00:00Z');

/** Dateiname, wie der Posteingang-Dienst ihn vergibt (legacy-inbox/src/store.js). */
function name(nr: number, empfangen: string): string {
	return `${String(nr).padStart(6, '0')}__${empfangen.replace(/[:.]/g, '-')}.json`;
}

async function datenVerzeichnis(dateien: Record<string, string[]>): Promise<string> {
	const wurzel = await mkdtemp(join(tmpdir(), 'prune-legacy-inbox-'));
	for (const unter of ['posteingang', 'abgewiesen', 'importiert']) {
		await mkdir(join(wurzel, unter));
		for (const datei of dateien[unter] ?? []) {
			await writeFile(join(wurzel, unter, datei), '{}');
		}
	}
	return wurzel;
}

const stumm = { log: vi.fn(), error: vi.fn() };

describe('empfangenAm', () => {
	it('liest den Eingang aus dem Dateinamen', () => {
		expect(empfangenAm('000123__2026-08-08T17-19-47-919Z.json')).toEqual(
			new Date('2026-08-08T17:19:47.919Z')
		);
	});

	it.each(['notizen.txt', '000123__kaputt.json', '000123__2026-08-08T17-19-47-919Z.json.tmp'])(
		'liefert für %s kein Datum',
		(datei) => {
			expect(empfangenAm(datei)).toBeNull();
		}
	);
});

describe('abgewiesenFaelligAb', () => {
	// Monatsende: PostgreSQL kappt auf das Ende des Zielmonats, setUTCMonth()
	// liefe in den Folgemonat über und überschritte die Frist (Review PR #1019).
	it('kappt am Monatsende auf das Ende des Zielmonats, bevor der Puffer abgeht', () => {
		expect(abgewiesenFaelligAb(new Date('2026-11-30T12:00:00Z'))).toEqual(
			new Date('2027-02-27T12:00:00Z')
		);
	});

	// Das Werkzeug läuft unter blankem node und kann die TS-Fassung nicht
	// importieren — der Vergleich hält beide Rechnungen deckungsgleich.
	it('rechnet wie die Fristberechnung der App, über ein ganzes Jahr', () => {
		for (let tag = 0; tag < 366; tag++) {
			const eingang = new Date(Date.UTC(2027, 0, 1 + tag, 13, 7, 5, 123));
			expect(abgewiesenFaelligAb(eingang)).toEqual(anonymizationDueAt(eingang));
		}
	});
});

describe('raeumeAuf', () => {
	it('hält für abgewiesene Meldungen dieselbe Frist wie die Datenbank', () => {
		expect(ABGEWIESEN_MONATE).toBe(ANONYMIZE_AFTER_MONTHS);
	});

	it('löscht importierte Dateien nach der Frist und behält jüngere', async () => {
		const alt = name(1, '2026-10-01T10:00:00.000Z');
		const jung = name(2, '2026-11-01T10:00:00.000Z');
		const wurzel = await datenVerzeichnis({ importiert: [alt, jung] });

		const bericht = await raeumeAuf({ datenVerzeichnis: wurzel, jetzt: JETZT, log: stumm });

		expect(await readdir(join(wurzel, 'importiert'))).toEqual([jung]);
		expect(bericht.geloescht).toEqual({ importiert: 1, abgewiesen: 0 });
		expect(IMPORTIERT_TAGE).toBe(30);
	});

	it('löscht abgewiesene Dateien erst nach 3 Monaten (mit einem Tag Puffer)', async () => {
		// Grenze wie in der Datenbank: Eingang + 3 Monate - 1 Tag <= jetzt.
		const faellig = name(1, '2026-08-11T03:00:00.000Z');
		const nochNicht = name(2, '2026-08-11T03:00:01.000Z');
		const wurzel = await datenVerzeichnis({ abgewiesen: [faellig, nochNicht] });

		const bericht = await raeumeAuf({ datenVerzeichnis: wurzel, jetzt: JETZT, log: stumm });

		expect(await readdir(join(wurzel, 'abgewiesen'))).toEqual([nochNicht]);
		expect(bericht.geloescht.abgewiesen).toBe(1);
	});

	it('fasst den Posteingang nie an — dort liegt, was noch nicht übertragen ist', async () => {
		const uralt = name(1, '2020-01-01T00:00:00.000Z');
		const wurzel = await datenVerzeichnis({ posteingang: [uralt] });

		await raeumeAuf({ datenVerzeichnis: wurzel, jetzt: JETZT, log: stumm });

		expect(await readdir(join(wurzel, 'posteingang'))).toEqual([uralt]);
	});

	it('meldet, was im Posteingang über der Frist liegt', async () => {
		const wurzel = await datenVerzeichnis({
			posteingang: [name(1, '2026-01-01T00:00:00.000Z'), name(2, '2026-11-09T00:00:00.000Z')]
		});

		const bericht = await raeumeAuf({ datenVerzeichnis: wurzel, jetzt: JETZT, log: stumm });

		expect(bericht.posteingangUeberFrist).toBe(1);
	});

	it('lässt Dateien ohne lesbares Datum stehen und nennt sie', async () => {
		// Was sich nicht datieren lässt, wird nicht gelöscht: Lieber ein Rest,
		// den ein Mensch ansieht, als eine Löschung auf Verdacht.
		const fremd = 'notizen.txt';
		const tmp = `${name(1, '2020-01-01T00:00:00.000Z')}.tmp`;
		const wurzel = await datenVerzeichnis({ importiert: [fremd, tmp] });

		const bericht = await raeumeAuf({ datenVerzeichnis: wurzel, jetzt: JETZT, log: stumm });

		expect((await readdir(join(wurzel, 'importiert'))).sort()).toEqual([fremd, tmp].sort());
		expect(bericht.uebersprungen.sort()).toEqual(
			[`importiert/${fremd}`, `importiert/${tmp}`].sort()
		);
	});

	it('ein zweiter Lauf ändert nichts', async () => {
		const wurzel = await datenVerzeichnis({
			importiert: [name(1, '2026-01-01T00:00:00.000Z')]
		});
		await raeumeAuf({ datenVerzeichnis: wurzel, jetzt: JETZT, log: stumm });

		const zweiter = await raeumeAuf({ datenVerzeichnis: wurzel, jetzt: JETZT, log: stumm });

		expect(zweiter.geloescht).toEqual({ importiert: 0, abgewiesen: 0 });
	});

	it('übersteht ein fehlendes Unterverzeichnis', async () => {
		const wurzel = await mkdtemp(join(tmpdir(), 'prune-legacy-inbox-'));

		const bericht = await raeumeAuf({ datenVerzeichnis: wurzel, jetzt: JETZT, log: stumm });

		expect(bericht.geloescht).toEqual({ importiert: 0, abgewiesen: 0 });
	});

	it('meldet undatierte Dateien im Posteingang, ohne sie zu löschen', async () => {
		// Etwa ein .tmp-Rest nach einem Prozessabbruch: Der Sender überträgt ihn
		// nicht (nur *.json), gelöscht wird er hier nicht — also muss er auffallen.
		const tmp = `${name(1, '2026-01-01T00:00:00.000Z')}.tmp`;
		const wurzel = await datenVerzeichnis({ posteingang: [tmp] });

		const bericht = await raeumeAuf({ datenVerzeichnis: wurzel, jetzt: JETZT, log: stumm });

		expect(await readdir(join(wurzel, 'posteingang'))).toEqual([tmp]);
		expect(bericht.uebersprungen).toEqual([`posteingang/${tmp}`]);
	});
});
