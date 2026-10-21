import { describe, it, expect, vi } from 'vitest';
import { isStepValid, validateStep } from './stepValidation';
import type { SightingFormData } from '#lib/report/types.ts';

// Mock logger to suppress debug output in tests
vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

// Mock formStepsConfig/getFormSteps to decouple from runtime config
// (sightingSchema itself is NOT mocked — real validation logic is tested)
vi.mock('#lib/report/formConfig.ts', () => {
	const formStepsConfig = [
		{
			id: 'location-time',
			title: 'Position & Zeit',
			fields: ['hasPosition', 'latitude', 'longitude', 'waterway', 'sightingDate']
		},
		{
			id: 'sighting-details',
			title: 'Sichtungsdetails',
			// `deadCondition` steht hier absichtlich neben `species`/`totalCount`/
			// `distance`, OHNE `isDead` — spiegelt den echten `formConfig.ts`-Stand
			// nach Task 7: `isDead` ist aus der Feldliste des Schritts entfernt,
			// `deadCondition` hängt aber weiterhin per `.when('isDead', …)` daran.
			// Review-Befund 4 prüft genau diese Kombination.
			fields: ['species', 'totalCount', 'distance', 'deadCondition']
		},
		{
			id: 'observations',
			title: 'Beobachtungen',
			// `reaction` steht absichtlich mit im eingedampften Testbestand: Ohne sie
			// wäre `not.toContain('reaction')` weiter unten (Totfund-Block) immer
			// erfüllt, unabhängig davon, ob `getFormSteps` sie beim Totfund
			// tatsächlich entfernt — der Mock-Schritt hätte das Feld nie enthalten.
			// Abschlussreview-Befund aus Task 3, hier behoben statt gestrichen.
			fields: ['behavior', 'reaction'],
			isOptional: true
		},
		{
			id: 'contact',
			title: 'Kontaktdaten',
			fields: ['firstName', 'lastName', 'email', 'privacyConsent']
		}
	];

	// Spiegelt formConfig.ts's HIDDEN_WHEN_DEAD auf dem eingedampften Testbestand:
	// stepValidation ruft getFormSteps(data) statt der statischen Konstante auf —
	// der Mock muss diese Verzweigung nachbilden, sonst testet er sie nicht.
	const isDeadFinding = (value: unknown): boolean =>
		value === true || value === 1 || value === '1' || value === 'true';

	const getFormSteps = (data: { isDead?: unknown }) => {
		if (!isDeadFinding(data?.isDead)) {
			return formStepsConfig;
		}
		const hidden = new Set(['behavior', 'behaviorText', 'reaction']);
		return formStepsConfig.map((step) => ({
			...step,
			fields: step.fields.filter((field) => !hidden.has(field))
		}));
	};

	return { formStepsConfig, getFormSteps };
});

// ── Test data ────────────────────────────────────────────────────────────────

const today = new Date().toISOString().substring(0, 10);

const validLocationData: Partial<SightingFormData> = {
	hasPosition: true,
	latitude: 54.5,
	longitude: 13.5,
	sightingDate: today
};

const validSightingData: Partial<SightingFormData> = {
	species: 0, // Schweinswal
	totalCount: 2,
	distance: 1
};

const validContactData: Partial<SightingFormData> = {
	firstName: 'Jane',
	lastName: 'Doe',
	email: 'jane@example.com',
	privacyConsent: true
};

// ── isStepValid ──────────────────────────────────────────────────────────────

