import { env, publicEnv } from '#lib/server/env.ts';
import { createLogger } from '#lib/logger.server.ts';
import { detectSpamIndicators } from '#lib/server/spam/spamDetector.ts';
import { HIGH_RISK_THRESHOLD, type SpamCheckResult } from '#lib/types/spam.ts';
import { db } from '#lib/server/db/index.ts';

// Helper to get PUBLIC_SITE_URL dynamically (runtime, not build-time)
const getPublicSiteUrl = () => publicEnv.PUBLIC_SITE_URL ?? 'http://localhost:3000';
import { sightings } from '#lib/server/db/schema.ts';
import type { SightingFormValues } from '#lib/types/Form.ts';
import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
import { formatSightingForDisplay } from '#lib/utils/format/sightingFormatter.ts';
import { baseLocale } from '#lib/paraglide/runtime.js';
import { eq } from 'drizzle-orm';
import Handlebars from 'handlebars';
import { htmlToText as htmlToPlainText } from 'html-to-text';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { ConfigRepository } from '#lib/server/db/configRepository.ts';
import {
	balticSeaEmailContext,
	type BalticSeaEmailContext
} from '#lib/server/templates/balticSeaEmailContext.ts';
import { emailColorContext } from '#lib/server/templates/emailTokens.ts';
import { NOTIFICATION_EMAIL_DEFAULT_TEMPLATE } from '#lib/server/templates/notificationEmailDefault.ts';
import { countFilesForSighting } from '#lib/server/db/sightingFilesRepository.ts';
import { isPhotoAnnouncementPending } from '#lib/utils/media/photoAnnouncement.ts';
import { SMTP_CA_BUNDLE } from './smtpRootCertificates';

// Dynamic environment variables for Docker runtime
const NODE_ENV = env.NODE_ENV ?? 'development';
const SMTP_HOST = env.SMTP_HOST ?? '';
const SMTP_PORT = env.SMTP_PORT ?? '587';
const SMTP_USER = env.SMTP_USER ?? '';
const SMTP_PASSWORD = env.SMTP_PASSWORD ?? '';

const logger = createLogger('emailService');

/**
 * Liest einen Konfigurationswert und fällt bei **leerem** DB-Wert auf die
 * Umgebungsvariable zurück.
 *
 * Hält die Regel „Leerstring heißt nicht konfiguriert" an einer Stelle fest. Der
 * ENV-Wert darf nicht als `defaultValue` an `getString` gehen: der Default greift
 * dort nur bei `null`, und `initializeDefaultConfigurations()` legt die SMTP-Keys
 * mit Leerstring an — der ENV-Zweig war damit unerreichbar (siehe
 * `emailService.envFallback.test.ts`).
 */
async function configOrEnv(key: string, envValue: string): Promise<string> {
	return (await ConfigRepository.getString(key, '')) || envValue;
}

/**
 * Escapt einen Wert für die Einbettung in den HTML-Body der Test-Mail.
 *
 * Empfänger und CC stammen aus Eingaben: CC aus den Einstellungen, der
 * Empfänger aus dem Request-Body von `POST /api/config/test-email` — der ihn,
 * anders als die Admin-Route, gar nicht gegen ein E-Mail-Muster prüft. Beides
 * ist zwar Admin-beschränkt, roh interpoliertes HTML bleibt es trotzdem.
 */
function escape(value: string): string {
	return Handlebars.escapeExpression(value);
}

/**
 * Grund, aus dem eine Sichtungs-Benachrichtigung nicht verschickt wird.
 *
 * `disabled` ist der Schalter `notification.email.enabled`, an dem
 * `sendTestEmail()` bewusst vorbeigeht — die häufigste Ursache dafür, dass die
 * Test-Mail ankommt und die Benachrichtigung nicht.
 */
export type NotificationBlocker = 'disabled' | 'transport-unavailable' | 'recipient-missing';

