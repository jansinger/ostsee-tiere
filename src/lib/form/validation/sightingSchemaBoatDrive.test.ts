/**
 * @fileoverview Tests für die Bootsantrieb-Validierung (Befund U3)
 *
 * Hintergrund: boatDrive war unconditional required, ohne deutsche Fehlermeldung.
 * Das blockierte Land-Melder ("Sichtung von: Land"), die kein Boot haben.
 *
 * Ziel: boatDrive ist nur noch required, wenn sightingFrom Segelschiff (1)
 * oder Motorboot (2) ist — mit deutscher Fehlermeldung.
 *
 * boatDriveText bleibt unabhängig davon generell optional (siehe
 * sightingSchemaWhen.test.ts) — das gilt auch in Kombination mit den hier
 * getesteten sightingFrom-Werten.
 */

import { describe, it, expect } from 'vitest';
import { getSightingSchema } from './sightingSchema';

// Testet weiterhin den deutschen Ist-Zustand (Default-Locale) — unveraendert
// gegenueber der frueheren Modulkonstante.
const sightingSchema = getSightingSchema();
import { SightingFromEnum } from '#lib/report/formOptions/sightingFrom.ts';
import { BoatDriveEnum } from '#lib/report/formOptions/boatDrive.ts';

/**
 * Validiert ein einzelnes Feld im Schema und gibt den Fehlertext zurück
 * (oder null, wenn keine Validierung fehlschlägt).
 */
async function fieldError(
	fieldName: string,
	formData: Record<string, unknown>
): Promise<string | null> {
	try {
		await sightingSchema.validateAt(fieldName, formData, { abortEarly: true });
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

describe('sightingSchema - boatDrive (Befund U3)', () => {
	it('ist NICHT erforderlich, wenn die Sichtung von Land aus gemacht wurde', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: SightingFromEnum.LAND, // 3
			boatDrive: undefined
		});
		expect(fehler).toBeNull();
	});

	it('ist NICHT erforderlich, wenn die Sichtung von einer Fähre aus gemacht wurde', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: SightingFromEnum.FERRY, // 4
			boatDrive: undefined
		});
		expect(fehler).toBeNull();
	});

	it('ist NICHT erforderlich, wenn sightingFrom "Sonstiges" ist', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: SightingFromEnum.OTHER, // 0
			boatDrive: undefined
		});
		expect(fehler).toBeNull();
	});

	it('ist NICHT erforderlich, wenn sightingFrom (noch) nicht gesetzt ist', async () => {
		const fehler = await fieldError('boatDrive', {
			boatDrive: undefined
		});
		expect(fehler).toBeNull();
	});

	it('ist erforderlich mit deutscher Fehlermeldung, wenn die Sichtung von einem Motorboot aus gemacht wurde', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: SightingFromEnum.MOTORBOAT, // 2
			boatDrive: undefined
		});
		expect(fehler).toBe('Bitte wählen Sie den Bootsantrieb aus.');
	});

	it('ist erforderlich mit deutscher Fehlermeldung, wenn die Sichtung von einem Segelschiff aus gemacht wurde', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: SightingFromEnum.SAILBOAT, // 1
			boatDrive: undefined
		});
		expect(fehler).toBe('Bitte wählen Sie den Bootsantrieb aus.');
	});

	it('ist erforderlich, auch wenn sightingFrom als String "2" (HTML-Select) vorliegt', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: '2',
			boatDrive: undefined
		});
		expect(fehler).toBe('Bitte wählen Sie den Bootsantrieb aus.');
	});

	it('ist gültig, wenn Motorboot mit gesetztem boatDrive gemeldet wird', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: SightingFromEnum.MOTORBOAT,
			boatDrive: BoatDriveEnum.MOTOR
		});
		expect(fehler).toBeNull();
	});

	it('boatDriveText bleibt optional bei Segelschiff + Sonstiger Antrieb ohne Text', async () => {
		const fehler = await fieldError('boatDriveText', {
			sightingFrom: SightingFromEnum.SAILBOAT,
			boatDrive: BoatDriveEnum.OTHER,
			boatDriveText: ''
		});
		expect(fehler).toBeNull();
	});
});

/**
 * PR 4 (Museum, 2026-08-04): "Motor an / Motor aus" ersetzt im Meldeformular die
 * fünf Antriebsarten bei Motorboot/Segelschiff. "Motor aus" bekommt einen neuen
 * Enum-Wert `BoatDriveEnum.MOTOR_OFF = 6`.
 *
 * Die Pflicht bei Segelschiff/Motorboot und die Optionalität bei Land/Fähre/
 * Sonstiges bleiben unverändert bestehen — siehe die Tests oben, die genau das
 * bereits mit dem alten Wertebereich (0-5) absichern. Hier wird nur ergänzt,
 * dass der neue Wert `6` dieselbe Validierung besteht.
 */
describe('sightingSchema - boatDrive (PR 4 — Motor an/aus, Wert 6)', () => {
	it('besteht die Validierung mit MOTOR_OFF ("Motor aus"), wenn von einem Motorboot gemeldet wird', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: SightingFromEnum.MOTORBOAT,
			boatDrive: BoatDriveEnum.MOTOR_OFF
		});
		expect(fehler).toBeNull();
	});

	it('besteht die Validierung mit MOTOR_OFF, wenn von einem Segelschiff gemeldet wird', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: SightingFromEnum.SAILBOAT,
			boatDrive: BoatDriveEnum.MOTOR_OFF
		});
		expect(fehler).toBeNull();
	});

	it('bleibt bei Motorboot/Segelschiff ohne Wert weiterhin Pflicht — auch nach Einführung von 6', async () => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom: SightingFromEnum.MOTORBOAT,
			boatDrive: undefined
		});
		expect(fehler).toBe('Bitte wählen Sie den Bootsantrieb aus.');
	});

	it.each([
		['Land', SightingFromEnum.LAND],
		['Fähre', SightingFromEnum.FERRY],
		['Sonstiges', SightingFromEnum.OTHER]
	])('bleibt bei "%s" optional — auch nach Einführung von 6', async (_label, sightingFrom) => {
		const fehler = await fieldError('boatDrive', {
			sightingFrom,
			boatDrive: undefined
		});
		expect(fehler).toBeNull();
	});
});

describe('sightingSchema - Schritt-2-Validierung (Zusammenspiel boatDrive/sightingFrom)', () => {
	it('Schritt 2 ist gültig ohne boatDrive, wenn von Land gemeldet wird', async () => {
		const pickedSchema = sightingSchema.pick(['sightingFrom', 'boatDrive']);
		await expect(
			pickedSchema.validate(
				{ sightingFrom: SightingFromEnum.LAND, boatDrive: undefined },
				{ abortEarly: false }
			)
		).resolves.toBeDefined();
	});

	it('Schritt 2 ist ungültig ohne boatDrive, wenn von einem Motorboot gemeldet wird', async () => {
		const pickedSchema = sightingSchema.pick(['sightingFrom', 'boatDrive']);
		await expect(
			pickedSchema.validate(
				{ sightingFrom: SightingFromEnum.MOTORBOAT, boatDrive: undefined },
				{ abortEarly: false }
			)
		).rejects.toBeDefined();
	});
});