describe('isStepValid', () => {
	describe('Step 0 — Position & Zeit', () => {
		it('returns true for fully valid location data', () => {
			expect(isStepValid(0, validLocationData)).toBe(true);
		});

		it('returns true when hasPosition is false but a waterway description is provided', () => {
			// Ohne GPS-Position ist waterway erforderlich (Alternative "Beschreibung")
			expect(
				isStepValid(0, { hasPosition: false, waterway: 'Kieler Bucht', sightingDate: today })
			).toBe(true);
		});

		it('returns false for an empty form (no coords, no waterway)', () => {
			// Nach Entfernen der Defaults: hasPosition=false, keine Koordinaten, kein waterway
			// → waterway ist erforderlich → Schritt 1 blockiert
			expect(isStepValid(0, {})).toBe(false);
		});

		it('returns false when hasPosition=false and waterway is missing', () => {
			expect(isStepValid(0, { hasPosition: false, sightingDate: today })).toBe(false);
		});

		it('returns false when hasPosition is true but coordinates are missing (no defaults)', () => {
			// latitude/longitude haben keine Defaults mehr und sind bei hasPosition=true erforderlich
			expect(isStepValid(0, { hasPosition: true, sightingDate: today })).toBe(false);
		});

		it('returns false for latitude out of Baltic Sea bounds', () => {
			expect(
				isStepValid(0, {
					hasPosition: true,
					latitude: 200, // Invalid: >90°
					longitude: 13.5,
					sightingDate: today
				})
			).toBe(false);
		});

		it('returns false for longitude out of Baltic Sea bounds', () => {
			expect(
				isStepValid(0, {
					hasPosition: true,
					latitude: 54.5,
					longitude: 400, // Invalid: >180°
					sightingDate: today
				})
			).toBe(false);
		});

		it('returns false for a future sightingDate', () => {
			const future = new Date();
			future.setFullYear(future.getFullYear() + 1);
			expect(
				isStepValid(0, {
					hasPosition: false,
					waterway: 'Kieler Bucht',
					sightingDate: future.toISOString().substring(0, 10)
				})
			).toBe(false);
		});
	});

	describe('Step 1 — Sichtungsdetails', () => {
		it('returns true for fully valid sighting data', () => {
			expect(isStepValid(1, validSightingData)).toBe(true);
		});

		it('returns false when species is missing (no default — user must actively choose)', () => {
			// species hat keinen Default mehr → fehlende Tierart blockiert Schritt 2
			expect(isStepValid(1, { totalCount: 2, distance: 1 })).toBe(false);
		});

		it('returns false for species value -1 (below valid range)', () => {
			expect(isStepValid(1, { species: -1, totalCount: 1, distance: 1 })).toBe(false);
		});

		it('returns false for totalCount above maximum (15)', () => {
			expect(isStepValid(1, { species: 0, totalCount: 999, distance: 1 })).toBe(false);
		});

		it('returns false for totalCount below minimum (0)', () => {
			expect(isStepValid(1, { species: 0, totalCount: -1, distance: 1 })).toBe(false);
		});
	});

	describe('Step 3 — Kontaktdaten', () => {
		it('returns true for fully valid contact data', () => {
			expect(isStepValid(3, validContactData)).toBe(true);
		});

		it('returns false when privacyConsent is missing', () => {
			expect(
				isStepValid(3, {
					firstName: 'Jane',
					lastName: 'Doe',
					email: 'jane@example.com'
					// privacyConsent missing
				})
			).toBe(false);
		});

		it('returns false for invalid email format', () => {
			expect(
				isStepValid(3, {
					...validContactData,
					email: 'not-an-email'
				})
			).toBe(false);
		});
	});

	describe('Edge cases', () => {
		it('returns true for a non-existent step index', () => {
			expect(isStepValid(99, {})).toBe(true);
		});
	});
});

// ── validateStep ─────────────────────────────────────────────────────────────