/**
 * Macht aus einer Empfängerliste den Wert, den nodemailer erwartet: die
 * bereinigte Liste, oder `undefined` wenn nichts konfiguriert ist.
 *
 * Ein leeres Array als `cc`/`bcc` wäre für nodemailer zwar unschädlich, taucht
 * aber im Mail-Header und in den Logs als gesetztes Feld auf — „nicht
 * konfiguriert" und „konfiguriert, aber leer" sollen unterscheidbar bleiben.
 *
 * Leereinträge fliegen raus: `ConfigRepository.getArray()` reicht den
 * JSONB-Wert ungeprüft durch. Die Settings-Oberfläche filtert sie zwar schon
 * beim Eingeben, `PUT /api/config` nimmt aber jedes Array entgegen — ein
 * Leerstring landete sonst als leere Adresse im Header.
 */
function recipientsOrUndefined(recipients: string[] | undefined): string[] | undefined {
	const cleaned = (recipients ?? [])
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);

	return cleaned.length > 0 ? cleaned : undefined;
}

export interface EmailConfig {
	enabled: boolean;
	recipient: string;
	cc?: string[];
	bcc?: string[];
	sender: string;
	senderName: string;
	template: string;
	smtpHost?: string;
	smtpPort?: number;
	smtpSecure?: boolean;
	smtpUser?: string;
	smtpPassword?: string;
}

export class EmailService {
	private static transporter: Transporter | null = null;
	/** Läuft gerade ein Aufbau? Siehe `ensureTransporter()`. */
	private static initialization: Promise<void> | null = null;
	private static templateCache = new Map<string, HandlebarsTemplateDelegate>();
	private static configCache: { config: EmailConfig; timestamp: number } | null = null;
	private static readonly CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	/**
	 * Initialize email service with configuration
	 */
	static async initialize(test = false): Promise<void> {
		try {
			const enabled = await ConfigRepository.getBoolean('notification.email.enabled', false);

			if (!enabled && !test) {
				logger.info('Email notifications are disabled');
				return;
			}

			// SMTP-Konfiguration. Priorität laut .claude/rules/email.md:
			// Datenbank > Environment Variables.
			//
			// Der ENV-Wert darf NICHT als `defaultValue` an `getString` gehen: der
			// Default greift dort nur bei `null`, und `initializeDefaultConfigurations()`
			// legt diese drei Keys mit **Leerstring** an. Sobald `/admin/settings`
			// einmal geöffnet war, existierte die Zeile also mit `''`, der Default
			// wurde nie erreicht und SMTP aus der Umgebung war toter Code — der
			// Versand brach still mit der Warnung unten ab.
			//
			// Deshalb der Fallback erst *nach* dem DB-Zugriff: ein gesetzter DB-Wert
			// gewinnt, ein leerer gilt als „in der DB nicht konfiguriert".
			const smtpHost = await configOrEnv('email.smtp.host', SMTP_HOST);
			const smtpUser = await configOrEnv('email.smtp.user', SMTP_USER);
			const smtpPassword = await configOrEnv('email.smtp.password', SMTP_PASSWORD);

			// Port und `secure` bleiben beim Default-Mechanismus: beide haben einen
			// sinnvollen Wert (587 bzw. false), der auch als Seed in der DB steht.
			// Ein gesetztes `SMTP_PORT` ist damit ebenfalls wirkungslos — anders als
			// beim Host lässt sich hier aber „bewusst auf 587 gestellt" nicht von
			// „nur geseedet" unterscheiden, und ein Fallback auf ENV würde eine
			// absichtliche DB-Einstellung überstimmen. `SMTP_SECURE` gibt es nicht.
			const smtpPort = await ConfigRepository.getNumber(
				'email.smtp.port',
				parseInt(SMTP_PORT || '587')
			);
			const smtpSecure = await ConfigRepository.getBoolean('email.smtp.secure', false);

			if (!smtpHost) {
				// Auch einen bestehenden Transporter verwerfen: Wird der Host in den
				// Einstellungen geleert, wäre „kein Host konfiguriert" sonst ein
				// Zustand, in dem trotzdem noch über die alte Verbindung versendet wird.
				this.resetTransporter();
				logger.warn('Email service not initialized: SMTP host not configured');
				return;
			}

			// Vor dem Neuaufbau die alte Verbindung schließen, sonst bleibt bei jeder
			// Konfigurationsänderung ein Socket-Pool zurück.
			this.resetTransporter();

			// Create transporter mit expliziten Timeouts, damit ein hängender SMTP-Server
			// den Request/Prozess nicht blockiert (Single-Container-Docker-Betrieb).
			this.transporter = nodemailer.createTransport({
				host: smtpHost,
				port: smtpPort,
				secure: smtpSecure,
				auth: {
					user: smtpUser,
					pass: smtpPassword
				},
				connectionTimeout: 5000, // max. 5s für den Verbindungsaufbau
				greetingTimeout: 5000, // max. 5s auf das SMTP-Greeting warten
				socketTimeout: 10000, // max. 10s Inaktivität auf dem Socket
				// Nodes eingebauter Satz plus der Root, den Microsofts
				// Connector-Kette braucht und den Node 24 nicht mehr mitbringt.
				// Ohne ihn bricht STARTTLS mit `unable to get local issuer
				// certificate` ab — gemeldet als `ESOCKET`/`CONN`, also wie ein
				// Netzwerkfehler. Herkunft und Widerrufsbedingung des Zertifikats:
				// `smtpRootCertificates.ts`.
				tls: { ca: SMTP_CA_BUNDLE }
			});

			// Verify connection
			await this.transporter?.verify();
			logger.info('Email service initialized successfully');
		} catch (error) {
			logger.error({ error }, 'Failed to initialize email service');
			this.transporter = null;
		}
	}

