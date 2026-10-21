import { DistanceEnum } from '#lib/report/formOptions/distance.ts';
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import { describe, expect, it } from 'vitest';
import * as yup from 'yup';
import { getAdminSightingSchema, getSightingSchema } from './sightingSchema';

// Testet weiterhin den deutschen Ist-Zustand (Default-Locale) — unveraendert
// gegenueber der frueheren Modulkonstante.
const sightingSchema = getSightingSchema();
const adminSightingSchema = getAdminSightingSchema();

/**
 * Bestandssichtungen müssen im Admin bearbeitbar bleiben.
 *
 * `adminSightingSchema` existiert genau dafür: Das öffentliche Formular darf
 * strenger sein als der Altbestand, sonst kann ein Admin eine 13 Jahre alte
 * Meldung nicht mehr korrigieren — auch dann nicht, wenn er an einem ganz
 * anderen Feld etwas richtigstellt. Bisher deckte es nur die Anzahlen ab.
 *
 * Die Werte hier sind keine Konstruktion: `entfernung = 0` tragen 282 Zeilen,
 * `vonwo = 0` ohne Freitext weitere 1.120 (Messung 2026-08-02, 19.881 Zeilen).
 */

/** Feldwerte, wie sie `buildAdminEditInitialValues` aus einer Bestandszeile baut. */
function legacyFormValues(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		species: 1,
		totalCount: 2,
		juvenileCount: 0,
		sightingDate: '2024-06-01',
		sightingTime: '10:30',
		hasPosition: true,
		latitude: 54.123456,
		longitude: 13.654321,
		sightingFrom: SightingFromEnum.LAND,
		distance: DistanceEnum.FROM_10_TO_50M,
		firstName: 'Erika',
		lastName: 'Mustermann',
		email: 'erika@example.invalid',
		privacyConsent: true,
		referenceId: 'ref-4711',
		...overrides
	};
}

/** Sammelt die Fehler eines Validierungslaufs feldweise. */
async function collectErrors(values: Record<string, unknown>): Promise<Record<string, string>> {
	try {
		await adminSightingSchema.validate(values, { abortEarly: false });
		return {};
	} catch (error) {
		if (!(error instanceof yup.ValidationError)) throw error;
		return Object.fromEntries(
			error.inner.map((inner) => [inner.path ?? '?', inner.message] as const)
		);
	}
}

describe('adminSightingSchema — Bestandssichtungen', () => {
	it('akzeptiert einen vollständigen Datensatz (Absicherung der Testbasis)', async () => {
		expect(await collectErrors(legacyFormValues())).toEqual({});
	});

	it('akzeptiert `entfernung = 0` — der Sentinel für "nicht angegeben"', async () => {
		// 282 Bestandszeilen. `DistanceEnum` geht von 1 bis 5; die 0 liegt bewusst
		// außerhalb und wird als "Unbekannt" angezeigt (siehe mapFormToSighting).
		expect(await collectErrors(legacyFormValues({ distance: 0 }))).toEqual({});
	});

	/**
	 * Nicht `vonwo` selbst ist der Blocker, sondern der Freitext dahinter:
	 * `sightingFromText` ist Pflicht, sobald "Sonstiges" gewählt ist. 1.120
	 * Bestandszeilen tragen `vonwo = 0` **ohne** Text — beim Melden mag die
	 * Nachfrage richtig sein, beim Bearbeiten verlangt sie vom Admin, eine
	 * Angabe zu erfinden, die der Melder nie gemacht hat.
	 */
	it('akzeptiert `vonwo = 0` ohne Freitext', async () => {
		expect(
			await collectErrors(
				legacyFormValues({ sightingFrom: SightingFromEnum.OTHER, sightingFromText: undefined })
			)
		).toEqual({});
	});

	it('erbt Beschriftung und Metadaten des Freitextfelds vom Basis-Schema', () => {
		// Die Feld-Pipeline liest beides aus `describe()` — `FieldRenderer` nimmt
		// genau diesen Typ entgegen. Eine Kopie statt einer Ableitung liefe beim
		// nächsten Textwechsel auseinander; dieselbe Begründung wie bei den
		// Anzahlen.
		const base = sightingSchema.describe().fields.sightingFromText as yup.SchemaDescription;
		const admin = adminSightingSchema.describe().fields.sightingFromText as yup.SchemaDescription;

		expect(admin.label).toBe(base.label);
		expect(admin.meta).toEqual(base.meta);
	});

	it('akzeptiert `vonwo = 5` — das serverseitig gesetzte "Keine Angabe"', async () => {
		// Nicht auswählbar, aber `mapFormToSighting` schreibt es. Eine so
		// gespeicherte Sichtung muss wieder bearbeitbar sein.
		expect(
			await collectErrors(legacyFormValues({ sightingFrom: SightingFromEnum.UNKNOWN }))
		).toEqual({});
	});

	it('bleibt streng, wo es um echte Angaben geht', async () => {
		const errors = await collectErrors(legacyFormValues({ distance: 99, sightingFrom: 42 }));

		expect(Object.keys(errors).sort()).toEqual(['distance', 'sightingFrom']);
	});
});