describe('validateStep', () => {
	describe('Step 0 — Position & Zeit', () => {
		it('returns isValid=true with no errors for fully valid data', () => {
			const result = validateStep(0, validLocationData);
			expect(result.isValid).toBe(true);
			expect(result.errors).toEqual({});
		});

		it('returns errors for an empty form (waterway required without coords)', () => {
			// Kein GPS, kein waterway → waterway-Fehler; sightingDate hat noch einen Default
			const result = validateStep(0, {});
			expect(result.isValid).toBe(false);
			expect(result.errors).toHaveProperty('waterway');
		});

		it('returns coordinate errors when hasPosition=true but coords are missing', () => {
			const result = validateStep(0, { hasPosition: true, sightingDate: today });
			expect(result.isValid).toBe(false);
			expect(result.errors).toHaveProperty('latitude');
			expect(result.errors).toHaveProperty('longitude');
		});

		it('returns errors for both out-of-bounds coordinates', () => {
			const result = validateStep(0, {
				hasPosition: true,
				latitude: -100, // Invalid
				longitude: 400, // Invalid
				sightingDate: today
			});
			expect(result.isValid).toBe(false);
			expect(result.errors).toHaveProperty('latitude');
			expect(result.errors).toHaveProperty('longitude');
		});

		it('returns error for future sightingDate', () => {
			const future = new Date();
			future.setFullYear(future.getFullYear() + 1);
			const result = validateStep(0, {
				hasPosition: false,
				waterway: 'Kieler Bucht',
				sightingDate: future.toISOString().substring(0, 10)
			});
			expect(result.isValid).toBe(false);
			expect(result.errors).toHaveProperty('sightingDate');
		});
	});

	describe('Step 1 — Sichtungsdetails', () => {
		it('returns isValid=true with no errors for valid data', () => {
			const result = validateStep(1, validSightingData);
			expect(result.isValid).toBe(true);
			expect(result.errors).toEqual({});
		});

		it('returns isValid=false for empty data (distance is required without default)', () => {
			// species defaults to 0 (Schweinswal), totalCount defaults to 1,
			// but distance has no default and is required — validation fails
			const result = validateStep(1, {});
			expect(result.isValid).toBe(false);
		});

		it('returns error for invalid species value', () => {
			const result = validateStep(1, { species: -1, totalCount: 1, distance: 1 });
			expect(result.isValid).toBe(false);
			expect(result.errors).toHaveProperty('species');
		});

		it('returns error for totalCount above 15', () => {
			const result = validateStep(1, { species: 0, totalCount: 999, distance: 1 });
			expect(result.isValid).toBe(false);
			expect(result.errors).toHaveProperty('totalCount');
		});
	});

	describe('Step 3 — Kontaktdaten', () => {
		it('returns isValid=true with no errors for valid data', () => {
			const result = validateStep(3, validContactData);
			expect(result.isValid).toBe(true);
			expect(result.errors).toEqual({});
		});

		it('returns error for invalid email', () => {
			const result = validateStep(3, { ...validContactData, email: 'not-an-email' });
			expect(result.isValid).toBe(false);
			expect(result.errors).toHaveProperty('email');
		});

		it('returns error when privacyConsent is missing', () => {
			const result = validateStep(3, {
				firstName: 'Jane',
				lastName: 'Doe',
				email: 'jane@example.com'
			});
			expect(result.isValid).toBe(false);
			expect(result.errors).toHaveProperty('privacyConsent');
		});
	});

	describe('Edge cases', () => {
		it('returns isValid=true with empty errors for non-existent step', () => {
			const result = validateStep(99, {});
			expect(result.isValid).toBe(true);
			expect(result.errors).toEqual({});
		});
	});
});

/**
 * Review-Befund 4 (Task 7): `deadCondition` hängt im Schema per
 * `.when('isDead', …)` an einem Feld, das seit Task 7 NICHT mehr in der
 * gepickten Feldliste von Schritt 2 steht (`isDead` wird auf der
 * Einstiegsseite beantwortet, nicht mehr auf Schritt 2 — siehe
 * `formConfig.ts`). `isStepValid`/`validateStep` übergeben `sightingSchema
 * .pick(validateFields)` trotzdem die VOLLEN `formData` zur Validierung, nicht
 * nur die gepickten Felder — die Annahme ist, dass Yup den Sibling-Ref
 * `isDead` aus diesem vollen Wertobjekt auflöst, obwohl `isDead` selbst nicht
 * Teil des gepickten (Teil-)Schemas ist. Ungetestet war das plausibel, aber
 * unbelegt; dieser Block nagelt die Annahme fest.
 */