	/**
	 * Verwirft den Transporter samt offener SMTP-Verbindung.
	 *
	 * Aufzurufen, wenn sich `email.smtp.*` geändert hat. Der Transporter ist ein
	 * Singleton, das beim Modulstart einmal gebaut wird — ohne diesen Aufruf
	 * erreichten geänderte Verbindungsdaten ihn erst beim nächsten Neustart des
	 * Containers. Die Test-Mail prüfte damit die *alte* Verbindung und
	 * bescheinigte eine Konfiguration als funktionierend, die so gar nicht
	 * gespeichert war.
	 *
	 * Kein Neuaufbau an dieser Stelle: Der nächste Versand erledigt das über
	 * `ensureTransporter()`. So kostet eine Konfigurationsänderung keine
	 * SMTP-Verbindung, wenn danach gar keine Mail ansteht.
	 */
	static resetTransporter(): void {
		if (!this.transporter) {
			return;
		}

		// Das Schließen der ALTEN Verbindung darf den Aufbau der neuen nicht
		// verhindern — `resetTransporter()` läuft direkt vor `createTransport()`.
		// Ein Fehler hier kostet höchstens einen Socket, ein Abbruch dagegen den
		// gesamten Mailversand.
		try {
			this.transporter.close();
		} catch (error) {
			logger.warn({ error }, 'Failed to close previous SMTP transporter');
		}

		this.transporter = null;
		logger.info('SMTP transporter discarded, will be rebuilt on next send');
	}

	/**
	 * Liefert einen einsatzbereiten Transporter und baut ihn bei Bedarf auf.
	 *
	 * Der Neuaufbau ist nicht nur für Konfigurationsänderungen da: Schlug
	 * `verify()` beim Serverstart fehl (SMTP-Server kurz nicht erreichbar),
	 * blieb der Transporter `null` — und der Versand gab dauerhaft `false`
	 * zurück, bis jemand den Container neu startete. Ein Zustand, den niemand
	 * bemerkt, weil eine ausbleibende Benachrichtigung nichts anzeigt.
	 */
	private static async ensureTransporter(test = false): Promise<Transporter | null> {
		if (this.transporter) {
			return this.transporter;
		}

		// Nur ein Aufbau gleichzeitig. Ohne diese Klammer liefen zwei zeitgleich
		// eingehende Meldungen beide in `initialize()`, und der zweite Lauf schloss
		// über `resetTransporter()` die Verbindung, die der erste gerade aufgebaut
		// hatte. Der Fall wurde erst dadurch realistisch, dass ein fehlender
		// Transporter überhaupt neu aufgebaut wird — etwa nach einer SMTP-Störung,
		// wenn mehrere Meldungen gleichzeitig anstehen.
		this.initialization ??= this.initialize(test).finally(() => {
			this.initialization = null;
		});

		await this.initialization;

		return this.transporter;
	}

