/**
 * Aufbewahrungsfrist für Kontaktdaten der meldenden Person.
 *
 * Weisung des Landesdatenschutzbeauftragten MV: Löschung bzw. Anonymisierung
 * spätestens 3 Monate nach Eingang. Eine Vorgabe der Aufsicht, keine
 * Einstellung — deshalb Konstante und kein Wert in `app_config`
 * (docs/ANONYMISIERUNG_KONZEPT.md, Abschnitt 5.1).
 *
 * Steht nicht unter `#lib/server`, weil der Fristhinweis im Eingang (PR 5) im
 * Browser dieselbe Frist nennt wie der Job auf dem Server.
 */
export const ANONYMIZE_AFTER_MONTHS = 3;
