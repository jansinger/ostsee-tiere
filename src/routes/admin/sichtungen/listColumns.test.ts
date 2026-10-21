/**
 * @fileoverview Die Spaltenauswahl des Sichtungs-Loaders ist vollständig — und
 * nicht mehr als vollständig.
 *
 * **Der Befund (20).** `load()` las mit `db.select()` die ganze Zeile und gab
 * sie bis zu 100-mal ins ausgelieferte HTML: Telefonnummer, Klarname,
 * Anschrift, interne Kommentare und alle acht Einwilligungs-Nachweisspalten.
 * Angezeigt werden 18 Felder.
 *
 * **Warum dieser Test nötig ist und der Typcheck nicht reicht.** Dass jede
 * konfigurierbare Spalte einen Eintrag in `COLUMN_FIELDS` hat, erzwingt schon
 * der `satisfies Record<keyof ColumnVisibility, …>`. Was der Typ **nicht**
 * sieht, ist der Inhalt: `getBalticSeaStatus()` nimmt seine vier Felder alle
 * als optional entgegen — eine Zeile ohne `latitude` typprüft anstandslos und
 * meldet zur Laufzeit stumm „ohne Position". Genau diese Klasse Fehler fällt
 * erst auf, wenn ein Bearbeiter eine abgeschaltete Spalte einschaltet.
 */

import { describe, expect, it } from 'vitest';
import { sightings } from '#lib/server/db/schema.ts';
import { AVAILABLE_COLUMNS, DEFAULT_COLUMN_VISIBILITY } from './columns';
import {
	COLUMN_FIELDS,
	FIXED_FIELDS,
	SIGHTING_LIST_COLUMNS,
	SIGHTING_LIST_FIELDS
} from './listColumns';

/**
 * Spalten, die keine Ansicht dieser Seite zeigt und die deshalb auch nicht
 * ausgeliefert gehören. Bewusst eine Aufzählung und keine Heuristik über
 * Spaltennamen: Eine Heuristik („alles mit `Consent` im Namen") sähe nach
 * einer Regel aus, wäre aber nur eine Schreibkonvention — `phone` und
 * `internalComment` fielen durch.
 */
const NICHT_AUSLIEFERN = [
	'phone',
	'fax',
	'firstName',
	'lastName',
	'street',
	'zipCode',
	'city',
	'internalComment',
	'privacyConsentAt',
	'privacyConsentVersion',
	'nameConsentAt',
	'nameConsentVersion',
	'shipNameConsentAt',
	'shipNameConsentVersion',
	'mediaConsentAt',
	'mediaConsentVersion'
] as const;

/*
 * Der Typ-Wächter, und er läuft in `tsc`, nicht hier.
 *
 * `SIGHTING_LIST_FIELDS` war zwischenzeitlich mit `readonly SightingField[]`
 * annotiert — das weitet die Literal-Union auf *alle* Tabellenfelder, und
 * `SIGHTING_LIST_COLUMNS` war damit als die ganze Zeile typisiert. Der Loader
 * lieferte Datensätze, deren Typ weiterhin `phone` führte, obwohl das Feld zur
 * Laufzeit `undefined` ist. Die Laufzeit-Erwartungen unten sahen das nicht: Sie
 * prüfen die Konstante, nicht was Konsumenten davon zu sehen bekommen.
 *
 * `@ts-expect-error` dreht die Richtung um — verschwindet der Fehler, weil die
 * Union wieder aufgeweitet wurde, bricht `npm run type-check`.
 */
// @ts-expect-error `phone` steht nicht im Select und darf im Typ nicht auftauchen.
const _keinTelefon: keyof typeof SIGHTING_LIST_COLUMNS = 'phone';
// @ts-expect-error dasselbe für die Einwilligungs-Nachweisspalten.
const _keinNachweis: keyof typeof SIGHTING_LIST_COLUMNS = 'mediaConsentAt';
void _keinTelefon;
void _keinNachweis;

describe('Sichtungs-Loader — Spaltenauswahl', () => {
	it('kennt jede konfigurierbare Spalte des Dropdowns', () => {
		const zugeordnet = Object.keys(COLUMN_FIELDS);
		expect(zugeordnet.sort()).toEqual(AVAILABLE_COLUMNS.map((spalte) => spalte.key).sort());
	});

	it('deckt jede Spalte des Default-Zustands ab', () => {
		// `AVAILABLE_COLUMNS` (Dropdown) und `DEFAULT_COLUMN_VISIBILITY`
		// (Startzustand) sind zwei Listen derselben Menge — driften sie
		// auseinander, gibt es eine Spalte, die niemand mehr einschalten kann.
		expect(Object.keys(COLUMN_FIELDS).sort()).toEqual(
			Object.keys(DEFAULT_COLUMN_VISIBILITY).sort()
		);
	});

	it('liefert jedes Feld, das eine Spalte oder die Kartenansicht braucht', () => {
		const gebraucht = new Set<string>([...FIXED_FIELDS, ...Object.values(COLUMN_FIELDS).flat()]);
		const fehlend = [...gebraucht].filter((feld) => !SIGHTING_LIST_FIELDS.includes(feld as never));
		expect(fehlend).toEqual([]);
	});

	it('nennt nur Felder, die es in der Tabelle wirklich gibt', () => {
		const unbekannt = SIGHTING_LIST_FIELDS.filter((feld) => !(feld in sightings));
		expect(unbekannt).toEqual([]);
	});

	it('übergibt dieselben Felder an db.select()', () => {
		expect(Object.keys(SIGHTING_LIST_COLUMNS).sort()).toEqual([...SIGHTING_LIST_FIELDS].sort());
	});

	it('liefert keine Spalte aus, die keine Ansicht der Seite zeigt', () => {
		const ausgeliefert = NICHT_AUSLIEFERN.filter((feld) =>
			SIGHTING_LIST_FIELDS.includes(feld as never)
		);
		expect(ausgeliefert).toEqual([]);
	});

	it('bleibt deutlich unter der vollen Zeile', () => {
		// Kein Selbstzweck: Die Zahl ist der Beleg dafür, dass hier überhaupt
		// eine Auswahl steht. Wer versehentlich `db.select()` zurückbaut oder die
		// Liste um „sicherheitshalber alles" ergänzt, landet wieder bei ~70.
		const alleFelder = Object.keys(sightings).length;
		expect(SIGHTING_LIST_FIELDS.length).toBeLessThan(alleFelder / 2);
	});
});
