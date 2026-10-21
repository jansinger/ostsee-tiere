/**
 * @fileoverview Die Freigabe-Invariante in ihrer JavaScript-Schreibweise
 *
 * `approvedOnly()` beantwortet „ist diese Sichtung freigegeben?" in SQL. Drei
 * Endpunkte beantworten dieselbe Frage aber **nach** dem Laden in JavaScript,
 * weil sie die Zeile ohnehin schon geladen haben:
 *
 * - `GET /uploads/[...path]`
 * - `GET /api/media/[...path]`
 * - `PATCH /api/sightings/[id]/verify` (Vorzustand im Audit-Log)
 *
 * Jeder trug dafür seine eigene Inline-Prüfung (`!!…approvedAt`). Damit stand
 * dieselbe Regel in zwei Sprachen an vier Stellen — und die beiden
 * Medien-Endpunkte sind diejenigen, die Dateien **ohne Anmeldung** ausliefern.
 * Eine versehentlich gelockerte Prüfung gäbe dort nicht freigegebene Fotos
 * öffentlich frei.
 *
 * Diese Tests fixieren zwei Dinge:
 * 1. `isSightingApproved()` liefert für **jeden** möglichen Wert von
 *    `approvedAt` dasselbe wie das abgelöste `!!approvedAt` — der Umbau ist
 *    damit belegt verhaltensgleich, nicht bloß behauptet.
 * 2. Alle drei Endpunkte beziehen die Regel aus dem gemeinsamen Helper und
 *    tragen keine der bekannten Inline-Schreibweisen mehr.
 */

import { PgDialect } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	approvedOnly,
	isSightingApproved,
	isSightingRejected,
	openOnly,
	rejectedOnly
} from './approvalFilter';

const dialect = new PgDialect();

/**
 * Jeder Wert, den `approvedAt` annehmen kann.
 *
 * Der Typ ist `Date | null` (Drizzle `timestamp(..., { mode: 'date' })`);
 * `undefined` kommt hinzu, sobald eine Projektion die Spalte nicht auswählt.
 * `new Date(0)` und das ungültige Datum stehen hier, weil sie die naheliegende
 * Falle sind: Wer einen Zeitstempel als Zahl denkt, erwartet bei der Epoche
 * `false` — ein `Date`-Objekt ist aber immer truthy, und genau das tat die
 * abgelöste Inline-Prüfung auch.
 */
const moeglicheWerte: Array<{ label: string; value: Date | null | undefined }> = [
	{ label: 'Freigabezeitpunkt', value: new Date('2026-01-01T00:00:00Z') },
	{ label: 'Unix-Epoche (0 ms)', value: new Date(0) },
	{ label: 'ungültiges Datum', value: new Date('kein Datum') },
	{ label: 'null (nicht freigegeben)', value: null },
	{ label: 'undefined (Spalte nicht selektiert)', value: undefined }
];

describe('isSightingApproved — Freigabeprüfung in JavaScript', () => {
	describe('Verhaltensgleichheit mit der abgelösten Inline-Prüfung', () => {
		for (const { label, value } of moeglicheWerte) {
			it(`liefert für ${label} dasselbe wie !!approvedAt`, () => {
				expect(isSightingApproved({ approvedAt: value })).toBe(!!value);
			});
		}
	});

	describe('Grundmenge', () => {
		it('wertet dieselbe Regel aus wie approvedOnly() in SQL', () => {
			// Der SQL-Zweig prüft `freigegeben_am IS NOT NULL`. Wenn der
			// JS-Zweig etwas anderes prüfte, lieferten Karte und Medienabruf
			// unterschiedliche Grundmengen.
			expect(dialect.sqlToQuery(approvedOnly()).sql.toLowerCase()).toContain(
				'"freigegeben_am" is not null'
			);
			expect(isSightingApproved({ approvedAt: new Date() })).toBe(true);
			expect(isSightingApproved({ approvedAt: null })).toBe(false);
		});

		it('verweigert die Freigabe bei einem Wert außerhalb des Typs', () => {
			// Das Argument für die Truthy-Prüfung statt `!= null` (siehe JSDoc am
			// Helper) trägt nur außerhalb des deklarierten Typs — innerhalb sind
			// beide Schreibweisen identisch, wie die Tabelle oben zeigt. Käme über
			// einen ungetypten Pfad ein Leerstring oder eine 0 an, gewährte
			// `!= null` den Zugriff. Hier wird die verweigernde Richtung gepinnt.
			const typfremd = ['', 0] as unknown as Date[];
			for (const wert of typfremd) {
				expect(isSightingApproved({ approvedAt: wert }), String(wert)).toBe(false);
			}
		});
	});
});

