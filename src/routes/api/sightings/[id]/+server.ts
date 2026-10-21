import { getAdminSightingSchema } from '#lib/form/validation/sightingSchema.ts';
import { createLogger } from '#lib/logger.server.ts';
import type { SightingFormData } from '#lib/report/types.ts';
import { logAuditEvent } from '#lib/server/audit/auditService.ts';
import { requireUserRole } from '#lib/server/auth/auth.ts';
import { getClientIp } from '#lib/server/utils/getClientIp.ts';
import { db } from '#lib/server/db/index.ts';
import { sightingFiles, sightings } from '#lib/server/db/schema.ts';
import { deleteStoredFiles } from '#lib/server/storage/deleteStoredFiles.ts';
import { posix } from 'path';
import {
	loadSightingFiles,
	saveSightingFiles,
	updateSighting
} from '#lib/server/db/sightingRepository.ts';
import type { ExifData } from '#lib/types/index.ts';
import { resolveMediaUploadFlag } from '#lib/utils/media/mediaUploadFlag.ts';
import { createId } from '@paralleldrive/cuid2';
import { error, isHttpError, json } from '@sveltejs/kit';
import { ValidationError } from 'yup';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

function normalizeValue(value: unknown): unknown {
	if (value === undefined) return null;
	if (typeof value === 'number' && !Number.isNaN(value)) return String(value);
	return value;
}

function getChangedFields(
	current: Record<string, unknown>,
	next: Record<string, unknown>
): string[] {
	return Object.keys(next).filter(
		(key) =>
			JSON.stringify(normalizeValue(current[key])) !== JSON.stringify(normalizeValue(next[key]))
	);
}

// Logger für diesen API-Endpunkt erstellen
const logger = createLogger('api:sightings');

export const GET: RequestHandler = async ({ params, locals, url }) => {
	// Authorization check
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	// Extrahiere die Sichtungs-ID aus den URL-Parametern
	const { id } = params;

	if (!id || isNaN(Number(id))) {
		throw error(400, 'Ungültige Sichtungs-ID');
	}

	try {
		const sighting = await db
			.select()
			.from(sightings)
			.where(eq(sightings.id, Number(id)))
			.limit(1);

		if (sighting.length === 0) {
			logger.warn({ id }, 'Sichtung nicht gefunden');
			throw error(404, 'Sichtung nicht gefunden');
		}

		// Lade auch die zugehörigen Dateien
		const uploadedFiles = await loadSightingFiles(Number(id));

		return json({
			...sighting[0],
			uploadedFiles
		});
	} catch (err) {
		if (isHttpError(err)) throw err;
		logger.error(err, 'Fehler beim Laden der Sichtung:');
		throw error(500, 'Interner Serverfehler');
	}
};

