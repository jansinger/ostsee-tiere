/**
 * @fileoverview Datenbank-Repository für Sichtungen und Mediendateien
 *
 * Dieses Modul implementiert die Datenzugriffsschicht für Meerestier-Sichtungen
 * in der PostgreSQL-Datenbank. Es verwaltet sowohl Sichtungsdaten als auch
 * verknüpfte Mediendateien mit EXIF-Metadaten und unterstützt verschiedene
 * Storage-Provider (lokal und Cloud).
 *
 * Die Repository-Schicht abstrahiert Drizzle ORM-Operationen und bietet
 * typsichere CRUD-Funktionen für die Anwendungslogik.
 *
 * **`entryClient`-Diagnose — bekannte Lücke im Guard (Review Runde 2).**
 * `getSightingById()` und `getSightingByReferenceId()` nutzen `db.select()`
 * ohne Argument und laden damit die ganze Zeile inklusive `entryClient`
 * (Spalte `eingangs_client`, siehe `publicClientLeakScan.test.ts`). Heute
 * folgenlos: Beide Aufrufer sind admin-gated
 * (`api/admin/weather/[id]/refresh/+server.ts`,
 * `api/sightings/ref/[refId]/+server.ts`, beide mit `requireUserRole`).
 * Diese Datei ist absichtlich NICHT in die Scan-Liste des Guards
 * aufgenommen — sie setzt `entryClient` weiter unten legitim
 * (`sightingData.entryClient = truncateEntryClient(entryClient)`), ein
 * textbasierter Scan träfe dort sofort ein Falsch-Positiv. **Wer künftig eine öffentliche Route baut,
 * die `getSightingById`/`getSightingByReferenceId` aufruft und das Ergebnis
 * direkt zurückgibt (`return json(sighting)`), muss die Spalten selbst
 * explizit auswählen** — der Guard prüft diesen Pfad nicht.
 *
 * @author Ostsee-Tiere Team
 * @since 1.0.0
 */

import { createLogger } from '#lib/logger.server.ts';
import type { SightingFormData } from '#lib/report/types.ts';
import type { StoredWeatherData } from '#lib/services/weatherService.ts';
import { db } from '#lib/server/db/index.ts';
import { sightingFiles, sightings, type SightingSelect } from '#lib/server/db/schema.ts';
import { getCachedWeatherData } from '#lib/server/services/weatherDeduplication.ts';
import { getUploadPath } from '#lib/server/uploads.ts';
import { truncateEntryClient } from '#lib/server/utils/resolveEntryClient.ts';
import type { ExifData, UploadedFileInfo } from '#lib/types/index.ts';
import type { SightingFormValues } from '#lib/types/Form.ts';
import type { NewSighting, UpdateSighting } from '#lib/types/sighting.ts';
import type { SpamCheckResult } from '#lib/types/spam.ts';
import type { SightingFileInsert } from '#lib/types/sightingFile.ts';
import { isImageFile } from '#lib/utils/index.ts';
import { and, count, countDistinct, eq, gte, isNotNull, ne, sql, type SQL } from 'drizzle-orm';
import {
	approvalFilter,
	type ResolvedSightingScope,
	type SightingScope
} from '#lib/server/db/approvalFilter.ts';
import { readImageExifData } from '#lib/server/media/exifUtils.ts';
import { mapFormToSighting } from '#lib/server/db/mapFormToSighting.ts';
import { setSightingIdForReferenceId } from '#lib/server/db/sightingFilesRepository.ts';
import { deleteStoredFiles } from '#lib/server/storage/deleteStoredFiles.ts';

// Logger für Repository-Operationen
const logger = createLogger('db:sightingRepository');

/**
 * Speichert eine neue Sichtung mit verknüpften Mediendateien und Wetterdaten in der Datenbank
 *
 * Diese Funktion führt eine transaktionale Operation durch, bei der sowohl
 * die Sichtungsdaten als auch alle hochgeladenen Mediendateien mit ihren
 * EXIF-Metadaten und verfügbare Wetterdaten persistent gespeichert werden.
 *
 * @param formData Validierte Formulardaten aus dem Sichtungs-Formular
 * @param weatherData Optional: Wetterdaten für diese Sichtung (Issue #110)
 * @param spamCheck Optional: Spam-Heuristik zum Meldezeitpunkt (wird persistiert)
 * @param entryClient Optional: Kennung der erzeugenden Software (`resolveEntryClient`); wird auf die Spaltenbreite gekürzt
 * @returns Objekt mit der generierten Sichtungs-ID
 *
 * @example
 * const result = await saveSighting(formData, weatherData);
 * console.log(`Neue Sichtung gespeichert mit ID: ${result.id}`);
 *
 * @throws {Error} Bei Datenbankfehlern oder Validierungsfehlern
 */
