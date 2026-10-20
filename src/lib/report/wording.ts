/**
 * Ansprache im Meldeformular: Sichtung oder Totfund.
 *
 * Das Museum will für den Totfund eigene Formulierungen — „Was haben Sie
 * gefunden?" statt „Was haben Sie beobachtet?", „Funddetails" statt
 * „Sichtungsdetails". Vorgesehen sind dafür zwei getrennte Formulare hinter
 * einer Einstiegsseite; die gibt es noch nicht.
 *
 * Bis dahin trägt der Totfund-Schalter die Unterscheidung: Er ist das erste Feld
 * der Karte „Tierinformationen" auf Schritt 2 — seit dem Umzug des Medien-Uploads
 * steht diese Karte allerdings nicht mehr ganz oben, sondern hinter dem
 * Upload-Abschnitt. Für die Ansprache reicht das: Der Schalter steht weiterhin
 * vor allem, was auf ihn reagiert (Artfrage, Detail-Karte), und der Schritt-Kopf
 * darüber wird von Svelte ohnehin reaktiv nachgezogen. Das deckt die Stellen
 * ab, die das Dokument für Seite 2 nennt. Die Totfund-Texte für Seite 1
 * („Funddatum", die umgedrehte Marker-Erklärung, der entschärfte
 * Ostsee-Hinweis) stehen weiter unten in dieser Datei — `isDead` ist dort über
 * `initialIsDead` bereits auf Schritt 1 beantwortet.
 *
 * Die Zuordnung steht hier an EINER Stelle statt als Ternär in drei
 * Komponenten: Sie wird beim Bau der getrennten Formulare wieder gebraucht, und
 * drei Kopien liefen bis dahin auseinander.
 */

// `isDeadFinding` lebt in `formConfig.ts` — Begründung und Herkunft der Regel
// stehen dort an der Definition.
import * as m from '#lib/paraglide/messages.js';
import { isDeadFinding } from '#lib/report/formConfig.ts';

/** Beschriftung des Artfeldes auf Schritt 2. */
export function speciesQuestion(isDead: unknown): string {
	return isDeadFinding(isDead)
		? m.report_wording_text_welche_tierart_haben_sie_gefunden()
		: m.report_wording_text_welche_tierart_haben_sie_gesehen();
}

/** Einleitungsfrage im Kopf von Schritt 2. */
export function observationQuestion(isDead: unknown): string {
	return isDeadFinding(isDead)
		? m.report_wording_text_was_haben_sie_gefunden()
		: m.report_wording_text_was_haben_sie_beobachtet();
}

/**
 * Beschriftung des Herkunftsfeldes (`sightingFrom`) auf Schritt 2.
 *
 * Die Karte darüber heißt beim Totfund „Funddetails" (`detailsSectionTitle`),
 * das erste Feld darin fragte trotzdem weiter nach der Sichtung — das
 * Schema-Label kennt nur den Lebend-Zweig.
 *
 * Der Lebend-Zweig gibt wörtlich das Schema-Label zurück (verbindliche
 * Auftraggeber-Regel, siehe `dateSectionTitle`): Die Aufrufstelle kann die
 * Beschriftung deshalb unbedingt überschreiben, ohne im Lebend-Zweig etwas zu
 * verändern — nötig, weil `exactOptionalPropertyTypes` kein `undefined` an ein
 * optionales Prop erlaubt. Dass beide Texte übereinstimmen, prüft
 * `wording.test.ts` gegen das Schema selbst.
 */
export function sightingFromQuestion(isDead: unknown): string {
	return isDeadFinding(isDead)
		? m.report_wording_text_von_wo_aus_haben_sie_das_tier_gefunden()
		: // Wörtlich DIESELBE Botschaft, die das Schema als Label führt — nicht
			// eine zweite mit gleichem Wortlaut. Sonst könnten die beiden in einer
			// Zielsprache auseinanderlaufen, und `wording.test.ts` prüft ihre
			// Gleichheit gegen das Schema.
			m.sighting_sightingfrom_label();
}

/** Titel der Karte unter den Tierangaben auf Schritt 2. */
export function detailsSectionTitle(isDead: unknown): string {
	return isDeadFinding(isDead)
		? m.report_wording_text_funddetails()
		: m.report_wording_text_sichtungsdetails();
}

/**
 * Titel der Datumskarte auf Schritt 1.
 *
 * Verbindliche Entscheidung des Auftraggebers (Review Task 6, Befund 1): Der
 * Lebend-Zweig behält wörtlich „Datum und Uhrzeit" — der bestehende Weg für
 * Lebend-Melder darf sich durch die Totfund-Ansprache nicht sichtbar ändern.
 */
export function dateSectionTitle(isDead: unknown): string {
	return isDeadFinding(isDead)
		? m.report_wording_text_funddatum()
		: m.report_wording_text_datum_und_uhrzeit();
}

