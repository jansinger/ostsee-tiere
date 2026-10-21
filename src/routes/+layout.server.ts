import { ServerConfigService } from '#lib/services/configService.ts';
import { isAdminUser, isSuperAdminUser } from '#lib/server/auth/auth.ts';
import type { PublicUser } from '#lib/types/User.ts';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
	const isAdmin = isAdminUser(locals.user);

	// Get maintenance mode status for admin banner
	let maintenanceConfig = null;
	if (isAdmin) {
		try {
			maintenanceConfig = {
				enabled: await ServerConfigService.isMaintenanceModeEnabled(),
				message: await ServerConfigService.getString('display.maintenanceMessage')
			};
		} catch (_error) {
			// Ignore error, maintenance config is optional
		}
	}

	// Security: Only send minimal user data to frontend
	// Remove sensitive role information
	const publicUser: PublicUser | null = locals.user
		? {
				sub: locals.user.sub,
				email: locals.user.email,
				name: locals.user.name,
				picture: locals.user.picture,
				nickname: locals.user.nickname
				// REMOVED: roles - this prevents frontend manipulation
			}
		: null;

	return {
		user: publicUser,
		/* Restlaufzeit der Session als ISO-String. Grundlage fuer die Ablauf-Ankuendigung
		   aus #634; die UI dazu ist bewusst nicht Teil dieser Aenderung. */
		sessionExpiresAt: locals.sessionExpiresAt?.toISOString() ?? null,
		// Server-side computed admin status for UI rendering
		showAdminMenu: isAdmin,
		/* Der Sprachumschalter ist vorerst nur für Superadmins sichtbar
		   (Entscheidung Jan, 2026-08-13): Die englische Fassung ist weitgehend
		   vorübersetzt, aber nicht muttersprachlich abgenommen — sie soll im
		   Betrieb prüfbar sein, ohne sie schon allen Besuchern anzubieten.
		   Bewusst ohne Prozentzahl: Der Stand ändert sich, die Begründung
		   nicht. Serverseitig berechnet wie `showAdminMenu` — `PublicUser`
		   trägt die Rollen bewusst nicht, sie sind aus dem Frontend-Typ
		   herausgefiltert. */
		showLanguageSwitcher: isSuperAdminUser(locals.user),
		maintenanceConfig
	};
}) satisfies LayoutServerLoad;