export const saveSighting = async (
	formData: SightingFormValues,
	weatherData?: StoredWeatherData,
	spamCheck?: SpamCheckResult,
	entryClient?: string
): Promise<{ id: number | undefined }> => {
	// Konvertiere Formulardaten in das normalisierte Datenbankschema
	const sightingData: NewSighting = mapFormToSighting(formData);

	// Client-Kennung des Aufrufers festhalten. Ohne Angabe bleibt die Spalte
	// NULL — das ist die Kennzeichnung für Zeilen aus der Zeit vor dieser
	// Spalte und darf nicht durch einen Default überschrieben werden.
	// Die Kürzung steht hier und nicht nur bei den Aufrufern: Ein ungekürzter
	// User-Agent ließe den Insert an der Spaltenbreite scheitern und damit die
	// ganze Meldung verlorengehen — statt nur die Herkunftsnotiz zu kürzen.
	if (entryClient) {
		sightingData.entryClient = truncateEntryClient(entryClient);
	}

	// Spam-Heuristik zum Meldezeitpunkt festhalten. NULL bleibt für Altbestand,
	// Eingänge ohne Bewertung UND fehlgeschlagene Prüfungen — deren Fail-Safe-
	// Score 0 läse sich sonst als „geprüft, sauber".
	if (spamCheck && !spamCheck.failed) {
		sightingData.spamScore = spamCheck.score;
		sightingData.spamIndicators = spamCheck.indicators;
	}

	// Add weather data fields if provided (Issue #110)
	if (weatherData) {
		sightingData.weatherData = weatherData;
		sightingData.weatherFetchedAt = new Date(weatherData.fetched_at);
		sightingData.weatherProvider = weatherData.provider;
		sightingData.weatherApiVersion = weatherData.api_version;
		sightingData.weatherDataType = weatherData.data_type;

		logger.info(
			{
				sightingData: { ...sightingData, weatherData: undefined }, // Don't log full weather data
				hasWeatherData: true,
				weatherProvider: weatherData.provider,
				weatherDataType: weatherData.data_type
			},
			'Speichere neue Sichtung mit Wetterdaten'
		);
	} else {
		logger.info({ sightingData }, 'Speichere neue Sichtung ohne Wetterdaten');
	}

	// Insert der Sichtung UND das Verknüpfen der Mediendateien laufen in einer
	// Transaktion: Schlägt einer der Schritte fehl, wird nichts gespeichert und
	// es bleiben keine verwaisten Datei-Referenzen zurück.
	const sightingId = await db.transaction(async (tx) => {
		const [result] = await tx
			.insert(sightings)
			.values(sightingData)
			.returning({ id: sightings.id });

		const id = result?.id;

		if (!id) {
			logger.error({ sightingData }, 'Fehler beim Speichern der Sichtung');
			throw new Error('Fehler beim Speichern der Sichtung');
		}

		// Update referenced media files innerhalb derselben Transaktion
		await setSightingIdForReferenceId(formData.referenceId, id, tx);
		return id;
	});

	logger.info({ sightingId, hasWeatherData: !!weatherData }, 'Sichtung erfolgreich gespeichert');

	return { id: sightingId };
};

/**
 * Zählt Duplikat-Signale für die Spam-Heuristik zum Meldezeitpunkt.
 *
 * `sameEmail`: Meldungen der letzten 24 h mit derselben E-Mail-Adresse
 * (case-insensitiv). `sameNotes`: Meldungen der letzten 7 Tage mit exakt
 * demselben Bemerkungstext (getrimmt) — nur geprüft, wenn der Text
 * mindestens 20 Zeichen hat, sonst zählte „schön" jede zweite Meldung.
 *
 * Fail-open: Ein DB-Fehler liefert `{ 0, 0 }` und wirft nicht — die
 * Duplikatzählung darf das Speichern einer Meldung nie verhindern.
 */
export async function countRecentDuplicateSignals(params: {
	email?: string | null | undefined;
	notes?: string | null | undefined;
}): Promise<{ sameEmail: number; sameNotes: number }> {
	const MIN_NOTES_LENGTH = 20;
	const EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
	const NOTES_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

	try {
		let sameEmail = 0;
		let sameNotes = 0;

		const email = params.email?.trim();
		if (email) {
			const since = new Date(Date.now() - EMAIL_WINDOW_MS);
			const [row] = await db
				.select({ count: count() })
				.from(sightings)
				.where(
					and(
						gte(sightings.created, since),
						sql`lower(${sightings.email}) = ${email.toLowerCase()}`
					)
				);
			sameEmail = Number(row?.count ?? 0);
		}

		const notes = params.notes?.trim();
		if (notes && notes.length >= MIN_NOTES_LENGTH) {
			const since = new Date(Date.now() - NOTES_WINDOW_MS);
			const [row] = await db
				.select({ count: count() })
				.from(sightings)
				.where(and(gte(sightings.created, since), sql`trim(${sightings.notes}) = ${notes}`));
			sameNotes = Number(row?.count ?? 0);
		}

		return { sameEmail, sameNotes };
	} catch (error: unknown) {
		logger.warn({ error }, 'Duplikatzählung fehlgeschlagen – ohne Duplikat-Signale fortfahren');
		return { sameEmail: 0, sameNotes: 0 };
	}
}