describe('stepValidation — Totfund ohne Zustand macht Schritt 2 ungültig (Review-Befund 4)', () => {
	it('isStepValid: Schritt 2 ist ungültig, wenn isDead gesetzt ist, aber deadCondition fehlt', () => {
		expect(isStepValid(1, { ...validSightingData, isDead: true })).toBe(false);
	});

	it('validateStep: Schritt 2 meldet den fehlenden deadCondition-Fehler', () => {
		const result = validateStep(1, { ...validSightingData, isDead: true });

		expect(result.isValid).toBe(false);
		expect(result.errors).toHaveProperty('deadCondition');
	});

	it('isStepValid: Schritt 2 bleibt gültig, wenn isDead gesetzt ist und deadCondition vorliegt', () => {
		expect(isStepValid(1, { ...validSightingData, isDead: true, deadCondition: 1 })).toBe(true);
	});

	it('isStepValid: deadCondition bleibt ohne Totfund weiterhin unnötig', () => {
		// Gegenprobe: Ohne `isDead` bleibt Schritt 2 gültig, obwohl `deadCondition`
		// jetzt Teil der gepickten Feldliste ist — der `.when()`-Zweig greift nur
		// bei `isDead === true`.
		expect(isStepValid(1, validSightingData)).toBe(true);
	});
});

describe('stepValidation im Totfund-Zweig', () => {
	it('validiert ausgeblendete Felder nicht mehr', async () => {
		// Der wichtigste Test des Vorhabens: Würde `behavior` weiter validiert,
		// säße der Melder in einer Sackgasse — das Feld ist nicht sichtbar, der
		// Fehler nicht behebbar.
		//
		// `behavior` bekommt hier bewusst den ungültigen Enum-Wert 999 statt
		// `undefined` (wie in der ursprünglichen Formulierung des Tasks): Das
		// Feld ist im echten Schema `.notRequired()`, ein `undefined`-Wert löst
		// also so oder so nie einen Fehler aus — der Test wäre unabhängig vom
		// Seam immer grün gewesen (empirisch geprüft: `behavior: undefined`
		// erzeugt weder vor noch nach der Umstellung einen Fehler). Der
		// ungültige Wert macht den Unterschied sichtbar: Vor der Umstellung
		// wird `behavior` trotz Totfund weiter geprüft und schlägt fehl; nach
		// der Umstellung blendet `getFormSteps` das Feld aus, bevor `pick()`
		// es überhaupt sieht.
		//
		// `reaction` bekommt aus demselben Grund einen ungültigen Wert statt
		// `undefined`: Auch dieses Feld ist `.notRequired()`, nur mit einer
		// `.max(1000)`-Schranke statt eines Enums — ein zu langer String verletzt
		// sie zuverlässig. Ohne diesen Wert wäre `not.toContain('reaction')`
		// unten immer erfüllt gewesen, unabhängig davon, ob `getFormSteps` das
		// Feld beim Totfund tatsächlich entfernt (Abschlussreview-Befund aus
		// Task 3 — empirisch geprüft: mit `undefined` blieb die Assertion auch
		// grün, nachdem `reaction` testweise aus `HIDDEN_WHEN_DEAD` entfernt
		// wurde).
		const schrittMitVerhalten = 2; // 0-basiert: „Weitere Informationen"
		const daten = {
			isDead: true,
			behavior: 999,
			behaviorText: undefined,
			reaction: 'x'.repeat(1001)
		};

		const ergebnis = await validateStep(schrittMitVerhalten, daten);

		expect(Object.keys(ergebnis.errors ?? {})).not.toContain('behavior');
		expect(Object.keys(ergebnis.errors ?? {})).not.toContain('reaction');
	});
});
