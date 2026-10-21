import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { createLogger } from '#lib/logger.server.ts';
import { enforceRateLimit, createRateLimitIdentifier } from '#lib/server/middleware/rateLimit.ts';

const logger = createLogger('csp-report');

/** Rate-Limit für CSP-Reports: 60 Reports pro Minute und IP */
const CSP_REPORT_RATE_LIMIT = { windowMs: 60 * 1000, maxRequests: 60 };

/** Maximale akzeptierte Body-Größe eines CSP-Reports (8 KB) */
const MAX_CSP_REPORT_BYTES = 8 * 1024;

/** Bekannte, unbedenkliche CSP-Report-Felder, die geloggt werden dürfen */
type CspReportPayload = Record<string, unknown>;

function extractKnownFields(cspReport: CspReportPayload) {
	return {
		blockedUri: cspReport['blocked-uri'],
		violatedDirective: cspReport['violated-directive'],
		documentUri: cspReport['document-uri'],
		sourceFile: cspReport['source-file'],
		lineNumber: cspReport['line-number']
	};
}

/**
 * POST-Handler für /api/csp-report
 * Empfängt und verarbeitet CSP-Verstoßberichte, die vom Browser gesendet werden.
 *
 * Sicherheit:
 * - Rate-Limit gegen Log-Flooding (unauthentifizierter Endpunkt)
 * - Übergroße Payloads werden verworfen (kein Ressourcen-/Log-Missbrauch)
 * - Es werden ausschließlich bekannte CSP-Felder geloggt (kein ungefilterter `fullReport`)
 */
export async function POST({ request, getClientAddress }: RequestEvent) {
	// Rate Limiting (immer anonym — CSP-Reports tragen keine Auth)
	const clientIp = getClientAddress?.() ?? 'unknown';
	const identifier = createRateLimitIdentifier(undefined, clientIp, false);
	enforceRateLimit(identifier, CSP_REPORT_RATE_LIMIT, 'csp_report');

	// Schnelle Vorabprüfung anhand des content-length-Headers (kann fehlen/gefälscht sein).
	const contentLength = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(contentLength) && contentLength > MAX_CSP_REPORT_BYTES) {
		logger.warn({ contentLength }, 'CSP-Report verworfen — Payload zu groß (Header)');
		return new Response(null, { status: 204 });
	}

	// Tatsächliche Body-Größe begrenzen: Body als Text lesen und VOR dem Parsen prüfen.
	// So greift das Limit auch bei chunked Transfer oder fehlendem content-length-Header,
	// bevor die (globale) BODY_SIZE_LIMIT-Grenze relevant würde.
	let bodyText: string;
	try {
		bodyText = await request.text();
	} catch (error) {
		logger.error({ error }, 'Fehler beim Lesen des CSP-Report-Bodys');
		return json({ success: false, error: 'Ungültiges CSP-Verstoßformat' }, { status: 400 });
	}

	// Echte UTF-8-Bytelänge prüfen (nicht String-Länge/UTF-16-Code-Units),
	// damit das Limit bei Nicht-ASCII-Payloads korrekt greift.
	const byteLength = Buffer.byteLength(bodyText, 'utf8');
	if (byteLength > MAX_CSP_REPORT_BYTES) {
		logger.warn({ byteLength }, 'CSP-Report verworfen — Payload zu groß');
		return new Response(null, { status: 204 });
	}

	try {
		// CSP-Verstoß aus dem bereits gelesenen Body-Text parsen
		const report = JSON.parse(bodyText) as CspReportPayload;

		// Bei neueren Browsern ist der Report im 'csp-report' Feld, sonst direkt im Objekt
		const cspReport = (report['csp-report'] as CspReportPayload) ?? report ?? {};

		// Nur bekannte Felder loggen — kein ungefilterter fullReport
		logger.warn(
			{
				...extractKnownFields(cspReport),
				timestamp: new Date().toISOString()
			},
			'CSP-Verstoß erkannt'
		);

		// 204 No Content zurückgeben, da keine Antwort erforderlich ist
		return new Response(null, { status: 204 });
	} catch (error) {
		// Fehler beim Verarbeiten des CSP-Verstoßes loggen
		logger.error({ error }, 'Fehler bei der Verarbeitung eines CSP-Verstoßes');

		// 400 Bad Request zurückgeben, wenn der Request nicht verarbeitet werden konnte
		return json({ success: false, error: 'Ungültiges CSP-Verstoßformat' }, { status: 400 });
	}
}