	/**
	 * Send notification email for new sighting by ID (loads from database)
	 */
	static async sendNewSightingNotification(sightingId: number): Promise<boolean> {
		const sightingData = await this.loadSightingForEmail(sightingId);
		if (!sightingData) {
			return false;
		}

		// Send email using consolidated logic
		return this.sendEmailNotification(
			sightingData.sightingFormValues,
			sightingData.referenceId,
			sightingData.adminUrl,
			sightingData.balticSea,
			sightingData.photoAnnouncementPending,
			sightingData.persistedSpam,
			sightingData.inBalticSeaGeo
		);
	}

	/**
	 * Load sighting from database and convert to SightingFormValues format
	 * Ensures consistent data structure and includes processed inBalticSea values
	 */
	private static async loadSightingForEmail(sightingId: number): Promise<{
		sightingFormValues: SightingFormValues;
		referenceId: string;
		adminUrl: string;
		balticSea: BalticSeaEmailContext;
		photoAnnouncementPending: boolean;
		persistedSpam: SpamCheckResult | null;
		inBalticSeaGeo: number | null;
	} | null> {
		try {
			const sightingResult = await db
				.select()
				.from(sightings)
				.where(eq(sightings.id, sightingId))
				.limit(1);

			if (!sightingResult || sightingResult.length === 0) {
				logger.error({ sightingId }, 'Sighting not found in database');
				return null;
			}

			const sighting = sightingResult[0];

			if (!sighting) {
				logger.error({ sightingId }, 'Sighting data is null');
				return null;
			}

			// Convert database sighting to SightingFormValues format
			// This ensures consistent data structure and includes processed inBalticSea values
			const sightingFormValues = {
				// Required core fields
				latitude: sighting.latitude != null ? parseFloat(sighting.latitude) : null,
				longitude: sighting.longitude != null ? parseFloat(sighting.longitude) : null,
				// Berlin-Datum statt UTC-ISO-Split (M2): toISOString().split('T')[0]
				// läse eine Sichtung um 00:30 Berliner Zeit als UTC-Vortag.
				sightingDate: formatLocalDateTime(sighting.sightingDate || new Date(), 'date'),
				sightingDatetime: sighting.sightingDate || undefined,
				species: sighting.species || 0,
				totalCount: sighting.totalCount || 1,
				firstName: sighting.firstName || '',
				lastName: sighting.lastName || '',
				email: sighting.email || '',
				privacyConsent: true, // Already saved, so consent was given
				// Optional fields with defaults
				juvenileCount: sighting.juvenileCount || 0,
				sightingFrom: sighting.sightingFrom || 0,
				mediaUpload: !!sighting.mediaUpload,
				behavior: sighting.behavior || undefined,
				distance: sighting.distance || 0,
				waterway: sighting.waterway || undefined,
				seaMark: sighting.seaMark || undefined,
				notes: sighting.notes || undefined,
				phone: sighting.phone || undefined,
				isDead: !!sighting.isDead,
				deadCondition: sighting.deadCondition || undefined,
				deadSize: sighting.deadSize || undefined,
				// Additional required form fields with reasonable defaults
				distribution: sighting.distribution || 0,
				reaction: sighting.reaction || undefined,
				seaState: sighting.seaState || 0,
				visibility: sighting.visibility || 0,
				boatDrive: sighting.boatDrive || 0,
				entryChannel: sighting.entryChannel || 0,
				nameConsent: !!sighting.nameConsent,
				shipNameConsent: !!sighting.shipNameConsent,
				// `verified` fehlt hier absichtlich und wird auch nicht durch ein
				// hartkodiertes `false` ersetzt. Der Kontext dieses Objekts geht über
				// `...restSighting` (sightingFormatter.ts) unverändert in die Vorlage,
				// und die Vorlage liegt in `app_config` — sie kann im Betrieb angepasst
				// sein und `{{sighting.verified}}` referenzieren. Ein fehlender
				// Schlüssel rendert dort leer; ein `false` behauptete mit voller
				// Überzeugung einen Prüfstatus, den diese Zeile gar nicht gelesen hat.
				deadPhoneContact: !!sighting.deadPhoneContact,
				referenceId: sighting.referenceId || `REF-${sighting.id}`,
				hasPosition: !!(sighting.latitude && sighting.longitude),
				persistentDataConsent: true, // Already saved, so consent was given
				otherObservations: sighting.otherObservations || undefined,
				// Rohwerte der beiden Flags. Sie bleiben im Kontext, weil eine in
				// `app_config` gespeicherte (womöglich angepasste) Vorlage sie noch
				// referenzieren kann — die **fachliche** Aussage kommt aber aus
				// `balticSea` unten, nicht aus diesen beiden Werten.
				inBalticSea: !!sighting.inBalticSea,
				inBalticSeaGeo: !!sighting.inBalticSeaGeo
			} as SightingFormValues;

			// Build admin URL and reference ID
			const adminUrl = `${getPublicSiteUrl()}/admin/${sightingId}`;
			const referenceId = sighting.referenceId || `REF-${sightingId}`;

			// Nur zählen, wenn überhaupt ein Foto angekündigt ist — ohne Flag
			// trägt die Zahl keine Aussage und die Abfrage keinen Zweck.
			const attachedFileCount = sighting.mediaUpload ? await countFilesForSighting(sightingId) : 0;

			return {
				sightingFormValues,
				referenceId,
				adminUrl,
				// Dieselbe Aussage wie in der Admin-Detailansicht: „angekündigt und
				// noch nichts da". Das rohe Flag genügt hier **nicht** — das
				// Web-Formular setzt es genau dann, wenn eine Datei hochgeladen
				// wurde (`ModernReportForm.svelte`), und die hängt beim Versand
				// bereits an der Sichtung (`saveSighting` verknüpft sie in
				// derselben Transaktion). Über das Flag allein behauptete die Mail
				// bei jedem angehängten Foto, es käme noch eines per E-Mail nach.
				photoAnnouncementPending: isPhotoAnnouncementPending({
					mediaUpload: sighting.mediaUpload,
					attachedFileCount,
					createdAt: sighting.created,
					entryChannel: sighting.entryChannel
				}),
				// Aus der **Rohzeile**, nicht aus `sightingFormValues`: das `!!` oben
				// verliert den Altsystem-Wert 2 und macht `noPosition` unerreichbar.
				// Derselbe Aufruf wie in der Admin-Übersicht — der Status entsteht
				// genau einmal (`#lib/utils/geo/balticSeaStatus.ts`).
				balticSea: balticSeaEmailContext(sighting),
				// Spam-Bewertung zum Meldezeitpunkt (inkl. Token-Kontext, den eine
				// Neuberechnung hier nicht mehr hätte). NULL = Altbestand → der
				// Versand rechnet dann als Fallback neu.
				persistedSpam:
					sighting.spamScore != null
						? {
								score: sighting.spamScore,
								isHighRisk: sighting.spamScore >= HIGH_RISK_THRESHOLD,
								indicators: Array.isArray(sighting.spamIndicators)
									? (sighting.spamIndicators as string[])
									: []
							}
						: null,
				// Rohwert der Spalte für den Fallback — das `!!` in den FormValues
				// oben verliert 0 vs. >0 nicht, aber den Zahlwert schon.
				inBalticSeaGeo: sighting.inBalticSeaGeo
			};
		} catch (error) {
			logger.error({ error, sightingId }, 'Failed to load sighting from database');
			return null;
		}
	}

