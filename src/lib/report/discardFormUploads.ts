/**
 * @fileoverview Aufräumen der Uploads eines verworfenen Formulars.
 *
 * „Formular zurücksetzen" verwarf bis PR #717 nur den Browser-Zustand. Die
 * bereits hochgeladenen Dateien blieben unter `uploads/<referenceId>/` und als
 * Zeile in `sichtungen_dateien` liegen — ohne dass je eine Sichtung entsteht,
 * zu der sie gehören.
 *
 * Die Regel steht hier und nicht in `ModernReportForm.svelte`, weil sie zwei
 * Zusicherungen trägt, die ein Komponententest nur schwer sichtbar macht: Was
 * genau gelöscht wird, und dass der Reset weiterläuft, wenn die Löschung
 * scheitert.
 */
import { createLogger } from '#lib/logger.ts';
import type { UploadedFileInfo } from '#lib/types/index.ts';
import type { MediaStore } from '#lib/utils/media/MediaFile.svelte.ts';
import { deleteMultipleFiles } from '#lib/utils/upload/fileProcessing.ts';

const logger = createLogger('report:discard-form-uploads');

export interface DiscardFormUploadsOptions {
	/** Nur für Tests — sonst die echte Löschung über `DELETE /api/files/delete`. */
	deleteFiles?: (files: UploadedFileInfo[]) => Promise<void>;
}

/**
 * Löscht die Uploads eines verworfenen Formulars und leert den Medien-Store.
 *
 * **Synchron, absichtlich.** Der Aufrufer darf nicht auf die Antwort des Servers
 * warten: Das Zurücksetzen ist eine Zusage an den Nutzer und darf nicht daran
 * hängenbleiben, dass gerade kein Netz da ist. `deleteMultipleFiles` räumt
 * intern mit `Promise.allSettled` auf und wirft deshalb weder bei einem 403
 * noch bei einem Abbruch — der `catch` hier ist die Absicherung gegen alles,
 * was davor scheitern kann, und gegen einen Aufrufer, der diese Zusage nicht
 * hält. Was der Server nicht löscht, ist danach eine Waise und Sache von
 * `npm run media:cleanup-orphans` (Klasse A: `sichtung_id IS NULL`).
 *
 * **Der Store wird ganz geleert, nicht gefiltert.** Anders als `handleClear` in
 * `DropzoneEnhanced` (PR #716), das sich auf `ownedMediaFiles` beschränkt, weil
 * ein Klick in Schritt 1 nicht die Medien aus Schritt 2 mitnehmen darf: Der
 * Reset verwirft ausdrücklich alle Schritte. Ohne das Leeren blieben die
 * Vorschaubilder der gerade gelöschten Dateien stehen — `mediaStore` hängt an
 * `Form.svelte` und überlebt `updateInitialValues`.
 *
 * @param uploadedFiles Die Dateien aus `$form.uploadedFiles` — **vor** dem
 *   Verwerfen des Formularzustands einsammeln. Danach ist die Liste leer und
 *   niemand weiß mehr, was zu löschen war.
 * @param mediaStore Der Medien-Store des Formulars (aus dem Form-Context).
 */
export function discardFormUploads(
	uploadedFiles: readonly UploadedFileInfo[] | undefined,
	mediaStore: MediaStore,
	{ deleteFiles = deleteMultipleFiles }: DiscardFormUploadsOptions = {}
): void {
	mediaStore.mediaFiles = [];

	const files = uploadedFiles ?? [];
	if (files.length === 0) {
		return;
	}

	logger.info({ count: files.length }, 'Deleting uploads of the discarded form');

	try {
		void deleteFiles([...files]).catch((error: unknown) => {
			logger.error({ error }, 'Uploads des verworfenen Formulars konnten nicht gelöscht werden');
		});
	} catch (error) {
		logger.error({ error }, 'Uploads des verworfenen Formulars konnten nicht gelöscht werden');
	}
}
