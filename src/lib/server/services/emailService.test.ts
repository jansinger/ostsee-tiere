/**
 * Unit Tests für EmailService
 *
 * Testet das Verhalten des E-Mail-Benachrichtigungsdienstes für neue Meeressäuger-Sichtungen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryChannelEnum } from '#lib/report/formOptions/entryChannel.ts';

// Das globale Setup in vitest-setup-server.ts mockt emailService — hier aufheben
// damit wir die echte Implementierung testen
vi.unmock('#lib/server/services/emailService.ts');

// Mocks müssen vor dem Import des zu testenden Moduls definiert werden
vi.mock('#lib/server/env.ts', () => ({
	env: {
		NODE_ENV: 'test',
		SMTP_HOST: '',
		SMTP_PORT: '587',
		SMTP_USER: '',
		SMTP_PASSWORD: ''
	},
	publicEnv: {
		PUBLIC_SITE_URL: 'https://example.com'
	}
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/server/db/configRepository.ts', () => ({
	ConfigRepository: {
		getBoolean: vi.fn(),
		getString: vi.fn(),
		getNumber: vi.fn(),
		getArray: vi.fn()
	}
}));

vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: vi.fn()
	}
}));

vi.mock('#lib/server/db/sightingFilesRepository.ts', () => ({
	countFilesForSighting: vi.fn().mockResolvedValue(0)
}));

vi.mock('nodemailer', () => ({
	default: {
		createTransport: vi.fn()
	}
}));

// Der Service liest seit dem 2026-08-04 keine Datei mehr. Der Mock bleibt
// trotzdem — er ist der Angriffspunkt des Guards „liest dafür keine Datei",
// der einen Rückfall auf `readFileSync` bemerken soll.
vi.mock('fs', () => ({
	readFileSync: vi.fn()
}));

vi.mock('#lib/utils/format/sightingFormatter.ts', () => ({
	formatSightingForDisplay: vi.fn(),
	isUnknownOrMissingSpecies: vi.fn()
}));

vi.mock('#lib/server/spam/spamDetector.ts', () => ({
	detectSpamIndicators: vi.fn().mockResolvedValue({
		score: 0,
		isHighRisk: false,
		indicators: []
	})
}));

vi.mock('#lib/utils/format/dateTime.ts', () => ({
	formatLocalDateTime: vi.fn()
}));

import { ConfigRepository } from '#lib/server/db/configRepository.ts';
import { db } from '#lib/server/db/index.ts';
import { countFilesForSighting } from '#lib/server/db/sightingFilesRepository.ts';
import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import {
	formatSightingForDisplay,
	isUnknownOrMissingSpecies
} from '#lib/utils/format/sightingFormatter.ts';
import { formatLocalDateTime } from '#lib/utils/format/dateTime.ts';
import { NOTIFICATION_EMAIL_DEFAULT_TEMPLATE } from '#lib/server/templates/notificationEmailDefault.ts';
import { detectSpamIndicators } from '#lib/server/spam/spamDetector.ts';
import { EmailService } from './emailService';
import { SMTP_CA_BUNDLE } from './smtpRootCertificates';

// Hilfsfunktionen zum Erstellen von Mocks
function createMockTransporter(sendMailResult = { messageId: 'test-id-123' }) {
	return {
		verify: vi.fn().mockResolvedValue(true),
		sendMail: vi.fn().mockResolvedValue(sendMailResult),
		close: vi.fn()
	};
}

function setupConfigRepositoryMocks({
	enabled = true,
	recipient = 'admin@ostsee-tiere.de',
	smtpHost = 'smtp.example.com',
	smtpPort = 587,
	smtpSecure = false,
	smtpUser = 'user@example.com',
	smtpPassword = 'secret',
	sender = 'noreply@ostsee-tiere.de',
	senderName = 'Ostsee-Tiere',
	cc = [] as string[],
	bcc = [] as string[],
	template = '<html>{{referenceId}}</html>'
} = {}) {
	const mockGetBoolean = vi.mocked(ConfigRepository.getBoolean);
	const mockGetString = vi.mocked(ConfigRepository.getString);
	const mockGetNumber = vi.mocked(ConfigRepository.getNumber);
	const mockGetArray = vi.mocked(ConfigRepository.getArray);

	mockGetBoolean.mockImplementation(async (key: string, defaultValue: boolean) => {
		if (key === 'notification.email.enabled') return enabled;
		if (key === 'email.smtp.secure') return smtpSecure;
		return defaultValue;
	});

	mockGetString.mockImplementation(async (key: string, defaultValue: string) => {
		if (key === 'email.smtp.host') return smtpHost;
		if (key === 'email.smtp.user') return smtpUser;
		if (key === 'email.smtp.password') return smtpPassword;
		if (key === 'notification.email.recipient') return recipient;
		if (key === 'notification.email.sender') return sender;
		if (key === 'notification.email.senderName') return senderName;
		if (key === 'notification.email.template') return template;
		return defaultValue;
	});

	mockGetNumber.mockImplementation(async (key: string, defaultValue: number) => {
		if (key === 'email.smtp.port') return smtpPort;
		return defaultValue;
	});

	mockGetArray.mockImplementation(async (key: string, defaultValue: unknown[]) => {
		if (key === 'notification.email.cc') return cc;
		if (key === 'notification.email.bcc') return bcc;
		return defaultValue;
	});
}

function createMockSighting(overrides = {}) {
	return {
		id: 42,
		referenceId: 'REF-42',
		species: 0,
		totalCount: 2,
		firstName: 'Max',
		lastName: 'Mustermann',
		email: 'max@example.com',
		latitude: '54.5',
		longitude: '12.3',
		sightingDate: new Date('2024-06-15'),
		// Nach `NEW_IOS_CLIENT_LAUNCH_DATE` — sonst schlösse die Foto-Ankündigung
		// schon an der Zeitgrenze aus, und die Tests darüber prüften nichts.
		created: new Date('2026-08-03T10:00:00.000Z'),
		juvenileCount: 0,
		sightingFrom: 1,
		mediaUpload: null,
		behavior: null,
		distance: 2,
		waterway: null,
		seaMark: null,
		notes: null,
		phone: null,
		isDead: false,
		deadCondition: null,
		deadSize: null,
		distribution: 1,
		reaction: null,
		seaState: 1,
		visibility: 2,
		boatDrive: 1,
		entryChannel: 0,
		nameConsent: true,
		shipNameConsent: false,
		verified: 1,
		deadPhoneContact: false,
		hasPosition: true,
		otherObservations: null,
		inBalticSea: true,
		inBalticSeaGeo: true,
		...overrides
	};
}

describe('EmailService', () => {
	let mockTransporter: ReturnType<typeof createMockTransporter>;

	beforeEach(() => {
		vi.clearAllMocks();
		EmailService.clearCaches();
		// Der Transporter ist statisch und überlebt sonst den einzelnen Test —
		// ein in Test A aufgebauter Transporter ließ Test B versenden, obwohl der
		// dort gar keinen aufgebaut hatte. Die Reihenfolge der Tests entschied
		// damit über ihr Ergebnis.
		EmailService.resetTransporter();

		// Standard-Transporter-Mock
		mockTransporter = createMockTransporter();
		vi.mocked(nodemailer.createTransport).mockReturnValue(mockTransporter as any);

		// Formatter-Mocks
		vi.mocked(formatSightingForDisplay).mockReturnValue({
			species: 'Schweinswal',
			sightingDate: '15.06.2024',
			coordinatesFormatted: '54.5000° N, 12.3000° O'
		} as any);
		vi.mocked(isUnknownOrMissingSpecies).mockReturnValue(false);
		vi.mocked(formatLocalDateTime).mockReturnValue('15.06.2024');

		// `clearAllMocks` nimmt auch den Rückgabewert aus der Mock-Fabrik —
		// ohne diese Zeile liefert der Zähler `undefined` statt einer Zahl.
		vi.mocked(countFilesForSighting).mockResolvedValue(0);
	});

	afterEach(() => {
		EmailService.clearCaches();
	});

	// ---------------------------------------------------------------------------
	// clearCaches
	// ---------------------------------------------------------------------------
	describe('clearCaches()', () => {
		it('kann mehrfach aufgerufen werden ohne Fehler', () => {
			expect(() => EmailService.clearCaches()).not.toThrow();
			expect(() => EmailService.clearCaches()).not.toThrow();
		});

		it('clearTemplateCache() delegiert an clearCaches()', () => {
			const clearCachesSpy = vi.spyOn(EmailService, 'clearCaches');
			EmailService.clearTemplateCache();
			expect(clearCachesSpy).toHaveBeenCalledOnce();
		});
	});

	// ---------------------------------------------------------------------------
	// initialize
	// ---------------------------------------------------------------------------
	describe('initialize()', () => {
		it('bricht ab wenn E-Mail deaktiviert und test=false', async () => {
			setupConfigRepositoryMocks({ enabled: false });

			await EmailService.initialize(false);

			expect(nodemailer.createTransport).not.toHaveBeenCalled();
		});

		it('fährt fort wenn E-Mail deaktiviert aber test=true', async () => {
			setupConfigRepositoryMocks({ enabled: false, smtpHost: 'smtp.example.com' });

			await EmailService.initialize(true);

			expect(nodemailer.createTransport).toHaveBeenCalled();
		});

		it('bricht ab wenn SMTP-Host leer ist', async () => {
			setupConfigRepositoryMocks({ enabled: true, smtpHost: '' });

			await EmailService.initialize(false);

			expect(nodemailer.createTransport).not.toHaveBeenCalled();
		});

		it('erstellt Transporter wenn SMTP konfiguriert und Verify erfolgreich', async () => {
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });

			await EmailService.initialize(false);

			expect(nodemailer.createTransport).toHaveBeenCalledWith(
				expect.objectContaining({
					host: 'smtp.example.com',
					port: 587
				})
			);
			expect(mockTransporter.verify).toHaveBeenCalled();
		});

		it('reicht den fehlenden DigiCert-Root an den TLS-Kontext durch', async () => {
			// Ohne diesen Root scheitert STARTTLS gegen den Exchange-Online-Connector
			// des Museums mit `unable to get local issuer certificate` — nodemailer
			// meldet das als `ESOCKET`/`CONN`, also wie einen Netzwerkfehler.
			// Begründung und Widerrufsbedingung: `smtpRootCertificates.ts`.
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });

			await EmailService.initialize(false);

			expect(nodemailer.createTransport).toHaveBeenCalledWith(
				expect.objectContaining({
					tls: expect.objectContaining({ ca: SMTP_CA_BUNDLE })
				})
			);
		});

		it('setzt Transporter auf null wenn verify() fehlschlägt', async () => {
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });
			mockTransporter.verify.mockRejectedValueOnce(new Error('Verbindungsfehler'));

			await EmailService.initialize(false);

			// Wenn Transporter null ist, schlägt sendTestEmail fehl
			// (kein zweites initialize da test=false und enabled bereits in Cache)
			EmailService.clearCaches();
			setupConfigRepositoryMocks({ enabled: false, smtpHost: '' });
			const result = await EmailService.sendTestEmail('test@example.com');
			expect(result).toBe(false);
		});
	});

	// ---------------------------------------------------------------------------
	// sendNewSightingNotification
	// ---------------------------------------------------------------------------
	/**
	 * Warum es diese Funktion gibt: `sendNewSightingNotification` gibt bei allen
	 * drei Abbruchgründen dasselbe `false` zurück, und der Grund stand nur im
	 * Log — der Abschalter sogar nur auf `debug`. Ein Admin sah „Fehler beim
	 * Senden" und fand nichts. Besonders irreführend, weil die Test-Mail in den
	 * Einstellungen mit `test = true` an genau diesen Sperren vorbeigeht: Sie
	 * kommt an, während die Sichtungs-Benachrichtigung stumm scheitert.
	 *
	 * Die Reihenfolge ist dieselbe wie im Versand, weil beide dieselbe Funktion
	 * benutzen — sonst nennte die Diagnose einen anderen Grund als den, an dem
	 * der Versand tatsächlich abbrach.
	 */
	describe('findNotificationBlocker()', () => {
		it('meldet den Abschalter, wenn Benachrichtigungen deaktiviert sind', async () => {
			setupConfigRepositoryMocks({ enabled: false });

			await expect(EmailService.findNotificationBlocker()).resolves.toBe('disabled');
		});

		it('meldet den fehlenden Empfänger', async () => {
			setupConfigRepositoryMocks({ enabled: true, recipient: '' });

			await expect(EmailService.findNotificationBlocker()).resolves.toBe('recipient-missing');
		});

		it('meldet die fehlende SMTP-Verbindung', async () => {
			setupConfigRepositoryMocks({ enabled: true, smtpHost: '' });

			await expect(EmailService.findNotificationBlocker()).resolves.toBe('transport-unavailable');
		});

		it('meldet null, wenn nichts im Weg steht', async () => {
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });
			await EmailService.initialize(false);

			await expect(EmailService.findNotificationBlocker()).resolves.toBeNull();
		});

		/**
		 * Der Abschalter zuerst: Ist er aus, sagt ein zusätzlich fehlender
		 * Empfänger nichts über die Ursache — er ist dann nur noch nicht
		 * eingetragen worden.
		 */
		it('nennt den Abschalter vor dem fehlenden Empfänger', async () => {
			setupConfigRepositoryMocks({ enabled: false, recipient: '' });

			await expect(EmailService.findNotificationBlocker()).resolves.toBe('disabled');
		});
	});

	describe('sendNewSightingNotification()', () => {
		it('gibt false zurück wenn Sichtung nicht in DB gefunden', async () => {
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([])
					})
				})
			} as any);

			const result = await EmailService.sendNewSightingNotification(999);

			expect(result).toBe(false);
		});

		it('gibt false zurück wenn E-Mail-Benachrichtigung deaktiviert', async () => {
			const mockSighting = createMockSighting();
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			setupConfigRepositoryMocks({ enabled: false });

			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(false);
		});

		// Bis 2026-08-04 war das Gegenteil zugesichert („kein Transporter → false"),
		// und genau daran starb der Versand: Ein beim Start fehlgeschlagenes
		// verify() ließ den Transporter dauerhaft `null`, ohne dass je ein neuer
		// Versuch stattfand. Ein fehlender Transporter ist ein Grund, ihn
		// aufzubauen — kein Grund, die Benachrichtigung zu verwerfen. Dass ein
		// **gescheiterter** Aufbau weiterhin `false` liefert, sichert der Test
		// „gibt false zurück wenn der Neuaufbau ebenfalls scheitert" ab.
		it('baut einen fehlenden Transporter auf statt die Mail zu verwerfen', async () => {
			const mockSighting = createMockSighting();
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			// E-Mail aktiviert, aber kein Transporter (initialize nicht aufgerufen)
			setupConfigRepositoryMocks({ enabled: true });

			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(true);
			expect(nodemailer.createTransport).toHaveBeenCalledOnce();
		});

		it('sendet E-Mail und gibt true zurück wenn alles korrekt konfiguriert', async () => {
			const mockSighting = createMockSighting();
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });

			// Transporter initialisieren
			await EmailService.initialize(false);

			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(true);
			expect(mockTransporter.sendMail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: 'admin@ostsee-tiere.de',
					// Der Betreff nennt den Vorgang „Meldung" (A5.3): derselbe
					// Vorgang entsteht bei einem Totfund wie bei einem lebenden
					// Tier, und der Betreff ist die einzige Zeile, die im
					// Posteingang ohne Öffnen sichtbar ist.
					subject: 'Neue Meldung: REF-42'
				})
			);
		});

		it('gibt false zurück wenn kein Empfänger konfiguriert', async () => {
			const mockSighting = createMockSighting();
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com', recipient: '' });

			await EmailService.initialize(false);
			EmailService.clearCaches(); // Cache leeren damit getEmailConfig neu lädt

			// Config neu setzen ohne Empfänger
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com', recipient: '' });

			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(false);
		});

		it('formatiert sightingDate über formatLocalDateTime (Berlin) statt UTC-ISO-Split (M2)', async () => {
			// Sichtung 22:30 UTC am 14.07. = 00:30 Berliner Sommerzeit am 15.07.
			// `toISOString().split('T')[0]` läse fälschlich den 14.07. (UTC-Vortag).
			const mockSighting = createMockSighting({
				sightingDate: new Date('2024-07-14T22:30:00Z')
			});
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });
			await EmailService.initialize(false);

			await EmailService.sendNewSightingNotification(42);

			// formatLocalDateTime muss mit dem rohen Sichtungsdatum und Format 'date'
			// aufgerufen werden — nicht per toISOString().split('T')[0] umgangen.
			expect(formatLocalDateTime).toHaveBeenCalledWith(mockSighting.sightingDate, 'date');

			// formatSightingForDisplay (komplett gemockt) darf nur das Berlin-
			// formatierte Datum erhalten, nie den rohen UTC-Tag (wäre der Vortag).
			const callArg = vi.mocked(formatSightingForDisplay).mock.calls[0]?.[0];
			expect(callArg?.sightingDate).not.toBe('2024-07-14');
		});

		it('ruft formatSightingForDisplay mit baseLocale auf — die Mail geht ans Museum, nicht an den Melder (siehe docs/i18n/DESIGN_MEHRSPRACHIGKEIT_2026-08-10.md, 5.4)', async () => {
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([createMockSighting()])
					})
				})
			} as any);

			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });
			await EmailService.initialize(false);

			await EmailService.sendNewSightingNotification(42);

			const { baseLocale } = await import('#lib/paraglide/runtime.js');
			const localeArg = vi.mocked(formatSightingForDisplay).mock.calls[0]?.[1];
			expect(localeArg).toBe(baseLocale);
		});

		// ------------------------------------------------------------------
		// Ostsee-Status im Template-Kontext
		//
		// Der Status muss aus der **Rohzeile** kommen. `sightingFormValues`
		// wandelt beide Flags mit `!!` um — damit verschwindet der
		// Altsystem-Wert 2, und ohne Koordinaten wäre `noPosition` nicht mehr
		// erkennbar. Diese Tests fahren den echten Pfad
		// loadSightingForEmail → balticSeaEmailContext → Vorlage.
		// ------------------------------------------------------------------
		describe('Ostsee-Status im Template-Kontext', () => {
			async function renderMailFor(overrides: Record<string, unknown>): Promise<string> {
				vi.mocked(db.select).mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([createMockSighting(overrides)])
						})
					})
				} as any);

				setupConfigRepositoryMocks({
					enabled: true,
					smtpHost: 'smtp.example.com',
					// Minimale Vorlage, die nur den Status ausgibt — der Test prüft die
					// Verdrahtung, nicht das Layout der ausgelieferten Vorlage (das
					// tut notificationEmailDefault.test.ts).
					template:
						'<html>{{sighting.balticSea.status}}|{{sighting.balticSea.label}}|{{sighting.balticSea.needsAttention}}</html>'
				});
				await EmailService.initialize(false);

				await EmailService.sendNewSightingNotification(42);

				const mailOptions = mockTransporter.sendMail.mock.calls[0]?.[0];
				return (mailOptions as { html: string }).html;
			}

			// Der eigentliche Befund: ostsee_geo ist die grobe Bounding Box. Eine
			// Meldung aus dem Hamburger Hafen liegt darin, aber nicht im Polygon.
			it('weist eine Sichtung in der Box, aber außerhalb des Polygons NICHT als Ostsee aus', async () => {
				const html = await renderMailFor({
					inBalticSea: 0,
					inBalticSeaGeo: 1,
					latitude: '53.540000',
					longitude: '9.970000'
				});

				expect(html).toContain('outside');
				expect(html).not.toContain('Ostsee');
			});

			it('weist eine echte Ostsee-Sichtung als Ostsee aus', async () => {
				const html = await renderMailFor({
					inBalticSea: 1,
					inBalticSeaGeo: 1,
					latitude: '54.020000',
					longitude: '11.100000'
				});

				expect(html).toContain('baltic|Ostsee|false');
			});

			// Beweist, dass der Status aus der Rohzeile stammt: nach `!!` wäre die
			// 2 nicht mehr von 1 zu unterscheiden — hier ist sie es auch nicht,
			// aber ein späterer Umbau auf `> 1`-Semantik fiele sofort auf.
			it('behandelt den Altsystem-Wert 2 in ostsee_geo wie 1', async () => {
				const html = await renderMailFor({
					inBalticSea: 1,
					inBalticSeaGeo: 2,
					latitude: '54.020000',
					longitude: '11.100000'
				});

				expect(html).toContain('baltic|Ostsee|false');
			});

			// Ohne Koordinaten trägt kein Flag eine Aussage. Käme der Status aus
			// `sightingFormValues`, wären die Koordinaten dort schon Zahlen und
			// dieser Zustand nicht erreichbar.
			it('meldet eine Sichtung ohne Koordinaten als „ohne Position"', async () => {
				const html = await renderMailFor({
					inBalticSea: 1,
					inBalticSeaGeo: 1,
					latitude: null,
					longitude: null
				});

				expect(html).toContain('noPosition');
				expect(html).toContain('true');
			});
		});

		// ------------------------------------------------------------------
		// Foto-Ankündigung (neu gebauter iOS-Client, Stand 2026-07-30): Der
		// Client setzt `aufnahmeHochladen`, kann aber kein Foto hochladen —
		// es kommt per E-Mail nach. Ohne einen Hinweis in der
		// Benachrichtigungs-Mail weiß niemand, welcher Sichtung eine später
		// eintreffende Foto-Mail zuzuordnen ist.
		// ------------------------------------------------------------------
		describe('Foto-Ankündigung im Template-Kontext', () => {
			async function renderMailFor({
				mediaUpload,
				attachedFiles = 0,
				created = new Date('2026-08-03T10:00:00.000Z'),
				// Nur die App kündigt ein Foto an, ohne es übertragen zu können
				// (`#lib/utils/media/photoAnnouncement.ts`) — bei den manuell
				// erfassten Kanälen liegt dem Admin das Foto bereits vor.
				entryChannel = EntryChannelEnum.APP
			}: {
				mediaUpload: unknown;
				attachedFiles?: number;
				created?: Date;
				entryChannel?: number;
			}): Promise<string> {
				vi.mocked(db.select).mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([createMockSighting({ mediaUpload, created, entryChannel })])
						})
					})
				} as any);
				vi.mocked(countFilesForSighting).mockResolvedValue(attachedFiles);

				setupConfigRepositoryMocks({
					enabled: true,
					smtpHost: 'smtp.example.com',
					// Minimale Vorlage — prüft die Verdrahtung, nicht das Layout des
					// ausgelieferten Textes (das übernimmt notificationEmailDefault.test.ts).
					template:
						'<html>{{#if photoAnnouncementPending}}foto-angekuendigt:{{referenceId}}{{/if}}</html>'
				});
				await EmailService.initialize(false);

				await EmailService.sendNewSightingNotification(42);

				const mailOptions = mockTransporter.sendMail.mock.calls[0]?.[0];
				return (mailOptions as { html: string }).html;
			}

			it('kündigt das Foto an, wenn das Flag gesetzt und keine Datei angehängt ist', async () => {
				const html = await renderMailFor({ mediaUpload: 1 });

				expect(html).toContain('foto-angekuendigt:REF-42');
			});

			// Der Fehlerfall aus preprod: Meldung über das Web-Formular. Dort
			// setzt `ModernReportForm.svelte` `mediaUpload` genau dann, wenn eine
			// Datei hochgeladen wurde — und die hängt beim Versand bereits an der
			// Sichtung (`saveSighting` verknüpft sie in derselben Transaktion).
			it('lässt den Block weg bei einer nicht über die App eingegangenen Meldung', async () => {
				const html = await renderMailFor({
					mediaUpload: 1,
					entryChannel: EntryChannelEnum.MAIL
				});

				expect(html).not.toContain('foto-angekuendigt');
			});

			it('lässt den Block weg, wenn bereits eine Datei angehängt ist', async () => {
				const html = await renderMailFor({ mediaUpload: 1, attachedFiles: 1 });

				expect(html).not.toContain('foto-angekuendigt');
			});

			it('lässt den Block weg, wenn kein Foto angekündigt wurde', async () => {
				const html = await renderMailFor({ mediaUpload: 0 });

				expect(html).not.toContain('foto-angekuendigt');
			});

			it('lässt den Block bei null (kein Wert in der Zeile) ebenfalls weg', async () => {
				const html = await renderMailFor({ mediaUpload: null });

				expect(html).not.toContain('foto-angekuendigt');
			});

			// Vor dem Start des neuen iOS-Clients bedeutete das Flag nur „der
			// Melder hatte ein Foto" — siehe photoAnnouncement.ts. Erreichbar ist
			// der Fall über `import-legacy-inbox.js` und die Admin-Test-Mail.
			it('lässt den Block bei einer Sichtung aus der Zeit vor dem Client weg', async () => {
				const html = await renderMailFor({
					mediaUpload: 1,
					created: new Date('2024-06-15T10:00:00.000Z')
				});

				expect(html).not.toContain('foto-angekuendigt');
			});

			it('zählt die Dateien der geladenen Sichtung', async () => {
				await renderMailFor({ mediaUpload: 1 });

				expect(countFilesForSighting).toHaveBeenCalledWith(42);
			});
		});

		it('gibt false zurück wenn DB-Abfrage fehlschlägt', async () => {
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockRejectedValue(new Error('DB Verbindungsfehler'))
					})
				})
			} as any);

			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(false);
		});
	});

	// ---------------------------------------------------------------------------
	// sendTestEmail
	// ---------------------------------------------------------------------------
	describe('sendTestEmail()', () => {
		it('gibt false zurück wenn Transporter nicht initialisiert werden kann', async () => {
			// Transporter auf null zurücksetzen indem verify() fehlschlägt
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });
			mockTransporter.verify.mockRejectedValueOnce(new Error('Verbindung fehlgeschlagen'));
			await EmailService.initialize(false);
			EmailService.clearCaches();

			// Nun: E-Mail deaktiviert und kein SMTP-Host → initialize(true) schlägt fehl
			setupConfigRepositoryMocks({ enabled: false, smtpHost: '' });

			const result = await EmailService.sendTestEmail('test@example.com');

			expect(result).toBe(false);
		});

		it('sendet Test-E-Mail und gibt true zurück', async () => {
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });

			await EmailService.initialize(false);

			const result = await EmailService.sendTestEmail('empfaenger@example.com');

			expect(result).toBe(true);
			expect(mockTransporter.sendMail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: 'empfaenger@example.com',
					subject: expect.stringContaining('Test E-Mail')
				})
			);
		});

		it('verwendet konfigurierten Empfänger wenn kein Empfänger angegeben', async () => {
			setupConfigRepositoryMocks({
				enabled: true,
				smtpHost: 'smtp.example.com',
				recipient: 'standard@example.com'
			});

			await EmailService.initialize(false);

			const result = await EmailService.sendTestEmail();

			expect(result).toBe(true);
			expect(mockTransporter.sendMail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: 'standard@example.com'
				})
			);
		});

		it('gibt false zurück wenn sendMail fehlschlägt', async () => {
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });

			await EmailService.initialize(false);

			mockTransporter.sendMail.mockRejectedValueOnce(new Error('SMTP Fehler'));

			const result = await EmailService.sendTestEmail('test@example.com');

			expect(result).toBe(false);
		});

		it('gibt false zurück wenn kein Empfänger angegeben und keiner konfiguriert', async () => {
			setupConfigRepositoryMocks({
				enabled: true,
				smtpHost: 'smtp.example.com',
				recipient: ''
			});

			await EmailService.initialize(false);

			const result = await EmailService.sendTestEmail();

			expect(result).toBe(false);
		});
	});

	// ---------------------------------------------------------------------------
	// CC/BCC-Empfänger
	//
	// `notification.email.cc` und `.bcc` sind seit 2026-07-30 in den Einstellungen
	// pflegbar, wurden aber von **keinem** Versandweg tatsächlich gesetzt:
	//
	// - `sendEmailNotification()` schrieb `config.recipient ? undefined : config.cc`.
	//   Der Empfänger ist an dieser Stelle durch die Prüfung darüber garantiert
	//   gesetzt — der Ausdruck war also konstant `undefined`. Der Kommentar
	//   („nicht für Test-Mails") beschrieb einen Pfad, der hier gar nicht liegt.
	// - `sendTestEmail()` kannte CC/BCC überhaupt nicht.
	//
	// Beides fiel nicht auf, weil eine Mail an den Hauptempfänger ankommt und
	// niemand die stillen Mitleser vermisst.
	// ---------------------------------------------------------------------------
	describe('CC/BCC-Empfänger', () => {
		async function sendNotificationWith(cc: string[], bcc: string[]) {
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([createMockSighting()])
					})
				})
			} as any);

			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com', cc, bcc });
			await EmailService.initialize(false);
			await EmailService.sendNewSightingNotification(42);

			return mockTransporter.sendMail.mock.calls[0]?.[0] as {
				cc?: string[];
				bcc?: string[];
			};
		}

		async function sendTestMailWith(cc: string[], bcc: string[], recipient?: string) {
			setupConfigRepositoryMocks({
				enabled: true,
				smtpHost: 'smtp.example.com',
				recipient: 'admin@ostsee-tiere.de',
				cc,
				bcc
			});
			await EmailService.initialize(false);
			await EmailService.sendTestEmail(recipient);

			return mockTransporter.sendMail.mock.calls[0]?.[0] as {
				cc?: string[];
				bcc?: string[];
			};
		}

		it('setzt CC und BCC bei der Sichtungs-Benachrichtigung', async () => {
			const mailOptions = await sendNotificationWith(['kopie@example.com'], ['blind@example.com']);

			expect(mailOptions.cc).toEqual(['kopie@example.com']);
			expect(mailOptions.bcc).toEqual(['blind@example.com']);
		});

		it('setzt CC und BCC bei der Test-E-Mail', async () => {
			const mailOptions = await sendTestMailWith(
				['kopie@example.com', 'zweite@example.com'],
				['blind@example.com']
			);

			expect(mailOptions.cc).toEqual(['kopie@example.com', 'zweite@example.com']);
			expect(mailOptions.bcc).toEqual(['blind@example.com']);
		});

		// Der Knopf in `/admin/settings` schickt den konfigurierten Empfänger
		// **explizit** mit. Ein Override darf CC/BCC deshalb nicht abschalten,
		// sonst wäre der einzige Weg, eine Test-Mail auszulösen, genau der Weg,
		// der die Mitleser wieder verliert.
		it('setzt CC und BCC auch bei explizit übergebenem Empfänger', async () => {
			const mailOptions = await sendTestMailWith(
				['kopie@example.com'],
				['blind@example.com'],
				'abweichend@example.com'
			);

			expect(mailOptions.cc).toEqual(['kopie@example.com']);
			expect(mailOptions.bcc).toEqual(['blind@example.com']);
		});

		it('lässt CC und BCC weg wenn nichts konfiguriert ist', async () => {
			const mailOptions = await sendNotificationWith([], []);

			expect(mailOptions.cc).toBeUndefined();
			expect(mailOptions.bcc).toBeUndefined();
		});

		it('lässt CC und BCC in der Test-E-Mail weg wenn nichts konfiguriert ist', async () => {
			const mailOptions = await sendTestMailWith([], []);

			expect(mailOptions.cc).toBeUndefined();
			expect(mailOptions.bcc).toBeUndefined();
		});

		// `getArray` liefert den JSONB-Wert ungeprüft. Die Settings-Oberfläche
		// filtert Leereinträge zwar heraus, `PUT /api/config` nimmt aber jedes
		// Array entgegen — ein Leerstring würde als leere Adresse im Header landen.
		it('verwirft leere Einträge in CC und BCC', async () => {
			const mailOptions = await sendNotificationWith(['', '  ', 'kopie@example.com'], ['', '   ']);

			expect(mailOptions.cc).toEqual(['kopie@example.com']);
			expect(mailOptions.bcc).toBeUndefined();
		});
	});

	// ---------------------------------------------------------------------------
	// HTML-Escaping in der Test-E-Mail
	//
	// Die Test-Mail nennt Empfänger und CC im Fließtext. Beide stammen aus
	// Eingaben: CC aus den Einstellungen, der Empfänger aus dem Request-Body von
	// `POST /api/config/test-email`, der ihn — anders als die Admin-Route — gar
	// nicht validiert. Ohne Escaping landet der Wert roh im HTML-Body.
	// ---------------------------------------------------------------------------
	describe('HTML-Escaping in der Test-E-Mail', () => {
		it('escapt Empfänger und CC im Mail-Text', async () => {
			setupConfigRepositoryMocks({
				enabled: true,
				smtpHost: 'smtp.example.com',
				cc: ['<img src=x onerror=alert(1)>@example.com']
			});
			await EmailService.initialize(false);

			await EmailService.sendTestEmail('"><script>alert(1)</script>@example.com');

			const { html } = mockTransporter.sendMail.mock.calls[0]?.[0] as { html: string };

			expect(html).not.toContain('<script>');
			expect(html).not.toContain('<img src=x');
			expect(html).toContain('&lt;script&gt;');
		});
	});

	// ---------------------------------------------------------------------------
	// Transporter-Lebenszyklus
	//
	// Der Transporter ist ein Singleton, das beim Modulstart einmal gebaut wird.
	// Zwei Folgen davon waren falsch:
	//
	// - Geänderte SMTP-Einstellungen erreichten ihn nie. Die Test-Mail prüfte
	//   damit die alte Verbindung und bescheinigte eine Konfiguration als
	//   funktionierend, die so gar nicht gespeichert war.
	// - War der SMTP-Server beim Serverstart kurz nicht erreichbar, schlug
	//   `verify()` fehl, der Transporter blieb `null` — und die
	//   Sichtungs-Benachrichtigung gab von da an dauerhaft `false` zurück, bis
	//   jemand den Container neu startete. Nur `sendTestEmail()` versuchte es
	//   erneut.
	// ---------------------------------------------------------------------------
	describe('Transporter-Lebenszyklus', () => {
		function mockSightingRow() {
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([createMockSighting()])
					})
				})
			} as any);
		}

		it('schließt die alte Verbindung bei resetTransporter()', async () => {
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'alt.example.com' });
			await EmailService.initialize(false);

			EmailService.resetTransporter();

			expect(mockTransporter.close).toHaveBeenCalledOnce();
		});

		it('baut den Transporter nach resetTransporter() mit dem neuen SMTP-Host neu auf', async () => {
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'alt.example.com' });
			await EmailService.initialize(false);
			expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);

			// Admin speichert einen neuen Host — die Route verwirft den Transporter.
			EmailService.resetTransporter();
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'neu.example.com' });

			const result = await EmailService.sendTestEmail('test@example.com');

			expect(result).toBe(true);
			expect(nodemailer.createTransport).toHaveBeenCalledTimes(2);
			expect(nodemailer.createTransport).toHaveBeenLastCalledWith(
				expect.objectContaining({ host: 'neu.example.com' })
			);
		});

		it('baut den Transporter für die Sichtungs-Benachrichtigung bei Bedarf neu auf', async () => {
			mockSightingRow();
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });
			await EmailService.initialize(false);

			EmailService.resetTransporter();

			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(true);
			expect(mockTransporter.sendMail).toHaveBeenCalledOnce();
		});

		// Der eigentliche Betriebsfall: SMTP beim Serverstart nicht erreichbar.
		it('erholt sich von einem beim Start fehlgeschlagenen verify()', async () => {
			mockSightingRow();
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });
			mockTransporter.verify.mockRejectedValueOnce(new Error('ECONNREFUSED'));

			// Serverstart: verify() scheitert, der Transporter bleibt null.
			await EmailService.initialize(false);
			expect(nodemailer.createTransport).toHaveBeenCalledOnce();

			// SMTP ist wieder erreichbar. Die nächste Sichtung baut die Verbindung
			// selbst neu auf — früher blieb sie bis zum Container-Neustart tot.
			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(true);
			expect(nodemailer.createTransport).toHaveBeenCalledTimes(2);
		});

		// Zwei gleichzeitig eingehende Meldungen sehen beide `transporter === null`
		// und liefen beide in `initialize()`. Der zweite Lauf schloss dabei über
		// `resetTransporter()` die Verbindung, die der erste gerade aufgebaut
		// hatte. Realistisch wird das nach einer SMTP-Störung, seit ein fehlender
		// Transporter überhaupt neu aufgebaut wird.
		it('baut bei gleichzeitigem Versand nur einen Transporter auf', async () => {
			mockSightingRow();
			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });

			const results = await Promise.all([
				EmailService.sendNewSightingNotification(42),
				EmailService.sendNewSightingNotification(42),
				EmailService.sendNewSightingNotification(42)
			]);

			expect(results).toEqual([true, true, true]);
			expect(nodemailer.createTransport).toHaveBeenCalledOnce();
			expect(mockTransporter.close).not.toHaveBeenCalled();
		});

		it('gibt false zurück wenn der Neuaufbau ebenfalls scheitert', async () => {
			mockSightingRow();
			setupConfigRepositoryMocks({ enabled: true, smtpHost: '' });

			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(false);
			expect(mockTransporter.sendMail).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------------
	// Spam-Erkennung (indirekt über sendNewSightingNotification)
	// ---------------------------------------------------------------------------
	describe('Spam-Erkennung', () => {
		async function setupAndSend(sightingOverrides = {}) {
			const mockSighting = createMockSighting(sightingOverrides);
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });
			await EmailService.initialize(false);
			return EmailService.sendNewSightingNotification(42);
		}

		it('sendet E-Mail auch bei noreply-Adresse (Spam nur informativ)', async () => {
			const result = await setupAndSend({ email: 'noreply@example.com' });
			expect(result).toBe(true);
		});

		it('sendet E-Mail auch wenn Notizen verdächtige URLs enthalten', async () => {
			const result = await setupAndSend({ notes: 'Besuchen Sie www.spam-site.com für Angebote' });
			expect(result).toBe(true);
		});

		it('sendet E-Mail auch bei Position außerhalb der Ostsee', async () => {
			const result = await setupAndSend({ latitude: '40.0', longitude: '2.0' });
			expect(result).toBe(true);
		});

		it('nutzt den persistierten Spam-Score aus der Datenbank statt neu zu rechnen', async () => {
			const mockSighting = createMockSighting({
				spamScore: 7,
				spamIndicators: ['Testindikator']
			});
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			setupConfigRepositoryMocks({
				enabled: true,
				smtpHost: 'smtp.example.com',
				template:
					'<p>Spam: {{spamCheck.score}}{{#if spamCheck.isHighRisk}} HOCHRISIKO{{/if}} {{#each spamCheck.indicators}}{{this}}{{/each}}</p>'
			});

			await EmailService.initialize(false);
			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(true);
			expect(detectSpamIndicators).not.toHaveBeenCalled();
			const sendMailCall = mockTransporter.sendMail.mock.calls[0]?.[0] as any;
			expect(sendMailCall?.html).toContain('Spam: 7');
			expect(sendMailCall?.html).toContain('HOCHRISIKO');
			expect(sendMailCall?.html).toContain('Testindikator');
		});

		it('rechnet nur beim Altbestand ohne persistierten Score neu — mit dem DB-Ostsee-Flag', async () => {
			const mockSighting = createMockSighting({
				spamScore: null,
				spamIndicators: null,
				inBalticSeaGeo: 1
			});
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });
			await EmailService.initialize(false);
			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(true);
			expect(detectSpamIndicators).toHaveBeenCalledWith(
				expect.objectContaining({ inBalticSeaGeo: 1 })
			);
		});
	});

	// ---------------------------------------------------------------------------
	// Template-Rendering (Handlebars, kein Mock)
	// ---------------------------------------------------------------------------
	describe('Template-Rendering', () => {
		it('rendert Handlebars-Template mit Sichtungsdaten', async () => {
			const mockSighting = createMockSighting();
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			// Template mit Handlebars-Variablen
			setupConfigRepositoryMocks({
				enabled: true,
				smtpHost: 'smtp.example.com',
				template: '<p>Neue Sichtung: {{referenceId}}</p>'
			});

			await EmailService.initialize(false);
			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(true);
			const sendMailCall = mockTransporter.sendMail.mock.calls[0]?.[0] as any;
			expect(sendMailCall?.html).toContain('REF-42');
		});

		it('versendet mit dem Seed-Default, wenn kein eigener Text hinterlegt ist', async () => {
			const mockSighting = createMockSighting();
			vi.mocked(db.select).mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockSighting])
					})
				})
			} as any);

			setupConfigRepositoryMocks({
				enabled: true,
				smtpHost: 'smtp.example.com',
				template: NOTIFICATION_EMAIL_DEFAULT_TEMPLATE
			});

			await EmailService.initialize(false);
			const result = await EmailService.sendNewSightingNotification(42);

			expect(result).toBe(true);
			const sendMailCall = mockTransporter.sendMail.mock.calls[0]?.[0] as any;
			expect(sendMailCall?.html).toContain('REF-42');
		});

		// ------------------------------------------------------------------
		// Der Code-Default der Vorlage ist `NOTIFICATION_EMAIL_DEFAULT_TEMPLATE`
		// — dieselbe Konstante, die `configInitializer.ts` nach `app_config`
		// seedet. Bis 2026-08-04 las `getDefaultTemplate()` stattdessen
		// `templates/sightingNotificationTemplate.html` per `readFileSync`.
		// Diese Datei liegt in `src/` und wird vom Bundler nie nach `build/`
		// ausgegeben; das Docker-Image kopiert nur `build/`. In Produktion
		// schlug der Lesevorgang deshalb immer fehl. Weil der Default als
		// Argument von `ConfigRepository.getString(…)` eifrig ausgewertet
		// wird, passierte das bei jedem Config-Cache-Miss — auch wenn der
		// DB-Wert den Default ohnehin schlägt. Ergebnis: eine `level:50`-Zeile
		// im Produktions-Log alle fünf Minuten, ohne dass etwas kaputt war.
		describe('Vorlagen-Default kommt aus dem Bundle, nicht vom Dateisystem', () => {
			async function sendAndCaptureTemplateDefault() {
				vi.mocked(db.select).mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([createMockSighting()])
						})
					})
				} as any);
				setupConfigRepositoryMocks({ enabled: true, smtpHost: 'smtp.example.com' });

				await EmailService.initialize(false);
				await EmailService.sendNewSightingNotification(42);

				return vi
					.mocked(ConfigRepository.getString)
					.mock.calls.find(([key]) => key === 'notification.email.template');
			}

			it('reicht den Seed-Default an ConfigRepository durch', async () => {
				const call = await sendAndCaptureTemplateDefault();

				expect(call, 'notification.email.template wurde überhaupt gelesen').toBeDefined();
				expect(call?.[1]).toBe(NOTIFICATION_EMAIL_DEFAULT_TEMPLATE);
			});

			it('liest dafür keine Datei', async () => {
				await sendAndCaptureTemplateDefault();

				expect(readFileSync).not.toHaveBeenCalled();
			});
		});
	});
});
