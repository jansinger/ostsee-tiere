/**
 * `static/history-guard.js` läuft als klassisches Skript vor SvelteKit und hat
 * deshalb kein Modul, das man importieren könnte. Der Test führt die Datei in
 * einem eigenen Kontext aus, mit einer nachgebauten History, die sich wie
 * Safari (Aufrufe ignoriert) oder wie ein intakter Browser verhält.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const guardJs = readFileSync('static/history-guard.js', 'utf8');

interface FakeHistory {
	readonly state: unknown;
	pushState(state: unknown, unused: string, url?: string): void;
	replaceState(state: unknown, unused: string, url?: string): void;
}

function setup({ embedded, ignoresCalls }: { embedded: boolean; ignoresCalls: boolean }): {
	history: FakeHistory;
} {
	let stored: unknown = null;

	class History {
		get state(): unknown {
			return stored === null ? null : structuredClone(stored);
		}
		pushState(state: unknown): void {
			if (!ignoresCalls) stored = state;
		}
		replaceState(state: unknown): void {
			if (!ignoresCalls) stored = state;
		}
	}

	const window: { top?: unknown } = {};
	window.top = embedded ? {} : window;
	const context = { window, History, structuredClone };
	runInNewContext(guardJs, context);

	return { history: new History() as FakeHistory };
}

describe('history-guard.js', () => {
	it('liefert im iframe den Zustand, den Safari verworfen hat', () => {
		const { history } = setup({ embedded: true, ignoresCalls: true });

		history.replaceState({ meta: { resetIndex: 42 } }, '');

		expect(history.state).toEqual({ meta: { resetIndex: 42 } });
	});

	it('folgt auch pushState und späteren Aufrufen', () => {
		const { history } = setup({ embedded: true, ignoresCalls: true });

		history.replaceState({ n: 1 }, '');
		history.pushState({ n: 2 }, '');

		expect(history.state).toEqual({ n: 2 });
	});

	it('gibt eine Kopie heraus, wie der Browser', () => {
		const { history } = setup({ embedded: true, ignoresCalls: true });
		const state = { n: 1 };

		history.replaceState(state, '');
		state.n = 2;

		expect(history.state).toEqual({ n: 1 });
	});

	it('greift bei intakter History nicht ein', () => {
		const { history } = setup({ embedded: true, ignoresCalls: false });

		history.replaceState({ n: 1 }, '');
		history.replaceState(null, '');

		expect(history.state).toBeNull();
	});

	it('bleibt außerhalb eines iframes inaktiv', () => {
		const { history } = setup({ embedded: false, ignoresCalls: true });

		history.replaceState({ n: 1 }, '');

		expect(history.state).toBeNull();
	});
});