/**
 * Aktualisiert eine bestehende Sichtung in der Datenbank
 *
 * Diese Funktion führt ein partielles Update einer Sichtung durch,
 * wobei unveränderliche Felder wie ID und Erstellungsdatum
 * automatisch ausgeschlossen werden.
 *
 * @param id Eindeutige ID der zu aktualisierenden Sichtung
 * @param formData Neue Formulardaten für die Aktualisierung
 * @returns Aktualisierte Sichtung oder null falls nicht gefunden
 *
 * @example
 * const updated = await updateSighting(123, formData);
 * if (updated) console.log('Sichtung erfolgreich aktualisiert');
 *
 * @throws {Error} Bei Datenbankfehlern oder wenn Sichtung nicht existiert
 */
export const updateSighting = async (
	id: number,
	formData: SightingFormData
): Promise<NewSighting | null> => {
	// Konvertiere Formulardaten in das normalisierte Datenbankschema
	const sightingData: NewSighting = mapFormToSighting(formData);

	// Entferne unveränderliche Felder für sauberes Update.
	// `verified` und `approvedAt` gehören zum Prüfstatus und werden ausschließlich
	// von PATCH /api/sightings/[id]/verify gesetzt — beide immer gemeinsam. Würde
	// das Bearbeitungsformular `verified` mitschreiben, liefen die Spalten
	// auseinander und die Sichtung wäre "geprüft", aber nicht veröffentlicht.
	//
	// Die Einwilligungen gehören vollständig — Flag UND Nachweis — nicht ins
	// Update. Sie sind eine Aussage der meldenden Person, kein Attribut des
	// Datensatzes: Ein Admin ist nicht die betroffene Person und kann nicht für
	// sie einwilligen. `mapFormToSighting` stempelt die `…ConsentAt`-Spalten auf
	// `new Date()` — beim Anlegen richtig, beim Bearbeiten eine Erfindung.
	//
	// Nur den Nachweis auszuschließen und das Flag schreibbar zu lassen, würde
	// über diesen Pfad genau die Kombination erzeugen, die der Anlege-Pfad als
	// Fehler definiert (Flag 1 bei NULL-Nachweis, siehe
	// `mapFormToSightingConsentProof.test.ts`). Die Invariante hinge dann allein
	// daran, dass die Admin-Oberfläche kein Einwilligungsfeld anbietet.
	//
	// Es geht nichts verloren: Einziger Aufrufer ist PUT /api/sightings/[id]
	// hinter dem Admin-Bearbeitungsformular, und das rendert die drei übrigen
	// Einwilligungen nicht und zeigt `mediaConsent` gesperrt. Eine nachträglich
	// erteilte Einwilligung braucht einen eigenen Weg mit eigenem Nachweis.
	const {
		id: _id,
		created: _created,
		approvedAt: _approvedAt,
		// `freigegeben_von` gehört zum Zeitstempel wie `abgelehnt_von` zu seinem —
		// derselbe Vorgang, derselbe alleinige Schreiber (Verify-Endpunkt).
		approvedBy: _approvedBy,
		verified: _verified,
		// Gleiche Regel wie für `verified`/`approvedAt`: Die Ablehnung ist Teil
		// desselben Statusvorgangs. `PATCH /api/sightings/[id]/verify` schreibt
		// alle vier Spalten in EINEM Update und hält damit die Invariante, dass
		// Freigabe und Ablehnung nie gleichzeitig gesetzt sind. Ein zweiter
		// Schreiber, der nur eine Spalte setzt, bricht sie.
		rejectedAt: _rejectedAt,
		rejectedBy: _rejectedBy,
		nameConsent: _nameConsent,
		shipNameConsent: _shipNameConsent,
		privacyConsent: _privacyConsent,
		mediaConsent: _mediaConsent,
		nameConsentAt: _nameConsentAt,
		nameConsentVersion: _nameConsentVersion,
		shipNameConsentAt: _shipNameConsentAt,
		shipNameConsentVersion: _shipNameConsentVersion,
		privacyConsentAt: _privacyConsentAt,
		privacyConsentVersion: _privacyConsentVersion,
		mediaConsentAt: _mediaConsentAt,
		mediaConsentVersion: _mediaConsentVersion,
		...rest
	} = sightingData;
	const updateData = rest as UpdateSighting;

	// Führe Update-Operation mit ID-Filter aus
	const [updatedSighting] = await db
		.update(sightings)
		.set({
			...updateData
		})
		.where(eq(sightings.id, Number(id)))
		.returning();

	logger.info({ id, updatedSighting }, 'Sichtung erfolgreich aktualisiert');

	return updatedSighting as NewSighting;
};

