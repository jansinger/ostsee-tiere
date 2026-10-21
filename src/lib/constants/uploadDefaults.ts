/**
 * Öffentliche Upload-Konfiguration (anonyme Melder).
 *
 * Diese Werte sind **Fallbacks**: Im Normalbetrieb liefert
 * `GET /api/config/upload` die Größen aus der Laufzeit-Konfiguration. Greift
 * der Fetch nicht (Offline, SSR), fällt `#lib/stores/configStore.js` hierauf
 * zurück — und dann muss gelten, dass diese Werte nie mehr versprechen, als die
 * Vorbelegung der Konfiguration hergibt. Sonst akzeptiert die Dropzone Dateien,
 * die der Server anschließend ablehnt.
 *
 * Abgesichert durch `uploadLimitConsistency.test.ts`.
 */
export const PUBLIC_UPLOAD_MAX_FILE_SIZE_MB = 10;

export const PUBLIC_UPLOAD_MAX_FILE_SIZE_BYTES = PUBLIC_UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Offline-Fallback für die Videogrenze. Gilt nur, solange
 * `GET /api/config/upload` nicht erreichbar ist — im Normalbetrieb kommt der
 * Wert aus `security.maxVideoFileSize`.
 *
 * Muss ≤ der Vorbelegung von `security.maxVideoFileSize` bleiben, sonst
 * verspricht der Fallback mehr, als der Server annimmt
 * (`uploadLimitConsistency.test.ts`).
 */
export const PUBLIC_UPLOAD_MAX_VIDEO_FILE_SIZE_MB = 100;

export const PUBLIC_UPLOAD_MAX_VIDEO_FILE_SIZE_BYTES =
	PUBLIC_UPLOAD_MAX_VIDEO_FILE_SIZE_MB * 1024 * 1024;

export const PUBLIC_UPLOAD_ALLOWED_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'video/mp4',
	'video/quicktime'
] as const;

/**
 * `accept`-Attribut für den Datei-Dialog. MIME-Typen werden zu `image/*` bzw.
 * `video/*` gruppiert — derselbe Aufbau wie `buildAccept()` in
 * `GET /api/config/upload`, damit anonyme und authentifizierte Melder denselben
 * Dialog sehen. Ein einzelner `video/mp4,video/quicktime` würde den Dialog auf
 * genau diese Container beschränken, statt alle Video-Dateien anzubieten.
 */
export const PUBLIC_UPLOAD_ACCEPT = [
	...new Set(
		PUBLIC_UPLOAD_ALLOWED_TYPES.map((type) =>
			type.startsWith('image/') ? 'image/*' : type.startsWith('video/') ? 'video/*' : type
		)
	)
].join(',');
