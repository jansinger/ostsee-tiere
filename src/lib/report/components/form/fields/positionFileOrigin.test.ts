import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	isPositionUid,
	loadPositionUids,
	markPositionFile,
	unmarkPositionFile,
	withPositionUid,
	withoutPositionUid
} from './positionFileOrigin';

// `loadFromStorage`/`saveToStorage` steigen ohne Browser sofort aus. Für die
// Ausfall-Tests unten muss der Browser-Zweig genommen werden — sonst wäre jede
// dieser Funktionen schon durch die SSR-Wache ein No-op und der Test bewiese
// nichts.
vi.mock('$app/env', () => ({ browser: true }));

describe('positionFileOrigin — reine Mengen-Regeln', () => {
	it('nimmt eine uid auf', () => {
		expect(withPositionUid([], 'a')).toEqual(['a']);
	});

	it('nimmt dieselbe uid nicht doppelt auf', () => {
		expect(withPositionUid(['a'], 'a')).toEqual(['a']);
	});

	it('behält bestehende uids beim Hinzufügen', () => {
		expect(withPositionUid(['a'], 'b')).toEqual(['a', 'b']);
	});

	it('entfernt eine uid', () => {
		expect(withoutPositionUid(['a', 'b'], 'a')).toEqual(['b']);
	});

	it('bleibt beim Entfernen einer unbekannten uid unverändert', () => {
		expect(withoutPositionUid(['a'], 'zzz')).toEqual(['a']);
	});

	it('erkennt enthaltene und nicht enthaltene uids', () => {
		expect(isPositionUid(['a'], 'a')).toBe(true);
		expect(isPositionUid(['a'], 'b')).toBe(false);
		expect(isPositionUid([], 'a')).toBe(false);
	});

	it('verändert die übergebene Liste nicht', () => {
		const uids = ['a'];
		withPositionUid(uids, 'b');
		withoutPositionUid(uids, 'a');
		expect(uids).toEqual(['a']);
	});
});

/**
 * Ausfall des sessionStorage.
 *
 * `sessionStorage.setItem` wirft `SecurityError`, wenn der Browser den Zugriff
 * sperrt (Chrome „alle Cookies blockieren", abgeschottetes Safari), und
 * `QuotaExceededError`, wenn er voll ist. Die Vormerkung ist reine
 * UI-Information; ihr Verlust darf höchstens den Hinweis kosten — nicht den
 * Upload. `markPositionFile` läuft in `handleFilesAdded`, das
 * `UnifiedDropzone.svelte` ohne `await` aufruft: Eine Ausnahme hier ließe die
 * Datei nie im Store ankommen, sichtbar als „die Dropzone tut nichts".
 * `loadPositionUids` läuft sogar im `$effect.pre`, also mitten im Rendern.
 */
describe('positionFileOrigin — Ausfall des sessionStorage', () => {
	function breakStorage(method: 'getItem' | 'setItem', error: Error): void {
		const storage = {
			getItem: () => null,
			setItem: () => undefined,
			removeItem: () => undefined,
			clear: () => undefined,
			key: () => null,
			length: 0
		};
		Object.defineProperty(storage, method, {
			value: () => {
				throw error;
			}
		});
		vi.stubGlobal('sessionStorage', storage);
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('lässt einen Schreibfehler nicht bis zum Aufrufer durch', () => {
		breakStorage('setItem', new DOMException('quota', 'QuotaExceededError'));

		expect(() => markPositionFile('uid-1')).not.toThrow();
		expect(() => unmarkPositionFile('uid-1')).not.toThrow();
	});

	it('lässt einen Lesefehler nicht bis zum Aufrufer durch und meldet eine leere Menge', () => {
		breakStorage('getItem', new DOMException('blocked', 'SecurityError'));

		expect(() => loadPositionUids()).not.toThrow();
		expect(loadPositionUids()).toEqual([]);
	});
});
