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
import {
	ABGEWIESEN_MONATE,
	IMPORTIERT_TAGE,
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
});