/**
 * Die Endpunkte, die den Freigabestatus in JavaScript auswerten.
 *
 * Gelesen wird der Quelltext, nicht das Modul: Die Routen ziehen beim Import
 * Datenbank-, Storage- und Rate-Limit-Module nach, die hier alle gemockt werden
 * müssten — der Test prüft aber nur, welche Schreibweise der Regel im Quelltext
 * steht. Was die Routen zur Laufzeit tun, decken ihre eigenen Tests ab
 * (`uploads.test.ts`, `uploadsCache.test.ts`, `mediaCacheControl.test.ts`,
 * `verify.test.ts`, `verify.contract.test.ts`).
 */
const jsAuswertendeRouten = [
	{
		name: 'GET /uploads/[...path]',
		path: '../../../routes/uploads/[...path]/+server.ts'
	},
	{
		name: 'GET /api/media/[...path]',
		path: '../../../routes/api/media/[...path]/+server.ts'
	},
	{
		name: 'PATCH /api/sightings/[id]/verify',
		path: '../../../routes/api/sightings/[id]/verify/+server.ts'
	}
];

/**
 * Bekannte Schreibweisen einer eigenen Freigabeprüfung.
 *
 * Bewusst eine Aufzählung konkreter Muster und **kein** Beweis: Ein
 * `if (row.approvedAt)` ohne weitere Operatoren ließe sich von einer legitimen
 * Verwendung des Werts (z. B. `approvedAt ?? null` in der GET-Antwort desselben
 * Endpunkts) nicht unterscheiden, ohne den Quelltext zu parsen. Der Guard fängt
 * die Formen, die beim Zurückbauen tatsächlich entstehen — mehr behauptet er
 * nicht.
 */
const eigeneFreigabepruefungen = [
	{ form: '!!row.approvedAt', muster: /!![^;\n]*approvedAt/ },
	{ form: 'Boolean(row.approvedAt)', muster: /Boolean\([^)]*approvedAt/ },
	{ form: 'row.approvedAt !== null / != null', muster: /approvedAt\s*[!=]==?\s*null/ }
];

/** Liest die Route und meldet einen verschobenen Pfad als solchen. */
function leseRoutenQuelle(name: string, path: string): string {
	const absolut = fileURLToPath(new URL(path, import.meta.url));
	try {
		return readFileSync(absolut, 'utf-8');
	} catch {
		throw new Error(
			`Quelltext von ${name} nicht lesbar (${absolut}). Wurde die Route verschoben? ` +
				'Dann den Pfad in jsAuswertendeRouten mitziehen — nicht den Eintrag entfernen.'
		);
	}
}

describe('Endpunkte mit JavaScript-seitiger Freigabeprüfung', () => {
	for (const { name, path } of jsAuswertendeRouten) {
		describe(name, () => {
			const source = leseRoutenQuelle(name, path);

			it('bezieht die Regel aus approvalFilter', () => {
				expect(source).toContain('isSightingApproved');
				expect(source).toMatch(/from '[$#]lib\/server\/db\/approvalFilter(?:\.(?:js|ts))?'/);
			});

			for (const { form, muster } of eigeneFreigabepruefungen) {
				it(`prüft den Freigabestatus nicht per ${form}`, () => {
					expect(source).not.toMatch(muster);
				});
			}
		});
	}
});

describe('Triage „abgelehnt" — openOnly / rejectedOnly / isSightingRejected', () => {
	const dialect = new PgDialect();

	it('openOnly verlangt beide Spalten als NULL (offen = weder freigegeben noch abgelehnt)', () => {
		const sql = dialect.sqlToQuery(openOnly()).sql;
		expect(sql).toContain('"freigegeben_am" is null');
		expect(sql).toContain('"abgelehnt_am" is null');
		expect(sql).toContain(' and ');
	});

	it('rejectedOnly filtert auf abgelehnt_am IS NOT NULL', () => {
		const sql = dialect.sqlToQuery(rejectedOnly()).sql;
		expect(sql).toContain('"abgelehnt_am" is not null');
		expect(sql).not.toContain('freigegeben_am');
	});

	it('isSightingRejected spiegelt die Truthy-Semantik von isSightingApproved', () => {
		expect(isSightingRejected({ rejectedAt: new Date() })).toBe(true);
		expect(isSightingRejected({ rejectedAt: null })).toBe(false);
		expect(isSightingRejected({ rejectedAt: undefined })).toBe(false);
	});
});