	/**
	 * Prüft die drei Voraussetzungen des Benachrichtigungs-Versands und benennt
	 * die erste, die fehlt. `null` heißt: nichts steht im Weg.
	 *
	 * Der Versand selbst benutzt dieselbe Funktion — die Reihenfolge der Gründe
	 * ist damit garantiert dieselbe, und eine Diagnose kann nicht auf einen
	 * anderen Grund zeigen als den, an dem der Versand abbrach.
	 *
	 * **Warum das nötig wurde:** Alle drei Abbrüche gaben nach außen dasselbe
	 * `false`, und der häufigste — der Abschalter — stand nur auf `debug` im Log.
	 * Für einen Admin war das ununterscheidbar von einem SMTP-Fehler. Verschärft
	 * dadurch, dass `sendTestEmail()` mit `test = true` bewusst an Abschalter und
	 * Transporter-Gate vorbeigeht: Die Test-Mail aus `/admin/settings` kommt an,
	 * während die Sichtungs-Benachrichtigung stumm scheitert.
	 */
	static async findNotificationBlocker(): Promise<NotificationBlocker | null> {
		const enabled = await ConfigRepository.getBoolean('notification.email.enabled', false);

		if (!enabled) {
			return 'disabled';
		}

		if (!(await this.ensureTransporter())) {
			return 'transport-unavailable';
		}

		const config = await this.getEmailConfig();

		return config.recipient ? null : 'recipient-missing';
	}

