/**
 * @fileoverview Einordnung jeder Spalte von `sichtungen` nach Personenbezug.
 *
 * Einzige Quelle dafür, was die Anonymisierung 3 Monate nach Eingang leert
 * (docs/ANONYMISIERUNG_KONZEPT.md, Abschnitt 5; Entscheidungen E1–E3 mit dem
 * Museum abgestimmt am 2026-11-02). `piiColumns.test.ts` verlangt, dass jede
 * Spalte hier steht — eine neue Spalte ohne Einordnung bricht den Test.
 */
import type { sightings } from '#lib/server/db/schema.ts';

/**
 * - `contact`   — wird immer geleert (E1)
 * - `name`      — wird geleert, wenn `namensnennung = 0` (E1)
 * - `ship`      — wird geleert, wenn `schiffnamensnennung = 0` (E2)
 * - `freeText`  — kann Personenbezug enthalten, bleibt aber; bereinigt wird
 *                 von Hand bei der Prüfung (E3)
 * - `media`     — Dateiname einer Aufnahme; gehört zum Medien-Thema des
 *                 Datenschutz-Abgleichs, nicht zu dieser Anonymisierung
 * - `pseudonym` — Melder-Hash; bleibt, damit Meldungen verknüpft bleiben
 * - `none`      — kein Personenbezug zur meldenden Person
 */
export type SightingColumnClass =
	'contact' | 'name' | 'ship' | 'freeText' | 'media' | 'pseudonym' | 'none';

type SightingColumn = keyof typeof sightings.$inferSelect;

export const SIGHTING_COLUMN_CLASSES: Record<SightingColumn, SightingColumnClass> = {
	// Kontaktdaten (E1)
	email: 'contact',
	phone: 'contact',
	fax: 'contact',
	street: 'contact',
	zipCode: 'contact',
	city: 'contact',

	// Name, nur mit Einwilligung erhalten (E1)
	firstName: 'name',
	lastName: 'name',

	// Schiff, nur mit Einwilligung erhalten (E2) — führt bei Sportbooten zum Eigner
	shipName: 'ship',
	homePort: 'ship',

	// Freitexte (E3)
	notes: 'freeText',
	otherObservations: 'freeText',
	internalComment: 'freeText',
	reaction: 'freeText',
	waterway: 'freeText',
	seaMark: 'freeText',
	sightingFromText: 'freeText',
	distributionText: 'freeText',
	behaviorText: 'freeText',
	boatDriveText: 'freeText',

	mediaFile: 'media',

	reporterHash: 'pseudonym',
	reporterInternal: 'pseudonym',

	// Ohne Personenbezug zur meldenden Person. `approvedBy`/`rejectedBy` nennen
	// Admins des Museums, nicht die meldende Person; `entryClient` ist der
	// User-Agent der Software.
	id: 'none',
	latitude: 'none',
	longitude: 'none',
	location: 'none',
	sightingDate: 'none',
	sightingFrom: 'none',
	distance: 'none',
	shipCount: 'none',
	totalCount: 'none',
	juvenileCount: 'none',
	distribution: 'none',
	mediaUpload: 'none',
	behavior: 'none',
	seaState: 'none',
	windDirection: 'none',
	windForce: 'none',
	visibility: 'none',
	boatType: 'none',
	boatDrive: 'none',
	nameConsent: 'none',
	nameConsentAt: 'none',
	nameConsentVersion: 'none',
	shipNameConsent: 'none',
	shipNameConsentAt: 'none',
	shipNameConsentVersion: 'none',
	privacyConsent: 'none',
	privacyConsentAt: 'none',
	privacyConsentVersion: 'none',
	mediaConsent: 'none',
	mediaConsentAt: 'none',
	mediaConsentVersion: 'none',
	created: 'none',
	entryChannel: 'none',
	entryClient: 'none',
	approvedAt: 'none',
	approvedBy: 'none',
	rejectedAt: 'none',
	rejectedBy: 'none',
	verified: 'none',
	inBalticSea: 'none',
	inBalticSeaGeo: 'none',
	isDead: 'none',
	deadSize: 'none',
	deadCondition: 'none',
	deadSex: 'none',
	deadPhoneContact: 'none',
	species: 'none',
	referenceId: 'none',
	weatherData: 'none',
	weatherFetchedAt: 'none',
	weatherProvider: 'none',
	weatherApiVersion: 'none',
	weatherDataType: 'none',
	spamScore: 'none',
	spamIndicators: 'none',
	anonymizedAt: 'none'
};
