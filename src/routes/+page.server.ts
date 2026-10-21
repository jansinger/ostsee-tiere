import { issueFormToken } from '#lib/server/spam/formToken.ts';
import type { PageServerLoad } from './$types';

/**
 * Stellt das Zeit-Token für die Spam-Heuristik aus. Der Zeitstempel im Token
 * sagt dem Server beim Absenden, wie lange das Formular offen war — ein
 * Absenden nach wenigen Sekunden ist ein Bot-Indikator (nur Score, blockiert
 * nichts; siehe $lib/server/spam/formToken).
 */
export const load: PageServerLoad = () => {
	return { formToken: issueFormToken() };
};