	/**
	 * Consolidated email sending logic
	 */
	private static async sendEmailNotification(
		sightingFormValues: SightingFormValues,
		referenceId: string,
		adminUrl: string,
		balticSea: BalticSeaEmailContext,
		photoAnnouncementPending: boolean,
		persistedSpam: SpamCheckResult | null = null,
		inBalticSeaGeo: number | null = null
	): Promise<boolean> {
		try {
			const blocker = await this.findNotificationBlocker();

			if (blocker) {
				// `warn` auch für den Abschalter: Bis 2026-08-05 stand er auf
				// `debug` und war im Normalbetrieb unsichtbar — eine ausbleibende
				// Benachrichtigung zeigt sonst nirgends etwas an.
				logger.warn({ blocker, referenceId }, 'Sighting notification not sent');
				return false;
			}

			const transporter = await this.ensureTransporter();
			const config = await this.getEmailConfig();

			if (!transporter) {
				// Kann nach der Prüfung oben nur eintreten, wenn die Verbindung
				// dazwischen verworfen wurde. TypeScript braucht die Klammer ohnehin.
				logger.warn('Email service not available, notification not sent');
				return false;
			}

			// Spam-Bewertung: bevorzugt der zum Meldezeitpunkt persistierte Score
			// (kennt Token-Kontext und Duplikate). Neuberechnung nur als Fallback
			// für Altbestand ohne gespeicherte Bewertung — mit dem DB-Ostsee-Flag
			// statt eigener Geografie.
			const spamIndicators =
				persistedSpam ??
				(await detectSpamIndicators({
					latitude: sightingFormValues.latitude ?? undefined,
					longitude: sightingFormValues.longitude ?? undefined,
					species: sightingFormValues.species,
					firstName: sightingFormValues.firstName || undefined,
					lastName: sightingFormValues.lastName || undefined,
					email: sightingFormValues.email || undefined,
					waterway: sightingFormValues.waterway || undefined,
					seaMark: sightingFormValues.seaMark || undefined,
					notes: sightingFormValues.notes || undefined,
					inBalticSeaGeo
				}));

			// Prepare template data with formatted enum values.
			// Locale bewusst auf baseLocale ('de') gepinnt: Diese Mail geht ans
			// Deutsche Meeresmuseum, nicht an den Melder, und bleibt laut Entwurf
			// vom Sprachwechsel ausgenommen (docs/i18n/DESIGN_MEHRSPRACHIGKEIT_2026-08-10.md,
			// Abschnitt 5.4). Ohne die Pinnung würde eine Meldung über /en dem
			// Museum englische Labels in einer sonst deutschen Mail liefern.
			const formattedSighting = formatSightingForDisplay(sightingFormValues, baseLocale);
			const templateData = {
				referenceId,
				// Der Ostsee-Status liegt unter `sighting.balticSea` — die Vorlage
				// verzweigt darüber und nicht mehr über die beiden Rohflags.
				sighting: { ...formattedSighting, balticSea },
				// Auf oberster Ebene und nicht unter `sighting`: Der Wert steht
				// für keine Spalte, sondern für den Zustand „angekündigt, noch
				// nichts da" (siehe `loadSightingForEmail`).
				photoAnnouncementPending,
				adminUrl,
				currentDate: formatLocalDateTime(new Date(), 'date'),
				currentTime: formatLocalDateTime(new Date(), 'time'),
				spamCheck: spamIndicators,
				// Farbpalette als Kontext statt als Literale in der Vorlage. Auch
				// eine in der DB gespeicherte Vorlage bekommt sie damit — sonst
				// wären genau die Templates ausgenommen, die niemand reviewt.
				...emailColorContext()
			};

			// Compile template
			const template = await this.getCompiledTemplate(config.template);
			const htmlContent = template(templateData);

			// Prepare mail options
			const mailOptions = {
				from: {
					name: config.senderName,
					address: config.sender
				},
				to: config.recipient,
				cc: recipientsOrUndefined(config.cc),
				bcc: recipientsOrUndefined(config.bcc),
				// „Meldung", nicht „Sichtung": Derselbe Vorgang entsteht bei einem
				// Totfund wie bei einem lebenden Tier (A5.3). Der Betreff ist die
				// einzige Zeile, die im Posteingang ohne Öffnen sichtbar ist — er
				// darf den Totfund nicht sprachlich ausschließen.
				subject: `Neue Meldung: ${referenceId}`,
				html: htmlContent,
				text: this.htmlToText(htmlContent)
			};

			// Send email
			const info = await transporter.sendMail(mailOptions);

			logger.info(
				{
					messageId: info.messageId,
					referenceId,
					recipient: config.recipient
				},
				'Notification email sent successfully'
			);

			return true;
		} catch (error) {
			logger.error({ error, referenceId }, 'Failed to send notification email');
			return false;
		}
	}