export const PUT: RequestHandler = async ({ params, request, locals, url, getClientAddress }) => {
	// Authorization check
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const { id } = params;

	if (!id || isNaN(Number(id))) {
		throw error(400, 'Ungültige Sichtungs-ID');
	}

	try {
		// Daten aus dem Request-Body abrufen
		const requestData = await request.json();
		const { uploadedFiles, ...formData } = requestData as SightingFormData & {
			uploadedFiles?: unknown[];
		};

		logger.debug({ formData, uploadedFiles }, 'Sichtung speichern');

		// Validierung der Formulardaten gegen das Admin-Schema. Dieser Endpunkt ist
		// die Rückseite des Bearbeitungsformulars und damit der einzige, der
		// **bestehende** Zeilen entgegennimmt — die Eingabegrenzen des
		// Meldeformulars (Anzahlen, Entfernungskategorie, Freitext zu „Sonstiges")
		// sperren dort 1.158 Bestandssichtungen aus. Mit `sightingSchema` blieb die
		// Lockerung im Browser wirkungslos: Der Server warf die Meldung als 500
		// zurück, und der Admin las „Interner Serverfehler". Neue Meldungen laufen
		// unverändert über `POST /api/sightings` und das strenge Schema.
		await getAdminSightingSchema().validate(formData, { abortEarly: false });

		// Load current state for changedFields diff
		const currentRecords = await db
			.select()
			.from(sightings)
			.where(eq(sightings.id, Number(id)))
			.limit(1);

		// `mediaUpload` wird abgeleitet, nicht durchgereicht: Das Bearbeitungs-
		// formular kennt kein Ankreuzfeld dafür, und ein hier hochgeladenes Foto
		// muss auch in der Spalte „Aufnahme" ankommen. Die Regel ist asymmetrisch
		// — Begründung in `#lib/utils/media/mediaUploadFlag.ts`.
		//
		// `uploadedFiles` ist der vollständige Bestand nach dieser Bearbeitung und
		// nicht nur der Zuwachs — aber nur, wenn die Liste etwas enthält:
		// `saveSightingFiles` ersetzt die Verknüpfungen dann komplett. Bei leerer
		// Liste UND bei fehlendem Schlüssel läuft der Aufruf unten gar nicht bzw.
		// steigt sofort aus; die Anhänge bleiben in beiden Fällen unberührt.
		//
		// `attachedFileCount: 0` heißt hier also nie „die Dateien wurden
		// entfernt", sondern „an den Dateien wurde nichts geändert". Genau
		// deshalb darf die Ableitung das Flag nicht löschen — sie wüsste sonst
		// gar nicht, worauf sie sich beruft.
		const updatedSighting = await updateSighting(Number(id), {
			...formData,
			mediaUpload: resolveMediaUploadFlag({
				current: formData.mediaUpload,
				attachedFileCount: uploadedFiles?.length ?? 0
			}),
			uploadedFiles: uploadedFiles || []
		});

		if (currentRecords.length > 0 && updatedSighting) {
			const changedFields = getChangedFields(
				currentRecords[0] as Record<string, unknown>,
				updatedSighting as unknown as Record<string, unknown>
			);
			const ipAddress = getClientIp(getClientAddress, request);
			await logAuditEvent({
				action: 'sighting.edit',
				resourceType: 'sighting',
				resourceId: String(id),
				...(locals.user?.email ? { userEmail: locals.user.email } : {}),
				...(ipAddress ? { ipAddress } : {}),
				details: { changedFields }
			});
		}

		if (!updatedSighting) {
			logger.warn({ id }, 'Sichtung nicht gefunden oder konnte nicht aktualisiert werden');
			throw error(404, 'Sichtung nicht gefunden');
		}

		// Speichere Datei-Referenzen falls vorhanden
		if (uploadedFiles && uploadedFiles.length > 0) {
			// Verwende eine existierende referenceId oder generiere eine neue
			const referenceId = updatedSighting.referenceId || createId();

			// Transform uploadedFiles to match UploadedFileInfo interface
			const { getStorageProvider } = await import('#lib/server/storage/factory.ts');
			const storageProvider = getStorageProvider();

			const fileInfos = uploadedFiles.map((file: unknown) => {
				const fileObj = file as Record<string, unknown>;

				// Validate filePath is actually a string before any operations
				if (typeof fileObj.filePath !== 'string' || !fileObj.filePath) {
					logger.warn({ filePath: fileObj.filePath }, 'Ungültiger Dateipfad erkannt');
					throw error(400, 'Ungültiger Dateipfad');
				}
				const filePath = fileObj.filePath;

				// Prevent path traversal: decode URL-encoded sequences, then normalize
				let decodedPath: string;
				try {
					decodedPath = decodeURIComponent(filePath);
				} catch {
					logger.warn({ filePath }, 'Nicht dekodierbarer Dateipfad erkannt');
					throw error(400, 'Ungültiger Dateipfad');
				}
				const normalizedPath = posix.normalize(decodedPath);
				if (
					normalizedPath === '..' ||
					normalizedPath.startsWith('../') ||
					normalizedPath.startsWith('/') ||
					normalizedPath.includes('\\') ||
					// Catch double-encoded sequences (%252e, %252f, %255c)
					filePath.toLowerCase().includes('%25')
				) {
					logger.warn({ filePath, normalizedPath }, 'Pfad-Traversal erkannt');
					throw error(400, 'Ungültiger Dateipfad');
				}

				const fileUrl = storageProvider.getUrl(normalizedPath);

				return {
					uid: (fileObj.uid as string) || createId(),
					originalName: fileObj.originalName as string,
					fileName: (fileObj.fileName as string) || normalizedPath,
					filePath: normalizedPath,
					url: fileUrl,
					size: fileObj.size as number,
					mimeType: fileObj.mimeType as string,
					uploadedAt: (fileObj.uploadedAt as string) || new Date().toISOString(),
					exifData: fileObj.exifData as ExifData | null
				};
			});

			await saveSightingFiles(Number(id), fileInfos, referenceId);
		}

		return json(updatedSighting);
	} catch (err) {
		if (isHttpError(err)) throw err;

		// Eine abgelehnte Eingabe ist kein Serverfehler. Als 500 las der Admin
		// „Interner Serverfehler" und hatte keinen Anhaltspunkt, welches Feld ihn
		// blockiert — die Meldung log genau dann, wenn sie hätte helfen können.
		if (err instanceof ValidationError) {
			// Gleiche Hülle wie `POST /api/sightings` (`success`/`code`/`message`/
			// `errors`) — dieselbe Ressource soll denselben Fehler nicht in zwei
			// Formen melden. `message` trägt hier den ersten konkreten Fehler statt
			// eines Sammelbegriffs: Das Bearbeitungsformular zeigt genau dieses Feld
			// an, und ein Admin korrigiert eine bestehende Zeile, keine Eingabe von
			// Grund auf.
			const errors: Record<string, string> = {};
			for (const inner of err.inner) {
				if (inner.path) errors[inner.path] = inner.message;
			}
			// Nicht jeder Fehler trägt ein Feld: Ein schemaweiter `.test()` schlägt
			// ohne `path` fehl, und je nach Aufrufweg bleibt `inner` leer. Ohne
			// Auffangwert bekäme das Formular eine leere Karte und hätte nichts
			// anzuzeigen — derselbe Schlüssel wie im POST-Zweig.
			if (Object.keys(errors).length === 0) {
				errors.allgemein = err.message;
			}
			logger.info({ id, errors }, 'Sichtung abgelehnt: Validierung fehlgeschlagen');

			return json(
				{
					success: false,
					code: 'VALIDATION_ERROR',
					message: err.errors[0] ?? 'Die Angaben sind unvollständig oder ungültig.',
					errors
				},
				{ status: 400 }
			);
		}

		logger.error({ err }, 'Fehler beim Aktualisieren der Sichtung:');
		throw error(500, 'Interner Serverfehler');
	}
};

