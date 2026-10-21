/**
 * @fileoverview Browser-Storage-Management für Formulardaten
 *
 * Dieses Modul implementiert ein intelligentes Storage-System für die
 * Sichtungsformulare, das zwischen sessionStorage und localStorage
 * unterscheidet basierend auf Datentyp und Benutzer-Einwilligung.
 *
 * Es bietet DSGVO-konforme Speicherung mit automatischer Bereinigung
 * und unterstützt sowohl temporäre (Session) als auch persistente
 * Datenspeicherung je nach Nutzer-Präferenzen.
 *
 * @author Ostsee-Tiere Team
 * @since 1.0.0
 */

import { browser } from '$app/env';
import type { UserContactData } from '#lib/types/index.ts';

/**
 * Default-Objekt für UserContactData — dient als Whitelist-Template
 * für loadFromStorage-Sanitization. Nur diese Felder werden beim
 * Laden aus Storage akzeptiert, alle anderen verworfen.
 */
const USER_CONTACT_DEFAULTS: UserContactData = {
	firstName: '',
	lastName: '',
	email: '',
	phone: '',
	shipName: '',
	homePort: '',
	boatType: '',
	nameConsent: false,
	shipNameConsent: false,
	persistentDataConsent: false
};

/**
 * Konstanten für Storage-Schlüssel mit Namespace-Präfix
 * Verhindert Konflikte mit anderen Anwendungen im gleichen Domain
 */
export const STORAGE_KEYS = {
	CURRENT_STEP: 'sichtungen_current_step', // Aktueller Formular-Schritt
	FORM_DATA: 'sichtungen_form_data', // Hauptformulardaten
	// 'alive' | 'dead'. Fehlt der Schlüssel, wurde die Frage noch nie gestellt —
	// `isDead` kann das nicht ausdrücken, weil es als Boolean auf `false` steht.
	//
	// sessionStorage, nicht localStorage (Abschlussreview B3, 2026-08-06): Der
	// Zweig beschreibt DIESE Formulardaten und darf ihre Lebensdauer nicht
	// überdauern — sonst wird die Einstiegsfrage pro Browser nur einmal
	// gestellt, auch Wochen später für ein anderes Tier. `sessionKeys` unten
	// entscheidet den tatsächlichen Storage-Typ; dieser Kommentar beschreibt
	// nur noch die Semantik, nicht mehr den Ort.
	REPORT_KIND: 'sichtungen_report_kind',
	// uids der Dateien aus dem Positions-Schritt (siehe positionFileOrigin.ts).
	// Gehört zu FORM_DATA und muss dessen Lebensdauer teilen — sonst verlöre eine
	// wiederhergestellte Datei ihre Herkunft.
	POSITION_FILE_UIDS: 'sichtungen_position_file_uids',
	USER_CONTACT_DATA: 'sichtungen_user_contact_data' // Benutzer-Kontaktdaten
};

/**
 * Schlüssel für sessionStorage (temporäre Session-Daten)
 * Diese Daten werden beim Schließen des Browsers automatisch gelöscht
 */
const sessionKeys = [
	STORAGE_KEYS.FORM_DATA,
	STORAGE_KEYS.CURRENT_STEP,
	STORAGE_KEYS.POSITION_FILE_UIDS,
	STORAGE_KEYS.REPORT_KIND
];

/**
 * Intelligente Storage-Zugriffsfunktion
 * Entscheidet automatisch zwischen sessionStorage und localStorage
 * basierend auf dem Schlüssel-Typ
 */
function getItem(key: string): string | null {
	// Server-side Rendering Schutz
	if (!browser) return null;

	let stored;
	if (sessionKeys.includes(key)) {
		stored = sessionStorage.getItem(key); // Temporäre Session-Daten
	} else {
		stored = localStorage.getItem(key); // Persistente Daten
	}
	return stored;
}