	/**
	 * Send simple test email to verify configuration
	 */
	static async sendTestEmail(recipient?: string): Promise<boolean> {
		try {
			// `test = true`: Eine Test-Mail muss auch dann gehen, wenn die
			// Benachrichtigungen selbst noch abgeschaltet sind — genau so prüft man
			// die Konfiguration, bevor man sie scharf schaltet.
			const transporter = await this.ensureTransporter(true);

			if (!transporter) {
				throw new Error('Email service not available');
			}

			const config = await this.getEmailConfig();
			const testRecipient = recipient || config.recipient;

			if (!testRecipient) {
				throw new Error('No recipient specified');
			}

			// CC/BCC gehören zur Konfiguration, die diese Mail prüfen soll — auch
			// bei explizit übergebenem Empfänger. Der Knopf in `/admin/settings`
			// schickt den konfigurierten Empfänger immer explizit mit; ein
			// Override-Sonderfall würde CC/BCC genau auf dem einzigen Weg
			// auslassen, auf dem eine Test-Mail überhaupt ausgelöst wird.
			const cc = recipientsOrUndefined(config.cc);
			const bcc = recipientsOrUndefined(config.bcc);

			const mailOptions: SendMailOptions = {
				from: {
					name: config.senderName,
					address: config.sender
				},
				to: testRecipient,
				cc,
				bcc,
				subject: 'Test E-Mail - Ostsee-Tiere Konfiguration',
				html: `
					<h2>Test E-Mail</h2>
					<p>Diese Test-E-Mail wurde erfolgreich von der Ostsee-Tiere Anwendung gesendet.</p>
					<p><strong>Zeitpunkt:</strong> ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</p>
					<p><strong>Konfiguration:</strong> Funktioniert korrekt ✅</p>
					<p><strong>Empfänger:</strong> ${escape(testRecipient)}${
						cc ? `, Kopie an ${escape(cc.join(', '))}` : ''
					}</p>
				`,
				text: 'Test E-Mail - Die Ostsee-Tiere E-Mail Konfiguration funktioniert korrekt.'
			};

			const info = await transporter.sendMail(mailOptions);

			logger.info(
				{
					messageId: info.messageId,
					recipient: testRecipient,
					cc,
					bcc
				},
				'Simple test email sent successfully'
			);

			return true;
		} catch (error) {
			logger.error({ error, recipient }, 'Failed to send simple test email');
			return false;
		}
	}

