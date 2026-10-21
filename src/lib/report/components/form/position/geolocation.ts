import * as m from '#lib/paraglide/messages.js';
/**
 * Standortbestimmung für den Button „Mein aktueller Standort".
 *
 * Bewusst als reines Modul mit injizierter `Geolocation`-Instanz: Der Fehlerpfad
 * (Freigabe verweigert, kein HTTPS, Zeitüberschreitung) ist der wichtigste Teil
 * und lässt sich so in Node testen, ohne einen Browser zu starten.
 */

export type GeolocationOutcome =
	{ ok: true; latitude: number; longitude: number } | { ok: false; message: string };

/**
 * Zeitbudget, das die Geolocation-API selbst bekommt (`timeout`-Option). Es läuft
 * laut Spezifikation erst ab dem Moment, in dem der Nutzer den
 * Berechtigungsdialog beantwortet hat.
 */
export const GEOLOCATION_TIMEOUT_MS = 10_000;

/**
 * Frist des eigenen Wächters. Bewusst eine eigene Konstante und deutlich größer
 * als `GEOLOCATION_TIMEOUT_MS`:
 *
 * Die beiden Uhren starten zu verschiedenen Zeitpunkten — die API-Frist erst nach
 * der Antwort auf den Dialog, der Wächter schon beim Aufruf. Wer beide gleich
 * setzt, erklärt einen Erstnutzer, der ein paar Sekunden zum Lesen und Tippen
 * braucht und danach auf einen kalten GPS-Fix wartet, für gescheitert — obwohl
 * seine Position gleich eintrifft und der `settled`-Wächter sie dann verwirft.
 *
 * 30 s = API-Frist (10 s) + reichlich Spielraum für den Dialog. Der Wächter ist
 * ausschließlich für den Fall da, dass der Dialog NIE beantwortet wird und
 * deshalb überhaupt kein Callback kommt; er ist keine zweite Zeitmessung für die
 * Ortung selbst.
 */
export const GEOLOCATION_WATCHDOG_MS = 30_000;

/** Übersetzt die numerischen Codes der Geolocation-API in verständliche Sätze. */
export function describeGeolocationError(error: { code: number }): string {
	switch (error.code) {
		case 1:
			return m.report_form_position_geolocation_text_der_standort_wurde_nicht_freigegeben_sie();
		case 2:
			return m.report_form_position_geolocation_text_der_standort_konnte_nicht_ermittelt_werd();
		case 3:
			return m.report_form_position_geolocation_text_die_standortbestimmung_hat_zu_lange_geda();
		default:
			return m.report_form_position_geolocation_text_der_standort_liess_sich_nicht_abrufen_bi();
	}
}

/**
 * Fragt den Gerätestandort ab und liefert immer ein aufgelöstes Ergebnis —
 * nie eine abgelehnte Promise. Der Aufrufer muss also keinen catch-Pfad bauen.
 *
 * Der eigene Zeitwächter ist kein Gürtel-und-Hosenträger: Die `timeout`-Option
 * der Geolocation-API startet laut Spezifikation erst, nachdem der Nutzer den
 * Berechtigungsdialog beantwortet hat. Wer den Dialog offen liegen lässt, bekommt
 * weder Erfolgs- noch Fehler-Callback — ohne Wächter bliebe die Promise für
 * immer offen und der Ladezustand im Aufrufer hängen.
 */
export function requestCurrentPosition(
	geolocation: Pick<Geolocation, 'getCurrentPosition'> | undefined
): Promise<GeolocationOutcome> {
	if (!geolocation) {
		return Promise.resolve({
			ok: false,
			message: m.report_form_position_geolocation_text_dieser_browser_unterstuetzt_keine_stando()
		});
	}

	return new Promise((resolve) => {
		// Der Wächter wird vor `getCurrentPosition` gestartet, damit `finish` ihn
		// auch bei einem synchron aufgerufenen Callback bereits abräumen kann.
		const watchdog = setTimeout(
			() => finish({ ok: false, message: describeGeolocationError({ code: 3 }) }),
			GEOLOCATION_WATCHDOG_MS
		);

		/**
		 * Bewusst ohne `settled`-Wächter: Ein zweiter Aufruf kann nichts anrichten.
		 * `resolve` ist nach der ersten Auflösung wirkungslos (Promises lösen genau
		 * einmal auf), und `clearTimeout` auf einen bereits abgelaufenen oder
		 * abgeräumten Handle ist ein No-Op. Ein Flag hätte hier keine beobachtbare
		 * Wirkung gehabt — und damit auch keinen Test, der es hält.
		 */
		function finish(outcome: GeolocationOutcome): void {
			clearTimeout(watchdog);
			resolve(outcome);
		}

		// `getCurrentPosition` kann synchron werfen, statt den Fehler-Callback zu
		// rufen — etwa außerhalb eines Secure Context. Ungefangen würde der Wurf im
		// Promise-Executor die zurückgegebene Promise ablehnen; darauf ist kein
		// Aufrufer eingerichtet, denn diese Funktion verspricht ein
		// `GeolocationOutcome`. `useCurrentPosition` awaitet ohne `try`, sodass
		// `locating` nie zurückgesetzt würde und der Button stumm bliebe.
		try {
			geolocation.getCurrentPosition(
				(position) =>
					finish({
						ok: true,
						latitude: position.coords.latitude,
						longitude: position.coords.longitude
					}),
				(error) => finish({ ok: false, message: describeGeolocationError(error) }),
				{ enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS }
			);
		} catch {
			// Kein Code-Mapping möglich — die allgemeine Meldung verweist auf die Karte.
			finish({ ok: false, message: describeGeolocationError({ code: 99 }) });
		}
	});
}
