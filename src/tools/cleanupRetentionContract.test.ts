/**
 * Der Hinweis an der Dropzone verspricht eine Löschfrist. Eingehalten wird sie
 * vom Aufräum-Tool, das bewusst selbstgenügsam bleibt (eigene DB-Verbindung,
 * keine Projekt-Imports) — damit es standalone als Job laufen kann.
 *
 * Die Kopplung läuft deshalb nicht über einen Import, sondern über diesen Test:
 * Läuft die Vorgabe des Tools von der im Formular genannten Frist weg, wird aus
 * der Zusage an die Melder eine Falschaussage.
 *
 * Siehe docs/archive/MEDIENEINWILLIGUNG_ANALYSE_2026-07-28.md, Abschnitt 9.4.
 */
import { ORPHAN_RETENTION, ORPHAN_RETENTION_HOURS } from '#lib/constants/uploadRetention.ts';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION, parseRetention } from './cleanup-orphaned-uploads';

describe('Aufräum-Frist', () => {
	it('das Tool räumt nach genau der Frist, die das Formular zusagt', () => {
		expect(DEFAULT_RETENTION).toBe(ORPHAN_RETENTION);
	});

	it('die geteilte Schreibweise ist für das Tool lesbar', () => {
		// Schützt davor, dass jemand ORPHAN_RETENTION auf etwas setzt, das
		// `--older-than` nicht versteht.
		expect(parseRetention(ORPHAN_RETENTION)).toBe(ORPHAN_RETENTION_HOURS * 60 * 60 * 1000);
	});
});
