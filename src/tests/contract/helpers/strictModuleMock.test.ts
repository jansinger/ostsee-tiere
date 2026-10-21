import { describe, it, expect, beforeEach } from 'vitest';
import {
	strictModuleMock,
	drainMissingMockExports,
	assertNoMissingMockExports
} from './strictModuleMock';

describe('strictModuleMock', () => {
	// Jeder absichtlich provozierte Fehlgriff wird im Test selbst wieder
	// abgeräumt — sonst lässt ihn der globale `afterEach` aus
	// `vitest-setup-server.ts` zu Recht scheitern. `beforeEach` steht zusätzlich
	// da, damit ein neuer Test nicht vom Vorgänger erbt.
	beforeEach(() => {
		drainMissingMockExports();
	});

	it('wirft bei einem fehlenden Export mit erklärender Meldung', () => {
		const mock = strictModuleMock('drizzle-orm', { and: () => [] });

		expect(() => (mock as Record<string, unknown>).isNotNull).toThrowError(
			/drizzle-orm-Attrappe in strictModuleMock\.test\.ts exportiert `isNotNull` nicht/
		);

		drainMissingMockExports();
	});

	it('nennt in der Meldung den mittelbaren Aufruf und die Abhilfe', () => {
		const mock = strictModuleMock('drizzle-orm', { and: () => [] });

		let message = '';
		try {
			void (mock as Record<string, unknown>).isNotNull;
		} catch (e) {
			message = (e as Error).message;
		}

		expect(message).toContain('ggf. mittelbar');
		expect(message).toContain('Ergänze den Export in der Attrappe');

		drainMissingMockExports();
	});

	// Die Attrappe deckt zwei Modularten ab: `drizzle-orm` exportiert Funktionen,
	// `#lib/server/db/schema` Tabellen. Eine Tabelle wie `auditLogs` wird nicht
	// „aufgerufen" — die Meldung muss für beides stimmen.
	it('formuliert die Meldung neutral, also auch für Tabellen statt Funktionen', () => {
		const mock = strictModuleMock('#lib/server/db/schema', { sightings: { id: 'id' } });

		let message = '';
		try {
			void (mock as Record<string, unknown>).auditLogs;
		} catch (e) {
			message = (e as Error).message;
		}

		expect(message).toContain('#lib/server/db/schema-Attrappe');
		expect(message).toContain('`auditLogs` nicht');
		expect(message).not.toContain('ruft');
		expect(message).not.toContain('Helper');

		drainMissingMockExports();
	});

	it('reicht definierte Exporte unverändert durch', () => {
		const and = () => ['ok'];
		const mock = strictModuleMock('drizzle-orm', { and, zero: 0, nullish: null });

		expect(mock.and).toBe(and);
		expect(mock.zero).toBe(0);
		expect(mock.nullish).toBeNull();
		expect(Object.keys(mock)).toEqual(['and', 'zero', 'nullish']);
	});

	// Vitest/ESM tastet den Modul-Namespace auf diese Symbole ab — insbesondere
	// `then` beim Auflösen von `await import(...)`. Würde der Trap dafür werfen,
	// bräche schon der Import und keine Attrappe wäre mehr benutzbar.
	it('lässt die ESM- und Promise-Sonden durch, ohne zu werfen', () => {
		const mock = strictModuleMock('drizzle-orm', { and: () => [] }) as Record<
			string | symbol,
			unknown
		>;

		for (const probe of ['then', 'catch', 'finally', 'default', '__esModule', 'toJSON']) {
			expect(() => mock[probe]).not.toThrow();
			expect(mock[probe]).toBeUndefined();
		}
	});

	it('wirft nie bei Symbol-Keys', () => {
		const mock = strictModuleMock('drizzle-orm', { and: () => [] }) as Record<symbol, unknown>;

		expect(() => mock[Symbol.toStringTag]).not.toThrow();
		expect(() => mock[Symbol.iterator]).not.toThrow();
		expect(() => mock[Symbol.asyncIterator]).not.toThrow();
	});

	// Der eigentliche Zweck: Routen fangen den Fehler in ihrem catch-Block und
	// antworten mit 500 — die Meldung wäre sonst verloren (siehe PR #701).
	it('merkt sich den fehlenden Export, damit ein verschluckter Wurf sichtbar bleibt', () => {
		const mock = strictModuleMock('drizzle-orm', { and: () => [] });

		try {
			void (mock as Record<string, unknown>).isNotNull;
		} catch {
			// wie in der Route: verschluckt
		}

		expect(() => assertNoMissingMockExports()).toThrowError(/`isNotNull` nicht/);
	});

	it('meldet nichts, wenn kein Export gefehlt hat', () => {
		const mock = strictModuleMock('drizzle-orm', { and: () => [] });
		void mock.and;

		expect(() => assertNoMissingMockExports()).not.toThrow();
	});

	it('leert den Speicher beim Prüfen, damit der Folgetest sauber startet', () => {
		const mock = strictModuleMock('drizzle-orm', { and: () => [] });
		try {
			void (mock as Record<string, unknown>).isNotNull;
		} catch {
			/* verschluckt */
		}

		expect(() => assertNoMissingMockExports()).toThrow();
		expect(() => assertNoMissingMockExports()).not.toThrow();
	});

	it('meldet jeden fehlenden Export nur einmal pro Prüfung', () => {
		const mock = strictModuleMock('drizzle-orm', { and: () => [] }) as Record<string, unknown>;
		for (let i = 0; i < 3; i++) {
			try {
				void mock.isNotNull;
			} catch {
				/* verschluckt */
			}
		}

		expect(drainMissingMockExports()).toHaveLength(1);
	});
});
