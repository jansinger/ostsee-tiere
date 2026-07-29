/**
 * @fileoverview Formular-Übermittlung für Sichtungsdaten
 *
 * Dieses Modul implementiert die Client-seitige Logik zur Übermittlung
 * von Sichtungsformularen an die Server-API. Es verwaltet die HTTP-
 * Kommunikation und übersetzt jedes mögliche Ergebnis in einen
 * unterscheidbaren Zustand, den die Oberfläche verschieden behandeln kann.
 *
 * @author Ostsee-Tiere Team
 * @since 1.0.0
 */

import type { SightingFormValues } from '$lib/types/Form';

/**
 * Ergebnis einer Übermittlung — bewusst ein diskriminiertes Result statt eines
 * geworfenen `Error`.
 *
 * Vorher warf die Funktion für jeden Fehler denselben `Error`. „Kein Netz",
 * „Server down", „Validierung abgelehnt" und „Rate Limit" waren für die
 * Oberfläche damit nicht unterscheidbar — sie konnte nur die Meldung anzeigen.
 * Bei fehlendem Netz kam diese Meldung sogar direkt vom Browser („Failed to
 * fetch"), also unübersetzt und ohne Bezug zur Anwendung.
 *
 * Die vier Fehlerfälle verlangen unterschiedliche Reaktionen:
 * `offline` → Absenden vorab sperren, `server` → Wiederholen anbieten,
 * `rejected` → zum Feld springen, `ratelimited` → warten lassen.
 */
export type SubmitResult =
	| { status: 'ok'; id: number }
	| { status: 'offline' }
	| { status: 'server'; httpStatus: number }
	| { status: 'rejected'; message: string }
	| { status: 'ratelimited'; retryAfter?: number };

/** Fehlermeldung, die der Nutzer sieht, wenn der Server keine eigene liefert. */
const FALLBACK_MESSAGE = 'Die Sichtung konnte nicht gespeichert werden';

/** Antwortkörper der Sichtungs-API, soweit der Client ihn auswertet. */
interface SightingApiResponse {
	success?: boolean;
	id?: number;
	message?: string;
}

/**
 * Liest den Antwortkörper als JSON — und gibt `null` zurück, wenn das nicht geht.
 *
 * Nicht jede Antwort auf dieser Route ist JSON: Ein 502 kommt als HTML-Fehlerseite
 * des Reverse Proxy, ein 504 als Klartext des Gateways. `response.json()` wirft
 * dort einen `SyntaxError`, dessen Rohtext („Unexpected token '<' …") für den
 * Nutzer bedeutungslos ist. Der Parse-Fehler wird deshalb hier abgefangen und
 * nicht weitergereicht.
 */
async function readJsonBody(response: Response): Promise<SightingApiResponse | null> {
	try {
		return (await response.json()) as SightingApiResponse;
	} catch {
		return null;
	}
}

/**
 * Erkennt, ob ein von `fetch` geworfener Fehler ein Verbindungsproblem ist.
 *
 * `fetch` wirft nur bei Netzwerk- und Konfigurationsfehlern; ein HTTP-Fehlerstatus
 * ist für `fetch` ein Erfolg. Der Netzwerkfall ist immer ein `TypeError`.
 *
 * `navigator.onLine === false` ist dabei ein zusätzliches, aber kein notwendiges
 * Signal: Es meldet nur, ob eine Netzwerkschnittstelle aktiv ist, nicht ob das
 * Internet erreichbar ist. WLAN an Bord ohne Uplink meldet `true` und lässt
 * `fetch` trotzdem scheitern — für dieses Projekt der Regelfall. Der `TypeError`
 * allein genügt deshalb bereits.
 */
function isNetworkFailure(cause: unknown): boolean {
	if (cause instanceof TypeError) return true;
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Ermittelt, wie lange bis zum nächsten Versuch gewartet werden muss.
 *
 * `enforceRateLimit()` (`$lib/server/middleware/rateLimit.ts`) wirft
 * `error(429, 'Rate limit exceeded. Try again after 14:23:11 (45s)')`. SvelteKit
 * liefert das als `{ message }` aus und setzt **keinen** `Retry-After`-Header —
 * die Sekunden stehen nur im Text. Der Header wird trotzdem zuerst gelesen,
 * damit ein vorgeschalteter Reverse Proxy, der selbst drosselt, korrekt greift.
 */
function parseRetryAfter(response: Response, message: string | undefined): number | undefined {
	const header = response.headers?.get?.('Retry-After');

	if (header) {
		const seconds = Number(header);
		if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);

		// RFC 9110 erlaubt alternativ ein HTTP-Datum.
		const resetAt = Date.parse(header);
		if (!Number.isNaN(resetAt)) return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
	}

	const fromMessage = message?.match(/\((\d+)s\)/);
	return fromMessage ? Number(fromMessage[1]) : undefined;
}

