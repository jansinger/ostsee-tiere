import * as m from '#lib/paraglide/messages.js';
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

import type { SightingFormValues } from '#lib/types/Form.ts';

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
 * **Was dieser Typ leistet — und was nicht.** Er unterscheidet die Fälle und
 * hängt an jeden das, was der Server dazu hergibt: den HTTP-Status (`server`),
 * die Meldung des Servers (`rejected`), die Wartezeit (`ratelimited`). Wie
 * darauf reagiert wird, entscheidet die Aufrufstelle — hier wird nichts
 * erzwungen. `ModernReportForm` sperrt bei `offline` das Absenden über
 * `connection.reportUnreachable()` und bietet in den übrigen drei Fällen
 * Wiederholen an; `describeSubmitFailure` unten macht aus jedem Fall den Satz,
 * den der Nutzer liest, und arbeitet `retryAfter` als Information in ihn ein.
 *
 * **Feldbezug bei `rejected`.** `message` allein reicht dafür nicht: Bei einem
 * Validierungsfehler lautet sie immer „Validierungsfehler bei der Eingabe" und
 * nennt kein Feld — der Nutzer stand damit vor einem Satz, der ihm nicht sagte,
 * wo er suchen soll, womöglich drei Schritte entfernt. `fields` trägt deshalb
 * zusätzlich die Karte Feldname → Meldung, aus der die Aufrufstelle den Sprung
 * zum ersten betroffenen Feld baut (`ModernReportForm.svelte`). Alle drei
 * Quellen des Servers laufen darin zusammen, siehe {@link readFieldErrors}.
 */
export type SubmitResult =
	| { status: 'ok'; id: number }
	| { status: 'offline' }
	| { status: 'server'; httpStatus: number }
	| { status: 'rejected'; message: string; fields?: Record<string, string> }
	| { status: 'ratelimited'; retryAfter?: number };

/** Fehlermeldung, die der Nutzer sieht, wenn der Server keine eigene liefert. */
// Funktion statt Konstante: siehe formConfig.ts — ein fertiger String fröre
// die Sprache beim Modulladen ein.
const fallbackMessage = (): string =>
	m.form_submitsightingform_text_die_sichtung_konnte_nicht_gespeichert_we();

/**
 * Meldung für ein Feld aus einer der beiden Namenslisten des Servers —
 * `rejectedFields` (400) **und** `forbiddenFields` (403). Der Server liefert
 * dort nur Feldnamen und begründet die Ablehnung gesammelt in `message`.
 *
 * Der Name ist deshalb bewusst neutral gehalten und greift keine der beiden
 * Listen auf: Ein `FORBIDDEN_…` hier würde beim Lesen so wirken, als gälte die
 * Meldung nur für den 403er-Zweig.
 */
const disallowedFieldMessage = (): string =>
	m.form_submitsightingform_text_dieses_feld_darf_nicht_mitgesendet_werde();

/** Antwortkörper der Sichtungs-API, soweit der Client ihn auswertet. */
interface SightingApiResponse {
	success?: boolean;
	id?: number;
	message?: string;
	/** `code: 'VALIDATION_ERROR'` (400) — Yup-Pfad → Meldung, aus `abortEarly: false`. */
	errors?: Record<string, string>;
	/** `code: 'INVALID_FIELDS'` (400) — Feldnamen außerhalb der Whitelist. */
	rejectedFields?: string[];
	/** `code: 'FORBIDDEN_FIELDS'` (403) — Admin-Felder, die Clients nicht setzen dürfen. */
	forbiddenFields?: string[];
}

/**
 * Führt die drei Feld-Quellen des Servers zu einer Karte zusammen.
 *
 * `POST /api/sightings` benennt abgelehnte Felder auf drei Wegen, und sie sind
 * disjunkt — welcher greift, entscheidet der Server vor allen anderen Prüfungen:
 *
 * | Feld              | Code                | Status | Inhalt              |
 * | ----------------- | ------------------- | ------ | ------------------- |
 * | `forbiddenFields` | `FORBIDDEN_FIELDS`  | 403    | nur Namen           |
 * | `rejectedFields`  | `INVALID_FIELDS`    | 400    | nur Namen           |
 * | `errors`          | `VALIDATION_ERROR`  | 400    | Pfad → Meldung      |
 *
 * Für die Oberfläche ist das derselbe Vorgang — ein Feld, das korrigiert werden
 * muss —, deshalb entsteht hier eine einheitliche Form. Für die beiden
 * Namenslisten stellt der Client den Text, weil der Server dort keinen pro Feld
 * liefert.
 *
 * Einträge ohne Meldungstext fallen weg: Ein Feld als ungültig zu markieren,
 * ohne sagen zu können warum, ist schlechter als es unmarkiert zu lassen.
 *
 * @returns die Karte, oder `undefined` wenn kein Feld benannt ist — die
 *   Eigenschaft wird dann weggelassen (`exactOptionalPropertyTypes`), statt auf
 *   `undefined` zu stehen.
 */
function readFieldErrors(body: SightingApiResponse | null): Record<string, string> | undefined {
	const fields: Record<string, string> = {};

	for (const [field, message] of Object.entries(body?.errors ?? {})) {
		if (typeof message === 'string' && message.length > 0) {
			fields[field] = message;
		}
	}

	for (const field of [...(body?.rejectedFields ?? []), ...(body?.forbiddenFields ?? [])]) {
		if (typeof field === 'string' && field.length > 0) {
			fields[field] ??= disallowedFieldMessage();
		}
	}

	return Object.keys(fields).length > 0 ? fields : undefined;
}

/** Baut den `rejected`-Fall inklusive Feldkarte, sofern der Server eine liefert. */
function toRejected(message: string, body: SightingApiResponse | null): SubmitResult {
	const fields = readFieldErrors(body);
	return fields === undefined
		? { status: 'rejected', message }
		: { status: 'rejected', message, fields };
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
 * `enforceRateLimit()` (`#lib/server/middleware/rateLimit.ts`) wirft
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
export async function submitSightingForm(
	values: SightingFormValues,
	formToken?: string
): Promise<SubmitResult> {
	let response: Response;

	// HTTP POST-Anfrage an die Sichtungs-API mit JSON-Payload. Das Zeit-Token
	// (`_formToken`) ist kein Formularfeld — der Server entfernt es vor der
	// Feld-Validierung und wertet es nur für den Spam-Score aus.
	try {
		response = await fetch('/api/sightings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(formToken ? { ...values, _formToken: formToken } : values)
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
			return toRejected(body.message, body);
		}
		return { status: 'server', httpStatus: response.status };
	}

	if (body?.success === true && typeof body.id === 'number') {
		return { status: 'ok', id: body.id };
	}

	// 2xx, aber der Körper widerspricht sich oder ist unlesbar.
	if (body?.success === false && body.message) {
		return toRejected(body.message, body);
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
			return m.form_submitsightingform_text_keine_internetverbindung_ihre_eingaben_b();
		case 'ratelimited':
			return result.retryAfter
				? m.form_submitsightingform_text_zu_viele_uebermittlungen_sekunden({
						seconds: result.retryAfter
					})
				: m.form_submitsightingform_text_zu_viele_uebermittlungen_bitte_versuchen();
		case 'rejected':
			return result.message;
		case 'server':
			return fallbackMessage();
	}
}
