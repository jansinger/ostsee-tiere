import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fehlerText, importiere } from './import-legacy-inbox.js';

/**
 * `importiere()`'s default `notify` (sendeBenachrichtigung, see
 * import-legacy-inbox.js) reads the email config from the database via
 * ServerConfigService. Tests below that don't inject their own `notify` fall
 * through to that default — without this mock they'd reach a real database
 * connection, which CI does not have (a run against `.env.example` hangs
 * every such test until the 5s timeout). Same house pattern as
 * src/tests/contract/legacy.contract.test.ts.
 *
 * `enabled: false` makes sendeBenachrichtigung() return before it would ever
 * call EmailService, so this alone is enough to keep every test in this file
 * off the network — no EmailService mock is needed on top of it.
 */
vi.mock('#lib/services/configService.ts', () => ({
	ServerConfigService: {
		getEmailConfig: vi.fn().mockResolvedValue({ enabled: false, recipient: null })
	}
}));

let verzeichnis: string;

const repoWurzel = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Ruft den Import so auf, wie ihn ein Betreiber aufruft: über den
 * dokumentierten npm-Eintrag, in einem eigenen Prozess.
 *
 * Vitest setzt selbst `TEST=true` und `VITEST*` in die eigene Umgebung. Würden
 * diese Variablen an das Kind vererbt, liefe der SvelteKit-Vite-Guard auch dann
 * durch, wenn der npm-Eintrag sie gar nicht setzt — der Test wäre blind für
 * genau den Fehler, den er absichern soll.
 */
function rufeCliAuf(
	argumente: string[]
): Promise<{ code: number; ausgabe: string; fehler: string }> {
	const umgebung: NodeJS.ProcessEnv = { ...process.env };
	for (const schluessel of Object.keys(umgebung)) {
		if (schluessel === 'TEST' || schluessel.startsWith('VITEST')) delete umgebung[schluessel];
	}

	return new Promise((fertig) => {
		execFile(
			'npm',
			['run', '--silent', 'import:legacy-inbox', '--', ...argumente],
			{ cwd: repoWurzel, env: umgebung, timeout: 110_000 },
			(fehler, ausgabe, fehlerAusgabe) => {
				const code =
					fehler && typeof (fehler as NodeJS.ErrnoException).code === 'number'
						? Number((fehler as NodeJS.ErrnoException).code)
						: fehler
							? 1
							: 0;
				fertig({ code, ausgabe: String(ausgabe), fehler: String(fehlerAusgabe) });
			}
		);
	});
}

async function legeUmschlagAn(
	name: string,
	payload: Record<string, unknown> | null,
	extra: Record<string, unknown> = {}
) {
	await writeFile(
		path.join(verzeichnis, 'posteingang', name),
		JSON.stringify({
			empfangen_am: '2026-07-30T09:12:33.123Z',
			lfd_nr: 1,
			quelle: { ip: '1.2.3.4', user_agent: 'test', content_type: 'application/json' },
			roh: JSON.stringify(payload),
			abgeschnitten: false,
			payload,
			validierung: { gueltig: payload !== null, fehler: {} },
			...extra
		})
	);
}

beforeEach(async () => {
	verzeichnis = await mkdtemp(path.join(tmpdir(), 'import-'));
	await mkdir(path.join(verzeichnis, 'posteingang'), { recursive: true });
	await mkdir(path.join(verzeichnis, 'importiert'), { recursive: true });
});

afterEach(async () => {
	await rm(verzeichnis, { recursive: true, force: true });
});

