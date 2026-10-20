import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
// Kein `@ts-expect-error` nötig: `allowJs`/`checkJs` sind projektweit aktiv,
// daher erzeugt der Import selbst keinen Fehler (anders als bei reinem
// `allowJs: false`, wo hier TS7016 stünde). tsc zieht die importierten
// legacy-inbox-Module stattdessen in die Prüfung hinein — die betroffenen
// Dateien tragen deshalb seit dieser Aufgabe ein eigenes `@ts-nocheck`
// (reines JavaScript ohne Typdeklarationen, siehe CLAUDE.md).
import { erstelleServer } from '../../../legacy-inbox/src/server.js';
import { erstelleStore } from '../../../legacy-inbox/src/store.js';
import { erstelleRateLimit } from '../../../legacy-inbox/src/rateLimit.js';
import { validiere } from '../../../legacy-inbox/src/validate.js';
import { validateLegacySightingWithYup } from '../../lib/legacy-api/yup-validation.js';
import type { LegacySightingRequest } from '../../lib/legacy-api/types.js';
import { GET as antwortenRoute } from '../../routes/rest_sichtungen/antworten.json/+server';
import { GET as inBalticRoute } from '../../routes/rest_sichtungen/inBaltic.json/+server';

// Same convention as every other file in src/tests/contract/: silence the
// main app's pino logger so it doesn't spam the terminal on every invocation
// of the real GET handlers. Does not affect the comparisons below — those
// only touch response bodies/status codes, never the logger.
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

let server: Server;
let basis: string;
let verzeichnis: string;

beforeAll(async () => {
	verzeichnis = await mkdtemp(path.join(tmpdir(), 'inbox-contract-'));
	const store = await erstelleStore({ datenVerzeichnis: verzeichnis });
	await store.initialisiere();

	server = erstelleServer({
		konfiguration: { maxBodyBytes: 262144 },
		store,
		rateLimit: erstelleRateLimit({ proIpProStunde: 10000, globalProStunde: 10000 })
	});
	await new Promise<void>((fertig) => server.listen(0, () => fertig()));
	const adresse = server.address();
	basis = `http://127.0.0.1:${typeof adresse === 'object' && adresse ? adresse.port : 0}`;
});

afterAll(async () => {
	await new Promise<void>((fertig) => server.close(() => fertig()));
	await rm(verzeichnis, { recursive: true, force: true });
});

function hauptanwendung(pfad: string) {
	return {
		url: new URL(`https://localhost${pfad}`),
		getClientAddress: () => '127.0.0.1',
		request: new Request(`https://localhost${pfad}`)
	} as never;
}

describe('Posteingang gegen Hauptanwendung — antworten.json', () => {
	it('liefert dieselbe Enum-Tabelle', async () => {
		const ausApp = await (
			await antwortenRoute(hauptanwendung('/rest_sichtungen/antworten.json'))
		).json();
		const ausPosteingang = await (await fetch(`${basis}/rest_sichtungen/antworten.json`)).json();

		expect(ausPosteingang).toEqual(ausApp);
	});
});

describe('Posteingang gegen Hauptanwendung — inBaltic.json', () => {
	const punkte = [
		'53,10',
		'54.5,10.5',
		'54.646667,11.333333',
		'56.093587,10.512543',
		'66.5,20',
		'40,-70'
	];

	for (const location of punkte) {
		it(`stimmt für location=${location} überein`, async () => {
			const pfad = `/rest_sichtungen/inBaltic.json?location=${location}`;
			const ausApp = await (await inBalticRoute(hauptanwendung(pfad))).json();
			const ausPosteingang = await (await fetch(`${basis}${pfad}`)).json();

			expect(ausPosteingang).toEqual(ausApp);
		});
	}

	it('stimmt auch bei Fehleingaben überein', async () => {
		for (const abfrage of ['', 'location=53', 'location=abc,def', 'location=95,10']) {
			const pfad = `/rest_sichtungen/inBaltic.json?${abfrage}`;
			const appAntwort = await inBalticRoute(hauptanwendung(pfad));
			const posteingangAntwort = await fetch(`${basis}${pfad}`);

			expect(posteingangAntwort.status).toBe(appAntwort.status);
			expect(await posteingangAntwort.json()).toEqual(await appAntwort.json());
		}
	});
});

