/**
 * Serialisierung der `cause`-Kette eines Fehlers für strukturiertes Logging.
 *
 * Reine Funktionen ohne Logger- oder Env-Zugriff, damit sie testbar sind — analog zu
 * `secretGuard.ts`. Aufgerufen wird sie aus `src/hooks.server.ts`, das ausserhalb von
 * `src/lib/**` liegt und von den Server-Tests nicht erfasst wird.
 *
 * Hintergrund: Bei Drizzle-/postgres-js-Fehlern lautet `error.message` immer nur
 * "Failed query: <SQL>\nparams: ...". Die tatsächliche Ursache — Verbindungsabbruch,
 * `too many connections`, `CONNECTION_ENDED`, Timeout — steckt in `error.cause` und ging
 * bisher verloren. Am 2026-07-31 war ein fehlgeschlagener `/admin`-Load aus dem Log
 * deshalb nicht rekonstruierbar.
 */
import type { CaughtError } from '@sveltejs/kit/hooks';

/**
 * Maximale Anzahl an `cause`-Ebenen unterhalb des Wurzelfehlers.
 *
 * Verschachtelungen dieser Tiefe gibt es real (Drizzle → postgres-js → Node-Socket);
 * darüber hinaus ist die Kette eher ein Symptom als eine Information.
 */
export const MAX_CAUSE_DEPTH = 5;

/**
 * Ab dieser Länge wird eine Meldung gekürzt. Betrifft in der Praxis nur die
 * "Failed query"-Wrapper-Meldung mit vollständigem SQL — die eigentlichen
 * Ursachen-Meldungen sind kurz.
 */
export const MAX_MESSAGE_LENGTH = 500;

/**
 * Maximale Anzahl serialisierter Einzelfehler eines `AggregateError`.
 *
 * Node erzeugt bei nicht erreichbarer Datenbank einen Eintrag pro aufgelöster Adresse
 * (IPv6 und IPv4) — real also zwei. Fünf ist Luft nach oben, ohne dass ein Host mit
 * vielen A-Records das Log flutet.
 */
export const MAX_AGGREGATE_ERRORS = 5;

/**
 * Ein Glied der `cause`-Kette. Nur freigegebene Felder, siehe `pickDiagnosticFields`.
 *
 * ACHTUNG: Was hier steht, steht im Log. Pinos `redact.paths` greift auf `causes` nicht
 * (Array-Pfade), die Positivliste in `pickDiagnosticFields` ist also die einzige
 * Verteidigungslinie — jedes neue Feld hier muss selbst geprüft sein.
 */
export interface SerializedError {
	name: string;
	message: string;
	code?: string;
	errno?: number;
	syscall?: string;
	severity?: string;
	routine?: string;
	/** Nur bei `AggregateError` gesetzt, siehe `MAX_AGGREGATE_ERRORS`. */
	errors?: SerializedError[];
}

/**
 * Zugangsdaten in URIs: `schema://benutzer:passwort@host`.
 *
 * Host, Port und Datenbankname bleiben stehen — sie sind für die Diagnose gerade das
 * Interessante und kein Geheimnis. Der Benutzername wird mit redigiert: Er ist Teil der
 * Zugangsdaten und in dieser Anwendung fest mit einem Passwort gepaart.
 */
const URI_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+(?::[^\s/@]*)?@/gi;

/**
 * Schlüssel-Wert-Paare, deren Schlüssel nach einem Geheimnis aussieht — `PGPASSWORD=…`,
 * `password: "…"`, `SESSION_SECRET=…`. Bewusst großzügig: Lieber ein harmloser Wert zu
 * viel redigiert als ein Secret im Log.
 */
const SECRET_ASSIGNMENT =
	/([\w-]*(?:password|passwd|pwd|secret|token|api[_-]?key|credential)[\w-]*)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;)"']+)/gi;

