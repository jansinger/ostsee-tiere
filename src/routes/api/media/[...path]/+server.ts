import { createLogger } from '#lib/logger.server.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { isAdminUser } from '#lib/server/auth/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { isSightingApproved } from '#lib/server/db/approvalFilter.ts';
import { sightingFiles, sightings } from '#lib/server/db/schema.ts';
import { getStorageProvider } from '#lib/server/storage/factory.ts';
import { isRangeHeaderSyntaxValid, parseRangeHeader } from '#lib/server/media/rangeHeader.ts';
import {
	RATE_LIMITS,
	enforceRateLimit,
	createRateLimitIdentifier,
	buildRateLimitHeaders
} from '#lib/server/middleware/rateLimit.ts';
import { consumeByteBudget, type ByteBudget } from '#lib/server/middleware/byteBudget.ts';
import { error, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

const logger = createLogger('MediaAPI');

const BYTE_BUDGET_EXHAUSTED_MESSAGE =
	'Sie haben in der letzten Stunde bereits sehr viele Daten von diesem Server geladen. Bitte versuchen Sie es später erneut.';

/**
 * Secure media serving endpoint
 *
 * Rules:
 * - Public access for approved sightings
 * - Admin-only access for unapproved sightings
 * - File not found for invalid/missing files
 */
export const GET: RequestHandler = async ({ params, url, request, locals, getClientAddress }) => {
	const filePath = params.path;
	const clientIp = getClientIp(getClientAddress, request) ?? 'unknown';
	const isAuthenticated = !!locals.user;
	const userIdentifier = locals.user?.sub || 'anonymous';

	if (!filePath) {
		logger.warn(
			{
				action: 'media_access_invalid',
				clientIp,
				error: 'no_file_path'
			},
			'Media request without file path'
		);
		throw error(400, 'File path is required');
	}

	// Rate limiting based on authentication status. Range-Anfragen (Springen im
	// Video) bekommen ein eigenes, höheres Limit — sonst endet die Wiedergabe
	// mit 429, sobald ein Player mehrfach pro Sekunde einen neuen Bereich anfordert.
	//
	// Die Stufe hängt an der SYNTAX des Headers, nicht an seiner bloßen
	// Existenz (Befund 4, PR #682 Review): `parseRangeHeader` braucht für die
	// volle Auswertung die Dateigröße, die hier noch nicht feststeht — die
	// Syntaxprüfung kommt ohne sie aus und verhindert, dass ein kaputter
	// Header (`Range: unsinn`, am Ende als `kind: 'none'` behandelt, volle
	// Datei) sich unter dem zehnfach höheren media_range-Limit versteckt.
	const hasRangeHeader = isRangeHeaderSyntaxValid(request.headers.get('range'));
	const rateLimitConfig = hasRangeHeader
		? isAuthenticated
			? RATE_LIMITS.MEDIA_RANGE_AUTHENTICATED
			: RATE_LIMITS.MEDIA_RANGE_ANONYMOUS
		: isAuthenticated
			? RATE_LIMITS.MEDIA_ACCESS_AUTHENTICATED
			: RATE_LIMITS.MEDIA_ACCESS_ANONYMOUS;
	// Eigener Zähler-Schlüssel je Stufe: Range- und Nicht-Range-Anfragen teilen
	// sich sonst denselben Eintrag (`${endpoint}:${identifier}` in rateLimit.ts),
	// obwohl sie gegen unterschiedliche Configs geprüft werden. Ein Player, der
	// beim Springen im Video das Range-Limit ausschöpft, würde damit unbemerkt
	// auch das viel engere Nicht-Range-Limit verbrauchen.
	const rateLimitEndpoint = hasRangeHeader ? 'media_range' : 'media_access';

	const rateLimitIdentifier = createRateLimitIdentifier(userIdentifier, clientIp, isAuthenticated);

	const rateLimitResult = enforceRateLimit(rateLimitIdentifier, rateLimitConfig, rateLimitEndpoint);

	// Security audit log for all media access attempts
	logger.info(
		{
			action: 'media_access_attempt',
			filePath,
			clientIp,
			authenticated: isAuthenticated,
			user: userIdentifier,
			userAgent: request.headers.get('user-agent') || 'unknown'
		},
		'Media file access requested'
	);

	try {
		// Get the file record from database to check access permissions
		const fileRecord = await db
			.select({
				id: sightingFiles.id,
				sightingId: sightingFiles.sightingId,
				fileName: sightingFiles.fileName,
				filePath: sightingFiles.filePath,
				mimeType: sightingFiles.mimeType,
				size: sightingFiles.size,
				originalName: sightingFiles.originalName,
				// Get sighting approval status. `verified` (geprueft) wird bewusst nicht
				// mitselektiert — die Entscheidung unten läuft ausschließlich über
				// isSightingApproved()/approvedAt (.claude/rules/api.md).
				approvedAt: sightings.approvedAt
			})
			.from(sightingFiles)
			.innerJoin(sightings, eq(sightingFiles.sightingId, sightings.id))
			.where(eq(sightingFiles.filePath, filePath))
			.limit(1);

		if (fileRecord.length === 0) {
			logger.warn(
				{
					action: 'media_access_not_found',
					filePath,
					clientIp
				},
				'File not found in database'
			);
			throw error(404, 'File not found');
		}

		const file = fileRecord[0];
		if (!file) {
			logger.warn({ filePath }, 'File record not found');
			throw error(404, 'File not found');
		}

		const isApproved = isSightingApproved(file);

		// Check permissions
		if (!isApproved) {
			// File is not approved - check if user is admin
			const user = locals.user;
			const isAdmin = isAdminUser(user);

			if (!isAdmin) {
				logger.warn(
					{
						action: 'media_access_unauthorized',
						filePath,
						sightingId: file.sightingId,
						userRoles: user?.roles,
						hasUser: !!user,
						clientIp
					},
					'Unauthorized access to unapproved media file'
				);
				throw error(404, 'File not found'); // Don't reveal that file exists
			}

			logger.info(
				{
					filePath,
					sightingId: file.sightingId,
					userId: user?.sub
				},
				'Admin accessing unapproved media file'
			);
		}

		// Auslieferung als Stream mit Range-Unterstützung.
		//
		// Die frühere Variante las die ganze Datei über getFileContent() in einen
		// Buffer. Bei Bildern von wenigen MB fiel das nicht auf; bei Videos von
		// 100 MB kostet jeder Abruf die volle Größe an Arbeitsspeicher, Springen
		// im Video ist ohne Range unmöglich, und Safari/iOS verweigert bei
		// fehlendem Accept-Ranges in der Regel die Wiedergabe.
		const storage = getStorageProvider();

		// EINE Größenquelle, und zwar der Storage — nicht die Datenbankspalte.
		// Beides zu mischen wäre ein echter Fehler: Die Bereichsrechnung liefe gegen
		// einen anderen Wert als der Content-Range-Header nennt, sobald DB-Größe und
		// Datei auseinanderlaufen, und ein Player bricht auf so einer Antwort ab.
		// Der Storage kennt die Bytes, die er gleich ausliefert.
		const metadata = await storage.getMetadata(filePath);
		if (!metadata) {
			logger.warn({ filePath }, 'File metadata not found in storage');
			throw error(404, 'File not found');
		}
		const totalSize = metadata.size;
		const range = parseRangeHeader(request.headers.get('range'), totalSize);

		// Freigegebene Dateien sind CUID-benannt und unveränderlich — die lange
		// öffentliche Cache-Dauer ist dort gewollt. Nicht freigegebene Dateien
		// liefert dieser Endpunkt nur an Admins aus (siehe isApproved-Zweig
		// oben); `public` würde geteilten Caches (CDN, Firmenproxy,
		// Reverse-Proxy-Cache) trotzdem erlauben, sie vorzuhalten und
		// weiterzureichen — und `immutable` über ein Jahr verhindert, dass eine
		// spätere Ablehnung der Sichtung diesen Cache invalidiert. Vorbestehender
		// Befund, nicht durch diesen Branch eingeführt.
		const cacheControl = isApproved ? 'public, max-age=31536000, immutable' : 'private, no-store';

		const baseHeaders: Record<string, string> = {
			'Content-Type': file.mimeType,
			'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
			'Cache-Control': cacheControl,
			ETag: `"${Buffer.from(filePath + totalSize).toString('base64')}"`,
			'Accept-Ranges': 'bytes',
			'X-Content-Type-Options': 'nosniff',
			'X-Frame-Options': 'SAMEORIGIN',
			...buildRateLimitHeaders(rateLimitConfig, rateLimitResult)
		};

		if (range.kind === 'unsatisfiable') {
			logger.warn({ filePath, totalSize }, 'Range not satisfiable');
			return new Response(null, {
				status: 416,
				headers: { ...baseHeaders, 'Content-Range': `bytes */${totalSize}` }
			});
		}

		// Bedingte Anfragen: Der Client schickt sein ETag als Query-Parameter
		// (bestehende Konvention dieser Route, nicht If-None-Match).
		const clientETag = url.searchParams.get('etag') || '';
		if (clientETag && clientETag === baseHeaders.ETag) {
			return new Response(null, { status: 304, headers: baseHeaders });
		}

		// Volumen-Bremse (Befund C1). Das Rate-Limit oben zählt nur die ANZAHL
		// der Zugriffe — `Range: bytes=0-` ist ein erfüllbarer Bereich über die
		// ganze Datei und bekam dabei sogar das höhere Range-Limit statt des
		// engeren Nicht-Range-Limits. Gebucht wird deshalb hier die tatsächlich
		// auszuliefernde Menge (bei einem Bereich dessen Länge, sonst die volle
		// Dateigröße) — VOR dem Streamen, damit ein ausgeschöpftes Budget keine
		// Bytes mehr kostet, bevor die Antwort verweigert wird.
		const plannedDeliveryBytes =
			range.kind === 'satisfiable' ? range.end - range.start + 1 : totalSize;
		const mediaByteBudget: ByteBudget = isAuthenticated
			? RATE_LIMITS.MEDIA_BYTES_AUTHENTICATED
			: RATE_LIMITS.MEDIA_BYTES_ANONYMOUS;
		const byteBudgetResult = consumeByteBudget(
			rateLimitIdentifier,
			plannedDeliveryBytes,
			mediaByteBudget
		);

		if (!byteBudgetResult.allowed) {
			logger.warn(
				{
					action: 'media_access_rejected',
					reason: 'byte_budget_exhausted',
					filePath,
					clientIp,
					authenticated: isAuthenticated,
					plannedDeliveryBytes,
					usedBytes: byteBudgetResult.usedBytes,
					remainingBytes: byteBudgetResult.remainingBytes
				},
				'Media access rejected - hourly byte budget exhausted'
			);
			throw error(429, BYTE_BUDGET_EXHAUSTED_MESSAGE);
		}

		const requestedRange =
			range.kind === 'satisfiable' ? { start: range.start, end: range.end } : undefined;
		const result = await storage.getFileStream(filePath, requestedRange);

		if (!result) {
			logger.warn({ filePath }, 'File content not found in storage');
			throw error(404, 'File not found');
		}

		// Ob der Storage einen angeforderten Bereich tatsächlich eingehalten hat,
		// steht nicht schon fest, weil der Client ihn angefragt hat — ein CDN vor
		// Vercel Blob darf den Range-Header ignorieren und mit 200 und dem vollen
		// Body antworten (RFC 9110). Nur wenn beides zutrifft — Bereich erfüllbar
		// UND vom Storage geliefert — ist 206 mit Content-Range korrekt. Sonst
		// entstünde eine in sich widersprüchliche Antwort: Status 206 über einem
		// Body, der die ganze Datei enthält.
		if (range.kind === 'satisfiable' && result.rangeDelivered) {
			const length = range.end - range.start + 1;
			logger.debug(
				{ filePath, sightingId: file.sightingId, range, totalSize, isApproved },
				'Serving media file range'
			);
			return new Response(result.stream, {
				status: 206,
				headers: {
					...baseHeaders,
					'Content-Length': String(length),
					'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}`
				}
			});
		}

		if (range.kind === 'satisfiable' && !result.rangeDelivered) {
			logger.warn(
				{ filePath, sightingId: file.sightingId, range, totalSize },
				'Storage did not honor range request, falling back to full response'
			);

			// Gebucht war nur die Bereichslänge (`plannedDeliveryBytes`), tatsächlich
			// ausgeliefert wird jetzt die volle Datei — die Differenz muss vor der
			// Antwort nachgebucht werden. Sonst kostet `Range: bytes=0-0` bei einem
			// Storage, der den Bereich nicht einhält, nur 1 Byte Budget für bis zu
			// 100 MB Auslieferung (Befund C1-Bypass).
			const shortfallBytes = totalSize - plannedDeliveryBytes;
			if (shortfallBytes > 0) {
				const reconciliation = consumeByteBudget(
					rateLimitIdentifier,
					shortfallBytes,
					mediaByteBudget
				);

				if (!reconciliation.allowed) {
					logger.warn(
						{
							action: 'media_access_rejected',
							reason: 'byte_budget_exhausted_on_range_fallback',
							filePath,
							clientIp,
							authenticated: isAuthenticated,
							plannedDeliveryBytes,
							shortfallBytes,
							usedBytes: reconciliation.usedBytes,
							remainingBytes: reconciliation.remainingBytes
						},
						'Media access rejected - byte budget exhausted after range fallback'
					);
					await result.stream?.cancel?.();
					throw error(429, BYTE_BUDGET_EXHAUSTED_MESSAGE);
				}
			}
		}

		logger.debug(
			{ filePath, sightingId: file.sightingId, size: totalSize, isApproved },
			'Serving media file'
		);
		return new Response(result.stream, {
			headers: { ...baseHeaders, 'Content-Length': String(totalSize) }
		});
	} catch (err: unknown) {
		if (typeof err === 'object' && err && 'status' in err) {
			// If the error is a SvelteKit error, re-throw it
			logger.warn({ error: err, filePath }, 'SvelteKit error serving media file');
			throw err; // Re-throw SvelteKit errors
		}

		logger.error({ error: err, filePath }, 'Unexpected error serving media file');
		throw error(500, 'Internal server error');
	}
};
