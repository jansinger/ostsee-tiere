import * as m from '#lib/paraglide/messages.js';
import { getFormSteps } from '#lib/report/formConfig.ts';
import type { ReportKind } from '#lib/report/reportKind.ts';
import type { SightingFormData } from '#lib/types/index.ts';

/**
 * Felder, die NICHT in den angegebenen Zweig gehören — unabhängig davon, ob
 * und wie oft vorher gewechselt wurde. Ein `behavior`, das im Formularzustand
 * steht, während der Melder im Totfund-Zweig ist, ginge beim Absenden mit ans
 * Backend — und die Schritt-Validierung prüft es nicht mehr, weil es aus
 * `getFormSteps()` verschwunden ist. Umgekehrt genauso mit `deadCondition` im
 * Lebend-Zweig.
 *
 * Bewusst nicht als „beim Wechsel zu leerende Felder" formuliert: Seit
 * `changeKind()` (`reportKind.ts`) `isDead` aus den gespeicherten `FORM_DATA`
 * entfernt, ist ein vorheriger Zweig beim erneuten Betreten des Formulars
 * nicht mehr rekonstruierbar — dort steht dann nur noch der Schema-Default.
 * Die Funktion beantwortet deshalb ausschließlich „was gehört nicht in den
 * Zweig, in dem ich JETZT bin" — das deckt zusätzlich den Fall ab, dass
 * zweigfremde Daten aus einer älteren Sitzung im localStorage liegen, den ein
 * Wechsel-Vergleich nie sähe, und ist idempotent.
 *
 * Für BEIDE Zweige aus `getFormSteps` abgeleitet (einzige Quelle: genau die
 * Felder, die dort im jeweils anderen Zweig aus der Schritt-Konfiguration
 * verschwinden) statt einer zweiten, von Hand gepflegten Liste. Bis zum
 * 2026-08-06 ging das nur für den Totfund-Zweig: `getFormSteps` kannte nur
 * `HIDDEN_WHEN_DEAD`, die Totfund-Felder blendete allein das Markup aus, und
 * `FOREIGN_TO_ALIVE` stand hier als handgepflegtes Literal daneben. Mit
 * `HIDDEN_WHEN_ALIVE` (`formConfig.ts`) ist die Schritt-Konfiguration in beide
 * Richtungen symmetrisch — und die Liste hier fällt in beide Richtungen aus
 * derselben Quelle an.
 *
 * Abschlussreview B4: Der Vergleich läuft bewusst zwischen den beiden
 * `getFormSteps`-Aufrufen und NICHT gegen `formStepsConfig` direkt. `getFormSteps` bildet mittlerweile
 * drei Achsen ab — Totfund (`isDead`), Beobachtungsort (`sightingFrom`) und
 * Medien-Upload (`uploadedFiles`, über `hasUploadedMedia`) — und diese Funktion
 * darf ausschließlich die erste beantworten. Ein Diff gegen `formStepsConfig`
 * zieht JEDE Bedingung mit herein, die `getFormSteps` unabhängig von `isDead`
 * anwendet: Beide Aufrufe unten lassen `sightingFrom` und `uploadedFiles`
 * bewusst weg (bleiben `undefined`), sodass `mediaConsent` — hier `hasUploadedMedia(undefined)`
 * ist `false` — in BEIDEN Aufrufen gleichermaßen fehlt und sich beim Differenzbilden
 * gegenseitig aufhebt, statt fälschlich als „gehört nicht in den Totfund-Zweig" zu erscheinen.
 * Genau das war der Fehler: Der vorherige Vergleich gegen `formStepsConfig` (das
 * `mediaConsent` uneingeschränkt führt) ließ `getFormSteps({ isDead: true })`s
 * Medien-bedingtes Entfernen von `mediaConsent` wie eine Totfund-Bedingung aussehen.
 * Eine künftige vierte Achse in `getFormSteps` bleibt aus demselben Grund automatisch
 * außen vor, solange sie nicht von `isDead` abhängt — keine Anpassung hier nötig.
 */
export function fieldsOutsideReportKind(kind: ReportKind): (keyof SightingFormData)[] {
	const keptWhenAlive = getFormSteps({ isDead: false }).flatMap((step) => step.fields);
	const keptWhenDead = getFormSteps({ isDead: true }).flatMap((step) => step.fields);

	// Was der ANDERE Zweig führt und dieser nicht: die Felder, die im aktuellen
	// Zweig nichts verloren haben.
	const [kept, foreign] =
		kind === 'alive' ? [keptWhenAlive, keptWhenDead] : [keptWhenDead, keptWhenAlive];
	const keptSet = new Set(kept);

	return foreign.filter((field) => !keptSet.has(field)) as (keyof SightingFormData)[];
}

/**
 * Was der Melder darüber erfahren soll, dass `fieldsOutsideReportKind`
 * tatsächlich etwas geräumt hat — oder `null`, wenn nichts zu melden ist.
 *
 * UX-Review (2026-08-06, Punkt 3): Der Wechsel über „Ändern" nahm die Felder
 * des verlassenen Zweigs kommentarlos mit. Sichtbar wird das erst Schritte
 * später, und ohne Erklärung liegt die Vermutung nahe, dass auch Position,
 * Datum und Fotos betroffen sind — genau die teuersten Eingaben. Der zweite
 * Halbsatz beantwortet das mit.
 *
 * `clearedCount` statt der Feldliste: Welche Felder es einzeln waren, ist für
 * den Melder ohne Belang — er hat sie unter „Angaben zum Totfund" bzw.
 * „Verhalten" ausgefüllt, nicht unter `deadPhoneContact`. Gebraucht wird nur
 * die Unterscheidung „es wurde etwas geräumt" von „es war nichts da": Eine
 * Meldung über eine Änderung, die nicht stattgefunden hat, ist schlimmer als
 * keine — und dieser Fall ist der häufigere (jeder gewöhnliche Formularstart,
 * und der Wechsel zurück in denselben Zweig).
 */
export function reportKindClearedNotice(kind: ReportKind, clearedCount: number): string | null {
	if (clearedCount === 0) {
		return null;
	}

	// „Verhalten und Entfernung": Seit dem UX-Review 2026-08-07 entfällt beim
	// Totfund auch `distance` (HIDDEN_WHEN_DEAD) — der Text muss mitziehen,
	// sonst verschweigt er einen Teil dessen, was gerade geräumt wurde.
	// Der Einschub ist eine NOMINALPHRASE, kein Satzteil mit eigener Stellung —
	// deshalb hier ausnahmsweise ein Parameter statt zweier ganzer Sätze.
	const removed =
		kind === 'alive'
			? m.report_fieldsoutsidereportkind_text_zum_totfund()
			: m.report_fieldsoutsidereportkind_text_zum_verhalten_und_zur_entfernung();
	return m.report_fieldsoutsidereportkind_text_ihre_angaben_removed_wurden_entfernt({ removed });
}
