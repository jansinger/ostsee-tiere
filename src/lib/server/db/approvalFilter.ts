/**
 * @fileoverview Freigabestatus (`freigegeben_am`) als explizite Prüfung
 *
 * Die öffentliche Karte (`/sichtungen/showreports.json`) zeigt ausschließlich
 * freigegebene Sichtungen. Die öffentlichen Statistiken zählten dagegen lange
 * jede eingegangene Meldung mit — Karte und Zahlentext widersprachen sich
 * dadurch sichtbar (Stand 2026-07-27: 19.262 freigegeben vs. 19.877 gesamt).
 *
 * Damit beide Seiten nicht erneut auseinanderlaufen, wird das Prädikat hier
 * **einmal** definiert und von allen öffentlichen Abfragen importiert.
 *
 * Diese Datei hat an dieser Stelle lange behauptet, ein Aufrufer ohne diesen
 * Import falle beim Review auf. Er fällt nicht auf: `/sichtungen/showreports.json`
 * hat das Prädikat monatelang als `sql`-Literal nachgebaut, und niemand hat es
 * bemerkt (behoben in PR #701). Die Regel hängt deshalb nicht mehr an der
 * Aufmerksamkeit des Reviewers, sondern an `approvalPredicateScan.test.ts`: Der
 * Test durchsucht `src/` nach selbstgebauten Freigabeprüfungen — auf die Spalte
 * in **beiden** Schreibweisen (`freigegeben_am` wie `approvedAt`), in SQL wie in
 * JavaScript — und nennt in der Fehlermeldung `approvedOnly()`, `pendingOnly()`
 * bzw. `isSightingApproved()` als Ersatz.
 *
 * Dieselbe Regel wird an drei Stellen nicht in SQL, sondern in JavaScript über
 * einer bereits geladenen Zeile ausgewertet (`/uploads/[...path]`,
 * `/api/media/[...path]`, `PATCH /api/sightings/[id]/verify`). Dafür steht
 * `isSightingApproved()` weiter unten —
 * bewusst in **dieser** Datei und nicht in einer eigenen: Eine Regel, die je
 * nach Auswertungsort in zwei Dateien steht, ist genau der Zustand, den dieses
 * Modul beseitigen soll. Wer eine der beiden Formen ändert, sieht die andere.
 *
 * Vorgabe des Deutschen Meeresmuseums (2026-07-27):
 * 1. Im öffentlichen Bereich zählen nur freigegebene Sichtungen.
 * 2. Nicht freigegebene dürfen in der Admin-Statistik vorkommen, aber niemals
 *    mit freigegebenen zu **einer** Zahl vermischt werden.
 * 3. Eine Statistikzahl ohne erkennbaren Freigabebezug soll es nicht geben.
 */

import { sightings } from '#lib/server/db/schema.ts';
import { and, isNotNull, isNull, type SQL } from 'drizzle-orm';

/**
 * Freigabestatus einer Auswertung.
 *
 * `'both'` liefert bewusst **getrennte** Werte je Status und niemals eine
 * vermischte Summe — siehe Vorgabe 2 oben.
 */
export type SightingScope = 'approved' | 'pending' | 'both';

/** Ein einzelner, eindeutig zuordenbarer Freigabestatus. */
export type ResolvedSightingScope = Exclude<SightingScope, 'both'>;

/**
 * Nur freigegebene Sichtungen — die Grundmenge des öffentlichen Bereichs.
 *
 * Auch `/sichtungen/showreports.json` (Legacy-Karte) filtert hierüber, damit
 * Karte und Statistik dieselbe Menge zählen. Dieser Endpunkt ist an den
 * Legacy-Vertrag gebunden: Änderungen an diesem Prädikat ändern seine Response.
 * `src/routes/sichtungen/showreports.json/showreports.test.ts` pinnt es
 * deshalb gegen den Ausdruck, der dort ursprünglich wörtlich stand.
 */
export const approvedOnly = (): SQL => isNotNull(sightings.approvedAt);

/** Nur noch nicht freigegebene Sichtungen (Admin-Sicht). */
export const pendingOnly = (): SQL => isNull(sightings.approvedAt);

/** Liefert den Filter zum jeweiligen Status. */
export const approvalFilter = (scope: ResolvedSightingScope): SQL =>
	scope === 'approved' ? approvedOnly() : pendingOnly();

/**
 * Der Teil einer geladenen Sichtung, der über ihren Freigabestatus entscheidet.
 *
 * `undefined` steht mit im Typ, damit eine Projektion, die `approvedAt` gar
 * nicht auswählt, nicht als freigegeben durchgeht.
 */
export type SightingApprovalState = { approvedAt: Date | null | undefined };

/**
 * `approvedOnly()` für eine bereits geladene Zeile — dieselbe Grundmenge,
 * ausgewertet in JavaScript statt in SQL.
 *
 * Genutzt von `/uploads/[...path]` und `/api/media/[...path]`: Beide haben die
 * Sichtung wegen des Joins ohnehin in der Hand und entscheiden anhand dieses
 * Werts, ob eine Datei **ohne Anmeldung** ausgeliefert wird — das sind die
 * Aufrufer, bei denen ein Fehlurteil weh tut. `PATCH /api/sightings/[id]/verify`
 * hält damit zusätzlich den Vorzustand im Audit-Log fest; dort entscheidet der
 * Wert über keinen Zugriff. Vorher trug jede der drei Routen ihre eigene
 * Inline-Prüfung.
 *
 * Bewusst die Truthy-Prüfung und nicht `!= null`: Für den deklarierten Typ sind
 * beide identisch (ein `Date` ist immer truthy, auch `new Date(0)`), aber bei
 * einem Wert außerhalb des Typs verweigert die Truthy-Prüfung den Zugriff,
 * während `!= null` ihn gewährte. In einem Endpunkt, dessen Fehlurteil nicht
 * freigegebene Fotos öffentlich macht, ist die verweigernde Richtung die
 * richtige. Die Gleichheit mit der abgelösten Schreibweise ist über alle
 * möglichen Werte in `approvalFilter.test.ts` festgehalten.
 */
export const isSightingApproved = (sighting: SightingApprovalState): boolean =>
	!!sighting.approvedAt;

/**
 * Offene Sichtungen — die Grundmenge der Admin-Eingangsseite (`/admin`).
 *
 * „Offen" heißt: weder freigegeben noch abgelehnt. Die Ablehnung ist eine
 * Triage-Dimension und KEIN dritter Freigabe-Zustand — öffentliche Flächen
 * filtern weiterhin ausschließlich über `approvedOnly()`. `pendingOnly()`
 * bleibt davon unberührt: Es meint „nicht freigegeben" (inkl. abgelehnter)
 * und ist die Gegenmenge der öffentlichen Statistik.
 */
export const openOnly = (): SQL =>
	and(isNull(sightings.approvedAt), isNull(sightings.rejectedAt)) as SQL;

/** Nur abgelehnte Sichtungen — Filter der Admin-Tabelle. */
export const rejectedOnly = (): SQL => isNotNull(sightings.rejectedAt);

/** Der Teil einer geladenen Sichtung, der über ihren Ablehnungsstatus entscheidet. */
export type SightingRejectionState = { rejectedAt: Date | null | undefined };

/**
 * `rejectedOnly()` für eine bereits geladene Zeile. Gleiche Truthy-Begründung
 * wie `isSightingApproved()` (siehe dort). Genutzt vom Verify-Endpunkt für den
 * Vorzustand im Audit-Log.
 */
export const isSightingRejected = (sighting: SightingRejectionState): boolean =>
	!!sighting.rejectedAt;