describe('importiere', () => {
	it('reicht den Payload unverändert an das Mapping der Hauptanwendung', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 3, vorname: 'Jörg' });
		const gemappt: unknown[] = [];

		await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: (daten: unknown) => {
				gemappt.push(daten);
				return { totalCount: 3 };
			},
			speichere: async () => ({ id: 4711 })
		});

		expect(gemappt).toEqual([{ anzahl_gesamt: 3, vorname: 'Jörg' }]);
	});

	it('verschiebt Übernommenes nach importiert/', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });

		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => ({ id: 1 })
		});

		expect(ergebnis).toEqual({ uebernommen: 1, fehlgeschlagen: 0, moveFailure: null });
		expect(await readdir(path.join(verzeichnis, 'posteingang'))).toEqual([]);
		expect(await readdir(path.join(verzeichnis, 'importiert'))).toEqual(['000001__a.json']);
	});

	it('lässt Fehlgeschlagenes liegen, damit ein zweiter Lauf es erneut versucht', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });

		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => {
				throw new Error('Datenbank nicht erreichbar');
			}
		});

		expect(ergebnis).toEqual({ uebernommen: 0, fehlgeschlagen: 1, moveFailure: null });
		expect(await readdir(path.join(verzeichnis, 'posteingang'))).toEqual(['000001__a.json']);
	});

	it('bricht bei einem Fehler nicht ab, sondern nimmt den Rest mit', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });
		await legeUmschlagAn('000002__b.json', { anzahl_gesamt: 2 });

		let aufruf = 0;
		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => {
				aufruf++;
				if (aufruf === 1) throw new Error('einmaliger Fehler');
				return { id: 2 };
			}
		});

		expect(ergebnis).toEqual({ uebernommen: 1, fehlgeschlagen: 1, moveFailure: null });
	});

	it('legt bei einem zweiten Lauf nichts doppelt an', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });
		let aufrufe = 0;
		const optionen = {
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => {
				aufrufe++;
				return { id: 1 };
			}
		};

		await importiere(optionen);
		await importiere(optionen);

		expect(aufrufe).toBe(1);
	});

	it('übersetzt sonstige_auffaelligkeiten in die Schreibweise der Hauptanwendung', async () => {
		await legeUmschlagAn('000001__a.json', {
			anzahl_gesamt: 1,
			sonstige_auffaelligkeiten: 'Sehr ruhig'
		});
		let gemappt: Record<string, unknown> = {};

		await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: (daten: Record<string, unknown>) => {
				gemappt = daten;
				return { totalCount: 1 };
			},
			speichere: async () => ({ id: 1 })
		});

		expect(gemappt['sonstige_auffälligkeiten']).toBe('Sehr ruhig');
		expect(gemappt).not.toHaveProperty('sonstige_auffaelligkeiten');
	});

	it('rührt Umschläge ohne Payload nicht an', async () => {
		await legeUmschlagAn('000001__a.json', null);

		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => ({ id: 1 })
		});

		expect(ergebnis).toEqual({ uebernommen: 0, fehlgeschlagen: 1, moveFailure: null });
		expect(await readdir(path.join(verzeichnis, 'posteingang'))).toEqual(['000001__a.json']);
	});

	it('bricht den Lauf ab, wenn die Sichtung gespeichert wurde, das Verschieben nach importiert/ aber dauerhaft scheitert', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });
		const fehlerSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => ({ id: 4711 }),
			renameFile: async () => {
				throw new Error('EACCES: permission denied');
			},
			renameRetryDelayMs: 0
		});

		expect(ergebnis.uebernommen).toBe(0);
		expect(ergebnis.fehlgeschlagen).toBe(0);
		expect(ergebnis.moveFailure).toEqual({
			file: '000001__a.json',
			sightingId: 4711,
			message: expect.stringContaining('EACCES')
		});

		// Datei bleibt im Posteingang liegen — die Sichtung existiert bereits in
		// der DB, ein erneuter Lauf würde sie sonst doppelt anlegen.
		expect(await readdir(path.join(verzeichnis, 'posteingang'))).toEqual(['000001__a.json']);
		expect(await readdir(path.join(verzeichnis, 'importiert'))).toEqual([]);

		const fehlerZeile = fehlerSpy.mock.calls.map((call) => String(call[0])).join('\n');
		expect(fehlerZeile).toContain('000001__a.json');
		expect(fehlerZeile).toContain('4711');
		expect(fehlerZeile).toContain('importiert/');

		fehlerSpy.mockRestore();
	});

	it('verschiebt die Datei trotzdem, wenn das Verschieben erst beim Wiederholungsversuch klappt', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });

		let versuche = 0;
		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => ({ id: 42 }),
			renameFile: async (quelle: string, ziel: string) => {
				versuche++;
				if (versuche === 1) throw new Error('EBUSY: resource busy');
				await rename(quelle, ziel);
			},
			renameRetryDelayMs: 0
		});

		expect(versuche).toBe(2);
		expect(ergebnis).toEqual({ uebernommen: 1, fehlgeschlagen: 0, moveFailure: null });
		expect(await readdir(path.join(verzeichnis, 'posteingang'))).toEqual([]);
		expect(await readdir(path.join(verzeichnis, 'importiert'))).toEqual(['000001__a.json']);
	});

	it('verarbeitet bei dauerhaftem Verschiebefehler auf der ersten Datei die folgenden Dateien nicht mehr', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });
		await legeUmschlagAn('000002__b.json', { anzahl_gesamt: 2 });
		vi.spyOn(console, 'error').mockImplementation(() => {});

		let speicherAufrufe = 0;
		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => {
				speicherAufrufe++;
				return { id: speicherAufrufe };
			},
			renameFile: async () => {
				throw new Error('ENOSPC: no space left on device');
			},
			renameRetryDelayMs: 0
		});

		// Nur die erste Datei wurde überhaupt gespeichert — die zweite wurde
		// gar nicht erst angefasst, weil der Lauf vorher abgebrochen ist.
		expect(speicherAufrufe).toBe(1);
		expect(ergebnis.moveFailure?.file).toBe('000001__a.json');
		expect(await readdir(path.join(verzeichnis, 'posteingang'))).toEqual([
			'000001__a.json',
			'000002__b.json'
		]);

		vi.restoreAllMocks();
	});

	it('reicht den User-Agent aus dem Umschlag als Client-Kennung an speichere durch', async () => {
		// Sonst stünde bei jeder nachgespielten Meldung der Importer statt des
		// Clients, der sie tatsächlich geschickt hat.
		await legeUmschlagAn(
			'000001__a.json',
			{ anzahl_gesamt: 1 },
			{
				quelle: { ip: '1.2.3.4', user_agent: 'OstSeeTiere/8', content_type: 'application/json' }
			}
		);
		const speichere = vi.fn().mockResolvedValue({ id: 4711 });

		await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere
		});

		expect(speichere.mock.calls[0]?.[3]).toBe('OstSeeTiere/8');
	});

	it('setzt unbekannt, wenn der Umschlag keine Quelle trägt', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 }, { quelle: undefined });
		const speichere = vi.fn().mockResolvedValue({ id: 4711 });

		await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere
		});

		expect(speichere.mock.calls[0]?.[3]).toBe('unbekannt');
	});
});

