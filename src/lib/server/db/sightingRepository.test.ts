/**
 * Unit Tests für sightingRepository.ts
 *
 * Testet alle Funktionen des Repository-Patterns für Sichtungen
 * mit besonderem Fokus auf Sicherheit und Edge Cases
 */
import {
	NAME_CONSENT_VERSION,
	PRIVACY_CONSENT_VERSION,
	SHIP_NAME_CONSENT_VERSION
} from '#lib/form/consent/consentVersions.ts';
import { MEDIA_CONSENT_VERSION } from '#lib/form/consent/mediaConsentVersion.ts';
import { db } from '#lib/server/db/index.ts';
import * as schema from '#lib/server/db/schema.ts';
import type { UploadedFileInfo } from '#lib/types/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	loadSightingFiles,
	saveSighting,
	saveSightingFiles,
	updateSighting
} from './sightingRepository';

// Mock dependencies
vi.mock('#lib/server/db/index.ts', () => {
	const db: Record<string, any> = {
		insert: vi.fn(),
		update: vi.fn(),
		select: vi.fn(),
		execute: vi.fn(),
		delete: vi.fn(() => ({
			// saveSightingFiles liest die Pfade der entfernten Zeilen per returning()
			where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) }))
		})),
		// transaction runs the callback with the same mock so existing assertions work
		transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db))
	};
	return { db };
});

vi.mock('./mapFormToSighting', () => ({
	// Der Mock muss die Nachweisspalten der Einwilligungen mit erzeugen — sonst
	// prüft der Test „Nachweisspalten vom Update ausschließen" ins Leere: Was der
	// Mapper nie liefert, kann das Update auch nicht schreiben.
	mapFormToSighting: vi.fn((formData) => {
		const proof = (granted: unknown, version: string) =>
			granted ? { at: new Date(), version } : { at: null, version: null };
		const name = proof(formData.nameConsent, NAME_CONSENT_VERSION);
		const ship = proof(formData.shipNameConsent, SHIP_NAME_CONSENT_VERSION);
		const privacy = proof(formData.privacyConsent, PRIVACY_CONSENT_VERSION);
		const media = proof(formData.mediaConsent, MEDIA_CONSENT_VERSION);
		return {
			id: 1,
			...formData,
			// `Date`, nicht `toISOString()`: Die echte Implementierung liefert hier
			// ein Date-Objekt (`mapFormToSighting.ts`). Ein String im Mock ließe
			// Typ- und Serialisierungsfehler im Insert/Update-Payload durchrutschen.
			created: new Date(),
			approvedAt: null,
			nameConsentAt: name.at,
			nameConsentVersion: name.version,
			shipNameConsentAt: ship.at,
			shipNameConsentVersion: ship.version,
			privacyConsentAt: privacy.at,
			privacyConsentVersion: privacy.version,
			mediaConsentAt: media.at,
			mediaConsentVersion: media.version
		};
	})
}));

vi.mock('#lib/server/storage/factory.ts', () => ({
	isCloudStorage: vi.fn(() => false),
	getStorageProvider: vi.fn(() => ({
		getUrl: vi.fn((path) => `/uploads/${path}`),
		delete: vi.fn().mockResolvedValue(undefined)
	}))
}));
// vi.hoisted ensures this runs before the hoisted vi.mock factory
const { readImageExifDataMock } = vi.hoisted(() => ({
	readImageExifDataMock: vi.fn(() =>
		Promise.resolve({
			latitude: 54.123,
			longitude: 12.456,
			make: 'TestCamera',
			model: 'Model X'
		})
	)
}));

vi.mock('#lib/server/media/exifUtils.ts', () => ({
	isImageFile: vi.fn((mimeType: string | undefined) => mimeType?.startsWith('image/')),
	readImageExifData: readImageExifDataMock
}));

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}))
}));