/**
 * Intelligente Storage-Schreibfunktion
 * Speichert automatisch im passenden Storage-Typ
 */
function setItem(key: string, value: string): void {
	// Server-side Rendering Schutz
	if (!browser) return;

	if (sessionKeys.includes(key)) {
		sessionStorage.setItem(key, value); // Session-spezifische Daten
	} else {
		localStorage.setItem(key, value); // Browser-übergreifende Persistenz
	}
}

/**
 * Lädt typsichere Daten aus dem Browser-Storage
 *
 * Diese Funktion entscheidet automatisch zwischen sessionStorage und
 * localStorage und parsed JSON-Daten sicher mit Fallback-Behandlung.
 *
 * @param key Storage-Schlüssel aus STORAGE_KEYS
 * @param defaultValue Fallback-Wert bei fehlenden oder korrupten Daten
 * @returns Geladene und geparste Daten oder Standardwert
 *
 * @example
 * const userData = loadFromStorage(STORAGE_KEYS.USER_CONTACT_DATA, {});
 *
 * @note Automatische Fehlerbehandlung bei korrupten JSON-Daten
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
	// Server-side Rendering Schutz
	if (!browser) return defaultValue;

	const stored = getItem(key);
	if (stored) {
		try {
			const parsed = JSON.parse(stored);

			// Sanitize: only accept objects when default is an object,
			// reject arrays/primitives that don't match the expected type
			if (typeof defaultValue === 'object' && defaultValue !== null) {
				if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
					console.warn(`Storage-Typfehler für ${key}: erwartet Objekt, erhalten ${typeof parsed}`);
					return defaultValue;
				}
				// Whitelist: only keep keys that exist in the default value
				// Skip filtering if default is empty (e.g. {} as UserContactData)
				const defaultKeys = Object.keys(defaultValue);
				if (defaultKeys.length > 0) {
					const sanitized: Record<string, unknown> = {};
					for (const k of defaultKeys) {
						if (k in parsed) {
							sanitized[k] = parsed[k];
						} else {
							sanitized[k] = (defaultValue as Record<string, unknown>)[k];
						}
					}
					return sanitized as T;
				}
				return parsed as T;
			}

			return parsed as T;
		} catch (e) {
			console.error(`JSON-Parse-Fehler für ${key} aus Storage:`, e);
			return defaultValue; // Fallback bei korrupten Daten
		}
	}
	return defaultValue;
}

/**
 * Speichert typsichere Daten im Browser-Storage
 *
 * Serialisiert JavaScript-Objekte automatisch zu JSON und speichert
 * sie im passenden Storage-Typ (session oder local) basierend auf dem Schlüssel.
 *
 * @param key Storage-Schlüssel aus STORAGE_KEYS
 * @param value Zu speicherndes JavaScript-Objekt (wird JSON-serialisiert)
 *
 * @example
 * saveToStorage(STORAGE_KEYS.FORM_DATA, formState);
 *
 * @note Verwendet automatisch sessionStorage für temporäre Daten
 */
export function saveToStorage<T>(key: string, value: T): void {
	// Server-side Rendering Schutz
	if (!browser) return;

	setItem(key, JSON.stringify(value)); // JSON-Serialisierung für komplexe Objekte
}

/**
 * Entfernt einen Schlüssel vollständig aus dem passenden Storage-Typ.
 *
 * Nutzt denselben session-vs-local-Dispatch wie `getItem`/`setItem`. Anders
 * als `saveToStorage(key, null)` — das den String "null" ablegen würde —
 * verschwindet der Schlüssel dabei tatsächlich aus dem Storage.
 *
 * @param key Storage-Schlüssel aus STORAGE_KEYS
 *
 * @example
 * removeFromStorage(STORAGE_KEYS.REPORT_KIND);
 */
export function removeFromStorage(key: string): void {
	// Server-side Rendering Schutz
	if (!browser) return;

	if (sessionKeys.includes(key)) {
		sessionStorage.removeItem(key);
	} else {
		localStorage.removeItem(key);
	}
}