/**
 * Lädt alle Mediendateien einer Sichtung mit EXIF-Metadaten
 *
 * Diese Funktion ruft alle verknüpften Dateien einer Sichtung ab und
 * lädt zusätzlich EXIF-Metadaten für Bilddateien. EXIF-Daten werden
 * zunächst aus der Datenbank gelesen (JSONB), bei Bedarf aber auch
 * direkt aus lokalen Dateien extrahiert.
 *
 * @param sightingId ID der Sichtung deren Dateien geladen werden sollen
 * @returns Array mit allen Datei-Informationen inkl. EXIF-Daten und URLs
 *
 * @example
 * const files = await loadSightingFiles(123);
 * console.log(`${files.length} Dateien geladen`);
 *
 * @note Unterstützt sowohl lokalen Storage als auch Cloud-Storage-Provider
 */
export const loadSightingFiles = async (sightingId: number): Promise<UploadedFileInfo[]> => {
	// Lade Datei-Metadaten aus der Datenbank
	const files = await db
		.select()
		.from(sightingFiles)
		.where(eq(sightingFiles.sightingId, sightingId));

	// Parallel EXIF-Daten für Bilddateien laden und URLs generieren
	const filesWithExif = await Promise.all(
		files.map(async (file) => {
			let exifData = null;

			// EXIF-Daten zuerst aus der Datenbank-JSONB laden (bereits geparst)
			if (file.exifData) {
				exifData = file.exifData;
				logger.debug(
					{
						fileId: file.id,
						hasExif: true,
						source: 'database'
					},
					'EXIF-Daten aus Datenbank geladen'
				);
			}

			// Falls keine EXIF-Daten in DB verfügbar: bei lokalen Bildern nachlesen
			if (!exifData && isImageFile(file.mimeType)) {
				const { isCloudStorage } = await import('#lib/server/storage/factory.ts');

				if (!isCloudStorage()) {
					// Nur bei lokalem Storage EXIF-Daten aus Datei extrahieren
					try {
						const fullPath = getUploadPath(file.filePath);
						exifData = await readImageExifData(fullPath);
						logger.debug(
							{
								fileId: file.id,
								filePath: file.filePath,
								fullPath,
								hasExif: !!exifData,
								source: 'file',
								exifData: exifData
									? {
											hasGPS: !!(exifData.latitude && exifData.longitude),
											hasCameraData: !!(exifData.make || exifData.model)
										}
									: null
							},
							'EXIF-Daten aus lokaler Datei extrahiert'
						);
					} catch (error) {
						logger.warn(
							{ error, fileId: file.id, filePath: file.filePath },
							'EXIF-Extraktion aus lokalem Storage fehlgeschlagen'
						);
					}
				} else {
					logger.debug(
						{
							fileId: file.id,
							filePath: file.filePath,
							storage: 'cloud'
						},
						'EXIF-Extraktion für Cloud-Storage übersprungen'
					);
				}
			}

			// URL aus Datenbank verwenden oder vom Storage-Provider generieren lassen
			let fileUrl = file.url;
			if (!fileUrl) {
				const { getStorageProvider } = await import('#lib/server/storage/factory.ts');
				const storageProvider = getStorageProvider();
				fileUrl = storageProvider.getUrl(file.filePath);
			}

			return {
				id: file.id,
				uid: file.uid,
				originalName: file.originalName,
				fileName: file.fileName,
				filePath: file.filePath,
				url: fileUrl || undefined, // Gespeicherte oder generierte URL
				size: file.size,
				mimeType: file.mimeType,
				uploadedAt: file.uploadedAt,
				exifData: exifData as ExifData | null // Typgecastete EXIF-Daten
			};
		})
	);

	return filesWithExif.map((file) => {
		return {
			...file,
			uploadedAt: file.uploadedAt ? new Date(file.uploadedAt).toISOString() : undefined
		};
	});
};

/**
 * Speichert Datei-Referenzen für eine bestehende Sichtung
 *
 * Diese Hilfsfunktion verknüpft bereits hochgeladene Mediendateien
 * mit einer Sichtung und speichert die Metadaten in der Datenbank.
 * Wird für nachträgliche Datei-Uploads verwendet.
 *
 * @param sightingId ID der Sichtung zu der die Dateien gehören
 * @param uploadedFiles Array mit Datei-Informationen und Metadaten
 * @param referenceId Eindeutige Referenz-ID der Sichtung
 *
 * @example
 * await saveSightingFiles(123, uploadedFiles, 'REF-20240315-001');
 *
 * @note Verwendet Batch-Insert für optimale Performance bei vielen Dateien
 */
