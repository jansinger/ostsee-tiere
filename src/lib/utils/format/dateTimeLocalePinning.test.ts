/**
 * @fileoverview Guard-Test: Die Ersatztexte der Datumsformatierung folgen der
 * Anzeigesprache, die der Aufrufer übergibt — und die Export-Pfade übergeben
 * keine, bekommen also Deutsch.
 *
 * **Warum das hier besonders leicht schiefgeht.** `dateTime.ts` bedient beide
 * Welten aus denselben Funktionen:
 *
 * | Aufrufer | erwartet |
 * | --- | --- |
 * | `server/export/csvExport.ts` | Deutsch — Vertrag mit dem Altbestand |
 * | `server/services/emailService.ts` | Deutsch — Empfänger ist das Museum |
 * | `formatForKmlExport` / `formatForXmlExport` | Deutsch — Exportformate |
 * | Karte, Meldeformular, `about` | die aktive Sprache |
 *
 * Ein `m.key()` ohne Locale-Argument wäre in `csvExport` an `getLocale()`
 * gekoppelt gewesen. Das ist derselbe Fehler, der in Etappe 1 dreimal
 * zuschlug (Legacy-API, CSV-Export, Museums-Mail) — hier zum vierten Mal
 * derselbe Pfad, nur über eine Hilfsfunktion statt direkt.
 *
 * **Die Lösung braucht keinen zweiten Parameter.** `formatLocalDateTime` trägt
 * bereits ein `locale`-Argument für die Zahlen- und Datumsformatierung; der
 * Ersatztext folgt jetzt demselben Argument. Wer Deutsch formatiert, bekommt
 * deutschen Ersatztext — ohne dass die Aufrufstelle etwas zusätzlich wissen
 * müsste. `APP_LOCALE` (`de-DE`) ist der Vorgabewert, also sind alle
 * Export- und Mailpfade ohne Änderung richtig.
 *
 * Die englischen Botschaften werden für die Dauer des Tests künstlich
 * auseinandergezogen: `messages/en.json` trägt heute noch denselben deutschen
 * Wortlaut, ein Vergleich mit dem echten Katalog wäre also grün, ohne etwas zu
 * belegen.
 */
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

const DIVERGED_INVALID = 'TEST-ONLY-DIVERGED-INVALID-DATE';
const DIVERGED_MISSING = 'TEST-ONLY-DIVERGED-NOT-SPECIFIED';

vi.mock('#lib/paraglide/messages.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/paraglide/messages.js')>();
	const diverge =
		(original: (i?: Record<string, never>, o?: { locale?: 'de' | 'en' }) => string, en: string) =>
		(inputs?: Record<string, never>, options?: { locale?: 'de' | 'en' }) =>
			options?.locale === 'en' ? en : original(inputs, options);
	return {
		...actual,
		utils_format_datetime_text_ungueltiges_datum: diverge(
			actual.utils_format_datetime_text_ungueltiges_datum,
			DIVERGED_INVALID
		),
		utils_format_datetime_text_nicht_angegeben: diverge(
			actual.utils_format_datetime_text_nicht_angegeben,
			DIVERGED_MISSING
		)
	};
});

const { formatLocalDateTime, formatForKmlExport, formatForXmlExport } = await import('./dateTime');
const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');

/** Ein Wert, den `new Date(...)` zuverlässig als ungültig meldet. */
const INVALID = 'kein-datum';

describe('dateTime — Ersatztexte und Locale', () => {
	it('liefert im Export Deutsch, obwohl die aktive Locale Englisch ist', () => {
		overwriteGetLocale(() => 'en');
		try {
			expect(formatForKmlExport(INVALID)).toBe('Ungültiges Datum');
			expect(formatForXmlExport(INVALID).date).toBe('Ungültiges Datum');
		} finally {
			overwriteGetLocale(() => baseLocale);
		}
	});

	it('liefert für den Vorgabe-Aufruf Deutsch — das ist der Weg von csvExport und emailService', () => {
		overwriteGetLocale(() => 'en');
		try {
			expect(formatLocalDateTime(INVALID)).toBe('Ungültiges Datum');
			expect(formatLocalDateTime(null)).toBe('Nicht angegeben');
		} finally {
			overwriteGetLocale(() => baseLocale);
		}
	});

	it('folgt der Anzeigesprache, wenn der Aufrufer sie übergibt', () => {
		// Die Gegenprobe. Ohne sie wäre alles oben auch dann grün, wenn die
		// Ersatztexte schlicht hartcodiert blieben — die Anwendung wäre an
		// dieser Stelle einsprachig, und nichts sagte es. Genau diese Blindheit
		// lag in Etappe 1 vierzig Commits lang über der gesamten Locale-Testmenge.
		expect(formatLocalDateTime(INVALID, 'datetime', 'en-GB')).toBe(DIVERGED_INVALID);
		expect(formatLocalDateTime(null, 'datetime', 'en-GB')).toBe(DIVERGED_MISSING);
	});

	it('nimmt auch die kurze Locale an, nicht nur den BCP-47-Tag', () => {
		// `resolveDisplayLocale` reicht unbekannte Tags unverändert durch, und
		// eine Aufrufstelle könnte `getLocale()` direkt übergeben.
		expect(formatLocalDateTime(INVALID, 'datetime', 'en')).toBe(DIVERGED_INVALID);
	});
});
