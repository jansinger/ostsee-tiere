/**
 * Zugangsdaten in `app_config`, die den Server nicht im Klartext verlassen.
 *
 * Getrennt von `accessControl.ts`, weil es zwei verschiedene Fragen sind: Dort
 * geht es darum, **wer** eine Einstellung überhaupt sieht, hier darum, **wie**
 * ein Wert aussieht, wenn jemand sie sehen darf. Alle Schlüssel hier sind
 * ohnehin superadmin-only — die Maskierung ist keine Rechte-Ebene, sondern
 * verhindert, dass ein Passwort im Seitenquelltext, in einem Screenshot oder im
 * Browser-Cache landet.
 *
 * Aufnahmekriterium ist „ist ein Zugangsgeheimnis", nicht „klingt sensibel":
 * `email.smtp.user` und `email.smtp.host` stehen bewusst nicht hier — sie sind
 * für die Fehlersuche nötig und für sich genommen kein Zugang.
 * `integration.webhookUrl` ist ein Grenzfall (manche Dienste betten ein Token in
 * die URL); die URL ist aber ohne Sichtprüfung nicht sinnvoll pflegbar, deshalb
 * bleibt sie vorerst draußen.
 *
 * **Liegt bewusst nicht unter `$lib/server/`.** Die Settings-Seite braucht
 * `isSecretConfigKey()`, um das Passwort-Feld zu rendern; ein Import aus
 * `$lib/server/**` in Client-Code lässt SvelteKit den Build abbrechen — und zwar
 * statisch, unabhängig davon, dass nur diese eine Funktion gebraucht wird.
 * Geheim sind hier ohnehin nur die Werte, nicht die Namen der Schlüssel.
 */

/** Schlüssel, deren Wert nur maskiert ausgeliefert wird. */
export const SECRET_CONFIG_KEYS: ReadonlySet<string> = new Set([
	'email.smtp.password',
	'integration.weatherApiKey',
	'integration.geoApiKey'
]);

/**
 * Was anstelle eines gesetzten Geheimwerts ausgeliefert wird.
 *
 * Bewusst **nicht** der Leerstring: Ein leeres Feld sähe für ein gesetztes und
 * für ein fehlendes Passwort gleich aus. Wer das Feld dann anfasst und wieder
 * leert, überschreibt ein Passwort, von dem er nie wusste, dass es existierte.
 * Mit dem Platzhalter heißt gefüllt „gesetzt" und leer „nicht gesetzt".
 */
export const SECRET_PLACEHOLDER = '••••••••';

/** Ist der Wert dieses Schlüssels ein Zugangsgeheimnis? */
export function isSecretConfigKey(key: string): boolean {
	return SECRET_CONFIG_KEYS.has(key);
}

/**
 * Ersetzt gesetzte Geheimwerte durch den Platzhalter.
 *
 * Arbeitet auf Kopien — die übergebenen Objekte stammen aus dem
 * `ConfigRepository`-Cache, ein `in place`-Überschreiben würde den echten Wert
 * für nachfolgende Leser (z. B. `EmailService.initialize()`) vernichten.
 */
export function maskSecretConfigValues<T extends { key: string; value: unknown }>(
	configs: T[]
): T[] {
	return configs.map((config) => {
		if (!isSecretConfigKey(config.key)) {
			return config;
		}

		// Nur ein tatsächlich gesetzter Wert bekommt den Platzhalter; ein leerer
		// bleibt leer, damit „nicht gesetzt" erkennbar bleibt.
		const gesetzt = typeof config.value === 'string' && config.value.length > 0;

		return { ...config, value: gesetzt ? SECRET_PLACEHOLDER : '' };
	});
}

/**
 * Kommt hier der unveränderte Platzhalter zurück?
 *
 * Dann hat niemand etwas eingegeben und der Schreibvorgang muss unterbleiben —
 * sonst wäre das echte Passwort nach dem ersten Speichern durch die Punkte
 * ersetzt. Ein **leerer** Wert ist ausdrücklich kein solcher Fall: Das ist das
 * bewusste Löschen und muss durchgehen.
 */
export function isUnchangedSecret(key: string, value: unknown): boolean {
	return isSecretConfigKey(key) && value === SECRET_PLACEHOLDER;
}