export const saveSightingFiles = async (
	sightingId: number,
	uploadedFiles: UploadedFileInfo[],
	referenceId: string
): Promise<void> => {
	// Early return bei leerer Dateiliste
	if (uploadedFiles.length === 0) return;

	const timestamp = new Date();

	// Normalisiere Datei-Metadaten für Datenbank-Schema
	const fileData: SightingFileInsert[] = uploadedFiles.map((file) => ({
		uid: file.uid,
		sightingId,
		referenceId,
		originalName: file.originalName,
		fileName: file.fileName || file.originalName,
		filePath: file.filePath,
		mimeType: file.mimeType,
		size: file.size,
		uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : timestamp,
		createdAt: timestamp, // Aktuelle Zeit als Erstellungsdatum
		exifData: file.exifData || null
	}));

	// Delete existing and insert new file references atomically.
	// `returning` liefert die Pfade der entfernten Zeilen — ohne sie wüsste
	// niemand mehr, welche Dateien im Storage noch aufzuräumen sind.
	const removedPaths = await db.transaction(async (tx) => {
		const removed = await tx
			.delete(sightingFiles)
			.where(eq(sightingFiles.sightingId, sightingId))
			.returning({ filePath: sightingFiles.filePath });
		await tx.insert(sightingFiles).values(fileData);
		return removed.map((file) => file.filePath);
	});

	// Nur Dateien löschen, die in der neuen Liste nicht mehr vorkommen —
	// unveränderte Dateien wurden gerade nur neu verknüpft.
	const keptPaths = new Set(fileData.map((file) => file.filePath));
	await deleteStoredFiles(removedPaths.filter((filePath) => !keptPaths.has(filePath)));

	logger.info(
		{
			sightingId,
			referenceId,
			fileCount: uploadedFiles.length
		},
		'Datei-Referenzen erfolgreich gespeichert'
	);
};

/**
 * Interface für Statistik-Daten der FormHelp-Komponente
 *
 * Alle Werte beziehen sich auf **einen** Freigabestatus — siehe `scope` in
 * `getSightingStatistics`. Eine Instanz vermischt nie freigegebene und offene
 * Sichtungen.
 */
export interface SightingStatistics {
	totalSightings: number;
	completionRate: number;
	averageOptionalFields: number;
	yearsOfService: number;
	uniqueUsers: number;
	sightingsWithMedia: number;
	deadAnimalsFound: number;
}

/**
 * Nach Freigabestatus getrennte Statistiken (`scope: 'both'`).
 *
 * Bewusst **ohne** aggregierte Gesamtwerte: Eine Summe aus beiden Töpfen wäre
 * genau die Zahl, die das Meeresmuseum nicht mehr sehen will.
 */
export interface SightingStatisticsByScope {
	approved: SightingStatistics;
	pending: SightingStatistics;
}

/**
 * Untere Plausibilitätsgrenze für Sichtungsdaten.
 *
 * 280 Datensätze liegen auf dem Epoch-Platzhalter `1970-01-01 01:00:00` — das
 * sind fehlerhafte Importe, keine Sichtungen aus dem Jahr 1970. Sie zählen in
 * Statistiken nicht mit. Die älteste echte Sichtung stammt von 2002, zwischen
 * 1970 und 2002 liegt kein einziger Datensatz; die Grenze ist deshalb bewusst
 * in diese Lücke gelegt.
 *
 * Vorher wurde auf Gleichheit mit `new Date(0)` + `setHours(2)` verglichen.
 * `setHours` arbeitet in der lokalen Zeitzone: in Europe/Berlin traf das die
 * Datensätze, in einem UTC-Container (Produktion setzt kein `TZ`) nicht — dort
 * wurde Epoch mitgezählt und `yearsOfService` sprang von 24 auf ~56 Jahre.
 * Die feste UTC-Grenze ist zeitzonenunabhängig.
 */
export const EARLIEST_PLAUSIBLE_SIGHTING_DATE = new Date('1990-01-01T00:00:00Z');