/**
 * Der Parameter-Block aus Drizzles Fehlermeldung.
 *
 * `DrizzleQueryError` baut seine Meldung als ``Failed query: ${query}\nparams: ${params}``
 * (node_modules/drizzle-orm/errors.js:12). Die Parameter sind in dieser Anwendung
 * E-Mail, Name, Anschrift und Freitext einer Sichtung — also genau die Daten, die
 * `pickDiagnosticFields` über die Felder `parameters`/`detail` bewusst aussperrt. Ohne
 * diese Regel kämen sie über die Meldung trotzdem ins Log.
 *
 * Das SQL davor bleibt stehen: Es ist der diagnostische Wert und enthält nur Platzhalter.
 * Der Block reicht bis zum Ende der Meldung, weil Drizzle ihn zuletzt anhängt.
 */
const QUERY_PARAMS = /\nparams:[\s\S]*$/;

const REDACTED = '***';

/**
 * Entfernt Zugangsdaten und Query-Parameter aus einem Text, bevor er ins Log geht.
 *
 * Exportiert, weil die Regeln einzeln testbar sein sollen.
 */
export function redactSecrets(text: string): string {
	return text
		.replace(URI_CREDENTIALS, `$1${REDACTED}:${REDACTED}@`)
		.replace(SECRET_ASSIGNMENT, `$1$2${REDACTED}`)
		.replace(QUERY_PARAMS, `\nparams: ${REDACTED}`);
}

function normalizeMessage(raw: string): string {
	const redacted = redactSecrets(raw);
	if (redacted.length <= MAX_MESSAGE_LENGTH) {
		return redacted;
	}
	return `${redacted.slice(0, MAX_MESSAGE_LENGTH)}… [gekürzt]`;
}

/**
 * Übernimmt genau die Felder, die für die Diagnose taugen und nichts über den Inhalt der
 * Daten verraten.
 *
 * Positivliste statt Ausschlussliste: postgres-js-Fehler tragen unter anderem `detail`
 * (enthält Zeilenwerte, also personenbezogene Daten), `query`, `parameters` und je nach
 * Treiber die Verbindungszeichenfolge. Nichts davon gehört ins Log.
 */
function pickDiagnosticFields(value: object): Omit<SerializedError, 'name' | 'message'> {
	const source = value as Record<string, unknown>;
	const fields: Omit<SerializedError, 'name' | 'message'> = {};

	if (typeof source.code === 'string') fields.code = source.code;
	if (typeof source.code === 'number') fields.code = String(source.code);
	if (typeof source.errno === 'number') fields.errno = source.errno;
	if (typeof source.syscall === 'string') fields.syscall = source.syscall;
	if (typeof source.severity === 'string') fields.severity = source.severity;
	if (typeof source.routine === 'string') fields.routine = source.routine;

	return fields;
}

function safeToString(value: unknown): string {
	try {
		return String(value);
	} catch {
		return '[nicht darstellbar]';
	}
}

/**
 * Serialisiert die Einzelfehler eines `AggregateError`.
 *
 * Node wirft diesen Typ, wenn der Verbindungsaufbau für *alle* aufgelösten Adressen
 * fehlschlägt — mit leerer `message`, ohne `cause`, und der gesamten Information (Host,
 * Port, Adressfamilie) ausschließlich in `errors`. Ohne diesen Zweig endet die Kette bei
 * einem leeren Eintrag, ausgerechnet im Ausfallszenario.
 *
 * Bewusst flach: Die Einzelfehler bekommen keine eigene `cause`-Verfolgung. Real sind es
 * einfache `ECONNREFUSED`-Fehler ohne Ursache; eine zweite Rekursionsachse wäre Aufwand
 * ohne Gegenwert.
 */
function serializeAggregateErrors(errors: unknown[]): SerializedError[] {
	const serialized = errors.slice(0, MAX_AGGREGATE_ERRORS).map(serializeOne);

	if (errors.length > MAX_AGGREGATE_ERRORS) {
		serialized.push({
			name: 'AggregateErrorsTruncated',
			message: `${errors.length - MAX_AGGREGATE_ERRORS} weitere Einzelfehler ausgelassen (Limit ${MAX_AGGREGATE_ERRORS})`
		});
	}

	return serialized;
}

