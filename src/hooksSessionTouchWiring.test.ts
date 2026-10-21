import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripComments } from '#lib/testing/sourceScan.testutil.ts';

/**
 * @fileoverview `resolveSessionUser` muss mit der Touch-Ausnahme aufgerufen werden
 *
 * **Warum es diesen Test gibt.** `verlaengertSession()` (sessionTouchExemption.ts)
 * und `resolveSessionUser()` (sessionRepository.ts) sind beide für sich getestet —
 * die Verdrahtung zwischen den beiden, die einzeilige Übergabe
 * `verlaengern: verlaengertSession(url.pathname)` in `hooks.server.ts`, ist es
 * nicht. Der Admin-Inbox-Poller (`inboxPoller.ts`) fragt `/api/admin/inbox-status`
 * im exakt selben 60-Sekunden-Takt ab, den `SESSION_TOUCH_THRESHOLD_SECONDS` als
 * Schwelle für die Sitzungsverlängerung verwendet — praktisch jeder Poll träfe
 * die Schwelle. Fiele die Übergabe heraus (oder würde `resolveSessionUser` ohne
 * zweites Argument bzw. mit `verlaengern: true` aufgerufen), verlängerte allein
 * das Offenlassen des Admin-Eingangs die Sitzung endlos, und der
 * 1-Stunden-Leerlauf-Ablauf aus `SESSION_IDLE_SECONDS` griffe nie mehr. Kein
 * bestehender Test bemerkt das: `sessionTouchExemption.test.ts` prüft nur die
 * Pfadliste, die Sessions-Repository-Tests rufen `resolveSessionUser` direkt mit
 * eigenen Optionen auf. Diese Datei sichert die Verdrahtung selbst.
 *
 * Läuft im Node-Projekt (`npm run test:unit`, damit auch in `test:quick`) —
 * `hooks.server.ts` liegt außerhalb von `src/lib/**`, ein Import würde beim
 * Modul-Scope (Startup-Guards) mitlaufen; gelesen und gescannt wird deshalb nur
 * der Quelltext, nicht das Modul importiert.
 */

const HOOKS_PATH = 'src/hooks.server.ts';

/**
 * Der Aufruf, so wie er im Bestand steht: `resolveSessionUser(event.cookies, {`
 * gefolgt (mit beliebigem Weißraum/Zeilenumbruch dazwischen) von
 * `verlaengern: verlaengertSession(`. Absichtlich ohne das übergebene Argument
 * (`url.pathname`) im Muster — es geht um die Verdrahtung der Ausnahme, nicht um
 * den konkreten Pfad-Ausdruck.
 */
const WIRING =
	/resolveSessionUser\s*\(\s*event\.cookies\s*,\s*\{\s*verlaengern\s*:\s*verlaengertSession\s*\(/;

describe('hooks.server.ts — Touch-Ausnahme verdrahtet', () => {
	it('ruft resolveSessionUser mit verlaengern: verlaengertSession(...) auf', () => {
		const source = stripComments(readFileSync(HOOKS_PATH, 'utf-8'));

		expect(
			WIRING.test(source),
			[
				'hooks.server.ts ruft resolveSessionUser nicht (mehr) mit der Touch-Ausnahme auf.',
				'',
				'Erwartet wird sinngemäß:',
				'  const session = await resolveSessionUser(event.cookies, {',
				'    verlaengern: verlaengertSession(url.pathname)',
				'  });',
				'',
				'Grund: Der Admin-Inbox-Poller fragt /api/admin/inbox-status im selben',
				'60-Sekunden-Takt ab, den SESSION_TOUCH_THRESHOLD_SECONDS als Schwelle für',
				'die Sitzungsverlängerung nutzt. Ohne die Ausnahme verlängert jeder Poll die',
				'Sitzung, und ein offen gelassener /admin-Tab hebelt den 1-Stunden-',
				'Leerlauf-Ablauf (SESSION_IDLE_SECONDS) vollständig aus.',
				'',
				'Siehe src/lib/server/auth/sessionTouchExemption.ts für die Begründung der',
				'Ausnahmeliste selbst.'
			].join('\n')
		).toBe(true);
	});
});
