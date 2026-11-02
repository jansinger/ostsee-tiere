import { sql } from 'drizzle-orm';
import { berlinCalendarDate, berlinDatePart } from './sqlTimeZone';
import {
	bigint,
	boolean,
	check,
	geometry,
	index,
	integer,
	jsonb,
	numeric,
	pgSequence,
	pgTable,
	serial,
	smallint,
	text,
	timestamp,
	varchar
} from 'drizzle-orm/pg-core';

export const sichtungenSeq = pgSequence('sichtungen_seq', {
	startWith: '1840',
	increment: '1',
	minValue: '1',
	maxValue: '9223372036854775807',
	cache: '1',
	cycle: false
});

export const sightings = pgTable(
	'sichtungen',
	{
		id: bigint({ mode: 'number' })
			.default(sql`nextval('sichtungen_seq'::regclass)`)
			.primaryKey()
			.notNull(),
		latitude: numeric('gps_breite', { precision: 8, scale: 6 }),
		longitude: numeric('gps_laenge', { precision: 8, scale: 6 }),
		waterway: text('fahrwasser'),
		seaMark: text('seezeichen'),
		sightingDate: timestamp('sichtungsdatum', { mode: 'date' }).notNull(),
		sightingFrom: integer('vonwo').default(0).notNull(),
		sightingFromText: text('vonwo_text'),
		distance: integer('entfernung').default(0).notNull(),
		shipCount: integer('anzahl_schiffe'),
		totalCount: integer('anzahl_gesamt').default(0).notNull(),
		juvenileCount: integer('anzahl_jung').default(0).notNull(),
		distribution: integer('verteilung').default(0).notNull(),
		distributionText: text('verteilung_text'),
		mediaFile: varchar('aufnahme', { length: 255 }),
		mediaUpload: integer('aufnahmeHochladen').default(0).notNull(),
		behavior: integer('verhalten').default(0).notNull(),
		behaviorText: text('verhalten_text'),
		reaction: text('reaktion'),
		otherObservations: text('sonstige_auffaelligkeiten'),
		seaState: integer('seegang').default(0).notNull(),
		windDirection: varchar('windrichtung', { length: 4 }),
		windForce: varchar('windstaerke', { length: 2 }),
		visibility: integer('sichtweite').default(0).notNull(),
		shipName: varchar('schiffsname', { length: 64 }),
		homePort: varchar('heimathafen', { length: 64 }),
		boatType: varchar('bootstyp', { length: 64 }),
		boatDrive: integer('bootsantrieb').default(0).notNull(),
		boatDriveText: text('bootsantrieb_text'),
		firstName: varchar('vorname', { length: 64 }),
		lastName: varchar('name', { length: 64 }),
		street: varchar('strasse', { length: 64 }),
		zipCode: varchar('plz', { length: 5 }),
		city: varchar('ort', { length: 64 }),
		phone: varchar('telefon', { length: 64 }),
		fax: varchar('fax', { length: 64 }),
		email: varchar('email', { length: 64 }),
		// Einwilligung zur Veröffentlichung von Vor- und Nachname. `/api/sightings`
		// gibt den Namen aus, sobald das Flag steht — Zeitpunkt und Textfassung
		// sind der Nachweis nach Art. 7 Abs. 1 DSGVO. Altbestand: NULL, dort gibt
		// es keinen Nachweis, und ein rückdatierter Wert wäre eine Erfindung.
		nameConsent: integer('namensnennung').default(0).notNull(),
		nameConsentAt: timestamp('namensnennung_am', { mode: 'date' }),
		nameConsentVersion: varchar('namensnennung_version', { length: 32 }),
		shipNameConsent: integer('schiffnamensnennung').default(0).notNull(),
		shipNameConsentAt: timestamp('schiffnamensnennung_am', { mode: 'date' }),
		shipNameConsentVersion: varchar('schiffnamensnennung_version', { length: 32 }),
		notes: text('bemerkungen'),
		created: timestamp('created', { mode: 'date' }).notNull(),
		entryChannel: integer('eingangskanal').default(0).notNull(),
		// Welche Software diese Zeile erzeugt hat: `web/<version>` aus dem eigenen
		// Build, sonst der User-Agent des Clients. Serverseitig gesetzt, nie aus
		// dem Request-Body — sonst könnte ein Client sich beliebig ausgeben.
		// Beantwortet eine ANDERE Frage als `eingangskanal`: Eine per Post
		// eingegangene Meldung hat Kanal MAIL und Client `web/<version>`.
		// NULL heißt „vor Einführung der Spalte" ODER vom Altsystem geschrieben
		// (dieselbe Datenbank wird mitbenutzt); fehlt der User-Agent, steht
		// `unbekannt` drin (siehe `resolveEntryClient.ts`).
		entryClient: varchar('eingangs_client', { length: 128 }),
		approvedAt: timestamp('freigegeben_am', { mode: 'date' }),
		verified: integer('geprueft').default(0).notNull(),
		inBalticSea: integer('ostsee').default(0),
		internalComment: text('kommentar_intern'),
		location: geometry('location', { type: 'point', srid: 4326 }),
		inBalticSeaGeo: integer('ostsee_geo').default(0).notNull(),
		isDead: smallint('totfund').default(0).notNull(),
		deadSize: integer('totfund_groesse'),
		deadCondition: smallint('totfund_zustand').default(0).notNull(),
		deadSex: smallint('totfund_geschlecht').default(0).notNull(),
		deadPhoneContact: smallint('totfund_telefon').default(0).notNull(),
		species: smallint('tierart').default(0).notNull(),
		// Pflicht-Einwilligung der Meldung. Zeitpunkt und Textfassung sind auch
		// hier der Nachweis nach Art. 7 Abs. 1 DSGVO.
		privacyConsent: smallint('datenschutz_einverstaendnis').default(0).notNull(),
		privacyConsentAt: timestamp('datenschutz_einverstaendnis_am', { mode: 'date' }),
		privacyConsentVersion: varchar('datenschutz_einverstaendnis_version', { length: 32 }),
		// Einwilligung zur **Veröffentlichung** hochgeladener Aufnahmen.
		// Upload und fachliche Prüfung sind dagegen Teil der Meldung selbst und
		// von `privacyConsent` gedeckt (Entscheidung 2026-07-28).
		// Zeitpunkt und Textfassung sind der Nachweis nach Art. 7 Abs. 1 DSGVO.
		mediaConsent: smallint('medien_einwilligung').default(0).notNull(),
		mediaConsentAt: timestamp('medien_einwilligung_am', { mode: 'date' }),
		mediaConsentVersion: varchar('medien_einwilligung_version', { length: 32 }),
		referenceId: varchar('referenz_id', { length: 64 }),
		// Weather data fields for Issue #110
		weatherData: jsonb('weather_data'),
		weatherFetchedAt: timestamp('weather_fetched_at', { mode: 'date' }),
		weatherProvider: varchar('weather_provider', { length: 50 }).default('open-meteo'),
		weatherApiVersion: varchar('weather_api_version', { length: 20 }),
		weatherDataType: varchar('weather_data_type', { length: 20 }).default('historical'),
		// Spam-Heuristik zum Meldezeitpunkt (detectSpamIndicators). NULL = Altbestand
		// bzw. Eingang an der Web-API vorbei — nicht mit Score 0 („geprüft, sauber")
		// verwechselbar. Die Indikatoren sind ein String-Array (jsonb).
		spamScore: smallint('spam_score'),
		spamIndicators: jsonb('spam_indicators'),
		// Triage „abgelehnt": gesichtet und bewusst NICHT veröffentlicht (Spam,
		// Testeintrag, unplausibel). KEIN dritter Freigabe-Zustand: öffentliche
		// Flächen filtern weiterhin ausschließlich auf freigegeben_am. Nie
		// gleichzeitig mit freigegeben_am gesetzt — geschrieben ausschließlich von
		// PATCH /api/sightings/[id]/verify (ein Update, alle Status-Spalten).
		// Regeln: .claude/rules/api.md „Prüfstatus einer Sichtung".
		rejectedAt: timestamp('abgelehnt_am', { mode: 'date' }),
		rejectedBy: varchar('abgelehnt_von', { length: 255 }),
		// Wer freigegeben hat — symmetrisch zu abgelehnt_von und Teil desselben
		// Statusvorgangs. Nullable und ohne Default: Der Altbestand (bis 2025-11
		// aus dem Altsystem, das auf derselben Datenbank liegt) hat diese
		// Information nicht, und ein Platzhalter würde eine Person behaupten, die
		// es nie gab. Geschrieben ausschließlich von
		// PATCH /api/sightings/[id]/verify, gemeinsam mit allen Status-Spalten.
		approvedBy: varchar('freigegeben_von', { length: 255 }),
		// Melder-Hash: HMAC-SHA256 der normalisierten E-Mail (hex), gesetzt beim
		// Eingang. Verknüpft die Meldungen einer Person auch nach der
		// Anonymisierung. Verlässt den Server nie (omitReporterIdentity).
		// Konzept: docs/ANONYMISIERUNG_KONZEPT.md. NULL = keine Adresse oder
		// beim Eingang kein Schlüssel (der Backfill holt ihn nach).
		reporterHash: varchar('melder_hash', { length: 64 }),
		// Adresse gehört dem Museum. Ersetzt den Domain-Filter der Statistik, der
		// nach der Anonymisierung nichts mehr fände. NULL = keine Adresse.
		reporterInternal: boolean('melder_intern'),
		// Zeitpunkt, zu dem die Kontaktdaten geleert wurden. NULL = nicht anonymisiert.
		anonymizedAt: timestamp('anonymisiert_am', { mode: 'date' })
	},
	(table) => [
		index('geom_sichtungen').using(
			'gist',
			table.location.asc().nullsLast().op('gist_geometry_ops_2d')
		),
		index('idx_sichtungsdatum').on(table.sightingDate),
		index('idx_melder_hash').on(table.reporterHash),
		// Berliner Kalendertag — muss zum Ausdruck des Admin-Datumsfilters passen
		// (admin/+page.server.ts), sonst greift der Index nicht.
		index('idx_sichtungsdatum_berlin_tag').using('btree', berlinCalendarDate(table.sightingDate)),
		// Jahr in deutscher Ortszeit — muss zum Ausdruck der Statistik-Gruppierung
		// passen (admin/statistics/+page.server.ts), sonst greift der Index nicht.
		index('idx_year_sichtungen').using('btree', berlinDatePart('year', table.sightingDate)),
		// Weather data indexes for Issue #110
		index('idx_weather_data_gin').using('gin', table.weatherData),
		index('idx_weather_fetched').on(table.weatherFetchedAt),
		index('idx_weather_provider').on(table.weatherProvider),
		// Compound index for position+date lookup (deduplication).
		// Der Datumsausdruck MUSS zeichengleich mit dem der Dedup-Abfrage bleiben
		// (weatherDeduplication.ts) — deshalb beide über berlinCalendarDate().
		index('idx_position_date_weather')
			.on(
				sql`ROUND(${table.latitude}::numeric, 2)`,
				sql`ROUND(${table.longitude}::numeric, 2)`,
				berlinCalendarDate(table.sightingDate)
			)
			.where(sql`${table.weatherData} IS NOT NULL`)
	]
);

