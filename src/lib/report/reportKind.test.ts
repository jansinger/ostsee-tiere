import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '#lib/storage/localStorage.ts';
import {
	clearReportKind,
	readReportKind,
	resolveReportKind,
	reportKindToIsDead,
	reportKindToParam,
	writeReportKind
} from './reportKind';

/**
 * Mock für Node.js-Tests. REPORT_KIND liegt in `sessionKeys` (Abschlussreview
 * B3, 2026-08-06) — derselbe Speicher wie FORM_DATA, dessen Lebensdauer der
 * Zweig jetzt teilt. Zwei getrennte Instanzen, weil `localStorage.ts` beide
 * unabhängig anspricht; `createStorageMock()` statt einer geteilten Fabrik
 * hält das offensichtlich, ohne dass ein Test versehentlich in den falschen
 * Speicher schreibt.
 */
function createStorageMock() {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
		length: Object.keys(store).length,
		key: (index: number) => Object.keys(store)[index] || null
	};
}

vi.mock('$app/env', () => ({
	browser: true
}));

Object.defineProperty(global, 'localStorage', { value: createStorageMock() });
Object.defineProperty(global, 'sessionStorage', { value: createStorageMock() });
Object.defineProperty(global, 'window', { value: global });

describe('resolveReportKind', () => {
	it('liefert null, wenn nichts bekannt ist — die Auswahlseite muss erscheinen', () => {
		expect(resolveReportKind(null, null, null)).toBeNull();
	});

	it('nimmt den gespeicherten Zweig, wenn kein Parameter gesetzt ist', () => {
		expect(resolveReportKind(null, 'dead', null)).toBe('dead');
	});

	it('leitet den Zweig aus gespeichertem isDead ab, wenn reportKind fehlt (Migration)', () => {
		// Beim Deploy sitzen Nutzer mitten im Formular. Ohne diese Ableitung
		// würden sie auf die Auswahlseite zurückgeworfen.
		expect(resolveReportKind(null, null, false)).toBe('alive');
		expect(resolveReportKind(null, null, true)).toBe('dead');
	});

	it('normalisiert gespeichertes isDead, statt es roh auf Wahrheit zu prüfen', () => {
		// `FORM_DATA` kommt ungeprüft aus dem Storage — `loadFromStorage` mit
		// Default `null` reicht das geparste JSON durch, ohne zu sanitisieren.
		// Ein `'0'` von dort ist in JS wahr; eine rohe Prüfung machte daraus
		// einen Totfund. `isDeadFinding` ist die eine gültige Normalisierung
		// im Projekt (`formConfig.ts`) und gilt auch hier.
		for (const alsLebend of ['0', 'false', 0, '']) {
			expect(resolveReportKind(null, null, alsLebend)).toBe('alive');
		}
		for (const alsTot of ['1', 'true', 1, true]) {
			expect(resolveReportKind(null, null, alsTot)).toBe('dead');
		}
	});

	it('fragt nur dann, wenn gar kein gespeichertes isDead vorliegt', () => {
		// Die Unterscheidung „nicht vorhanden" gegen „vorhanden und falsch"
		// trägt die Migration: Ein Melder mitten im Formular soll nicht auf die
		// Auswahlseite zurückgeworfen werden, nur weil sein Zweig `alive` ist.
		expect(resolveReportKind(null, null, null)).toBeNull();
		expect(resolveReportKind(null, null, undefined)).toBeNull();
	});

	it('lässt den Query-Parameter gegen den gespeicherten Zweig gewinnen', () => {
		expect(resolveReportKind('totfund', 'alive', null)).toBe('dead');
		expect(resolveReportKind('lebend', 'dead', null)).toBe('alive');
	});

	it('ignoriert einen unbekannten Parameterwert', () => {
		expect(resolveReportKind('bloedsinn', 'alive', null)).toBe('alive');
		expect(resolveReportKind('bloedsinn', null, null)).toBeNull();
	});

	it('ignoriert geerbte Property-Namen im Parameter-Lookup (Prototype-Lücke)', () => {
		// Der Query-Parameter kommt fremdkontrolliert aus der URL. Ein normales
		// Objektliteral als Lookup-Tabelle liefert für geerbte Property-Namen
		// truthy Werte statt undefined — resolveReportKind('constructor', ...)
		// gäbe sonst die Function Object zurück statt null.
		expect(resolveReportKind('constructor', null, null)).toBeNull();
		expect(resolveReportKind('__proto__', null, null)).toBeNull();
		expect(resolveReportKind('toString', null, null)).toBeNull();
		expect(resolveReportKind('valueOf', null, null)).toBeNull();
		expect(resolveReportKind('hasOwnProperty', null, null)).toBeNull();
	});
});

describe('reportKindToIsDead', () => {
	it('bildet die zwei Zweige auf isDead ab', () => {
		expect(reportKindToIsDead('alive')).toBe(false);
		expect(reportKindToIsDead('dead')).toBe(true);
	});
});

describe('reportKindToParam', () => {
	it('bildet die zwei Zweige auf den Query-Parameter-Wert ab — die Umkehrung von PARAM_TO_KIND', () => {
		expect(reportKindToParam('alive')).toBe('lebend');
		expect(reportKindToParam('dead')).toBe('totfund');
	});
});

describe('reportKind storage roundtrip', () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	it('clearReportKind entfernt den Schlüssel statt "null" zu speichern', () => {
		writeReportKind('dead');
		expect(sessionStorage.getItem(STORAGE_KEYS.REPORT_KIND)).not.toBeNull();

		clearReportKind();

		// saveToStorage(key, null) würde den String "null" ablegen — der Schlüssel
		// muss stattdessen vollständig verschwinden, wie bei clearUserContactData.
		expect(sessionStorage.getItem(STORAGE_KEYS.REPORT_KIND)).toBeNull();
		expect(readReportKind()).toBeNull();
	});
});
