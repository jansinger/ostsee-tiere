import * as m from '#lib/paraglide/messages.js';
import { ORPHAN_RETENTION_HOURS } from '#lib/constants/uploadRetention.ts';

/**
 * Hinweis an der Dropzone.
 *
 * Aufnahmen werden sofort beim Ablegen übertragen — also bevor feststeht, ob
 * die Meldung überhaupt abgeschickt wird. Das ist zulässig, weil Upload und
 * fachliche Prüfung Teil der Meldung sind und von `privacyConsent` gedeckt
 * werden (Entscheidung des Museums, 2026-07-28). Die Gegenleistung dafür ist
 * Transparenz und eine Befristung — beides steht in diesem Satz.
 *
 * Die Frist kommt aus `ORPHAN_RETENTION_HOURS`, damit Zusage und tatsächlicher
 * Aufräum-Lauf nicht auseinanderlaufen können (`uploadNotice.test.ts`).
 *
 * ACHTUNG: Wortlaut noch nicht vom Museum freigegeben — vor Inbetriebnahme
 * juristisch abnehmen lassen. Siehe
 * docs/archive/MEDIENEINWILLIGUNG_ANALYSE_2026-07-28.md, Abschnitt 6.
 */
// Funktion statt Konstante (Sprache sonst beim Modulladen eingefroren), und
// EINE Botschaft statt vier verketteter Fragmente: Die Aufteilung war reine
// Zeilenlänge, kein Satzbau — wer übersetzt, braucht den ganzen Absatz.
export const uploadNotice = (): string =>
	m.form_consent_uploadnotice_text_ihre_aufnahme_wird_beim_ablegen_zu_uns({
		hours: ORPHAN_RETENTION_HOURS
	});
