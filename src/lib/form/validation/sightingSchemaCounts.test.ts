/**
 * @fileoverview Tests für die Anzahl-Validierungen im sightingSchema
 *
 * Zwei Regeln, beide auf Wunsch des Deutschen Meeresmuseums:
 *
 * - `totalCount` muss mindestens 1 sein. Eine Sichtung mit 0 Tieren ist keine
 *   Sichtung.
 * - `juvenileCount` darf `totalCount` nicht überschreiten — die Jungtiere sind
 *   eine Teilmenge der gesichteten Tiere, keine zusätzliche Gruppe.
 *
 * Beide Felder sind bei 15 gekappt („Bei mehr als 15 bitte 15 eintragen").
 * Die Kappung darf die Teilmengen-Regel nicht aushebeln: bei 15/15 muss sie
 * weiter greifen, und 15 Jungtiere bei 10 Tieren bleiben ein Fehler.
 *
 * Wichtig für die Legacy-API: Dort bedeutet `anzahl_gesamt = 0` einen Totfund
 * (docs/LEGACY_API_SPECIFICATION.md). Die Untergrenze gehört deshalb
 * ausschließlich hierher — der letzte Block wacht darüber.
 */

import { describe, expect, it } from 'vitest';
import { getAdminSightingSchema, getSightingSchema } from './sightingSchema';

// Testet weiterhin den deutschen Ist-Zustand (Default-Locale) — unveraendert
// gegenueber der frueheren Modulkonstante.
const sightingSchema = getSightingSchema();
const adminSightingSchema = getAdminSightingSchema();
import { legacyApiSchema } from '#lib/legacy-api/yup-validation.ts';

/**
 * Validiert ein einzelnes Feld im Schema.
 * @returns die Fehlermeldung, oder `null` wenn die Validierung besteht.
 */
async function fieldError(
	fieldName: string,
	formData: Record<string, unknown>
): Promise<string | null> {
	try {
		await sightingSchema.validateAt(fieldName, formData, { abortEarly: true });
		return null;
	} catch (error) {
		return (error as { message: string }).message;
	}
}

describe('sightingSchema — Anzahl Tiere (totalCount)', () => {
	it('weist 0 Tiere zurück', async () => {
		expect(await fieldError('totalCount', { totalCount: 0 })).not.toBeNull();
	});

	it('weist negative Anzahlen zurück', async () => {
		expect(await fieldError('totalCount', { totalCount: -1 })).not.toBeNull();
	});

	it('akzeptiert genau ein Tier', async () => {
		expect(await fieldError('totalCount', { totalCount: 1 })).toBeNull();
	});

	it('akzeptiert die Obergrenze von 15', async () => {
		expect(await fieldError('totalCount', { totalCount: 15 })).toBeNull();
	});

	it('weist mehr als 15 Tiere weiterhin zurück', async () => {
		expect(await fieldError('totalCount', { totalCount: 16 })).not.toBeNull();
	});
});

describe('sightingSchema — Jungtiere (juvenileCount)', () => {
	it('weist mehr Jungtiere als Tiere insgesamt zurück', async () => {
		expect(await fieldError('juvenileCount', { totalCount: 2, juvenileCount: 3 })).not.toBeNull();
	});

	it('akzeptiert genauso viele Jungtiere wie Tiere insgesamt', async () => {
		expect(await fieldError('juvenileCount', { totalCount: 3, juvenileCount: 3 })).toBeNull();
	});

	it('akzeptiert weniger Jungtiere als Tiere insgesamt', async () => {
		expect(await fieldError('juvenileCount', { totalCount: 5, juvenileCount: 2 })).toBeNull();
	});

	it('akzeptiert 0 Jungtiere', async () => {
		expect(await fieldError('juvenileCount', { totalCount: 4, juvenileCount: 0 })).toBeNull();
	});

	it('bleibt optional — ohne Angabe kein Fehler', async () => {
		expect(await fieldError('juvenileCount', { totalCount: 4 })).toBeNull();
	});

	// Randfall: Beide Felder sind bei 15 gekappt. Bei 15/15 darf die Regel
	// nicht ins Leere laufen, und 15 Jungtiere bei 10 Tieren bleiben falsch.
	it('greift auch an der Kappungsgrenze: 15 von 15 ist zulässig', async () => {
		expect(await fieldError('juvenileCount', { totalCount: 15, juvenileCount: 15 })).toBeNull();
	});

	it('greift auch an der Kappungsgrenze: 15 Jungtiere bei 10 Tieren nicht', async () => {
		expect(await fieldError('juvenileCount', { totalCount: 10, juvenileCount: 15 })).not.toBeNull();
	});

	it('meldet den Fehler am Feld juvenileCount, nicht an totalCount', async () => {
		expect(await fieldError('totalCount', { totalCount: 2, juvenileCount: 3 })).toBeNull();
	});
});

/**
 * Die Admin-Maske editiert den Bestand, nicht eine neue Meldung. Die
 * Eingabegrenzen dürfen dort nicht greifen, sonst lassen sich genau die
 * Altdatensätze nicht mehr speichern, die eine Korrektur brauchen —
 * 5 Zeilen mit `anzahl_gesamt = 0`, 8 mit mehr Jung- als Gesamttieren und
 * 22 über der 15er-Kappung (Stand 2026-07-31).
 */
describe('adminSightingSchema — Bestand bleibt editierbar', () => {
	async function adminError(field: string, data: Record<string, unknown>): Promise<string | null> {
		try {
			await adminSightingSchema.validateAt(field, data, { abortEarly: true });
			return null;
		} catch (error) {
			return (error as { message: string }).message;
		}
	}

	it('akzeptiert 0 Tiere (Legacy-Totfund)', async () => {
		expect(await adminError('totalCount', { totalCount: 0 })).toBeNull();
	});

	it('akzeptiert mehr als 15 Tiere', async () => {
		expect(await adminError('totalCount', { totalCount: 40 })).toBeNull();
	});

	it('akzeptiert mehr Jungtiere als Tiere insgesamt', async () => {
		expect(await adminError('juvenileCount', { totalCount: 2, juvenileCount: 3 })).toBeNull();
	});

	it('weist negative Anzahlen weiterhin zurück', async () => {
		expect(await adminError('totalCount', { totalCount: -1 })).not.toBeNull();
	});

	// Die Ableitung ist der Punkt: Eine Kopie der Felddefinition würde beim
	// nächsten Textwechsel auseinanderlaufen, und `FieldRenderer` liest Label
	// und `meta` aus `describe()`.
	it('erbt Label und Metadaten aus sightingSchema', () => {
		const base = sightingSchema.describe().fields.totalCount as {
			label?: string;
			meta?: unknown;
		};
		const admin = adminSightingSchema.describe().fields.totalCount as {
			label?: string;
			meta?: unknown;
		};

		expect(base.label).toBe('Anzahl Tiere');
		expect(admin.label).toBe(base.label);
		expect(admin.meta).toEqual(base.meta);
	});

	it('lässt das Meldeformular unverändert streng', async () => {
		await expect(sightingSchema.validateAt('totalCount', { totalCount: 0 })).rejects.toThrow();
	});
});

describe('Legacy-API bleibt unberührt', () => {
	// `anzahl_gesamt = 0` kennzeichnet dort einen Totfund und muss gültig
	// bleiben — der alte iOS-Client meldet Totfunde ausschließlich so.
	it('akzeptiert anzahl_gesamt = 0 weiterhin', async () => {
		await expect(
			legacyApiSchema.validateAt('anzahl_gesamt', { anzahl_gesamt: 0 })
		).resolves.toBeDefined();
	});
});