/**
 * Bereinigt formular-relevante Daten bei Formular-Abschluss
 *
 * Löscht alle temporären Formulardaten aber behält Benutzer-Kontaktdaten
 * für zukünftige Formulare (außer bei expliziter Widerspruch).
 * Respektiert DSGVO-Anforderungen zur Datenlöschung.
 *
 * @example
 * clearStorage(); // Nach erfolgreicher Formular-Übermittlung
 *
 * @note Erhält USER_CONTACT_DATA für Benutzerfreundlichkeit
 */
export function clearStorage(): void {
	// Server-side Rendering Schutz
	if (!browser) return;

	// Lösche alle Schlüssel außer persistenten Kontaktdaten
	const keysToClear = Object.values(STORAGE_KEYS).filter(
		(key) => key !== STORAGE_KEYS.USER_CONTACT_DATA
	);

	keysToClear.forEach((key) => {
		// Storage-Typ-spezifische Löschung
		if (sessionKeys.includes(key)) {
			sessionStorage.removeItem(key); // Session-Daten löschen
		} else {
			localStorage.removeItem(key); // Persistente Daten löschen
		}
	});
}

/**
 * Teilweise Datenbereinigung - behält Navigation und Kontakte
 *
 * Löscht nur die eigentlichen Formulardaten aber erhält den aktuellen
 * Schritt und Benutzer-Kontaktdaten für bessere User Experience.
 *
 * @example
 * clearFormDataOnly(); // Beim Formular-Reset ohne Navigation-Verlust
 */
export function clearFormDataOnly(): void {
	// Server-side Rendering Schutz
	if (!browser) return;

	// Nur Hauptformulardaten löschen (liegt in sessionStorage)
	sessionStorage.removeItem(STORAGE_KEYS.FORM_DATA);
	// Die Datei-Herkunft gehört zu den Formulardaten (positionFileOrigin.ts):
	// bleibt sie stehen, erbt eine später hochgeladene Datei mit derselben uid
	// eine fremde Herkunft.
	sessionStorage.removeItem(STORAGE_KEYS.POSITION_FILE_UIDS);
	// Der Zweig (Abschlussreview B3) beschreibt genau diese Formulardaten und
	// räumt deshalb mit ihnen auf — nicht erst, wenn ein Aufrufer explizit
	// `removeFromStorage(STORAGE_KEYS.REPORT_KIND)` nachholt.
	sessionStorage.removeItem(STORAGE_KEYS.REPORT_KIND);
}

/**
 * Speichert Benutzer-Kontaktdaten persistent im localStorage
 *
 * Diese Daten überleben Formular-Resets und Browser-Sessions um
 * das Ausfüllen zukünftiger Formulare zu vereinfachen.
 *
 * @param contactData Vollständige Kontaktdaten des Benutzers
 *
 * @example
 * saveUserContactData({ firstName: 'Max', lastName: 'Mustermann', ... });
 */
export function saveUserContactData(contactData: UserContactData): void {
	saveToStorage(STORAGE_KEYS.USER_CONTACT_DATA, contactData);
}

/**
 * Lädt gespeicherte Benutzer-Kontaktdaten aus localStorage
 *
 * Ermöglicht automatisches Vorausfüllen von Kontaktfeldern
 * in neuen Formularen für verbesserte Benutzerfreundlichkeit.
 *
 * @returns Gespeicherte Kontaktdaten oder leeres Objekt
 *
 * @example
 * const contacts = loadUserContactData();
 * if (contacts.email) setFormField('email', contacts.email);
 */
