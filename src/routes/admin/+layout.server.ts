import { isSuperAdminUser, requireUserRole } from '#lib/server/auth/auth.ts';
import { loadAnonymizationBanner } from '#lib/server/privacy/anonymizationStatus.ts';
import { getBuildInfo } from '#lib/server/startup/versionInfo.ts';
import type { PublicUser } from '#lib/types/User.ts';
import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals, url }) => {
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	// Bewusst gelesen: SvelteKit lädt dieses Layout bei Client-Navigation nur
	// neu, wenn `load` etwas liest, das sich ändert. Ohne diese Zeile bliebe die
	// Hinweisleiste der Anonymisierung bis zum nächsten harten Reload auf dem
	// Stand der ersten Seite — ein ausgefallener Cron fiele niemandem auf
	// (Review PR #1013). Kosten: zwei Konfigurationswerte und zwei Zählungen je
	// Navigation im Admin-Bereich.
	void url.pathname;

	// Security: Only send minimal admin user data to frontend
	const adminUser: PublicUser | null = locals.user
		? {
				sub: locals.user.sub,
				email: locals.user.email,
				name: locals.user.name,
				picture: locals.user.picture,
				nickname: locals.user.nickname
				// REMOVED: roles - not needed in admin frontend since access is already verified
			}
		: null;

	return {
		user: adminUser,
		// Server-computed admin status - no client-side role checking needed
		isAdmin: true, // We know user is admin since requireUserRole passed
		// Ein einzelnes Flag statt der Rollenliste: Die Bedienelemente für
		// `POST /api/admin/test-email` sollen nur Superadmins sehen, und das
		// Frontend bekommt weiterhin keine Rollen (siehe oben). Dieselbe Form
		// wie in admin/settings/+page.server.ts.
		isSuperAdmin: isSuperAdminUser(locals.user),
		buildInfo: getBuildInfo(),
		// Hinweisleiste der Anonymisierung (rot bei Meldungen über der Frist oder
		// einem letzten Lauf vor mehr als 48 Stunden). Nur Ampel und Anzahl;
		// `null`, wenn der Status nicht ermittelbar ist.
		anonymization: await loadAnonymizationBanner()
	};
}) satisfies LayoutServerLoad;
