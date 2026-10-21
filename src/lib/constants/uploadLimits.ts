/**
 * Die eine Stelle, die aus MIME-Typ und Konfiguration eine Größengrenze macht.
 *
 * Torwächter (`POST /api/files/upload`), Auskunft (`GET /api/config/upload`)
 * und Client-Validierung (`validateFile`) rufen alle diese Funktion auf. Genau
 * das ist der Punkt: Sobald zwei Stellen selbst rechnen, laufen sie
 * auseinander, und die Dropzone nimmt Dateien an, die der Server ablehnt.
 */
import { isVideoFile } from '#lib/utils/file/fileType.ts';

export interface UploadSizeLimits {
	/** Grenze für Bilder und alles Übrige, in Bytes */
	maxFileSize: number;
	/** Grenze für `video/*`, in Bytes */
	maxVideoFileSize: number;
}

/**
 * `true`, wenn `value` als Größengrenze taugt: eine endliche, positive Zahl.
 *
 * `security.maxFileSize`/`security.maxVideoFileSize` kommen aus der DB und
 * durchlaufen nur `Number(value)` (`ServerConfigService.getNumber()`) — ohne
 * Typprüfung, weil `PUT /api/config` `value` lediglich gegen `undefined`
 * validiert. Ein nicht wandelbarer Wert wird dadurch `NaN`, ein negativer
 * oder `Infinity`-Wert kommt unverändert durch.
 */
function isValidPositiveLimit(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

/**
 * Bildet eine Größenangabe auf sich selbst ab, wenn sie taugt (endlich,
 * positiv), sonst restriktiv auf `0` — siehe Begründung an `maxUploadSizeFor()`.
 *
 * Exportiert, weil `ServerConfigService.getUploadConfig()`
 * (`#lib/services/configService.ts`) dieselbe Normalisierung für die
 * AGGREGIERTEN Größen (Einzel-, Video- und Gesamtgrenze) braucht, nicht nur
 * für die Einzeldateiprüfung hier. Vorher rechnete `getUploadConfig()`
 * `Number(...)` direkt in Bytes um; ein kaputter DB-Wert (NaN, negativ,
 * Infinity) lief so ungefiltert bis zur Gesamtgrößen-Prüfung in
 * `POST /api/files/upload` durch, wo `x > NaN` immer `false` ist — die
 * Prüfung war damit lautlos abgeschaltet, und `/api/config/upload` lieferte
 * `null` an den Client (`JSON.stringify(NaN) === 'null'`).
 */
export function normalizeUploadSize(value: number): number {
	return isValidPositiveLimit(value) ? value : 0;
}

/**
 * Liefert die erlaubte Dateigröße in Bytes für einen MIME-Typ.
 *
 * Unbekannte Typen bekommen die allgemeine (kleinere) Grenze — im Zweifel
 * restriktiv, damit ein neuer Typ nicht versehentlich die Videogrenze erbt.
 *
 * Restriktiver Fallback bei kaputter Konfiguration: Der Torwächter prüft
 * `file.size > maxSize`, und `x > NaN` ist in JavaScript IMMER `false` — eine
 * kaputte Grenze würde sich sonst wie „unbegrenzt" verhalten, nicht wie
 * „gesperrt". Eine Grenze, die keine endliche positive Zahl ist (NaN,
 * negativ, 0, Infinity), wird deshalb auf `0` abgebildet: `file.size > 0`
 * ist für jede nicht-leere Datei wahr, der Upload wird also abgelehnt, bis
 * die Konfiguration repariert ist — statt heimlich jede Größe zuzulassen.
 *
 * Diese Absicherung bleibt bestehen, obwohl `getUploadConfig()` seine drei
 * Größen inzwischen selbst normalisiert (`normalizeUploadSize()` oben):
 * `limits` kommt hier nicht nur aus der Serverkonfiguration, sondern auch aus
 * clientseitig gelieferten Presets (z. B. `getValidationPreset()` in
 * `fileValidation.ts`), die `getUploadConfig()` nie durchlaufen.
 */
export function maxUploadSizeFor(mimeType: string, limits: UploadSizeLimits): number {
	const rawLimit = isVideoFile(mimeType.toLowerCase())
		? limits.maxVideoFileSize
		: limits.maxFileSize;
	return normalizeUploadSize(rawLimit);
}