describe('Posteingang gegen den Vertrag — POST /rest_sichtungen', () => {
	// Der Erfolgsfall ist in beiden Implementierungen identisch und wird
	// direkt gegen das PDF geprüft.
	it('antwortet bei Erfolg exakt wie im PDF', async () => {
		const antwort = await fetch(`${basis}/rest_sichtungen`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				sichtungsdatum: '2026-07-30 14:50',
				vorname: 'Jörg',
				name: 'Schneider',
				email: 'joerg@example.de',
				anzahl_gesamt: 1
			})
		});

		expect(antwort.status).toBe(201);
		expect(antwort.headers.get('location')).toMatch(/^\/rest_sichtungen\/view\/\d+\.json$/);
		expect(await antwort.json()).toEqual({ message: 'Saved' });
	});

	/**
	 * Bewusste, dokumentierte Abweichung von der Hauptanwendung:
	 * Der Posteingang antwortet flach, wie das Original-PDF
	 * (docs/archive/Sichtungsdb-Web-Schnittstelle.pdf). Die Hauptanwendung
	 * erzeugt in src/lib/legacy-api/error-messages.ts eine geschachtelte
	 * Struktur — siehe Entwurf, Abschnitt 2.1.
	 *
	 * Ist die parallele Korrektur der Hauptanwendung eingeflossen, ist dieser
	 * Test um einen Vergleich mit ihrer Antwort zu erweitern.
	 */
	it('antwortet bei Validierungsfehlern flach, wie das PDF', async () => {
		const antwort = await fetch(`${basis}/rest_sichtungen`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ vorname: 'Jörg' })
		});

		expect(antwort.status).toBe(400);
		const koerper = await antwort.json();

		expect(typeof koerper.message).toBe('string');
		expect(koerper.message).toBe('Validation failed.');
		expect(koerper.errors.anzahl_gesamt).toEqual(['Dieses Feld kann nicht leer gelassen werden.']);
	});
});

/**
 * Der eigentliche Vertragstest für POST: dieselben Payloads durch beide
 * Validierungen, und der Posteingang darf für keinen davon einen Fehler
 * melden, den die Hauptanwendung nicht auch meldet.
 *
 * Die Richtung ist Absicht. Nachsichtiger zu sein ist eine dokumentierte,
 * akzeptierte Abweichung (Entwurf, Abschnitt 2.2): Der Dienst nimmt
 * `application/x-www-form-urlencoded` entgegen, wo ein leer gelassenes Feld als
 * leerer String ankommt, und wendet die NaN-Transformation deshalb auf jedes
 * Zahlenfeld an statt nur auf drei. Strenger zu sein ist dagegen der Defekt,
 * den es zu verhindern gilt — eine zu Unrecht abgewiesene Sichtung erreicht
 * einen echten Menschen als `400`.
 *
 * Beide Validierungen sind reine In-Process-Funktionen; der Vergleich braucht
 * weder HTTP noch Datenbank.
 */
