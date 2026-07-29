/**
 * Verbindungszustand der Anwendung.
 *
 * `navigator.onLine` allein reicht hier nicht: Es meldet nur, ob eine
 * Netzwerkschnittstelle aktiv ist, nicht ob das Internet erreichbar ist. WLAN an
 * Bord ohne Uplink meldet `true` — und ist für dieses Projekt der Regelfall,
 * nicht die Ausnahme.
 *
 * Der Zustand wird deshalb aus zwei Quellen gebildet:
 *
 * | Quelle                     | Aussagekraft                          | Rolle           |
 * | -------------------------- | ------------------------------------- | --------------- |
 * | `navigator.onLine`         | Schnittstelle aktiv (notwendig)       | Vorab-Signal    |
 * | Ergebnis eines echten POST | Server erreichbar (hinreichend)       | Letztes Wort    |
 *
 * Ein gescheiterter Request setzt den Zustand auf offline; erst ein
 * erfolgreicher Request oder ein `online`-Event des Browsers hebt ihn wieder auf.
 *
 * **SSR:** Modulweiter `$state` wird auf dem Server zwischen Requests geteilt.
 * Hier ist das unkritisch — der Wert trägt keine Nutzerdaten und startet immer
 * als „online". Verändert wird er ausschließlich im Browser: über
 * `watchConnection()` (an Ereignisse gebunden) und über die Rückmeldungen aus
 * echten Requests.
 */

import { browser } from '$app/environment';

/** Meldung des Browsers: Ist überhaupt eine Netzwerkschnittstelle aktiv? */
let interfaceUp = $state(true);

/** Was der letzte echte Request über die Erreichbarkeit gesagt hat. */
let lastRequest = $state<'unknown' | 'reachable' | 'unreachable'>('unknown');

/**
 * Wie lange „Wieder online" stehen bleibt.
 *
 * Das ist die eine Stelle in diesem Regelwerk, an der ein flüchtiger Hinweis
 * richtig ist: Er verlangt keine Handlung, er nimmt nur eine Sorge weg. Ein
 * Dauer-Indikator für „online" dagegen sagt 99 % der Zeit dasselbe und wird
 * deshalb nicht gelesen.
 */
const RECONNECTED_NOTICE_MS = 4000;

let reconnected = $state(false);
let reconnectedTimer: ReturnType<typeof setTimeout> | null = null;

/** Zeigt „Wieder online", aber nur wenn es vorher wirklich offline war. */
function noteReconnection(wasOffline: boolean): void {
	if (!browser || !wasOffline) return;

	reconnected = true;
	// Gegen `null` prüfen, nicht auf truthy: Der Typ lässt jeden `number` zu, und
	// `0` wäre falsy. (Die HTML-Spezifikation verlangt zwar einen Handle > 0, aber
	// der Vertrag hier ist der Typ, nicht die Spezifikation eines Zielsystems.)
	if (reconnectedTimer !== null) clearTimeout(reconnectedTimer);
	reconnectedTimer = setTimeout(() => {
		reconnected = false;
		reconnectedTimer = null;
	}, RECONNECTED_NOTICE_MS);
}

export const connection = {
	/**
	 * `true`, wenn abgesendete Daten den Server nicht erreichen würden.
	 *
	 * Beide Quellen dürfen das auslösen: eine abgeschaltete Schnittstelle ist ein
	 * sicheres Nein, ein gescheiterter Request ebenfalls.
	 */
	get isOffline(): boolean {
		return !interfaceUp || lastRequest === 'unreachable';
	},

	/**
	 * `true` nur, wenn der Browser die Schnittstelle selbst als abgeschaltet
	 * meldet — das ist ein **sicheres** Nein.
	 *
	 * Der Unterschied zu {@link isOffline} entscheidet, ob die Anwendung das
	 * Absenden vorab sperren darf. Ein gescheiterter Request ist ein starkes
	 * Indiz, aber kein Beweis: `isNetworkFailure()` in `submitSightingForm`
	 * wertet jeden `TypeError` von `fetch` als Verbindungsproblem, und den wirft
	 * `fetch` auch bei `ERR_CONNECTION_REFUSED` (Server startet neu), bei
	 * CORS-Fehlern und bei DNS-Aussetzern. In all diesen Fällen bleibt
	 * `navigator.onLine` auf `true` und es feuert **nie** ein `online`-Ereignis,
	 * das den Zustand wieder aufheben könnte.
	 *
	 * Würde die Sperre an `isOffline` hängen, käme der Nutzer aus ihr nur durch
	 * ein Neuladen wieder heraus — und verlöre damit genau die Sicherheit, die
	 * der Offline-Hinweis ihm zusagt. Gesperrt wird deshalb nur beim sicheren
	 * Nein; im Verdachtsfall bleibt „Trotzdem versuchen" erreichbar.
	 */
	get isInterfaceDown(): boolean {
		return !interfaceUp;
	},

	/**
	 * `true` für {@link RECONNECTED_NOTICE_MS} nach der Rückkehr aus dem
	 * Offline-Zustand — und nur dann. Wer nie offline war, sieht nichts.
	 */
	get justReconnected(): boolean {
		return reconnected;
	},

	/** Ein Request kam durch — überstimmt jedes ältere Signal. */
	reportReachable(): void {
		// Kein `this`: Die Methode soll auch nach einer Destrukturierung
		// (`const { reportReachable } = connection`) funktionieren.
		const wasOffline = !interfaceUp || lastRequest === 'unreachable';
		lastRequest = 'reachable';
		interfaceUp = true;
		noteReconnection(wasOffline);
	},

	/** Ein Request scheiterte am Netz (`status: 'offline'` aus `submitSightingForm`). */
	reportUnreachable(): void {
		lastRequest = 'unreachable';
	},

	/**
	 * Setzt nur die Request-Historie zurück, nicht das Browser-Signal.
	 * Gedacht für Tests und für das `online`-Ereignis, nach dem die alte
	 * Erfahrung nichts mehr über die neue Verbindung aussagt.
	 */
	reset(): void {
		lastRequest = 'unknown';
		interfaceUp = browser ? navigator.onLine : true;
		reconnected = false;
		if (reconnectedTimer !== null) {
			clearTimeout(reconnectedTimer);
			reconnectedTimer = null;
		}
	}
};

/**
 * Bindet den Zustand an die `online`/`offline`-Ereignisse des Browsers.
 *
 * Gibt die Abmeldefunktion zurück, damit sie direkt aus einem `$effect`
 * verwendet werden kann. Auf dem Server ein No-op.
 */
export function watchConnection(): () => void {
	if (!browser) return () => {};

	interfaceUp = navigator.onLine;

	const handleOnline = (): void => {
		const wasOffline = connection.isOffline;
		interfaceUp = true;
		// Die alte Erfahrung gilt nicht mehr: Es ist eine neue Verbindung, und ob
		// sie trägt, weiß erst der nächste echte Request.
		lastRequest = 'unknown';
		noteReconnection(wasOffline);
	};
	const handleOffline = (): void => {
		interfaceUp = false;
	};

	window.addEventListener('online', handleOnline);
	window.addEventListener('offline', handleOffline);

	return () => {
		window.removeEventListener('online', handleOnline);
		window.removeEventListener('offline', handleOffline);
	};
}
