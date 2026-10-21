import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EmailService, type NotificationBlocker } from '#lib/server/services/emailService.ts';
import { createLogger } from '#lib/logger.server.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';

const logger = createLogger('api:test-email');

/**
 * Übersetzt den Abbruchgrund in einen Satz, der sagt, was zu tun ist.
 *
 * Der Abschalter braucht dabei den Zusatz zur Test-Mail: Dass die eine ankommt
 * und die andere nicht, ist kein Widerspruch, sondern Absicht —
 * `sendTestEmail()` geht mit `test = true` bewusst an diesem Schalter vorbei,
 * damit sich SMTP prüfen lässt, bevor man die Benachrichtigungen scharf
 * schaltet.
 */
function describeBlocker(blocker: NotificationBlocker | null): string {
	switch (blocker) {
		case 'disabled':
			return 'E-Mail-Benachrichtigungen sind abgeschaltet (Einstellungen → „E-Mail-Benachrichtigungen aktiviert"). Die Test-Mail in den Einstellungen geht trotzdem — sie umgeht diesen Schalter bewusst.';
		case 'recipient-missing':
			return 'Es ist keine Empfänger-Adresse konfiguriert (Einstellungen → „Empfänger-Adresse").';
		case 'transport-unavailable':
			return 'Keine SMTP-Verbindung. Bitte SMTP-Einstellungen prüfen und dort die Test-Mail auslösen.';
		default:
			// Kein Blocker, trotzdem kein Versand: Sichtung nicht gefunden, oder der
			// SMTP-Versand selbst ist gescheitert. Beides steht als `error` im Log.
			return 'Die Sichtung wurde nicht gefunden, oder der Versand ist fehlgeschlagen. Details stehen im Server-Log.';
	}
}

export const POST: RequestHandler = async ({ request, locals, url }) => {
	// SECURITY: Must be outside try/catch so redirect(302) propagates correctly
	//
	// Nur `superadmin`, obwohl der Rest von /api/admin bei ['admin','superadmin']
	// liegt: Dieser Endpunkt verschickt in `testType: 'sighting'` dieselbe interne
	// Benachrichtigung wie eine echte Neu-Meldung — im Team-Postfach ist sie von
	// einer solchen nicht zu unterscheiden. Er diagnostiziert die
	// Mail-Konfiguration und gehört damit zu /api/config/init und
	// /api/config/reset, nicht zum Tagesgeschäft.
	requireUserRole(url, locals.user, ['superadmin']);

	try {
		logger.debug(
			{
				user: locals.user?.sub,
				roles: locals.user?.roles
			},
			'Admin user sending test email'
		);

		const body = await request.json();
		const { sightingId, recipient, testType = 'sighting' } = body;

		// Validate input
		if (testType === 'sighting') {
			if (!sightingId || typeof sightingId !== 'number') {
				return json({ success: false, error: 'Invalid sighting ID' }, { status: 400 });
			}

			// Send test email with sighting data using existing notification method
			// Note: recipient override is not supported by sendNewSightingNotification
			const success = await EmailService.sendNewSightingNotification(sightingId);

			if (success) {
				logger.info({ sightingId }, 'Test sighting email sent successfully');
				return json({
					success: true,
					// Empfänger benennen: Die Mail geht an die interne Adresse aus
					// `notification.email.recipient`, nicht an die meldende Person.
					// Ohne diesen Zusatz liest sich die Erfolgsmeldung so, als wäre der
					// Melder angeschrieben worden (#621).
					message: `Interne Benachrichtigung zu Sichtung ${sightingId} wurde an die konfigurierte Empfänger-Adresse gesendet`
				});
			} else {
				// Ohne diese Abfrage bekam der Admin denselben Satz für drei völlig
				// verschiedene Ursachen, und die häufigste (der Abschalter) stand
				// nur auf `debug` im Log — „Fehlermeldung, aber nichts im Log".
				const blocker = await EmailService.findNotificationBlocker();
				logger.warn({ sightingId, blocker }, 'Test sighting email not sent');

				return json({ success: false, error: describeBlocker(blocker) }, { status: 500 });
			}
		} else {
			// Validate recipient email format
			if (recipient != null) {
				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				if (
					typeof recipient !== 'string' ||
					recipient.length > 254 ||
					!emailRegex.test(recipient)
				) {
					return json(
						{ success: false, error: 'Invalid recipient email address' },
						{ status: 400 }
					);
				}
			}
			// Send simple test email
			const success = await EmailService.sendTestEmail(recipient);

			if (success) {
				logger.info(
					{ recipient: recipient || 'configured' },
					'Simple test email sent successfully'
				);
				return json({
					success: true,
					message: 'Test-E-Mail wurde erfolgreich gesendet'
				});
			} else {
				return json(
					{
						success: false,
						error: 'E-Mail konnte nicht gesendet werden. Bitte prüfen Sie die Konfiguration.'
					},
					{ status: 500 }
				);
			}
		}
	} catch (error) {
		logger.error({ error }, 'Error sending test email');
		return json(
			{
				success: false,
				error: 'Interner Fehler beim Senden der Test-E-Mail'
			},
			{ status: 500 }
		);
	}
};
