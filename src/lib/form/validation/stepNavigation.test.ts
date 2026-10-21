import { describe, it, expect, vi } from 'vitest';
import { canNavigateToStep } from './stepNavigation';
import type { SightingFormData } from '#lib/report/types.ts';

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

// Use same mock config as stepValidation.test.ts
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
			fields: ['species', 'totalCount', 'distance']
		},
		{
			id: 'observations',
			title: 'Beobachtungen',
			fields: ['behavior'],
			isOptional: true
		},
		{
			id: 'contact',
			title: 'Kontaktdaten',
			fields: ['firstName', 'lastName', 'email', 'privacyConsent']
		}
	];

	// isStepValid (aufgerufen von canNavigateToStep) liest seit Task 3 über
	// getFormSteps(data) statt der statischen Konstante — der Mock muss diese
	// Funktion deshalb mit anbieten, auch wenn kein Test hier isDead setzt.
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

const today = new Date().toISOString().substring(0, 10);

const validStep0: Partial<SightingFormData> = {
	hasPosition: true,
	latitude: 54.5,
	longitude: 13.5,
	sightingDate: today
};

const validStep1: Partial<SightingFormData> = {
	species: 0,
	totalCount: 2,
	distance: 1
};

const validStep3: Partial<SightingFormData> = {
	firstName: 'Max',
	lastName: 'Mustermann',
	email: 'max@example.com',
	privacyConsent: true
};

describe('canNavigateToStep', () => {
	describe('Rückwärts-Navigation', () => {
		it('erlaubt Navigation zum gleichen Step', () => {
			expect(canNavigateToStep(2, 2, {})).toBe(true);
		});

		it('erlaubt Navigation zu einem früheren Step', () => {
			expect(canNavigateToStep(3, 0, {})).toBe(true);
		});

		it('erlaubt Rückwärts-Navigation auch mit leeren Formulardaten', () => {
			expect(canNavigateToStep(2, 1, {})).toBe(true);
		});
	});

	describe('Vorwärts-Navigation', () => {
		it('erlaubt Vorwärts-Navigation wenn aktueller Step valid ist', () => {
			expect(canNavigateToStep(0, 1, validStep0)).toBe(true);
		});

		it('blockiert Vorwärts-Navigation wenn aktueller Step invalid ist', () => {
			// Step 0 with future date = invalid
			expect(canNavigateToStep(0, 1, { sightingDate: '2099-01-01' })).toBe(false);
		});

		it('erlaubt Sprung über mehrere Steps wenn alle valide sind', () => {
			const allValid = { ...validStep0, ...validStep1 };
			// Step 0 → Step 2: Step 0 und Step 1 müssen valid sein
			expect(canNavigateToStep(0, 2, allValid)).toBe(true);
		});

		it('blockiert Sprung wenn ein Zwischen-Step invalid ist', () => {
			// Step 0 → Step 2: Step 0 valid, Step 1 invalid (keine Species)
			expect(canNavigateToStep(0, 2, validStep0)).toBe(false);
		});

		it('erlaubt Navigation von Step 0 direkt zu Step 3 wenn alle Steps valid', () => {
			const allValid = { ...validStep0, ...validStep1, ...validStep3 };
			expect(canNavigateToStep(0, 3, allValid)).toBe(true);
		});

		it('blockiert Navigation von Step 0 zu Step 3 wenn Step 1 invalid', () => {
			const partial = { ...validStep0, ...validStep3 }; // Step 1 fehlt
			expect(canNavigateToStep(0, 3, partial)).toBe(false);
		});
	});

	describe('Edge Cases', () => {
		it('behandelt Step-Index 0 → 0 korrekt', () => {
			expect(canNavigateToStep(0, 0, {})).toBe(true);
		});

		it('erlaubt Navigation zum nächsten Step (currentStep + 1)', () => {
			expect(canNavigateToStep(1, 2, validStep1)).toBe(true);
		});
	});
});