function serializeOne(value: unknown): SerializedError {
	if (value instanceof Error) {
		const serialized: SerializedError = {
			name: value.name,
			message: normalizeMessage(value.message),
			...pickDiagnosticFields(value)
		};

		const aggregated = (value as AggregateError).errors;
		if (Array.isArray(aggregated) && aggregated.length > 0) {
			serialized.errors = serializeAggregateErrors(aggregated);
		}

		return serialized;
	}

	if (typeof value === 'object' && value !== null) {
		const message = (value as { message?: unknown }).message;
		return {
			name: value.constructor?.name ?? 'Object',
			message: normalizeMessage(typeof message === 'string' ? message : safeToString(value)),
			...pickDiagnosticFields(value)
		};
	}

	return {
		name: value === null ? 'null' : typeof value,
		message: normalizeMessage(safeToString(value))
	};
}

function getCause(value: unknown): unknown {
	if (typeof value !== 'object' || value === null) return undefined;
	return (value as { cause?: unknown }).cause ?? undefined;
}

/**
 * Serialisiert einen Fehler samt seiner `cause`-Kette.
 *
 * Index 0 ist der übergebene Fehler selbst, danach folgen die Ursachen in absteigender
 * Reihenfolge. Kürzung und Zyklen werden als eigener Eintrag sichtbar gemacht
 * (`CauseChainTruncated` / `CauseChainCycle`) statt still weggelassen zu werden.
 *
 * @param maxDepth Maximale Anzahl an `cause`-Ebenen unterhalb der Wurzel.
 */
export function serializeErrorChain(
	error: unknown,
	maxDepth: number = MAX_CAUSE_DEPTH
): SerializedError[] {
	const chain: SerializedError[] = [serializeOne(error)];
	const seen = new Set<unknown>();
	if (typeof error === 'object' && error !== null) seen.add(error);

	let current = getCause(error);
	let depth = 0;

	while (current !== undefined && current !== null) {
		if (depth >= maxDepth) {
			chain.push({
				name: 'CauseChainTruncated',
				message: `Weitere cause-Ebenen ausgelassen (Limit ${maxDepth})`
			});
			break;
		}

		if (typeof current === 'object' && seen.has(current)) {
			chain.push({
				name: 'CauseChainCycle',
				message: 'Zyklische cause-Kette — Abbruch'
			});
			break;
		}
		if (typeof current === 'object') seen.add(current);

		chain.push(serializeOne(current));
		depth++;
		current = getCause(current);
	}

	return chain;
}

/**
 * Nur die Ursachen eines Fehlers, ohne den Wurzelfehler selbst.
 *
 * Für `handleError` gedacht: Name, Meldung und Stack der Wurzel stehen dort bereits in
 * eigenen Log-Feldern. `undefined` bei fehlender `cause`, damit das Log-Objekt bei den
 * allermeisten Fehlern unverändert bleibt.
 */
export function describeErrorCauses(
	error: unknown,
	maxDepth: number = MAX_CAUSE_DEPTH
): SerializedError[] | undefined {
	const causes = serializeErrorChain(error, maxDepth).slice(1);
	return causes.length > 0 ? causes : undefined;
}

/** Die Fehler-Felder eines Log-Eintrags. Feldnamen bleiben wie bisher in `handleError`. */
export interface ErrorLogFields {
	error: string;
	stack?: string;
	causes?: SerializedError[];
}

/**
 * Baut alle Fehler-Felder für einen Log-Eintrag — der einzige Ort, an dem sie entstehen.
 *
 * Dass diese Funktion existiert, ist der Punkt: Solange `handleError` `error` und `stack`
 * von Hand aus `error.message`/`error.stack` zusammensetzte, ging die Redigierung genau
 * an den beiden Feldern vorbei, die den Drizzle-Parameterblock tragen — `causes` war
 * sauber, das Log trotzdem nicht.
 *
 * Die Wurzel-Meldung wird redigiert, aber **nicht** gekürzt: Das SQL einer Admin-Abfrage
 * überschreitet `MAX_MESSAGE_LENGTH` leicht, und nach dem Entfernen der Parameter steht
 * dort nichts Schützenswertes mehr. Für die Kettenglieder bleibt die Kürzung als Netz.
 */
