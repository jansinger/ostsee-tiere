/**
 * Herkunft hochgeladener Dateien — „stammt aus dem Positions-Schritt?"
 *
 * Warum das überhaupt gespeichert werden muss: `$form.uploadedFiles` überlebt
 * einen Reload (sessionStorage), `mediaStore` nicht. DropzoneEnhanced baut die
 * `MediaFile`s danach aus den Formulardaten neu auf — und `UploadedFileInfo`
 * trägt die Herkunft nicht. Vorher wurde sie deshalb aus der Mount-Reihenfolge
 * geraten: Die zuerst gemountete Dropzone stempelte ihre eigene Herkunft auf
 * ALLE wiederhergestellten Dateien. Beide Richtungen waren falsch — ein Reload
 * auf Schritt 1 machte Schritt-2-Medien zum „Positions-Foto ohne GPS", ein
 * Reload auf Schritt 2+ nahm dem echten Positions-Foto seinen Hinweis.
 *
 * Bewusst **neben** den Formulardaten und nicht in ihnen: `uploadedFiles` ist
 * Teil des Yup-Schemas und wandert beim Absenden zum Server (Legacy-API-
 * Vertrag). Die Herkunft ist reine UI-Information des Browsers und hat dort
 * nichts verloren. Der Schlüssel liegt wie `FORM_DATA` in `sessionStorage` und
 * wird von `clearStorage()` mit aufgeräumt — beide leben und sterben gemeinsam.
 *
 * Die Mengen-Regeln stehen als pure Funktionen darüber, damit sie ohne Browser
 * testbar sind.
 */
import { createLogger } from '#lib/logger.ts';
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from '#lib/storage/localStorage.ts';

const logger = createLogger('positionFileOrigin');

/**
 * Speicherform.
 *
 * Ein Objekt und kein blankes Array, weil `loadFromStorage` ein gespeichertes
 * Array verwirft (Array-Guard in der Sanitisierung) und stattdessen den
 * Default zurückgäbe — die Herkunft wäre nach jedem Reload wieder weg.
 */
type PositionFileOrigin = { uids: string[] };

const EMPTY: PositionFileOrigin = { uids: [] };

/** Fügt eine uid hinzu, ohne Duplikate und ohne die Eingabe zu verändern. */
export function withPositionUid(uids: readonly string[], uid: string): string[] {
	return uids.includes(uid) ? [...uids] : [...uids, uid];
}

/** Entfernt eine uid, ohne die Eingabe zu verändern. */
export function withoutPositionUid(uids: readonly string[], uid: string): string[] {
	return uids.filter((known) => known !== uid);
}

/** True, wenn die uid als Datei des Positions-Schritts vorgemerkt ist. */
export function isPositionUid(uids: readonly string[], uid: string): boolean {
	return uids.includes(uid);
}

/**
 * Der Zugriff auf `sessionStorage` darf nach außen nie werfen.
 *
 * `setItem` wirft einen `SecurityError`, wenn der Browser den Speicherzugriff
 * sperrt (Chrome „alle Cookies blockieren", abgeschottetes Safari), und einen
 * `QuotaExceededError`, wenn er voll ist; schon der reine *Zugriff* auf
 * `sessionStorage` kann in diesen Modi werfen, `getItem` also ebenso.
 *
 * Die Vormerkung ist reine UI-Information des Browsers. Ihr Verlust kostet
 * höchstens den GPS-Hinweis nach einem Reload — eine durchgereichte Ausnahme
 * kostet dagegen den Upload: `markPositionFile` läuft in `handleFilesAdded`,
 * das `UnifiedDropzone.svelte` ohne `await` aufruft, sodass die Ablehnung
 * niemanden erreicht und `updateMediaFiles(...)` nie läuft — für den Nutzer tut
 * die Dropzone dann einfach nichts. `loadPositionUids` läuft im `$effect.pre`
 * von `DropzoneEnhanced` und damit mitten im Rendern.
 */
function withoutThrowing<T>(operation: () => T, fallback: T, action: string): T {
	try {
		return operation();
	} catch (error) {
		logger.warn(
			{ error, action },
			'Herkunft der Positions-Datei konnte nicht gelesen/geschrieben werden'
		);
		return fallback;
	}
}

/**
 * Liest die vorgemerkten uids. Einmal je Wiederherstellungslauf aufrufen und
 * das Ergebnis an `isPositionUid` weiterreichen, statt pro Datei zu laden.
 */
export function loadPositionUids(): string[] {
	return withoutThrowing(
		() => {
			const stored = loadFromStorage<PositionFileOrigin>(STORAGE_KEYS.POSITION_FILE_UIDS, EMPTY);
			return Array.isArray(stored.uids) ? stored.uids.filter((uid) => typeof uid === 'string') : [];
		},
		[],
		'load'
	);
}

/** Merkt eine Datei als Datei des Positions-Schritts vor. */
export function markPositionFile(uid: string): void {
	withoutThrowing(
		() =>
			saveToStorage(STORAGE_KEYS.POSITION_FILE_UIDS, {
				uids: withPositionUid(loadPositionUids(), uid)
			}),
		undefined,
		'mark'
	);
}

/** Nimmt die Vormerkung zurück — beim Löschen der Datei. */
export function unmarkPositionFile(uid: string): void {
	withoutThrowing(
		() =>
			saveToStorage(STORAGE_KEYS.POSITION_FILE_UIDS, {
				uids: withoutPositionUid(loadPositionUids(), uid)
			}),
		undefined,
		'unmark'
	);
}
