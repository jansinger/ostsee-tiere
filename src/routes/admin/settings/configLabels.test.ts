/**
 * Sichert ab, dass in der Settings-Oberfläche kein roher Konfigurationsschlüssel
 * mehr auftaucht (UX-Review 2026-07-30).
 *
 * Der Test ist der eigentliche Mechanismus hinter `configLabels.ts`: Ohne ihn
 * wäre die Label-Tabelle nur eine Momentaufnahme, die bei der nächsten neuen
 * Einstellung wieder auseinanderläuft.
 */
import { describe, expect, it } from 'vitest';
import { getAvailableConfigurationKeys } from '#lib/server/services/configInitializer.ts';
import { ACTIVE_CONFIG_KEYS, configLabels, getConfigLabel } from './configLabels';

describe('Konfigurations-Labels', () => {
	const availableKeys = getAvailableConfigurationKeys();

	it('deckt jede vorbelegte Einstellung ab', () => {
		const ohneLabel = availableKeys.filter((key) => !(key in configLabels));

		// Aussagekräftige Fehlermeldung: der Test soll sagen, WELCHE Einstellung
		// fehlt, sonst sucht man den Schlüssel von Hand.
		expect(ohneLabel, `Ohne deutsches Label: ${ohneLabel.join(', ')}`).toEqual([]);
	});

	it('enthält keine Labels für Einstellungen, die es nicht mehr gibt', () => {
		const verwaist = Object.keys(configLabels).filter((key) => !availableKeys.includes(key));

		expect(verwaist, `Label ohne zugehörige Einstellung: ${verwaist.join(', ')}`).toEqual([]);
	});

	it('gibt niemals einen leeren Anzeigenamen zurück', () => {
		for (const key of availableKeys) {
			expect(getConfigLabel(key).trim().length, `Leeres Label für ${key}`).toBeGreaterThan(0);
		}
	});

	it('fällt bei unbekanntem Schlüssel auf den Schlüssel selbst zurück', () => {
		expect(getConfigLabel('gibt.es.nicht')).toBe('gibt.es.nicht');
	});

	it('kennzeichnet nur real existierende Einstellungen als aktiv', () => {
		// Ein Tippfehler in ACTIVE_CONFIG_KEYS würde die Einstellung sonst still
		// als „Geplant" einsortieren, obwohl sie wirkt.
		const unbekannt = [...ACTIVE_CONFIG_KEYS].filter((key) => !availableKeys.includes(key));

		expect(unbekannt, `Als aktiv markiert, aber unbekannt: ${unbekannt.join(', ')}`).toEqual([]);
	});
});