/**
 * Der Entwurf (Abschnitt 12) begründet den fehlenden Mailversand des Dienstes
 * damit, dass die Hauptanwendung beim Import benachrichtigt. Totfunde sind für
 * das Meeresmuseum zeitkritisch — ohne diese Tests landete eine importierte
 * Sichtung in der Datenbank, ohne dass jemand davon erfuhr.
 */
describe('importiere — Benachrichtigung', () => {
	it('benachrichtigt über eine übernommene Sichtung', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });
		const benachrichtigt: number[] = [];

		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => ({ id: 4711 }),
			notify: async (id: number) => {
				benachrichtigt.push(id);
			}
		});

		expect(benachrichtigt).toEqual([4711]);
		expect(ergebnis.uebernommen).toBe(1);
	});

	it('wartet den Versand ab, bevor der Lauf endet', async () => {
		// Ein CLI-Prozess endet mit der Ereignisschleife. Ein nur angestoßener
		// Versand würde dabei abgeschnitten — anders als in der Route, die den
		// HTTP-Client nicht warten lassen darf.
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });
		let abgeschlossen = false;

		await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => ({ id: 1 }),
			notify: async () => {
				await new Promise((weiter) => setTimeout(weiter, 20));
				abgeschlossen = true;
			}
		});

		expect(abgeschlossen).toBe(true);
	});

	it('lässt einen fehlgeschlagenen Versand den Import nicht aufhalten', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });
		await legeUmschlagAn('000002__b.json', { anzahl_gesamt: 2 });
		const fehlerSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => ({ id: 7 }),
			notify: async () => {
				throw new Error('SMTP nicht erreichbar');
			}
		});

		// Die Sichtung ist gespeichert, das Verschieben bleibt richtig.
		expect(ergebnis).toEqual({ uebernommen: 2, fehlgeschlagen: 0, moveFailure: null });
		expect(await readdir(path.join(verzeichnis, 'posteingang'))).toEqual([]);
		expect(await readdir(path.join(verzeichnis, 'importiert'))).toEqual([
			'000001__a.json',
			'000002__b.json'
		]);
		expect(fehlerSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain(
			'SMTP nicht erreichbar'
		);

		fehlerSpy.mockRestore();
	});

	it('benachrichtigt nicht über eine Sichtung, die nicht gespeichert werden konnte', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });
		const benachrichtigt: number[] = [];
		vi.spyOn(console, 'error').mockImplementation(() => {});

		await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => {
				throw new Error('Datenbank nicht erreichbar');
			},
			notify: async (id: number) => {
				benachrichtigt.push(id);
			}
		});

		expect(benachrichtigt).toEqual([]);
		vi.restoreAllMocks();
	});
});