export function buildErrorLogFields(
	error: unknown,
	maxDepth: number = MAX_CAUSE_DEPTH
): ErrorLogFields {
	const [root, ...causes] = serializeErrorChain(error, maxDepth);

	const fields: ErrorLogFields = {
		error: error instanceof Error ? redactSecrets(error.message) : (root?.message ?? '')
	};

	if (error instanceof Error && error.stack) {
		fields.stack = redactSecrets(error.stack);
	}
	if (causes.length > 0) {
		fields.causes = causes;
	}

	return fields;
}

/**
 * Ab dieser Länge werden `clientIp`, `userAgent` und `referer` gekürzt.
 *
 * Alle drei wählt der Client frei — die IP im Fallback-Zweig von `getClientIp`, wo sie
 * aus einem gesetzten `X-Forwarded-For` stammt. Ein Bot mit 8-KB-User-Agent würde sonst
 * pro 404 dieselbe Menge ins Log schreiben, und 404er kommen in Serien.
 */
export const MAX_REQUEST_HEADER_LENGTH = 300;

/** Was `handleError` über die Anfrage weiß. `null`, wo es nichts zu wissen gibt. */
/**
 * Was `handleError` aus einem von SvelteKit gefangenen Fehler macht.
 *
 * SvelteKit 3 reicht jeden Fehler an `handleError` durch und unterscheidet über
 * `kind`. SvelteKit 2 rief den Hook für bewusst geworfene Fehler (`error(400, '…')`)
 * gar nicht auf — ihre Meldung erreichte den Client unverändert, geloggt wurde
 * nichts. `null` bildet genau das nach: Der Hook kehrt ohne Rückgabe zurück, und
 * SvelteKit verwendet den Body aus `error(...)`.
 *
 * Für alle übrigen Arten liefert die Funktion Status und Meldung, wie SvelteKit 2
 * sie dem Hook als eigene Parameter übergab; unbekannte Fehler sind 500.
 */
export function caughtErrorOutcome(
	caught: CaughtError
): { status: number; message: string } | null {
	switch (caught.kind) {
		case 'app':
			return null;
		case 'framework':
		case 'validation':
			return { status: caught.error.status, message: caught.error.message };
		case 'unknown':
			return { status: 500, message: 'Internal Error' };
	}
}

export interface ErrorLogEntryInput {
	error: unknown;
	errorId: string;
	status: number;
	message: string;
	pathname: string;
	method: string;
	/** Aus `getClientIp` — in Dev ohne `X-Forwarded-For` legitim `null`. */
	clientIp: string | null;
	userAgent: string | null;
	referer: string | null;
}

/** Ein fertiger Log-Aufruf: `logger[level](fields, msg)`. */
export interface ErrorLogEntry {
	level: 'warn' | 'error';
	msg: string;
	fields: Record<string, unknown>;
}

/**
 * Ab diesem Status ist der Fehler unserer — darunter der des Clients.
 *
 * SvelteKit ruft `handleError` nicht nur bei geworfenen Ausnahmen auf, sondern auch
 * für jede nicht gematchte Route (`respond.js`, Zweig `state.depth === 0`). Praktisch
 * kommen hier also 500er und 404er an.
 */
const SERVER_ERROR_STATUS = 500;

function requestHeaderField(value: string | null): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;

	const redacted = redactSecrets(trimmed);
	return redacted.length <= MAX_REQUEST_HEADER_LENGTH
		? redacted
		: `${redacted.slice(0, MAX_REQUEST_HEADER_LENGTH)}… [gekürzt]`;
}