export function loadUserContactData(): UserContactData {
	if (!browser) return {} as UserContactData;
	// Check sessionStorage first (consent-free session data), then fall back to localStorage
	const sessionRaw = sessionStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA);
	if (sessionRaw) {
		try {
			const parsed = JSON.parse(sessionRaw);
			// Apply same whitelist sanitization as loadFromStorage
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				// Corrupt data — fall through to localStorage
			} else {
				const sanitized: Record<string, unknown> = {};
				for (const k of Object.keys(USER_CONTACT_DEFAULTS)) {
					sanitized[k] =
						k in parsed ? parsed[k] : (USER_CONTACT_DEFAULTS as Record<string, unknown>)[k];
				}
				return sanitized as UserContactData;
			}
		} catch {
			// ignore parse errors, fall through to localStorage
		}
	}
	return loadFromStorage(STORAGE_KEYS.USER_CONTACT_DATA, USER_CONTACT_DEFAULTS);
}

/**
 * Vollständige Storage-Bereinigung inklusive aller Benutzerdaten
 *
 * Löscht alle gespeicherten Daten inklusive der normalerweise
 * persistenten Benutzer-Kontaktdaten. Für DSGVO-Löschungsanfragen.
 *
 * @example
 * clearAllStorage(); // Bei Datenschutz-Löschungsanfrage
 *
 * @note Löscht auch die User-Kontaktdaten - Benutzer muss alles neu eingeben
 */
/**
 * Löscht ausschließlich Benutzer-Kontaktdaten aus beiden Storage-Typen.
 * Formulardaten und Navigations-State bleiben erhalten.
 * Für den "Kontaktdaten löschen"-Button in FormActions und Step4Contact.
 */
export function clearUserContactData(): void {
	if (!browser) return;
	localStorage.removeItem(STORAGE_KEYS.USER_CONTACT_DATA);
	sessionStorage.removeItem(STORAGE_KEYS.USER_CONTACT_DATA);
}

export function clearAllStorage(): void {
	if (!browser) return;

	// Vollständige Bereinigung aller namespaced Keys aus BEIDEN Storage-Typen
	Object.values(STORAGE_KEYS).forEach((key) => {
		localStorage.removeItem(key);
		sessionStorage.removeItem(key);
	});
}

/**
 * Speichert Benutzer-Kontaktdaten nur für die aktuelle Session (sessionStorage)
 *
 * Wird bei fehlendem DSGVO-Einverständnis verwendet. Daten werden automatisch
 * beim Schließen des Browsers / Tabs gelöscht.
 *
 * @param contactData Vollständige Kontaktdaten des Benutzers
 */
export function saveUserContactDataToSession(contactData: UserContactData): void {
	if (!browser) return;
	sessionStorage.setItem(STORAGE_KEYS.USER_CONTACT_DATA, JSON.stringify(contactData));
}

/**
 * DSGVO-konforme Kontaktdaten-Speicherung basierend auf Einwilligung
 *
 * Respektiert die Benutzer-Einwilligung zur persistenten Datenspeicherung:
 * - Mit Einwilligung: Persistente Speicherung in localStorage
 * - Ohne Einwilligung: Nur Session-Speicherung (automatische Löschung beim Tab-Schließen)
 *
 * @param contactData Kontaktdaten inklusive Einwilligungsstatus
 *
 * @example
 * saveUserContactDataWithConsent(contactDataWithConsent);
 *
 * @note Implementiert DSGVO-Anforderungen zur expliziten Einwilligung
 */
export function saveUserContactDataWithConsent(contactData: UserContactData): void {
	if (contactData.persistentDataConsent) {
		// Mit Einwilligung: Persistente Speicherung für zukünftige Besuche
		// Clear session copy to avoid stale duplicates
		if (browser) sessionStorage.removeItem(STORAGE_KEYS.USER_CONTACT_DATA);
		saveUserContactData(contactData);
	} else {
		// Ohne Einwilligung: Nur Session-Speicherung (automatische Löschung)
		// Clear any previously persisted localStorage data when consent is revoked
		if (browser) localStorage.removeItem(STORAGE_KEYS.USER_CONTACT_DATA);
		saveUserContactDataToSession(contactData);
	}
}