describe('Posteingang gegen Hauptanwendung — Validierung von POST /rest_sichtungen', () => {
	const gueltig = {
		sichtungsdatum: '2026-07-30 14:50',
		vorname: 'Jörg',
		name: 'Schneider',
		email: 'joerg@example.de',
		anzahl_gesamt: 1
	};

	const ohne = (feld: string) => {
		const kopie: Record<string, unknown> = { ...gueltig };
		delete kopie[feld];
		return kopie;
	};

	const faelle: Array<{ name: string; payload: unknown }> = [
		{ name: 'vollständige, gültige Sichtung', payload: gueltig },

		// Jedes Pflichtfeld einzeln weggelassen
		{ name: 'ohne sichtungsdatum', payload: ohne('sichtungsdatum') },
		{ name: 'ohne vorname', payload: ohne('vorname') },
		{ name: 'ohne name', payload: ohne('name') },
		{ name: 'ohne email', payload: ohne('email') },
		{ name: 'ohne anzahl_gesamt', payload: ohne('anzahl_gesamt') },
		{ name: 'leerer Payload', payload: {} },

		// Datumsformat
		{
			name: 'Datum im falschen Format',
			payload: { ...gueltig, sichtungsdatum: '30.07.2026 14:50' }
		},
		{ name: 'Datum mit Sekunden', payload: { ...gueltig, sichtungsdatum: '2026-07-30 14:50:12' } },
		{ name: 'Datum als Unsinn', payload: { ...gueltig, sichtungsdatum: 'morgen' } },
		{ name: 'Datum leer', payload: { ...gueltig, sichtungsdatum: '' } },

		// Längen und E-Mail
		{ name: 'zu langer Vorname', payload: { ...gueltig, vorname: 'J'.repeat(65) } },
		{ name: 'zu langer Name', payload: { ...gueltig, name: 'S'.repeat(65) } },
		{ name: 'zu lange E-Mail', payload: { ...gueltig, email: `${'a'.repeat(60)}@example.de` } },
		{ name: 'E-Mail ohne @', payload: { ...gueltig, email: 'joerg.example.de' } },

		// Koordinaten
		{
			name: 'Koordinaten im gültigen Bereich',
			payload: { ...gueltig, gps_breite: 54.5, gps_laenge: 13.5 }
		},
		{ name: 'Breitengrad zu groß', payload: { ...gueltig, gps_breite: 95, gps_laenge: 13.5 } },
		{ name: 'Breitengrad zu klein', payload: { ...gueltig, gps_breite: -95, gps_laenge: 13.5 } },
		{ name: 'Längengrad zu groß', payload: { ...gueltig, gps_breite: 54.5, gps_laenge: 181 } },
		{ name: 'Längengrad zu klein', payload: { ...gueltig, gps_breite: 54.5, gps_laenge: -181 } },
		{ name: 'Koordinaten als Text', payload: { ...gueltig, gps_breite: 'abc', gps_laenge: 'def' } },

		// anzahl_gesamt
		{ name: 'anzahl_gesamt 0 (Totfund, gültig)', payload: { ...gueltig, anzahl_gesamt: 0 } },
		{ name: 'anzahl_gesamt negativ', payload: { ...gueltig, anzahl_gesamt: -1 } },
		{ name: 'anzahl_gesamt gebrochen', payload: { ...gueltig, anzahl_gesamt: 1.5 } },
		{ name: 'anzahl_gesamt als Zahlenstring', payload: { ...gueltig, anzahl_gesamt: '3' } },
		{ name: 'anzahl_gesamt leer', payload: { ...gueltig, anzahl_gesamt: '' } },

		// Leere Strings in optionalen Zahlenfeldern — der Alltag eines
		// urlencodierten Formulars mit leer gelassenen Auswahlfeldern.
		{
			name: 'leere Strings in optionalen Zahlenfeldern',
			payload: {
				...gueltig,
				anzahl_jung: '',
				vonwo: '',
				entfernung: '',
				anzahl_schiffe: '',
				verteilung: '',
				verhalten: '',
				seegang: '',
				sichtweite: '',
				bootsantrieb: '',
				namensnennung: '',
				tierart: '',
				totfund: '',
				totfund_zustand: '',
				totfund_geschlecht: '',
				totfund_groesse: '',
				totfund_telefon: '',
				aufnahmeHochladen: '',
				schiffnamensnennung: '',
				eingangskanal: ''
			}
		},
		{
			name: 'gefüllte optionale Zahlenfelder',
			payload: { ...gueltig, tierart: 1, totfund: 1, seegang: 3, bootsantrieb: 5 }
		},

		// Beide Schreibweisen des Freitextfelds
		{
			name: 'sonstige_auffaelligkeiten mit ae',
			payload: { ...gueltig, sonstige_auffaelligkeiten: 'Sehr ruhig' }
		},
		{
			name: 'sonstige_auffälligkeiten mit Umlaut',
			payload: { ...gueltig, sonstige_auffälligkeiten: 'Sehr ruhig' }
		},
		{
			name: 'beide Schreibweisen gleichzeitig',
			payload: { ...gueltig, sonstige_auffaelligkeiten: 'A', sonstige_auffälligkeiten: 'B' }
		},

		// Unbekannte Felder — keine der beiden Seiten benutzt noUnknown()
		{ name: 'unbekanntes Feld', payload: { ...gueltig, voellig_unbekannt: 'x', 42: 'y' } },
		{
			name: 'datenschutzEinverstaendnis (nur in der Hauptanwendung deklariert)',
			payload: { ...gueltig, datenschutzEinverstaendnis: 1 }
		},

		// Alles gleichzeitig kaputt
		{
			name: 'mehrere Fehler auf einmal',
			payload: { sichtungsdatum: 'x', vorname: 'V'.repeat(70), email: 'kaputt', gps_breite: 200 }
		}
	];

	for (const { name, payload } of faelle) {
		it(`meldet für "${name}" keinen Fehler, den die Hauptanwendung nicht auch meldet`, async () => {
			const ausPosteingang = await validiere(payload);
			const ausApp = await validateLegacySightingWithYup(payload as LegacySightingRequest);

			// `validiere` ist reines JavaScript ohne Typdeklaration; tsc leitet für
			// `fehler` eine Vereinigung ohne Index-Signatur ab. Die Form ist
			// dieselbe wie auf der Seite der Hauptanwendung (Feldname → Meldungen).
			const fehlerDesDienstes = ausPosteingang.fehler as Record<string, string[]>;

			const strengerBei = Object.keys(fehlerDesDienstes).filter(
				(schluessel) => !(schluessel in ausApp.errors)
			);

			expect(
				strengerBei,
				`Der Posteingang weist "${name}" wegen ${strengerBei.join(', ')} ab, die ` +
					'Hauptanwendung nicht. Strenger zu sein ist der Defekt — der Dienst ist zu ' +
					'korrigieren, nicht dieser Test.'
			).toEqual([]);

			// Wo beide bemängeln, muss es aus demselben Grund geschehen: Die
			// deutschen Meldungen sind Teil des Vertrags und wurden wortgleich
			// portiert.
			for (const [schluessel, meldungen] of Object.entries(fehlerDesDienstes)) {
				expect([...meldungen].sort()).toEqual([...(ausApp.errors[schluessel] ?? [])].sort());
			}

			// Ein gültiger Payload muss auch für den Posteingang gültig sein,
			// wenn die Hauptanwendung ihn durchlässt.
			if (ausApp.isValid) expect(ausPosteingang.gueltig).toBe(true);
		});
	}
});
