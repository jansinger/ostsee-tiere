import * as m from '#lib/paraglide/messages.js';
import { createLogger } from '#lib/logger.ts';
import type { UploadedFileInfo } from '#lib/types/index.ts';

const logger = createLogger('UploadUtils');

export interface UploadProgress {
	loadedBytes: number;
	totalBytes: number;
	/** 0–100, gerundet */
	percent: number;
}

export interface UploadHandle {
	result: Promise<UploadedFileInfo>;
	abort(): void;
}

/**
 * Direkter Upload einer Datei mit Fortschrittsmeldung.
 *
 * Bewusst `XMLHttpRequest` und nicht `fetch`: `fetch` kennt kein Ereignis für
 * den Fortschritt des REQUEST-Bodys. Solange nur Fotos von wenigen MB
 * hochgeladen wurden, genügte ein Spinner. Ein 100-MB-Video braucht über
 * Mobilfunk 3 bis 13 Minuten — ohne Prozentanzeige hält der Melder die
 * Übertragung für hängengeblieben und bricht ab.
 *
 * (Die Alternative wäre ein `ReadableStream` als `fetch`-Body mit
 * `duplex: 'half'`. Das unterstützt Safari bis heute nicht und träfe damit
 * genau die iPhone-Melder, um die es hier geht.)
 */
export function uploadFileDirect(
	file: File,
	referenceId: string,
	uid: string,
	onProgress?: (progress: UploadProgress) => void
): UploadHandle {
	logger.info({ fileName: file.name, referenceId, uid }, 'Starting direct upload');

	if (!referenceId) {
		throw new Error('Reference ID ist erforderlich für Upload');
	}

	const formData = new FormData();
	formData.append('file', file);
	formData.append('referenceId', referenceId);
	formData.append('uid', uid);

	const xhr = new XMLHttpRequest();

	const result = new Promise<UploadedFileInfo>((resolve, reject) => {
		xhr.upload.onprogress = (event) => {
			if (!event.lengthComputable) return;
			onProgress?.({
				loadedBytes: event.loaded,
				totalBytes: event.total,
				percent: Math.round((event.loaded / event.total) * 100)
			});
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					resolve(JSON.parse(xhr.responseText) as UploadedFileInfo);
				} catch (error) {
					logger.error({ error, fileName: file.name }, 'Upload response was not valid JSON');
					reject(new Error(m.utils_uploadutils_text_unerwartete_antwort_des_servers()));
				}
				return;
			}

			// Die Fehlermeldung des Servers ist die brauchbare — sie nennt die
			// tatsächliche Größe und den Ausweg (Task 12).
			let message = m.constants_upload_text_upload_fehlgeschlagen_versuchen_sie_es_e();
			try {
				const body = JSON.parse(xhr.responseText);
				message = body.message ?? body.error?.message ?? message;
			} catch {
				// Antwort ohne JSON-Körper — etwa wenn BODY_SIZE_LIMIT greift,
				// bevor die Route läuft. Dann bleibt der Standardtext.
			}
			logger.warn({ status: xhr.status, fileName: file.name }, 'Upload rejected by server');
			reject(new Error(message));
		};

		xhr.onerror = () =>
			reject(new Error(m.utils_uploadutils_text_verbindung_zum_server_unterbrochen()));
		xhr.onabort = () => reject(new Error(m.utils_uploadutils_text_upload_abgebrochen()));

		xhr.open('POST', '/api/files/upload');
		xhr.send(formData);
	});

	return { result, abort: () => xhr.abort() };
}

/**
 * Direktes Löschen einer Datei vom Server
 */
export async function deleteFileDirect(filePath: string): Promise<void> {
	logger.info({ filePath }, 'Starting direct delete');

	const response = await fetch('/api/files/delete', {
		method: 'DELETE',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ filePath })
	});

	logger.info(
		{
			filePath,
			status: response.status,
			ok: response.ok
		},
		'Delete response received'
	);

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		logger.error({ errorData, status: response.status }, 'Delete failed');
		throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
	}

	const result = await response.json();
	logger.info({ filePath, result }, 'Delete completed successfully');
	return result;
}