/**
 * Übermittelt validierte Sichtungsformulardaten an die Server-API
 *
 * @param values Vollständig validierte Sichtungsformulardaten
 * @returns Das Ergebnis als {@link SubmitResult} — die Funktion wirft für kein
 *   erwartbares Fehlerbild. Geworfen wird nur weiter, was kein Netzwerkfehler
 *   ist (etwa ein Programmierfehler beim Aufbau der Anfrage); solche Fehler zu
 *   verschlucken würde sie unsichtbar machen.
 *
 * @note Räumt den Browser-Speicher **nicht** auf. Zuständig dafür ist
 *   `ModernReportForm.svelte`, siehe Hinweis unten.
 */
export async function submitSightingForm(values: SightingFormValues): Promise<SubmitResult> {
	let response: Response;

	// HTTP POST-Anfrage an die Sichtungs-API mit JSON-Payload
	try {
		response = await fetch('/api/sightings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(values) // Serialisiere komplette Formulardaten
		});
	} catch (cause) {
		if (isNetworkFailure(cause)) return { status: 'offline' };
		throw cause;
	}

	// Der Körper wird einmal gelesen, BEVOR über den Status entschieden wird —
	// die Verzweigungen unten brauchen ihn alle. Möglich ist das nur, weil
	// `readJsonBody()` den Parse kapselt: Bei einem HTTP-Fehler ist der Körper
	// oft kein JSON (HTML-Fehlerseite eines Proxy), und ein durchschlagender
	// `SyntaxError` würde die eigentliche Ursache verdecken. Ohne diese Kapselung
	// müsste die Statusprüfung zwingend vorher laufen.
	const body = await readJsonBody(response);

	if (response.status === 429) {
		// `exactOptionalPropertyTypes`: die Eigenschaft wird weggelassen, nicht auf
		// `undefined` gesetzt.
		const retryAfter = parseRetryAfter(response, body?.message);
		return retryAfter === undefined
			? { status: 'ratelimited' }
			: { status: 'ratelimited', retryAfter };
	}

	if (!response.ok) {
		// 4xx mit lesbarer Meldung ist eine inhaltliche Ablehnung (Validierung,
		// verbotene Felder) — der Text nennt das betroffene Feld und hilft dem
		// Nutzer. 5xx-Meldungen sind generisch; dort zählt nur „wiederholbar".
		if (response.status < 500 && body?.message) {
			return { status: 'rejected', message: body.message };
		}
		return { status: 'server', httpStatus: response.status };
	}

	if (body?.success === true && typeof body.id === 'number') {
		return { status: 'ok', id: body.id };
	}

	// 2xx, aber der Körper widerspricht sich oder ist unlesbar.
	if (body?.success === false && body.message) {
		return { status: 'rejected', message: body.message };
	}
	return { status: 'server', httpStatus: response.status };
}

/**
 * Übersetzt ein gescheitertes {@link SubmitResult} in einen Satz für den Nutzer.
 *
 * Zwischenschritt: Solange die Oberfläche Fehler nur als Text anzeigt, braucht
 * sie eine Meldung. Ab `SubmitStatus` trägt die Komponente den Zustand selbst
 * und wählt Wortlaut und Aktion pro Fall — dann bleibt hier nur noch der
 * Fallback für Protokollzwecke.
 */
export function describeSubmitFailure(result: Exclude<SubmitResult, { status: 'ok' }>): string {
	switch (result.status) {
		case 'offline':
			return 'Keine Internetverbindung. Ihre Eingaben bleiben vollständig gespeichert.';
		case 'ratelimited':
			return result.retryAfter
				? `Zu viele Übermittlungen. Bitte versuchen Sie es in ${result.retryAfter} Sekunden erneut.`
				: 'Zu viele Übermittlungen. Bitte versuchen Sie es später erneut.';
		case 'rejected':
			return result.message;
		case 'server':
			return FALLBACK_MESSAGE;
	}
}
