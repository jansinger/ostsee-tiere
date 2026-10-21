import type { SightingFormData } from '#lib/types/index.ts';

/**
 * Felder, die beim Vergleich nicht zählen — sie tragen keine Nutzereingabe und
 * dürfen den Wiederherstellungs-Toast deshalb nicht auslösen:
 *
 * - `referenceId`: pro Formular-Mount neu erzeugt (`createId()` in
 *   `ModernReportForm.svelte`). `savedFormData` trägt immer die Referenz der
 *   VORHERIGEN Sitzung — ein Vergleich ohne diese Ausnahme wäre also immer
 *   „verschieden".
 * - `isDead`: kommt aus `initialIsDead` von der Einstiegsseite
 *   (`ReportKindChoice`), nicht vom Nutzer im Formular getippt.
 * - `entryChannel`: fester Schema-Default (`.default(0)`), im Meldeformular
 *   kein Bedienelement — nur die Admin-Maske zeigt/ändert es.
 * - `weatherData`: `type: 'hidden'` im Schema, wird automatisch von der
 *   Wetter-API befüllt (`Environment.svelte`), nicht vom Nutzer eingegeben.
 */
const IGNORED_FIELDS: ReadonlySet<keyof SightingFormData> = new Set([
	'referenceId',
	'isDead',
	'entryChannel',
	'weatherData'
]);

/**
 * Ob die aus dem Storage geladenen Formulardaten sich tatsächlich vom
 * Initialzustand unterscheiden — also ob eine frühere Sitzung wirklich etwas
 * hinterlassen hat, das den Wiederherstellungs-Toast in `ModernReportForm.svelte`
 * rechtfertigt.
 *
 * Feld für Feld verglichen, nicht per `JSON.stringify` über das ganze Objekt:
 * Reihenfolge-Unterschiede in verschachtelten Strukturen dürften sonst falsch
 * positiv auslösen, und die Ausnahmen in `IGNORED_FIELDS` ließen sich über
 * einen Gesamtvergleich nicht sauber herausrechnen.
 *
 * `uploadedFiles` ist die eine Ausnahme vom Feld-für-Feld-Vergleich: Es ist ein
 * Array, ein `!==` auf die Referenz wäre immer wahr. Die Länge genügt hier —
 * bereits eine hochgeladene Datei ist ein Unterschied, der es wert ist, gemeldet
 * zu werden; ein inhaltlicher Abgleich (Dateiname, Größe, …) bringt keinen
 * zusätzlichen Erkenntnisgewinn, den der Nutzer über den Toast bewerten könnte.
 */
export function hasMeaningfulSavedData(
	saved: SightingFormData,
	initial: SightingFormData
): boolean {
	if ((saved.uploadedFiles?.length ?? 0) !== (initial.uploadedFiles?.length ?? 0)) {
		return true;
	}

	const keys = new Set<keyof SightingFormData>([
		...(Object.keys(saved) as (keyof SightingFormData)[]),
		...(Object.keys(initial) as (keyof SightingFormData)[])
	]);

	for (const key of keys) {
		if (key === 'uploadedFiles' || IGNORED_FIELDS.has(key)) continue;
		if (saved[key] !== initial[key]) return true;
	}

	return false;
}