/**
 * Ermittelt statistische Daten über Sichtungen — getrennt nach Freigabestatus
 *
 * Der Freigabestatus ist **Teil der Signatur**, damit ein Aufrufer sich nicht
 * versehentlich ungefiltert bedienen kann. Der Default ist die sichere
 * Variante: nur freigegebene Sichtungen, also dieselbe Grundmenge wie die
 * öffentliche Karte (`/sichtungen/showreports.json`).
 *
 * @param scope `'approved'` (Default, öffentlich) | `'pending'` (offene
 *   Meldungen, nur Admin) | `'both'` (beide Werte **getrennt**, nie als Summe)
 * @returns Promise mit statistischen Daten
 * @throws {Error} Bei Datenbankfehlern — bewusst kein Fallback mit erfundenen
 *   Zahlen, siehe `collectStatisticsForScope`.
 *
 * @example
 * const stats = await getSightingStatistics(); // nur freigegebene
 * const beide = await getSightingStatistics('both');
 * console.log(`${beide.approved.totalSightings} freigegeben / ${beide.pending.totalSightings} offen`);
 */
// Reihenfolge beachten: Die `'both'`-Überladung steht zuerst, damit sie für das
// Literal greift. Die Einzel-Status-Überladung steht zuletzt und ist damit die,
// die `vi.mocked(...)` in Tests sieht — dort wird der öffentliche Fall gemockt.
export async function getSightingStatistics(scope: 'both'): Promise<SightingStatisticsByScope>;
export async function getSightingStatistics(
	scope?: ResolvedSightingScope
): Promise<SightingStatistics>;
export async function getSightingStatistics(
	scope: SightingScope = 'approved'
): Promise<SightingStatistics | SightingStatisticsByScope> {
	if (scope === 'both') {
		// Zwei getrennte Läufe statt einer Abfrage mit CASE-Aggregaten: So kann
		// per Konstruktion keine vermischte Summe entstehen.
		const [approved, pending] = await Promise.all([
			collectStatisticsForScope('approved'),
			collectStatisticsForScope('pending')
		]);
		return { approved, pending };
	}

	return collectStatisticsForScope(scope);
}

/**
 * Führt alle Statistik-Abfragen für **einen** Freigabestatus aus
 *
 * Jede einzelne Abfrage trägt den Freigabefilter — auch die Medien-Abfrage,
 * die dafür über `sichtungen` joinen muss (`sichtungen_dateien` kennt
 * `freigegeben_am` nicht).
 *
 * Wirft bei Datenbankfehlern weiter, statt Platzhalterzahlen zurückzugeben:
 * Ein Fallback wie „2.847 Sichtungen" landete sonst mit HTTP 200 im
 * Bürgerformular und wäre dort von echten Museumszahlen nicht zu
 * unterscheiden. Die Anzeige hat für diesen Fall einen eigenen Zweig
 * („Statistiken konnten nicht geladen werden").
 */