// Type for selecting from sightings table
export type SightingSelect = typeof sightings.$inferSelect;

/**
 * Status-Historie einer Sichtung (Spec B3).
 *
 * **Ergänzt die Statusspalten, ersetzt sie nicht.** `freigegeben_am`,
 * `abgelehnt_am` und `abgelehnt_von` bleiben unverändert die Wahrheit über den
 * *aktuellen* Zustand — das Altsystem liegt auf derselben Datenbank und liest
 * sie. Diese Tabelle beantwortet die andere Frage: wie der Zustand zustande kam.
 *
 * **Geschrieben ausschließlich von `PATCH /api/sightings/[id]/verify`,** in
 * derselben Transaktion wie die Statusspalten. Das ist keine Stilfrage: Eine
 * Historie, die einen Wechsel verschweigt, sieht vollständig aus und ist es
 * nicht. Mechanisch abgesichert durch `statusLogWriteScan.test.ts`.
 *
 * **Warum eine eigene Tabelle neben `audit_logs`.** Das Audit-Log hält denselben
 * Vorgang bereits fest, taugt aber nicht als Anzeigequelle: Es ist bewusst
 * bestbemüht (`logAuditEvent` schluckt Schreibfehler), sein `details`-JSONB hat
 * keine feste Form, und es hat keinen Index auf `resource_id` — die Historie
 * einer Sichtung wäre ein Full Scan über alle Aktionen aller Ressourcen.
 *
 * **Bearbeiter-Identität (DSGVO).** `bearbeiter` trägt dieselbe Kennung wie
 * `freigegeben_von`/`abgelehnt_von`: die E-Mail-Adresse aus der
 * Auth0-Anmeldung. Es entsteht damit keine neue Datenkategorie, nur eine
 * längere Reihe derselben. Ohne angemeldete Identität bleibt die Spalte `NULL`
 * statt einen Platzhalter zu behaupten. Sichtbar ist die Historie nur im
 * Admin-Bereich (`requireUserRole`), nie auf einer öffentlichen Fläche.
 *
 * **Aufbewahrung.** Keine eigene Frist. Die Einträge sind über
 * `ON DELETE CASCADE` an die Sichtung gebunden und teilen deren Schicksal —
 * eine kürzere Frist würde die Historie genau dann leeren, wenn die Sichtung
 * noch öffentlich steht, und die Frage „wer hat das freigegeben" unbeantwortbar
 * machen, obwohl `freigegeben_von` sie weiterhin beantwortet. Eine eigene Frist
 * wäre erst dann sinnvoll, wenn die Sichtungen selbst eine bekommen — die steht
 * als offener Punkt in `docs/DATENSCHUTZ_ABGLEICH_DMM_2026-08-02.md` (§2.1).
 */