/**
 * Einleitungszeile über den Datumsfeldern. Die Karte hat heute keine
 * Einleitung — beim Lebend-Zweig bleibt es deshalb bei `null`, statt einen
 * Satz zu erfinden, der vorher nicht da war.
 */
export function dateSectionIntro(isDead: unknown): string | null {
	return isDeadFinding(isDead) ? m.report_wording_text_an_welchem_tag_war_der_fund() : null;
}

/** Frage über der Positionsangabe auf Schritt 1. */
export function positionQuestion(isDead: unknown): string {
	return isDeadFinding(isDead)
		? m.report_wording_text_wo_haben_sie_das_tier_gefunden()
		: m.report_wording_text_wo_haben_sie_das_tier_gesehen();
}

/** Erklärtext unter der Karte auf Schritt 1: sagt, wofür der Marker steht. */
export function mapHint(isDead: unknown, hasPosition: boolean, enableGPS: boolean): string {
	// SECHS ganze Sätze statt eines Satzes mit `${verb}`-Einschub. Das Verb steht
	// MITTEN im Satz; ein Parameter dort friert die deutsche Wortstellung ein —
	// „the spot where you found the animal" stellt sie anders. Muster C aus
	// `docs/i18n/ARBEITSPROTOKOLL_ETAPPE1.md`: Steht die Auszeichnung mitten im
	// Satz, hilft nur der ganze Satz je Variante.
	const dead = isDeadFinding(isDead);
	if (!hasPosition) {
		return dead
			? m.report_wording_text_noch_keine_position_gewaehlt_gefunden()
			: m.report_wording_text_noch_keine_position_gewaehlt_gesehen();
	}
	if (enableGPS) {
		return dead
			? m.report_wording_text_tippen_sie_auf_die_karte_gps_gefunden()
			: m.report_wording_text_tippen_sie_auf_die_karte_gps_gesehen();
	}
	return dead
		? m.report_wording_text_tippen_sie_auf_die_karte_oder_ziehen_gef()
		: m.report_wording_text_tippen_sie_auf_die_karte_oder_ziehen_ges();
}

/**
 * Hinweistext, wenn die gewählte Position außerhalb der Ostsee liegt.
 *
 * Beim Totfund ist eine Position an Land der Normalfall (Strandfund) — der
 * strengere Sichtungs-Wortlaut würde dort ständig aufscheinen.
 */
export function outsideBalticNotice(isDead: unknown): string {
	return isDeadFinding(isDead)
		? m.report_wording_text_bitte_pruefen_sie_die_position_totfunde()
		: m.report_wording_text_die_koordinaten_liegen_scheinbar_ausserh();
}

/** Dringlichkeit des Ostsee-Hinweises: beim Totfund niedriger (siehe oben). */
export function outsideBalticSeverity(isDead: unknown): 'warning' | 'info' {
	return isDeadFinding(isDead) ? 'info' : 'warning';
}

/**
 * Zweiter Satz der Einleitung auf Schritt 3 („Weitere Informationen").
 *
 * Der Satz warb bislang unbedingt mit „Verhaltensinformationen … helfen bei
 * der Artbestimmung" — die Verhaltens-Karte (`Behavior.svelte`) ist beim
 * Totfund aber ausgeblendet (`Step3Observations.svelte`, `isDeadFinding`).
 * Ein totes Tier zeigt kein Verhalten mehr; der Kopf darf deshalb nichts
 * versprechen, das die Karte darunter nicht einlöst (Abschlussreview,
 * nicht blockierend).
 */
export function step3ObservationsIntro(isDead: unknown): string {
	return isDeadFinding(isDead)
		? m.report_wording_text_umweltbedingungen_helfen_beim_verstaendn()
		: m.report_wording_text_verhaltensinformationen_und_umweltbeding();
}

/**
 * Einleitungssatz der Umweltkarte (`sections/Environment.svelte`).
 *
 * Der Satz warb in beiden Zweigen mit „beeinflussen sowohl die Sichtbarkeit
 * als auch das Tierverhalten". Beim Totfund trifft keines von beidem zu: Das
 * Tier verhält sich nicht mehr, und gefunden ist es bereits. Was Wetter und
 * Seegang dort tatsächlich beeinflussen, ist der **Zustand** des Fundes —
 * genau das hat das Meeresmuseum angemerkt (2026-08-13).
 *
 * Der Sichtungs-Satz behält seinen `sections_environment`-Schlüssel: Der Name
 * kommt vom Extraktions-Pfad und ist ein Bezeichner, kein Ort. Ihn umzubenennen
 * hieße, denselben Text in beiden Sprachdateien neu anzulegen.
 */
export function environmentIntro(isDead: unknown): string {
	return isDeadFinding(isDead)
		? m.report_wording_text_wetter_und_seebedingungen_koennen_den()
		: m.report_components_sections_environment_text_wetter_und_seebedingungen_beeinflussen_s();
}