describe('sightingRepository', () => {
	/**
	 * Test-Daten Setup
	 */
	// Mock-Formulardaten f\u00fcr Tests
	// Verwende 'any' f\u00fcr Tests, da das vollst\u00e4ndige Schema sehr komplex ist
	const mockFormData: any = {
		referenceId: 'test-ref-123',
		species: 'Schweinswal',
		date: '2024-01-15',
		time: '14:30',
		latitude: 54.5,
		longitude: 12.3,
		location: 'Testort',
		observerName: 'Max Mustermann',
		observerEmail: 'test@example.com',
		uploadedFiles: []
	};

	const mockUploadedFile: UploadedFileInfo = {
		uid: 'file-1',
		originalName: 'test.jpg',
		fileName: 'test-123.jpg',
		filePath: 'uploads/test-123.jpg',
		url: '/uploads/test-123.jpg',
		size: 1024000,
		mimeType: 'image/jpeg',
		uploadedAt: new Date().toISOString(),
		exifData: null
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('saveSighting', () => {
		/**
		 * Test: Erfolgreiche Speicherung einer Sichtung ohne Dateien
		 */
		it('sollte eine Sichtung ohne Dateien erfolgreich speichern', async () => {
			// Arrange
			const mockDb = db as any;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: 42 }])
				})
			});

			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: 42 }])
					})
				})
			});

			// Act
			const result = await saveSighting(mockFormData);

			// Assert
			expect(result).toEqual({ id: 42 });
			expect(mockDb.insert).toHaveBeenCalledWith(schema.sightings);
		});

		it('persistiert das Spam-Ergebnis in den Spalten spamScore/spamIndicators', async () => {
			const mockDb = db as any;
			let capturedValues: Record<string, unknown> | undefined;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockImplementation((data) => {
					capturedValues = data;
					return { returning: vi.fn().mockResolvedValue([{ id: 42 }]) };
				})
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: 42 }])
					})
				})
			});

			await saveSighting(mockFormData, undefined, {
				score: 7,
				isHighRisk: true,
				indicators: ['Testindikator']
			});

			expect(capturedValues?.spamScore).toBe(7);
			expect(capturedValues?.spamIndicators).toEqual(['Testindikator']);
		});

		it('lässt die Spam-Spalten bei fehlgeschlagener Prüfung auf NULL statt Score 0', async () => {
			// Der Fail-Safe des Detektors liefert score 0 + isHighRisk true. Als
			// spamScore = 0 persistiert läse sich das als „geprüft, sauber" —
			// genau die Verwechslung, vor der der Schema-Kommentar warnt.
			const mockDb = db as any;
			let capturedValues: Record<string, unknown> | undefined;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockImplementation((data) => {
					capturedValues = data;
					return { returning: vi.fn().mockResolvedValue([{ id: 42 }]) };
				})
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: 42 }])
					})
				})
			});

			await saveSighting(mockFormData, undefined, {
				score: 0,
				isHighRisk: true,
				indicators: ['Spam-Prüfung fehlgeschlagen'],
				failed: true
			});

			expect(capturedValues?.spamScore).toBeUndefined();
			expect(capturedValues?.spamIndicators).toBeUndefined();
		});

		it('schreibt die Client-Kennung aus dem vierten Parameter in eingangs_client', async () => {
			const mockDb = db as any;
			let capturedValues: Record<string, unknown> | undefined;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockImplementation((data) => {
					capturedValues = data;
					return { returning: vi.fn().mockResolvedValue([{ id: 42 }]) };
				})
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: 42 }])
					})
				})
			});

			await saveSighting(mockFormData, undefined, undefined, 'OstSeeTiere/8');

			expect(capturedValues?.entryClient).toBe('OstSeeTiere/8');
		});

		it('lässt entryClient auf NULL, wenn kein Aufrufer eine Kennung liefert', async () => {
			// NULL heißt „vor Einführung der Spalte". Ein Default hier würde diese
			// Bedeutung auflösen, und jede Auswertung bräuchte wieder ein Datums-Gate.
			const mockDb = db as any;
			let capturedValues: Record<string, unknown> | undefined;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockImplementation((data) => {
					capturedValues = data;
					return { returning: vi.fn().mockResolvedValue([{ id: 42 }]) };
				})
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: 42 }])
					})
				})
			});

			await saveSighting(mockFormData);

			expect(capturedValues?.entryClient).toBeUndefined();
		});

		it('kürzt eine überlange Client-Kennung auf die Spaltenbreite', async () => {
			// Die 128-Zeichen-Grenze der Spalte `eingangs_client` wird hier an der
			// Schreibgrenze durchgesetzt, nicht erst bei den Aufrufern: Ein roher
			// User-Agent, der ungekürzt durchgereicht wird, ließe sonst den Insert
			// mit einem DB-Fehler scheitern — und dabei ginge die ganze Meldung
			// verloren, nicht bloß die Herkunftsnotiz.
			const mockDb = db as any;
			let capturedValues: Record<string, unknown> | undefined;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockImplementation((data) => {
					capturedValues = data;
					return { returning: vi.fn().mockResolvedValue([{ id: 42 }]) };
				})
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: 42 }])
					})
				})
			});

			const overlong = 'A'.repeat(200);
			await saveSighting(mockFormData, undefined, undefined, overlong);

			expect(typeof capturedValues?.entryClient).toBe('string');
			const stored = capturedValues?.entryClient as string;
			expect(stored.length).toBeLessThanOrEqual(128);
			expect(stored).toBe(`${'A'.repeat(127)}…`);
		});

		/**
		 * Test: Erfolgreiche Speicherung mit Dateien
		 */
		it('sollte eine Sichtung mit Dateien erfolgreich speichern', async () => {
			// Arrange
			const formDataWithFiles = {
				...mockFormData,
				uploadedFiles: [mockUploadedFile]
			};

			const mockDb = db as any;
			mockDb.insert.mockImplementation((table: any) => ({
				values: vi.fn().mockImplementation((_data) => {
					if (table === schema.sightings) {
						return {
							returning: vi.fn().mockResolvedValue([{ id: 100 }])
						};
					}
					// Für sightingFiles
					return Promise.resolve();
				})
			}));
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: 42 }])
					})
				})
			});

			// Act
			const result = await saveSighting(formDataWithFiles);

			// Assert
			expect(result).toEqual({ id: 100 });
			expect(mockDb.insert).toHaveBeenCalledTimes(1);
			expect(mockDb.insert).toHaveBeenNthCalledWith(1, schema.sightings);
			expect(mockDb.update).toHaveBeenCalledTimes(1);
		});

		/**
		 * Test: Fehlerbehandlung bei Datenbankfehler
		 */
		it('sollte Datenbankfehler korrekt propagieren', async () => {
			// Arrange
			const mockDb = db as any;
			const dbError = new Error('Database connection failed');
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockRejectedValue(dbError)
				})
			});

			// Act & Assert
			await expect(saveSighting(mockFormData)).rejects.toThrow('Database connection failed');
		});

		/**
		 * Test: Edge Case - Leere uploadedFiles Array
		 */
		it('sollte leere uploadedFiles Arrays korrekt behandeln', async () => {
			// Arrange
			const formDataWithEmptyFiles = {
				...mockFormData,
				uploadedFiles: []
			};

			const mockDb = db as any;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: 50 }])
				})
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: 42 }])
					})
				})
			});

			// Act
			const result = await saveSighting(formDataWithEmptyFiles);

			// Assert
			expect(result).toEqual({ id: 50 });
			expect(mockDb.insert).toHaveBeenCalledTimes(1); // Nur sightings, keine Files
		});

		/**
		 * Test: SQL Injection Schutz
		 */
		it('sollte gegen SQL Injection geschützt sein', async () => {
			// Arrange
			const maliciousFormData = {
				...mockFormData,
				observerName: "'; DROP TABLE sightings; --",
				location: "<script>alert('XSS')</script>"
			};

			const mockDb = db as any;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: 99 }])
				})
			});

			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: 42 }])
					})
				})
			});

			// Act
			const result = await saveSighting(maliciousFormData);

			// Assert
			expect(result).toEqual({ id: 99 });
			// Drizzle ORM sollte parametrisierte Queries verwenden
			expect(mockDb.insert).toHaveBeenCalled();
		});

		/**
		 * Test: Insert + Datei-Verknüpfung laufen in einer Transaktion
		 */
		it('sollte Insert und Datei-Verknüpfung in einer Transaktion kapseln', async () => {
			// Arrange
			const mockDb = db as any;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: 77 }])
				})
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ uid: 'file-1' }])
					})
				})
			});

			// Act
			const result = await saveSighting(mockFormData);

			// Assert
			expect(result).toEqual({ id: 77 });
			expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		});

		/**
		 * Test: Fehler bei der Datei-Verknüpfung propagiert (Rollback-Semantik)
		 */
		it('sollte Fehler propagieren wenn die Datei-Verknüpfung fehlschlägt', async () => {
			// Arrange
			const mockDb = db as any;
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: 88 }])
				})
			});
			// Die Datei-Verknüpfung (update) wirft -> gesamte Transaktion muss scheitern
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockRejectedValue(new Error('Update failed'))
					})
				})
			});

			// Act & Assert
			await expect(saveSighting(mockFormData)).rejects.toThrow('Update failed');
		});
	});

	describe('updateSighting', () => {
		/**
		 * Test: Erfolgreiche Aktualisierung
		 */
		it('sollte eine Sichtung erfolgreich aktualisieren', async () => {
			// Arrange
			const mockDb = db as any;
			const updatedData = { ...mockFormData, location: 'Neuer Ort' };

			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updatedData])
					})
				})
			});

			// Act
			const result = await updateSighting(42, mockFormData);

			// Assert
			expect(result).toBeTruthy();
			expect(mockDb.update).toHaveBeenCalledWith(schema.sightings);
		});

		/**
		 * Test: Der Prüfstatus darf NUR über /api/sightings/[id]/verify geändert
		 * werden, damit `geprueft`, `freigegeben_am` und `abgelehnt_am` nicht
		 * auseinanderlaufen. Ein Update über das Admin-Bearbeitungsformular darf
		 * ihn nicht anfassen.
		 *
		 * `abgelehnt_am`/`abgelehnt_von` gehören zum selben Vorgang: Der
		 * Verify-Endpunkt schreibt alle vier Spalten in EINEM Update und hält so
		 * die Invariante, dass Freigabe und Ablehnung nie gleichzeitig gesetzt
		 * sind. Ein zweiter Schreiber, der nur eine davon setzt, bricht sie —
		 * deshalb stehen sie hier gemeinsam in der Ausschlussliste.
		 */
		it('sollte verified, approvedAt und die Ablehnungsspalten vom Update ausschließen', async () => {
			// Arrange
			const mockDb = db as any;
			const setMock = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockFormData])
				})
			});
			mockDb.update.mockReturnValue({ set: setMock });

			// Act: Formular liefert einen gesetzten Prüf- und Ablehnungsstatus mit
			await updateSighting(42, {
				...mockFormData,
				verified: true,
				approvedAt: new Date('2026-01-01T00:00:00.000Z'),
				approvedBy: 'angreifer@example.com',
				rejectedAt: new Date('2026-01-02T00:00:00.000Z'),
				rejectedBy: 'angreifer@example.com'
			} as any);

			// Assert
			const updatePayload = setMock.mock.calls[0]?.[0];
			expect(updatePayload).toBeDefined();
			expect(updatePayload).not.toHaveProperty('verified');
			expect(updatePayload).not.toHaveProperty('approvedAt');
			expect(updatePayload).not.toHaveProperty('approvedBy');
			expect(updatePayload).not.toHaveProperty('rejectedAt');
			expect(updatePayload).not.toHaveProperty('rejectedBy');
		});

		/**
		 * Test: Der Nachweis einer Einwilligung ist ein historisches Ereignis —
		 * „Person X hat am T der Fassung V zugestimmt". Ein Admin, der einen
		 * Datensatz bearbeitet, ist nicht die betroffene Person und kann diesen
		 * Nachweis nicht erneuern. Liefe er über `mapFormToSighting`, trüge jede
		 * Bearbeitung den Bearbeitungszeitpunkt ein und behauptete damit eine
		 * Einwilligung, die es nie gab.
		 */
		it('sollte die Nachweisspalten der Einwilligungen vom Update ausschließen', async () => {
			// Arrange
			const mockDb = db as any;
			const setMock = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockFormData])
				})
			});
			mockDb.update.mockReturnValue({ set: setMock });

			// Act: Das Admin-Formular schickt die geladenen Einwilligungen mit
			await updateSighting(42, {
				...mockFormData,
				nameConsent: true,
				shipNameConsent: true,
				privacyConsent: true,
				mediaConsent: true
			} as any);

			// Assert
			const updatePayload = setMock.mock.calls[0]?.[0];
			expect(updatePayload).toBeDefined();
			for (const column of [
				'nameConsentAt',
				'nameConsentVersion',
				'shipNameConsentAt',
				'shipNameConsentVersion',
				'privacyConsentAt',
				'privacyConsentVersion',
				'mediaConsentAt',
				'mediaConsentVersion'
			]) {
				expect(updatePayload).not.toHaveProperty(column);
			}
		});

		/**
		 * Test: Auch die Flags selbst gehören nicht ins Update.
		 *
		 * Nur den Nachweis auszuschließen und das Flag schreibbar zu lassen
		 * erzeugt über `PUT /api/sightings/[id]` genau die Kombination, die der
		 * Anlege-Pfad als Fehler definiert: Flag 1 bei NULL-Nachweis. Die
		 * Invariante hinge dann allein daran, dass die Admin-Oberfläche kein
		 * Einwilligungsfeld anbietet — eine UI-Sperre als einzige Absicherung
		 * einer Datenregel.
		 *
		 * Es geht dabei nichts verloren: Einziger Aufrufer ist das
		 * Admin-Bearbeitungsformular, und das rendert `nameConsent`,
		 * `shipNameConsent` und `privacyConsent` gar nicht; `mediaConsent` ist
		 * dort gesperrt. Eine nachträglich erteilte Einwilligung braucht ohnehin
		 * einen eigenen Weg mit eigenem Nachweis.
		 */
		it('sollte auch die Einwilligungs-Flags vom Update ausschließen', async () => {
			// Arrange
			const mockDb = db as any;
			const setMock = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockFormData])
				})
			});
			mockDb.update.mockReturnValue({ set: setMock });

			// Act: Ein Aufruf am UI vorbei versucht, eine Einwilligung zu setzen
			await updateSighting(42, {
				...mockFormData,
				nameConsent: true,
				shipNameConsent: true,
				privacyConsent: true,
				mediaConsent: true
			} as any);

			// Assert
			const updatePayload = setMock.mock.calls[0]?.[0];
			for (const flag of ['nameConsent', 'shipNameConsent', 'privacyConsent', 'mediaConsent']) {
				expect(updatePayload).not.toHaveProperty(flag);
			}
		});

		/**
		 * Test: Edge Case - Negative ID
		 */
		it('sollte negative IDs ablehnen', async () => {
			// Arrange
			const mockDb = db as any;
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([])
					})
				})
			});

			// Act
			const result = await updateSighting(-1, mockFormData);

			// Assert
			expect(result).toBeUndefined();
		});

		/**
		 * Test: Edge Case - Sehr große ID
		 */
		it('sollte sehr große IDs korrekt behandeln', async () => {
			// Arrange
			const mockDb = db as any;
			const largeId = Number.MAX_SAFE_INTEGER;

			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([mockFormData])
					})
				})
			});

			// Act
			const result = await updateSighting(largeId, mockFormData);

			// Assert
			expect(result).toBeTruthy();
		});

		/**
		 * Test: Nicht existierende Sichtung
		 */
		it('sollte undefined zurückgeben wenn Sichtung nicht existiert', async () => {
			// Arrange
			const mockDb = db as any;
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([])
					})
				})
			});

			// Act
			const result = await updateSighting(999999, mockFormData);

			// Assert
			expect(result).toBeUndefined();
		});
	});

	describe('loadSightingFiles', () => {
		/**
		 * Test: Erfolgreiche Datei-Ladung mit EXIF-Daten aus DB
		 */
		it('sollte Dateien mit EXIF-Daten aus der Datenbank laden', async () => {
			// Arrange
			const mockDb = db as any;
			const mockFiles = [
				{
					id: 1,
					sightingId: 42,
					originalName: 'test.jpg',
					fileName: 'test-123.jpg',
					filePath: 'uploads/test-123.jpg',
					mimeType: 'image/jpeg',
					size: 1024000,
					url: '/uploads/test-123.jpg',
					uploadedAt: new Date().toISOString(),
					exifData: {
						latitude: 54.123,
						longitude: 12.456,
						make: 'Canon'
					}
				}
			];

			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(mockFiles)
				})
			});

			// Act
			const result = await loadSightingFiles(42);

			// Assert
			expect(result).toHaveLength(1);
			expect(result[0]?.exifData).toEqual({
				latitude: 54.123,
				longitude: 12.456,
				make: 'Canon'
			});
		});

		/**
		 * Test: Laden von Dateien ohne EXIF-Daten
		 */
		it('sollte Dateien ohne EXIF-Daten korrekt behandeln', async () => {
			// Arrange
			const mockDb = db as any;
			const mockFiles = [
				{
					id: 2,
					sightingId: 42,
					originalName: 'document.pdf',
					fileName: 'document-456.pdf',
					filePath: 'uploads/document-456.pdf',
					mimeType: 'application/pdf',
					size: 500000,
					url: null,
					uploadedAt: new Date().toISOString(),
					exifData: null
				}
			];

			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(mockFiles)
				})
			});

			// Act
			const result = await loadSightingFiles(42);

			// Assert
			expect(result).toHaveLength(1);
			expect(result[0]?.exifData).toBeNull();
			expect(result[0]?.mimeType).toBe('application/pdf');
		});

		/**
		 * Test: Edge Case - Keine Dateien gefunden
		 */
		it('sollte leeres Array zurückgeben wenn keine Dateien existieren', async () => {
			// Arrange
			const mockDb = db as any;
			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([])
				})
			});

			// Act
			const result = await loadSightingFiles(999);

			// Assert
			expect(result).toEqual([]);
		});

		/**
		 * Test: Fehlerbehandlung bei EXIF-Extraktion
		 */
		it('sollte Fehler bei EXIF-Extraktion abfangen', async () => {
			// Arrange
			const mockDb = db as any;
			const mockFiles = [
				{
					id: 3,
					sightingId: 42,
					originalName: 'corrupt.jpg',
					fileName: 'corrupt-789.jpg',
					filePath: 'uploads/corrupt-789.jpg',
					mimeType: 'image/jpeg',
					size: 100,
					url: null,
					uploadedAt: new Date().toISOString(),
					exifData: null
				}
			];

			mockDb.select.mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(mockFiles)
				})
			});

			readImageExifDataMock.mockRejectedValueOnce(new Error('Corrupt image'));

			// Act
			const result = await loadSightingFiles(42);

			// Assert
			expect(result).toHaveLength(1);
			expect(result[0]?.exifData).toBeNull(); // Fehler sollte abgefangen werden
		});
	});

	describe('saveSightingFiles', () => {
		/**
		 * Test: Erfolgreiche Speicherung mehrerer Dateien
		 */
		it('sollte mehrere Dateien erfolgreich speichern', async () => {
			// Arrange
			const mockDb = db as any;
			const files = [mockUploadedFile, { ...mockUploadedFile, uid: 'file-2' }];

			// Mock delete to return successful where chain
			mockDb.delete.mockReturnValue({
				where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) }))
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn().mockResolvedValue(undefined)
			});

			// Act
			await saveSightingFiles(42, files, 'ref-123');

			// Assert
			expect(mockDb.delete).toHaveBeenCalledWith(schema.sightingFiles);
			expect(mockDb.insert).toHaveBeenCalledWith(schema.sightingFiles);
			expect(mockDb.insert).toHaveBeenCalledTimes(1);
		});

		/**
		 * Test: Edge Case - Leere Dateiliste
		 */
		it('sollte bei leerer Dateiliste nichts tun', async () => {
			// Arrange
			const mockDb = db as any;

			// Act
			await saveSightingFiles(42, [], 'ref-123');

			// Assert
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		/**
		 * Test: Fehlerbehandlung
		 */
		it('sollte Datenbankfehler propagieren', async () => {
			// Arrange
			const mockDb = db as any;
			const dbError = new Error('Insert failed');

			// Mock delete to return successful where chain
			mockDb.delete.mockReturnValue({
				where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) }))
			});

			// Mock insert to fail
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockRejectedValue(dbError)
			});

			// Act & Assert
			await expect(saveSightingFiles(42, [mockUploadedFile], 'ref-123')).rejects.toThrow(
				'Insert failed'
			);
		});
	});
});
