/**
 * Baut einen Wert je Locale genau einmal und hält ihn danach vor.
 *
 * Hintergrund: Yup-Schemas und die formOptions-Listen werten beim Aufbau aus —
 * Message-Funktionen, Feldnamen, Sortierung. Die Locale ist dabei die einzige
 * Variable; für zwei Sprachen genügen deshalb zwei fertig gebaute Instanzen.
 * Das ist bewusst KEIN prozessweiter `$state` im Sinne von
 * `.claude/rules/architecture.md`: Es gibt keinen mutierbaren Zustand, der
 * zwischen Requests verschiedener User divergieren könnte — die Map bildet
 * ausschließlich `Locale → unveränderliches Baurergebnis` ab, und für dieselbe
 * Locale liefert `build` immer denselben Wert.
 */
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';

export function memoizePerLocale<T>(build: (locale: Locale) => T): (locale?: Locale) => T {
	const cache = new Map<Locale, T>();

	return (locale: Locale = getLocale()): T => {
		if (cache.has(locale)) {
			return cache.get(locale)!;
		}
		const value = build(locale);
		cache.set(locale, value);
		return value;
	};
}