/**
 * Die Tests oben rufen `importiere()` direkt auf und sehen deshalb nichts von
 * dem, was zwischen Kommandozeile und Funktion liegt: dem npm-Eintrag und dem
 * Einstiegspunkt der Tool-Datei. Genau dort lag der Fehler, der den
 * dokumentierten Befehl unbenutzbar machte — diese Tests schließen die Lücke,
 * indem sie den Befehl als eigenen Prozess starten.
 */
describe('Kommandozeilen-Aufruf (npm run import:legacy-inbox)', () => {
	it('nennt den Aufruf und endet mit einem Fehlercode, wenn das Verzeichnis fehlt', async () => {
		const ergebnis = await rufeCliAuf([]);

		expect(ergebnis.code).toBe(1);
		expect(`${ergebnis.fehler}${ergebnis.ausgabe}`).toContain('Aufruf:');
	}, 120_000);

	it('meldet ein nicht vorhandenes Verzeichnis verständlich statt still zu enden', async () => {
		const fehlend = path.join(verzeichnis, 'gibt-es-nicht');
		const ergebnis = await rufeCliAuf([fehlend]);

		expect(ergebnis.code).not.toBe(0);
		expect(`${ergebnis.fehler}${ergebnis.ausgabe}`).toContain(fehlend);
	}, 120_000);

	it('meldet für ein leeres Datenverzeichnis einen leeren Lauf und endet mit 0', async () => {
		const ergebnis = await rufeCliAuf([verzeichnis]);

		expect(ergebnis.ausgabe).toContain('0 übernommen, 0 offen.');
		expect(ergebnis.code).toBe(0);
	}, 120_000);
});

describe('fehlerText', () => {
	it('nimmt die Meldung eines echten Fehlers', () => {
		expect(fehlerText(new Error('Platte voll'))).toBe('Platte voll');
	});

	it('wirft nicht bei null oder undefined', () => {
		expect(fehlerText(null)).toBe('null');
		expect(fehlerText(undefined)).toBe('undefined');
	});

	it('reicht einen geworfenen String durch', () => {
		expect(fehlerText('etwas ging schief')).toBe('etwas ging schief');
	});

	it('kommt mit einem Objekt zurecht, dessen toString wirft', () => {
		const bosartig = {
			toString() {
				throw new Error('auch das noch');
			}
		};
		expect(fehlerText(bosartig)).toBe('Unbekannter Fehler');
	});
});

describe('importiere — nicht-Error-Würfe', () => {
	it('hält den Lauf nicht auf, wenn speichere() null wirft', async () => {
		await legeUmschlagAn('000001__a.json', { anzahl_gesamt: 1 });
		await legeUmschlagAn('000002__b.json', { anzahl_gesamt: 2 });

		let aufruf = 0;
		const ergebnis = await importiere({
			datenVerzeichnis: verzeichnis,
			mappe: () => ({ totalCount: 1 }),
			speichere: async () => {
				aufruf++;
				if (aufruf === 1) throw null;
				return { id: 2 };
			},
			notify: async () => {}
		});

		expect(ergebnis.uebernommen).toBe(1);
		expect(ergebnis.fehlgeschlagen).toBe(1);
	});
});
