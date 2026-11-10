/**
 * Aufbewahrungsfrist des Legacy-Posteingangs (legacy-inbox/README.md).
 *
 * Der Posteingang-Dienst legt jede Meldung roh als JSON ab — mit Name,
 * E-Mail, Telefon und Anschrift. In der Datenbank werden diese Angaben
 * 3 Monate nach Eingang geleert (docs/ANONYMISIERUNG_KONZEPT.md); die Dateien
 * auf dem Plesk-Server lagen bis hierher unbefristet daneben und hätten die
 * Frist unterlaufen.
 *
 * - `importiert/` — die Meldung steht in der Datenbank, die Datei ist nur noch
 *   Herkunftsnachweis. Nach {@link IMPORTIERT_TAGE} Tagen gelöscht: lang genug,
 *   um einen fehlerhaften Import zu bemerken, und weit unter der Frist.
 * - `abgewiesen/` — die Meldung hat die Datenbank nie erreicht und wartet auf
 *   einen Menschen. Gelöscht nach derselben Frist wie in der Datenbank
 *   (3 Monate ab Eingang, ein Tag Puffer). Was bis dahin nicht gesichtet ist,
 *   darf trotzdem nicht länger liegen als dieselbe Meldung in der Datenbank.
 * - `posteingang/` — wird **nie** angefasst. Dort liegt, was noch nicht
 *   übertragen ist; eine Löschung wäre Datenverlust. Was dort über der Frist
 *   liegt oder sich nicht datieren lässt, wird nur gemeldet.
 *
 * Datiert wird über den Dateinamen, den der Dienst selbst vergibt
 * (`<lfd_nr>__<empfangen_am>.json`, siehe legacy-inbox/src/store.js) — nicht
 * über `mtime`, das ein Kopieren oder Verschieben ändert. Was sich nicht
 * datieren lässt, bleibt stehen und wird genannt.
 *
 * `lfd_nr` ermittelt der Dienst beim Start aus den vorhandenen Dateinamen.
 * Nach einem Aufräumen, das alle Dateien entfernt hat, beginnt die Zählung
 * deshalb wieder klein. Das ist harmlos: Die Nummer steht nur im Dateinamen
 * und im Protokoll, der Dateiname trägt zusätzlich den Zeitstempel, und an
 * den Client geht sie nicht.
 *
 * Reines JavaScript ohne Abhängigkeiten, damit es auf dem Plesk-Server unter
 * blankem `node` läuft — wie send-legacy-inbox.js.
 */
import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Muss `ANONYMIZE_AFTER_MONTHS` entsprechen — der Test prüft das. */
export const ABGEWIESEN_MONATE = 3;

export const IMPORTIERT_TAGE = 30;

const DATEINAME = /^\d+__(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;

/** Eingangszeitpunkt aus dem Dateinamen, oder `null`, wenn er nicht lesbar ist. */
export function empfangenAm(datei) {
	const treffer = DATEINAME.exec(datei);
	if (!treffer) return null;
	const [, datum, h, m, s, ms] = treffer;
	const zeit = new Date(`${datum}T${h}:${m}:${s}.${ms}Z`);
	return Number.isNaN(zeit.getTime()) ? null : zeit;
}

const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Ab wann eine abgewiesene Datei fällig ist: Eingang + 3 Monate − 1 Tag.
 *
 * Bildet die Rechnung der Datenbank nach (PostgreSQL addiert die Monate und
 * kappt den Tag auf das Ende des Zielmonats, erst danach geht der Tag ab) —
 * deckungsgleich mit `anonymizationDueAt` in
 * src/lib/utils/privacy/anonymizationCutoff.ts, was der Test über ein ganzes
 * Jahr nachrechnet. Importieren lässt sich die TS-Fassung hier nicht, weil das
 * Werkzeug unter blankem `node` auf dem Plesk-Server läuft. `setUTCMonth()`
 * allein liefe am Monatsende in den Folgemonat über und überschritte die
 * Frist (Review PR #1019).
 */
export function abgewiesenFaelligAb(zeit) {
	const monatsIndex = zeit.getUTCMonth() + ABGEWIESEN_MONATE;
	const jahr = zeit.getUTCFullYear() + Math.floor(monatsIndex / 12);
	const monat = monatsIndex % 12;
	const letzterTag = new Date(Date.UTC(jahr, monat + 1, 0)).getUTCDate();
	const verschoben = Date.UTC(
		jahr,
		monat,
		Math.min(zeit.getUTCDate(), letzterTag),
		zeit.getUTCHours(),
		zeit.getUTCMinutes(),
		zeit.getUTCSeconds(),
		zeit.getUTCMilliseconds()
	);
	return new Date(verschoben - TAG_MS);
}

function plusTage(zeit, tage) {
	return new Date(zeit.getTime() + tage * TAG_MS);
}

const FAELLIG = {
	importiert: (zeit, jetzt) => plusTage(zeit, IMPORTIERT_TAGE) <= jetzt,
	abgewiesen: (zeit, jetzt) => abgewiesenFaelligAb(zeit) <= jetzt
};

async function dateienIn(verzeichnis) {
	try {
		return (await readdir(verzeichnis)).sort();
	} catch (fehler) {
		if (fehler && fehler.code === 'ENOENT') return [];
		throw fehler;
	}
}

/**
 * Löscht abgelaufene Dateien aus `importiert/` und `abgewiesen/`.
 *
 * @returns {Promise<{
 *   geloescht: { importiert: number, abgewiesen: number },
 *   uebersprungen: string[],
 *   posteingangUeberFrist: number
 * }>}
 */
export async function raeumeAuf({ datenVerzeichnis, jetzt = new Date(), log = console }) {
	const geloescht = { importiert: 0, abgewiesen: 0 };
	const uebersprungen = [];

	for (const unter of /** @type {const} */ (['importiert', 'abgewiesen'])) {
		const verzeichnis = path.join(datenVerzeichnis, unter);
		for (const datei of await dateienIn(verzeichnis)) {
			const zeit = empfangenAm(datei);
			if (!zeit) {
				uebersprungen.push(`${unter}/${datei}`);
				continue;
			}
			if (!FAELLIG[unter](zeit, jetzt)) continue;
			await unlink(path.join(verzeichnis, datei));
			geloescht[unter] += 1;
		}
	}

	let posteingangUeberFrist = 0;
	for (const datei of await dateienIn(path.join(datenVerzeichnis, 'posteingang'))) {
		const zeit = empfangenAm(datei);
		// Undatiert heißt hier: weder übertragbar (der Sender nimmt nur *.json)
		// noch löschbar — ohne Meldung läge die Datei unbefristet (Review PR #1019).
		if (!zeit) uebersprungen.push(`posteingang/${datei}`);
		else if (FAELLIG.abgewiesen(zeit, jetzt)) posteingangUeberFrist += 1;
	}

	log.log(
		`Aufgeräumt: ${geloescht.importiert} aus importiert/, ${geloescht.abgewiesen} aus abgewiesen/ gelöscht.`
	);
	if (uebersprungen.length > 0) {
		log.log(`Ohne lesbares Datum stehen gelassen: ${uebersprungen.join(', ')}`);
	}
	if (posteingangUeberFrist > 0) {
		log.log(
			`Im Posteingang liegen ${posteingangUeberFrist} Datei(en) über der Frist von ${ABGEWIESEN_MONATE} Monaten — nicht gelöscht, bitte klären.`
		);
	}

	return { geloescht, uebersprungen, posteingangUeberFrist };
}