async function collectStatisticsForScope(
	scope: ResolvedSightingScope
): Promise<SightingStatistics> {
	const approval = approvalFilter(scope);

	/** Verknüpft den Freigabefilter mit den abfragespezifischen Bedingungen. */
	const withApproval = (...conditions: SQL[]): SQL => and(approval, ...conditions) as SQL;

	try {
		logger.info({ scope }, 'Ermittle Sichtungs-Statistiken');

		// Gesamtanzahl Sichtungen
		const [totalResult] = await db.select({ count: count() }).from(sightings).where(approval);

		const totalSightings = totalResult?.count || 0;

		// Sichtungen mit Medien: über `sichtungen` joinen, weil die Datei-Tabelle
		// den Freigabestatus nicht kennt. `countDistinct` zählt Sichtungen, nicht
		// Dateien — sonst überstiege der Medienanteil bei Mehrfach-Uploads 100 %.
		const [mediaResult] = await db
			.select({ count: countDistinct(sightingFiles.sightingId) })
			.from(sightingFiles)
			.innerJoin(sightings, eq(sightingFiles.sightingId, sightings.id))
			.where(approval);

		const sightingsWithMedia = mediaResult?.count || 0;

		// Completion Rate (Prozentsatz der Sichtungen mit mindestens 8 ausgefüllten optionalen Feldern)
		const completionRateQuery = await db
			.select({ count: count() })
			.from(sightings)
			.where(
				withApproval(
					sql`(
					CASE WHEN ${sightings.seaState} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.visibility} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.windDirection} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.windForce} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.behavior} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.distribution} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.reaction} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.shipCount} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.shipName} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.boatType} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.sightingDate} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.notes} IS NOT NULL THEN 1 ELSE 0 END
				) >= 8`
				)
			);

		const completeSightings = completionRateQuery[0]?.count || 0;
		const completionRate =
			totalSightings > 0 ? Math.round((completeSightings / totalSightings) * 100) : 0;

		// Durchschnittliche Anzahl ausgefüllter optionaler Felder
		const avgOptionalQuery = await db
			.select({
				avg: sql<number>`ROUND(AVG(
					CASE WHEN ${sightings.seaState} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.visibility} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.windDirection} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.windForce} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.behavior} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.distribution} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.reaction} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.shipCount} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.shipName} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.boatType} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.sightingDate} IS NOT NULL THEN 1 ELSE 0 END +
					CASE WHEN ${sightings.notes} IS NOT NULL THEN 1 ELSE 0 END
				))`
			})
			.from(sightings)
			.where(approval);

		// `ROUND(AVG(...))` liefert Postgres-`numeric`, der Treiber gibt das als
		// String zurück — die `sql<number>`-Annotation ist an dieser Stelle also
		// unzutreffend. Ohne die Konvertierung stünde im JSON `"8"` statt `8`,
		// was die OpenAPI-Spec (`type: number`) verletzt. Der Contract-Test merkt
		// das nicht, weil er das Repository mit Zahlen mockt.
		const averageOptionalFields = Number(avgOptionalQuery[0]?.avg ?? 0);

		// Jahre seit der ersten Sichtung. Der Epoch-Ausschluss gilt zusätzlich zum
		// Freigabefilter — die 1970er-Platzhalter sind fehlerhafte Importe.
		const firstSightingQuery = await db
			.select({
				minDate: sql<string>`MIN(${sightings.sightingDate})`
			})
			.from(sightings)
			.where(withApproval(gte(sightings.sightingDate, EARLIEST_PLAUSIBLE_SIGHTING_DATE)));

		const firstSighting = firstSightingQuery[0]?.minDate;
		const yearsOfService = firstSighting
			? new Date().getFullYear() - new Date(firstSighting).getFullYear()
			: 0;

		// Anzahl einzigartige Schiffe.
		// Der Leerstring wird mit ausgeschlossen: `SELECT DISTINCT` zählt ihn sonst als
		// eigenen Wert und damit als zusätzliche "Person". `/about` und die
		// Admin-Statistik filtern ihn seit jeher weg — ohne diese Bedingung lieferten
		// zwei öffentliche Flächen unterschiedliche Personenzahlen, sobald ein
		// Leerstring in die Tabelle käme (aktuell steht dort keiner).
		const uniqueUsersQuery = await db.select({ count: count() }).from(
			db
				.selectDistinct({ email: sightings.email })
				.from(sightings)
				.where(withApproval(isNotNull(sightings.email), ne(sightings.email, '')))
				.as('unique_ships')
		);

		const uniqueUsers = uniqueUsersQuery[0]?.count || 0;

		// Anzahl Totfunde
		const deadAnimalsQuery = await db
			.select({ count: count() })
			.from(sightings)
			.where(withApproval(eq(sightings.isDead, 1)));

		const deadAnimalsFound = deadAnimalsQuery[0]?.count || 0;

		const statistics: SightingStatistics = {
			totalSightings,
			completionRate,
			averageOptionalFields,
			yearsOfService: Math.max(yearsOfService, 1), // Mindestens 1 Jahr anzeigen
			uniqueUsers,
			sightingsWithMedia,
			deadAnimalsFound
		};

		logger.info(
			{
				scope,
				totalSightings,
				completionRate,
				averageOptionalFields,
				yearsOfService: statistics.yearsOfService,
				uniqueUsers,
				sightingsWithMedia,
				deadAnimalsFound
			},
			'Sichtungs-Statistiken erfolgreich ermittelt'
		);

		return statistics;
	} catch (error) {
		logger.error({ error, scope }, 'Fehler beim Ermitteln der Sichtungs-Statistiken');

		// Bewusst kein Fallback mit erfundenen Zahlen: Die frühere Variante gab
		// „2.847 Sichtungen / 89 % / 15 Jahre" zurück, was der API-Endpunkt mit
		// HTTP 200 auslieferte — im Bürgerformular nicht von echten Zahlen des
		// Meeresmuseums zu unterscheiden. Der Aufrufer entscheidet, was er bei
		// einem Ausfall anzeigt.
		throw error;
	}
}

/**
 * Ruft eine Sichtung anhand der ReferenzID ab
 *
 * Diese Funktion sucht nach einer Sichtung in der Datenbank anhand
 * ihrer eindeutigen ReferenzID und gibt die vollständigen Sichtungsdaten zurück.
 *
 * @param referenceId Die ReferenzID der zu suchenden Sichtung
 * @returns Sichtungsdaten oder null wenn nicht gefunden
 *
 * @example
 * const sighting = await getSightingByReferenceId('REF-2024-001');
 * if (sighting) {
 *   console.log(`Sichtung gefunden: ID ${sighting.id}`);
 * }
 *
 * @throws {Error} Bei Datenbankfehlern
 */
