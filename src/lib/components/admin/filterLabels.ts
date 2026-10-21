/**
 * @fileoverview Beschriftung der Filterwerte der Sichtungstabelle: die zwei
 * Ja/Nein-Wortpaare — „Mit"/„Ohne" und „Lebendsichtung" — und die Auflösung
 * der Kanal-ID.
 *
 * Sie standen bis 2026-08-10 in `src/routes/admin/sichtungen/filterChips.ts`,
 * mit der dort notierten Begründung: Kein Präsentationsmodul führt diese Wörter,
 * weil sie keine Auszeichnung eines Datensatzes sind, sondern nur die zwei
 * Seiten eines Filters. Die Begründung gilt unverändert — geändert hat sich nur,
 * **wer** sie braucht: neben Chip-Zeile und Filter-Panel jetzt auch der
 * Export-Dialog (`exportFilterDisplay.ts`), und der liegt in `#lib`. Ein Import
 * aus `src/routes/**` hinein wäre eine umgekehrte Abhängigkeit; dieselben Wörter
 * ein zweites Mal zu tippen wäre die Zweitbeschriftung, gegen die die Chips
 * angetreten sind. Also stehen sie hier, wo beide Seiten sie erreichen.
 *
 * Der Sonderwert der Aufnahme-Auswahl kommt weiterhin aus seinem eigenen Modul
 * — er trägt eine fachliche Aussage (`photoAnnouncement.ts`).
 *
 * Client-sicher: **kein** Import aus `#lib/server/**`.
 */
import { DEAD_FINDING_PRESENTATION } from '#lib/components/admin/deadFinding.ts';
import { getEntryChannelOptions } from '#lib/report/formOptions/entryChannel.ts';
import { MEDIA_UPLOAD_ANNOUNCED_MISSING } from '#lib/utils/media/photoAnnouncement.ts';

/**
 * Die Kanal-ID aus der URL als Wort. Ein Wert, den keine Quelle kennt
 * (veraltetes Lesezeichen, von Hand getippte URL), erscheint unverändert — ihn
 * wegzulassen wäre der schlechtere Ausgang: Gefiltert würde weiterhin, nur
 * stünde es nirgends.
 */
export function kanalLabel(value: string): string {
	return getEntryChannelOptions().find((option) => String(option.value) === value)?.label ?? value;
}

/**
 * Die drei Zustände des Aufnahme-Filters. Quelle für die `<option>`-Texte des
 * Panels (`admin/sichtungen/+page.svelte`), für den Chip und für den Satz im
 * Export-Dialog.
 *
 * Endliche Schlüsselmenge statt `Record<string, string>`: So liefert ein
 * Zugriff mit bekanntem Schlüssel unter `noUncheckedIndexedAccess` ein `string`
 * statt `string | undefined`, und ein Wert aus der URL muss vorher durch den
 * Wächter — dieselbe Konstruktion wie bei `isBalticSeaStatus`.
 */
export type AufnahmeFilterWert = '1' | '0' | typeof MEDIA_UPLOAD_ANNOUNCED_MISSING;

export const AUFNAHME_LABEL: Record<AufnahmeFilterWert, string> = {
	'1': 'Mit',
	'0': 'Ohne',
	[MEDIA_UPLOAD_ANNOUNCED_MISSING]: 'Angekündigt, fehlt noch'
};

export function isAufnahmeFilterWert(value: string): value is AufnahmeFilterWert {
	return Object.hasOwn(AUFNAHME_LABEL, value);
}

/**
 * Gegenstück zum Totfund; `deadFinding.ts` führt für den Normalfall bewusst kein
 * Wort, deshalb steht „Lebendsichtung" hier.
 */
export type MeldeartFilterWert = '1' | '0';

export const MELDEART_LABEL: Record<MeldeartFilterWert, string> = {
	'1': DEAD_FINDING_PRESENTATION.label,
	'0': 'Lebendsichtung'
};

export function isMeldeartFilterWert(value: string): value is MeldeartFilterWert {
	return Object.hasOwn(MELDEART_LABEL, value);
}
