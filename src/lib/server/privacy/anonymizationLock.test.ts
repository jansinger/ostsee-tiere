/**
 * Eine anonymisierte Meldung bekommt ihre Kontaktdaten nicht zurück.
 *
 * Die Sperre steht im UPDATE selbst, nicht in einer Vorabprüfung: Läuft der
 * Job zwischen dem Laden der Bearbeitungsmaske und dem Speichern, schriebe
 * ein Speichern sonst die gerade geleerte Adresse wieder hinein — und mit ihr
 * einen neuen Hash. Die Route weist solche Eingaben vorher ab
 * (`lockedFieldsIn`); das hier ist die Absicherung dahinter.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { guardAnonymizedColumns, lockedFieldsIn } from './anonymizationLock';

const render = (value: unknown): string => new PgDialect().sqlToQuery(value as SQL).sql;

describe('guardAnonymizedColumns', () => {
	it('lässt Kontaktdaten nur an nicht anonymisierten Zeilen ändern', () => {
		const guarded = guardAnonymizedColumns({ email: 'neu@example.invalid', species: 2 });

		expect(render(guarded.email)).toBe(
			'CASE WHEN "sichtungen"."anonymisiert_am" IS NULL THEN $1 ELSE "sichtungen"."email" END'
		);
		expect(guarded.species).toBe(2);
	});

	it('lässt den Namen bei Einwilligung auch an anonymisierten Zeilen ändern', () => {
		const guarded = guardAnonymizedColumns({ firstName: 'Erika' });

		expect(render(guarded.firstName)).toBe(
			'CASE WHEN "sichtungen"."anonymisiert_am" IS NULL OR "sichtungen"."namensnennung" = 1 ' +
				'THEN $1 ELSE "sichtungen"."vorname" END'
		);
	});

	it('lässt das Schiff bei Einwilligung auch an anonymisierten Zeilen ändern', () => {
		const guarded = guardAnonymizedColumns({ shipName: 'Möwe' });

		expect(render(guarded.shipName)).toContain('"sichtungen"."schiffnamensnennung" = 1');
	});

	it('sperrt Hash und Intern-Kennzeichen an anonymisierten Zeilen', () => {
		const guarded = guardAnonymizedColumns({ reporterHash: 'h', reporterInternal: true });

		expect(render(guarded.reporterHash)).toBe(
			'CASE WHEN "sichtungen"."anonymisiert_am" IS NULL THEN $1 ELSE "sichtungen"."melder_hash" END'
		);
		expect(render(guarded.reporterInternal)).toContain('"sichtungen"."melder_intern" END');
	});

	it('fasst fehlende Felder nicht an', () => {
		expect(guardAnonymizedColumns({ species: 1 })).toEqual({ species: 1 });
	});

	it('lässt Freitexte frei', () => {
		expect(guardAnonymizedColumns({ notes: 'x' })).toEqual({ notes: 'x' });
	});
});

describe('lockedFieldsIn', () => {
	const anonymized = { anonymizedAt: new Date(), nameConsent: 0, shipNameConsent: 1 };

	it('meldet nichts für nicht anonymisierte Zeilen', () => {
		expect(
			lockedFieldsIn({ email: 'a@example.invalid' }, { ...anonymized, anonymizedAt: null })
		).toEqual([]);
	});

	it('meldet geleerte Felder, die einen Wert bekommen sollen', () => {
		expect(
			lockedFieldsIn(
				{ email: 'a@example.invalid', firstName: 'Erika', shipName: 'Möwe', notes: 'frei' },
				anonymized
			)
		).toEqual(['email', 'firstName']);
	});

	it('hält eine Zeile ohne Angabe für nicht anonymisiert', () => {
		expect(
			lockedFieldsIn({ email: 'a@example.invalid' }, { ...anonymized, anonymizedAt: undefined })
		).toEqual([]);
	});

	it('nimmt leere und Leerraum-Werte hin', () => {
		expect(lockedFieldsIn({ email: '', firstName: '  ', lastName: null }, anonymized)).toEqual([]);
	});
});