export const getSightingByReferenceId = async (referenceId: string) => {
	try {
		logger.info({ referenceId }, 'Suche Sichtung anhand ReferenzID');

		const result = await db
			.select()
			.from(sightings)
			.where(eq(sightings.referenceId, referenceId))
			.limit(1);

		const sighting = result[0] || null;

		if (sighting) {
			logger.info({ sightingId: sighting.id, referenceId }, 'Sichtung anhand ReferenzID gefunden');
		} else {
			logger.warn({ referenceId }, 'Keine Sichtung mit dieser ReferenzID gefunden');
		}

		return sighting;
	} catch (error) {
		logger.error({ error, referenceId }, 'Fehler beim Suchen der Sichtung anhand ReferenzID');
		throw error;
	}
};

/**
 * Lädt eine Sichtung mit Wetterdaten anhand der ID (Issue #110)
 *
 * @param sightingId ID der zu ladenden Sichtung
 * @returns Sichtung mit Wetterdaten oder null wenn nicht gefunden
 */
export const getSightingWithWeatherData = async (
	sightingId: number
): Promise<{ sighting: SightingSelect; weatherData: StoredWeatherData | null } | null> => {
	try {
		logger.info({ sightingId }, 'Lade Sichtung mit Wetterdaten');

		const result = await db.select().from(sightings).where(eq(sightings.id, sightingId)).limit(1);

		if (result.length === 0) {
			logger.warn({ sightingId }, 'Sichtung nicht gefunden');
			return null;
		}

		const sighting = result[0]!;
		const weatherData = sighting.weatherData as StoredWeatherData | null;

		logger.info({ sightingId, hasWeatherData: !!weatherData }, 'Sichtung mit Wetterdaten geladen');

		return {
			sighting,
			weatherData
		};
	} catch (error) {
		logger.error({ error, sightingId }, 'Fehler beim Laden der Sichtung mit Wetterdaten');
		throw error;
	}
};

/**
 * Aktualisiert die Wetterdaten einer bestehenden Sichtung (Issue #110)
 *
 * @param sightingId ID der zu aktualisierenden Sichtung
 * @param weatherData Neue Wetterdaten
 * @returns True wenn erfolgreich aktualisiert
 */
export const updateSightingWeatherData = async (
	sightingId: number,
	weatherData: StoredWeatherData
): Promise<boolean> => {
	try {
		logger.info(
			{ sightingId, weatherProvider: weatherData.provider, weatherDataType: weatherData.data_type },
			'Aktualisiere Wetterdaten für Sichtung'
		);

		const result = await db
			.update(sightings)
			.set({
				weatherData,
				weatherFetchedAt: new Date(weatherData.fetched_at),
				weatherProvider: weatherData.provider,
				weatherApiVersion: weatherData.api_version,
				weatherDataType: weatherData.data_type
			})
			.where(eq(sightings.id, sightingId))
			.returning({ id: sightings.id });

		const success = result.length > 0;

		logger.info({ sightingId, success }, 'Wetterdaten-Update abgeschlossen');

		return success;
	} catch (error) {
		logger.error({ error, sightingId }, 'Fehler beim Aktualisieren der Wetterdaten');
		throw error;
	}
};

/**
 * Prüft und lädt cached Wetterdaten für eine Position/Datum-Kombination (Issue #110)
 *
 * @param latitude Breitengrad der Sichtung
 * @param longitude Längengrad der Sichtung
 * @param date Datum der Sichtung (YYYY-MM-DD)
 * @returns Cached Wetterdaten oder null
 */
export const getCachedWeatherForSighting = async (
	latitude: number,
	longitude: number,
	date: string
): Promise<StoredWeatherData | null> => {
	try {
		logger.debug({ latitude, longitude, date }, 'Prüfe cached Wetterdaten');

		const cachedData = await getCachedWeatherData(latitude, longitude, date);

		if (cachedData) {
			logger.info(
				{ latitude, longitude, date, fetchedAt: cachedData.fetched_at },
				'Cached Wetterdaten gefunden'
			);
		} else {
			logger.debug({ latitude, longitude, date }, 'Keine cached Wetterdaten verfügbar');
		}

		return cachedData;
	} catch (error) {
		logger.error({ error, latitude, longitude, date }, 'Fehler beim Laden cached Wetterdaten');
		return null;
	}
};

/**
 * Loads a single sighting by its ID from the database
 *
 * @param sightingId ID of the sighting
 * @returns Sighting data or null if not found
 */
export const getSightingById = async (sightingId: number): Promise<SightingSelect | null> => {
	try {
		logger.debug({ sightingId }, 'Loading sighting by ID');

		const [sighting] = await db
			.select()
			.from(sightings)
			.where(eq(sightings.id, sightingId))
			.limit(1);

		if (sighting) {
			logger.debug({ sightingId, hasWeatherData: !!sighting.weatherData }, 'Sighting found');
		} else {
			logger.warn({ sightingId }, 'Sighting not found');
		}

		return sighting || null;
	} catch (error) {
		logger.error({ error, sightingId }, 'Error loading sighting');
		throw error;
	}
};