export const DELETE: RequestHandler = async ({
	params,
	request,
	locals,
	url,
	getClientAddress
}) => {
	// Authorization check - only admins can delete
	requireUserRole(url, locals.user, ['admin', 'superadmin']);

	const { id } = params;

	if (!id || isNaN(Number(id))) {
		logger.warn({ id }, 'Ungültige Sichtungs-ID für Löschung');
		throw error(400, 'Ungültige Sichtungs-ID');
	}

	try {
		// Prüfen ob die Sichtung existiert
		const existingSighting = await db
			.select({ id: sightings.id })
			.from(sightings)
			.where(eq(sightings.id, Number(id)))
			.limit(1);

		if (existingSighting.length === 0) {
			logger.warn({ id }, 'Sichtung zum Löschen nicht gefunden');
			throw error(404, 'Sichtung nicht gefunden');
		}

		// Die Dateizeilen explizit löschen statt sie still per Cascade verschwinden
		// zu lassen: `returning` liefert die Pfade, die der Storage sonst nie
		// erfährt. Lesen und Löschen in einer Anweisung schließt zudem aus, dass
		// dazwischen eine neue Zeile entsteht, die die Cascade unbemerkt mitnimmt.
		const removedFiles = await db.transaction(async (tx) => {
			const removed = await tx
				.delete(sightingFiles)
				.where(eq(sightingFiles.sightingId, Number(id)))
				.returning({ filePath: sightingFiles.filePath });

			await tx.delete(sightings).where(eq(sightings.id, Number(id)));

			return removed;
		});

		// Erst nach dem Commit — siehe deleteStoredFiles()
		await deleteStoredFiles(removedFiles.map((file) => file.filePath));

		const ipAddress = getClientIp(getClientAddress, request);
		await logAuditEvent({
			action: 'sighting.delete',
			resourceType: 'sighting',
			resourceId: String(id),
			...(locals.user?.email ? { userEmail: locals.user.email } : {}),
			...(ipAddress ? { ipAddress } : {})
		});

		logger.info({ id, deletedBy: locals.user?.email }, 'Sichtung erfolgreich gelöscht');

		return json({ success: true, message: 'Sichtung erfolgreich gelöscht' });
	} catch (err) {
		if (isHttpError(err)) throw err;
		logger.error({ err, id }, 'Fehler beim Löschen der Sichtung');
		throw error(500, 'Interner Serverfehler beim Löschen der Sichtung');
	}
};