/**
 * Der Referer, reduziert auf Herkunft und Pfad — ohne Query und Fragment.
 *
 * `redactSecrets` allein reicht hier nicht: Seine Regel für Schlüssel-Wert-Paare greift
 * nur bei Schlüsseln, die nach einem Geheimnis aussehen. `?suche=`, `?code=`, `?email=`
 * blieben stehen, und ein Same-Origin-Referer aus einer gefilterten Admin-Liste trägt
 * genau solche Werte — womöglich einen Personennamen. Der diagnostische Zweck ("von
 * welcher Seite kam die Anfrage") steckt vollständig in Herkunft und Pfad.
 *
 * `URL.origin` lässt Zugangsdaten der Form `https://benutzer:passwort@host` mit wegfallen.
 *
 * Der Referer ist laut Spezifikation absolut — ein Client kann trotzdem senden, was er
 * will. Was `new URL()` nicht zerlegt, behält deshalb seinen Wert als Hinweis (dass da
 * Unsinn ankommt, ist selbst diagnostisch), verliert aber alles ab dem ersten `?` oder
 * `#`: Ein relativer `/admin?suche=…` scheitert am Parser und trüge sonst genau den
 * Suchbegriff ins Log, den diese Funktion fernhalten soll.
 */
function refererField(value: string | null): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;

	try {
		const url = new URL(trimmed);
		if (url.protocol === 'http:' || url.protocol === 'https:') {
			return requestHeaderField(`${url.origin}${url.pathname}`);
		}
	} catch {
		// Kein zerlegbarer Wert — dann greift der Schnitt an `?`/`#` unten.
	}

	return requestHeaderField(trimmed.split(/[?#]/).at(0) ?? '');
}

/**
 * Baut den vollständigen Log-Eintrag für `handleError` — Stufe, Meldung und Felder.
 *
 * Zwei Dinge, die diese Funktion regelt und die vorher fehlten:
 *
 * **Die Stufe hängt am Status.** Bis 2026-08-03 ging jeder 404 als `level: 50` mit
 * vollem Stacktrace ins Log. In Produktion sah damit jeder Bot-Scan auf `/api/login`
 * aus wie ein Serverausfall; ein echter 500er ging in dem Rauschen unter. Ein 404 ist
 * kein unerwarteter Fehler, sein Stack zeigt immer dieselbe SvelteKit-interne Stelle
 * und kostet nur Platz — beides entfällt jetzt unterhalb von 500.
 *
 * **Methode, IP, User-Agent und Referer stehen im Eintrag.** Ohne sie war am selben Tag
 * nicht zu klären, wer `/api/login` anfragt — kein Codepfad der Anwendung tut es, und
 * der Log-Eintrag nannte nur den Pfad. Die beiden Header sind Client-Eingaben: `redactSecrets`
 * und die Längenbegrenzung gelten deshalb auch für sie, nicht nur für Fehlermeldungen.
 */
export function buildErrorLogEntry(input: ErrorLogEntryInput): ErrorLogEntry {
	const isServerError = input.status >= SERVER_ERROR_STATUS;
	const { error, stack, causes } = buildErrorLogFields(input.error);

	// Auch die IP läuft durch die Begrenzung: Im Fallback-Zweig von `getClientIp` ist sie
	// das erste Segment eines client-gesetzten `X-Forwarded-For` und damit unbegrenzt lang.
	const clientIp = requestHeaderField(input.clientIp);
	const userAgent = requestHeaderField(input.userAgent);
	const referer = refererField(input.referer);

	const fields: Record<string, unknown> = {
		event: isServerError ? 'unhandled_error' : 'client_error',
		errorId: input.errorId,
		status: input.status,
		message: input.message,
		pathname: input.pathname,
		method: input.method,
		error
	};

	if (clientIp) fields.clientIp = clientIp;
	if (userAgent) fields.userAgent = userAgent;
	if (referer) fields.referer = referer;

	// Der Stack eines 404 zeigt immer dieselbe SvelteKit-interne Stelle, Ursachen hat er keine.
	if (isServerError) {
		if (stack) fields.stack = stack;
		if (causes) fields.causes = causes;
	}

	return {
		level: isServerError ? 'error' : 'warn',
		msg: isServerError
			? 'Unerwarteter Serverfehler'
			: input.status === 404
				? 'Nicht gefunden'
				: 'Anfrage nicht beantwortet',
		fields
	};
}