	/**
	 * Get email configuration from database with caching
	 */
	private static async getEmailConfig(): Promise<EmailConfig> {
		const now = Date.now();

		// Return cached config if still valid
		if (this.configCache && now - this.configCache.timestamp < this.CONFIG_CACHE_TTL) {
			return this.configCache.config;
		}

		// Fetch fresh config from database
		const config: EmailConfig = {
			enabled: await ConfigRepository.getBoolean('notification.email.enabled', false),
			recipient: await ConfigRepository.getString('notification.email.recipient', ''),
			cc: await ConfigRepository.getArray('notification.email.cc', []),
			bcc: await ConfigRepository.getArray('notification.email.bcc', []),
			sender: await ConfigRepository.getString(
				'notification.email.sender',
				'noreply@ostsee-tiere.de'
			),
			senderName: await ConfigRepository.getString('notification.email.senderName', 'Ostsee-Tiere'),
			template: await ConfigRepository.getString(
				'notification.email.template',
				NOTIFICATION_EMAIL_DEFAULT_TEMPLATE
			)
		};

		// Cache the config
		this.configCache = { config, timestamp: now };
		return config;
	}

	/**
	 * Get compiled Handlebars template with hash-based caching
	 */
	private static async getCompiledTemplate(
		templateString: string
	): Promise<HandlebarsTemplateDelegate> {
		// Use simple hash for cache key instead of full template string
		const cacheKey = this.hashString(templateString);

		if (this.templateCache.has(cacheKey)) {
			return this.templateCache.get(cacheKey)!;
		}

		try {
			const template = Handlebars.compile(templateString);
			this.templateCache.set(cacheKey, template);
			return template;
		} catch (error) {
			logger.error({ error }, 'Failed to compile email template, using default');
			const defaultTemplate = Handlebars.compile(NOTIFICATION_EMAIL_DEFAULT_TEMPLATE);
			return defaultTemplate;
		}
	}

	/**
	 * Simple hash function for template caching
	 */
	private static hashString(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return hash.toString(36);
	}

	/**
	 * Convert HTML to plain text for email
	 */
	private static htmlToText(html: string): string {
		return htmlToPlainText(html, {
			wordwrap: false
		}).trim();
	}

	/**
	 * Clear all caches
	 */
	static clearCaches(): void {
		this.templateCache.clear();
		this.configCache = null;
		logger.debug('Email service caches cleared');
	}

	/**
	 * Clear template cache (legacy method for backward compatibility)
	 * @deprecated Use clearCaches() instead
	 */
	static clearTemplateCache(): void {
		this.clearCaches();
	}
}

// Initialize service on module load (but not in test environment)
if (typeof process !== 'undefined' && NODE_ENV !== 'test') {
	EmailService.initialize().catch((error) => {
		logger.error({ error }, 'Failed to initialize email service on startup');
	});
}
