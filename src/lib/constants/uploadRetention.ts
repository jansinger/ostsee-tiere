/**
 * Aufbewahrungsfrist für unverknüpfte Uploads — Dateien, die übertragen, aber
 * nie mit einer abgeschickten Sichtung verknüpft wurden.
 *
 * Steht bewusst **nicht** unter `#lib/server`: Der Hinweis an der Dropzone
 * (`#lib/form/consent/uploadNotice.js`) nennt diese Frist und läuft im Browser,
 * das Aufräumen (`src/tools/cleanup-orphaned-uploads.ts`) auf dem Server. Beide
 * beziehen sie von hier, damit die Zusage im Formular und das tatsächliche
 * Verhalten nicht auseinanderlaufen können (`uploadNotice.test.ts`).
 *
 * Begründung der 24 Stunden: Formularentwürfe liegen in `sessionStorage` und
 * überstehen das Schließen des Tabs nicht — was so lange unverknüpft liegt,
 * kann nicht mehr abgesendet werden.
 */
export const ORPHAN_RETENTION_HOURS = 24;

/** Dieselbe Frist in der Schreibweise des Aufräum-Tools (`--older-than`). */
export const ORPHAN_RETENTION = `${ORPHAN_RETENTION_HOURS}h`;