export const sightingStatusLog = pgTable(
	'sichtung_status_log',
	{
		id: serial().primaryKey().notNull(),
		sightingId: bigint('sichtung_id', { mode: 'number' })
			.references(() => sightings.id, { onDelete: 'cascade' })
			.notNull(),
		/* 'approve' | 'reject' | 'reset' — dieselben drei Werte, die der
		   Verify-Endpunkt annimmt. Bewusst kein pgEnum: Ein Enum-Typ ist in
		   einer Datenbank, die ein zweites System mitbenutzt, nur mit
		   ALTER TYPE erweiterbar. Den Wertebereich hält stattdessen der
		   CHECK unten — ohne ihn käme ein Fremdwert (manuelles SQL, Altsystem)
		   ungeprüft bis in die Zeitleiste und fiele dort auf „Offen" zurück:
		   Eine abgelehnte Sichtung sähe aus wie eine unbearbeitete. */
		verdict: varchar('verdict', { length: 16 }).notNull(),
		editor: varchar('bearbeiter', { length: 255 }),
		recordedAt: timestamp('zeitpunkt', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		// Die einzige Abfrage: alle Einträge einer Sichtung in zeitlicher
		// Reihenfolge. Deshalb zusammengesetzt und nicht zwei einzelne Indizes.
		index('idx_sichtung_status_log_sichtung').on(table.sightingId, table.recordedAt),
		check(
			'sichtung_status_log_verdict_check',
			sql`${table.verdict} IN ('approve', 'reject', 'reset')`
		)
	]
);

export type SightingStatusLogSelect = typeof sightingStatusLog.$inferSelect;
export type SightingStatusLogInsert = typeof sightingStatusLog.$inferInsert;

// Table for storing file references linked to sightings
export const sightingFiles = pgTable(
	'sichtungen_dateien',
	{
		id: serial().primaryKey().notNull(),
		uid: varchar('uid', { length: 64 }).notNull(),
		sightingId: bigint('sichtung_id', { mode: 'number' }).references(() => sightings.id, {
			onDelete: 'cascade'
		}),
		referenceId: varchar('referenz_id', { length: 64 }).notNull(),
		originalName: varchar('original_name', { length: 255 }).notNull(),
		fileName: varchar('datei_name', { length: 255 }).notNull(),
		filePath: varchar('datei_pfad', { length: 500 }).notNull(),
		mimeType: varchar('mime_typ', { length: 100 }).notNull(),
		size: bigint({ mode: 'number' }).notNull(),
		url: varchar('url', { length: 1000 }),
		uploadedAt: timestamp('hochgeladen_am', { mode: 'date' }).notNull(),
		exifData: jsonb('exif_daten'),
		createdAt: timestamp('erstellt_am', { mode: 'date' }).defaultNow().notNull()
	},
	(table) => [
		index('idx_sichtungen_dateien_sichtung_id').on(table.sightingId),
		index('idx_sichtungen_dateien_referenz_id').on(table.referenceId),
		index('idx_sichtungen_dateien_uid').on(table.uid)
	]
);

// Table for storing application configuration
export const appConfig = pgTable(
	'app_config',
	{
		id: serial().primaryKey().notNull(),
		key: varchar('key', { length: 255 }).notNull().unique(),
		value: jsonb('value').notNull(),
		description: text('description'),
		category: varchar('category', { length: 50 }).notNull(),
		updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
		updatedBy: varchar('updated_by', { length: 255 })
	},
	(table) => [
		index('idx_app_config_key').on(table.key),
		index('idx_app_config_category').on(table.category)
	]
);

export const auditLogs = pgTable(
	'audit_logs',
	{
		id: serial().primaryKey().notNull(),
		timestamp: timestamp({ withTimezone: true }).notNull().defaultNow(),
		userEmail: varchar('user_email', { length: 255 }),
		action: varchar('action', { length: 100 }).notNull(),
		resourceType: varchar('resource_type', { length: 50 }).notNull(),
		resourceId: varchar('resource_id', { length: 100 }),
		details: jsonb('details'),
		ipAddress: varchar('ip_address', { length: 45 }),
		status: varchar('status', { length: 20 }).notNull().default('success')
	},
	(table) => [
		index('idx_audit_logs_timestamp').on(table.timestamp),
		index('idx_audit_logs_action_timestamp').on(table.action, table.timestamp),
		index('idx_audit_logs_user_email_timestamp').on(table.userEmail, table.timestamp)
	]
);

export type AuditLogSelect = typeof auditLogs.$inferSelect;
export type AuditLogInsert = typeof auditLogs.$inferInsert;

/**
 * Server-seitige Sessions (Issue #635, #634).
 *
 * Das Cookie trägt nur noch ein opakes Zufalls-Token; die Identität steht hier. Damit ist
 * eine Session nicht mehr fälschbar (ein erfundenes Cookie findet keine Zeile) und Logout
 * wirkt tatsächlich, statt nur den Cookie zu löschen.
 *
 * `token_hash` speichert bewusst nur den SHA-256 des Cookie-Werts: Ein Lesezugriff auf diese
 * Tabelle händigt damit keine lebenden Sessions aus.
 */
export const sessions = pgTable(
	'sessions',
	{
		id: serial().primaryKey().notNull(),
		tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
		sub: varchar('sub', { length: 255 }).notNull(),
		/* Snapshot des Auth0-Rollen-Claims vom Login. Eigene Spalte statt in user_claims
		   vergraben, damit abfragbar bleibt, welche Session privilegiert ist. */
		roles: text('roles')
			.array()
			.notNull()
			.default(sql`ARRAY[]::text[]`),
		/* Rest der Identität (Name, E-Mail, Bild, sid) für locals.user */
		userClaims: jsonb('user_claims').notNull(),
		/* Gleitendes Inaktivitätsfenster — wird von touchSession fortgeschrieben. */
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		/* Nicht verlängerbar: der exp des Auth0-ID-Tokens vom Login. */
		absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('idx_sessions_sub').on(table.sub),
		index('idx_sessions_expires_at').on(table.expiresAt)
	]
);

export type SessionSelect = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
