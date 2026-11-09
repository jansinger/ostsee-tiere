# Sichtungsmeldung per iframe einbetten

Anleitung für das Einbetten des Sichtungsmeldeformulars auf deutsches-meeresmuseum.de (Typo3).

**Kurzfassung für die Redaktion:** Im HTML-Inhaltselement mit dem Formular den alten Code durch den aus Variante A ersetzen. Neu sind zwei Dinge: `max-width:700px` fällt weg, und hinter dem iframe steht eine `<script>`-Zeile. Lässt Typo3 oder das Cookie-/Consent-Werkzeug ein Skript von fremder Adresse nicht zu, Variante B nehmen.

## Variante A — Skript von ostsee-tiere.de laden (empfohlen)

```html
<iframe
	src="https://ostsee-tiere.de/"
	title="Sichtung melden"
	style="display:block; width:100%; min-width:320px; height:3350px; border:0;"
></iframe>
<script src="https://ostsee-tiere.de/embed.js" defer></script>
```

Beides gehört in **ein** HTML-Inhaltselement, das `<script>` direkt hinter den iframe. Vorteil gegenüber Variante B: Verbesserungen am Skript kommen automatisch an, auf der Museumsseite ist nie wieder etwas zu ändern.

## Variante B — Code direkt einfügen

Für den Fall, dass externe Skripte nicht erlaubt sind. Der Code ist derselbe wie in Variante A (ein Test im Projekt hält beide gleich), er steht hier nur vollständig im Inhaltselement:

```html
<iframe
	src="https://ostsee-tiere.de/"
	title="Sichtung melden"
	style="display:block; width:100%; min-width:320px; height:3350px; border:0;"
></iframe>
<script>
	/*
	 * Ostsee-Tiere: Höhe des eingebetteten Meldeformulars anpassen.
	 *
	 * Für die einbettende Seite (deutsches-meeresmuseum.de). Einbinden direkt
	 * hinter dem iframe, per src="https://ostsee-tiere.de/embed.js".
	 * Einbettungscode und Anleitung: docs/IFRAME_EINBETTUNG.md
	 *
	 * Diese Datei darf nirgends ein schließendes Script-Tag enthalten, auch nicht
	 * im Kommentar: Inline eingefügt, beendete es das Skript an genau der Stelle.
	 *
	 * Das Skript sucht alle iframes, die von derselben Adresse laden wie es selbst,
	 * und
	 *   - setzt ihre Höhe auf die Höhe des Inhalts, sobald das Formular sie meldet,
	 *   - scrollt die Seite an die Stelle, die das Formular anspringen möchte
	 *     (nächster Schritt, erstes fehlerhaftes Feld).
	 *
	 * Statt per src darf der Inhalt dieser Datei auch direkt im Script-Element
	 * stehen (z. B. wenn externe Skripte nicht erlaubt sind). Dann gilt
	 * APP_ORIGIN unten.
	 *
	 * Hat die Seite eine fest stehende Kopfleiste, die den Formularanfang beim
	 * Scrollen verdecken würde: data-scroll-offset="Höhe in px" am Script-Element
	 * bzw. SCROLL_OFFSET unten setzen.
	 *
	 * Ohne das Skript bleibt der iframe einfach auf der Höhe aus seinem
	 * style-Attribut. Gegenstück in der App: src/lib/utils/client/embedMessages.ts.
	 */
	(function () {
		'use strict';

		/** Adresse des Formulars — gilt, wenn dieser Code direkt im Script-Element steht. */
		var APP_ORIGIN = 'https://ostsee-tiere.de';
		/** Zusätzlicher Abstand nach oben beim Scrollen, in px (fest stehende Kopfleiste). */
		var SCROLL_OFFSET = 0;

		var script = document.currentScript;
		var appOrigin = script && script.src ? new URL(script.src).origin : APP_ORIGIN;
		var scrollOffset = Number(script && script.getAttribute('data-scroll-offset')) || SCROLL_OFFSET;

		function appFrames() {
			return Array.prototype.filter.call(document.querySelectorAll('iframe'), function (frame) {
				try {
					return new URL(frame.src, document.baseURI).origin === appOrigin;
				} catch (_error) {
					return false;
				}
			});
		}

		function frameFor(source) {
			var frames = appFrames();
			for (var i = 0; i < frames.length; i++) {
				if (frames[i].contentWindow === source) return frames[i];
			}
			return null;
		}

		window.addEventListener('message', function (event) {
			if (event.origin !== appOrigin) return;
			var data = event.data;
			if (!data || typeof data !== 'object') return;
			var frame = frameFor(event.source);
			if (!frame) return;

			var isHeight = data.type === 'ostsee-tiere:height' && typeof data.height === 'number';
			if (isHeight && data.height > 0) {
				frame.style.height = Math.ceil(data.height) + 'px';
			} else if (data.type === 'ostsee-tiere:scroll' && typeof data.top === 'number') {
				var top = frame.getBoundingClientRect().top + window.pageYOffset + data.top - scrollOffset;
				window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
			}
		});

		// Die erste Höhenmeldung kann vor diesem Skript eingetroffen sein — nachfragen.
		function requestHeight(frame) {
			if (frame.contentWindow) {
				frame.contentWindow.postMessage({ type: 'ostsee-tiere:request-height' }, appOrigin);
			}
		}
		appFrames().forEach(function (frame) {
			requestHeight(frame);
			frame.addEventListener('load', function () {
				requestHeight(frame);
			});
		});
	})();
</script>
```

Nachteil: Ändert sich das Skript, muss das Museum den Block neu kopieren. Bisher ist das nicht absehbar — das Skript ist klein und hängt nur an drei Nachrichtennamen.

## Was das Skript tut

**Höhe:** Das Formular meldet seine Höhe per `postMessage`, das Skript setzt sie am iframe. Der iframe ist damit auf jedem Schritt so hoch wie sein Inhalt. Vorher stand er fest auf 3350px; auf der Einstiegsseite (rund 440px Inhalt) blieben so etwa 2.900px Leerraum stehen.

Die erste Meldung geht direkt beim Start des Formulars raus und wartet nicht auf einen `ResizeObserver`: Chromium rendert einen fremden iframe außerhalb des Sichtfelds gar nicht, der Observer feuert dort nie. Liegt der iframe unterhalb des sichtbaren Bereichs, blieb er bis 2026-11 auf 3350px stehen, bis jemand hineinscrollte (auf der Museumsseite gemessen: iframe-Oberkante bei 1159px, danach 453px). Spätere Höhenänderungen laufen weiter über den Observer und greifen deshalb erst, wenn der iframe im Sichtfeld liegt.

**Scrollen:** Beim Wechsel zum nächsten Formularschritt springt die Museumsseite zum Kopf des neuen Schritts. Ohne das bliebe man unten beim „Weiter"-Knopf stehen, mitten im neuen Schritt — sobald der iframe so hoch ist wie sein Inhalt, scrollt nicht mehr das Formular, sondern die Museumsseite.

**Ohne Skript** bleibt alles wie bisher: `height:3350px` im Einbettungscode ist die Starthöhe bis zur ersten Meldung und zugleich der Rückfall, falls das Skript nicht lädt. Deshalb bleibt der Wert stehen.

## Breite: frei, das Formular passt sich an

Der iframe darf die volle Spaltenbreite nutzen. Das Formular verhält sich darin wie beim direkten Aufruf von ostsee-tiere.de, gemessen am 2026-11-02:

| iframe-Breite | Formular                               | Ansicht |
| ------------- | -------------------------------------- | ------- |
| 320–703px     | füllt den iframe (je 16px Rand)        | mobil   |
| 704–767px     | 672px, zentriert, seitlich Hintergrund | mobil   |
| ab 768px      | 672px, zentriert, seitlich Hintergrund | breit   |

Ob die mobile oder die breite Ansicht erscheint, entscheidet die **iframe-Breite**, nicht die Breite des Browserfensters. Bis 2026-11 deckelte der Einbettungscode den iframe auf `max-width:700px` — das Formular erschien dadurch auch auf großen Bildschirmen immer in der mobilen Ansicht.

Ist der iframe breiter als 704px, steht links und rechts neben dem Formular die sehr hell blaugraue Hintergrundfarbe der Anwendung. Wer das nicht möchte, setzt am iframe `max-width:704px`; dann füllt das Formular den iframe ganz aus, bleibt aber in der mobilen Ansicht.

## Anpassungen, die nötig werden können

**Fest stehende Kopfleiste.** Das Formular scrollt mit 80px Luft über dem Schrittkopf. Ist die Kopfleiste der Museumsseite beim Scrollen höher, verdeckt sie den Anfang des Schritts. Dann ihre Höhe in Pixeln angeben:

- Variante A: `<script src="https://ostsee-tiere.de/embed.js" data-scroll-offset="100" defer></script>`
- Variante B: im Code die Zeile `var SCROLL_OFFSET = 0;` auf den Wert setzen

**Content-Security-Policy.** Setzt die Museumsseite eine CSP, braucht Variante A `https://ostsee-tiere.de` in `script-src`, Variante B ein erlaubtes Inline-Skript (`'unsafe-inline'`, Nonce oder Hash). Der iframe selbst braucht `https://ostsee-tiere.de` in `frame-src` — das gilt schon heute.

**Cookie-/Consent-Werkzeug.** Die Museumsseite ersetzt fremde iframes teils durch einen Platzhalter, bis zugestimmt wurde (zu sehen beim Google-Tag-Manager-iframe im Seitenquelltext). Den Formular-iframe betrifft das nach dem Stand vom 2026-11-02 nicht. Falls das Werkzeug ihn oder das Skript künftig zurückhält: Das Skript findet einen iframe auch dann, wenn er erst nach der Zustimmung geladen wird.

## Checkliste vor dem Livegang

- [ ] Einbettungscode aus Variante A (oder B) übernommen, `max-width:700px` ist weg
- [ ] Auf der Einstiegsseite („Was möchten Sie melden?") steht unter dem Formular kein großer Leerraum mehr
- [ ] Eine echte Sichtung durchgeklickt, alle Schritte bis zur Erfolgsseite: Der iframe wächst und schrumpft mit, nach jedem „Weiter" steht der Kopf des neuen Schritts oben im Fenster und nicht unter der Kopfleiste
- [ ] Dasselbe auf einem Smartphone
- [ ] Wenn etwas nicht passt: In der Browser-Konsole (F12) nach Fehlern zu `embed.js` oder zur Content-Security-Policy suchen

## Technischer Hintergrund

| Nachricht                     | Richtung          | Inhalt                                                                             |
| ----------------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `ostsee-tiere:height`         | Formular → Museum | `{ height }` in px, bei jeder Höhenänderung                                        |
| `ostsee-tiere:scroll`         | Formular → Museum | `{ top }` in px ab Oberkante des iframes                                           |
| `ostsee-tiere:request-height` | Museum → Formular | Bitte um erneute Höhenmeldung (falls das Skript später lädt als die erste Meldung) |

Das Skript nimmt nur Nachrichten von der Adresse an, von der es geladen wurde (Variante B: `APP_ORIGIN`), und nur von iframes, die von dort laden. Das Formular schickt nichts als Pixelzahlen.

Navigation, Footer und Formular-Titel der Anwendung blenden sich im iframe automatisch aus.

Im Projekt: [`static/embed.js`](../static/embed.js) ist das Skript, [`src/lib/utils/client/embedMessages.ts`](../src/lib/utils/client/embedMessages.ts) das Gegenstück in der App. Abgesichert durch `e2e/iframe-embedding.spec.ts` (echte Einbettung von fremder Adresse, beide Varianten, Scroll-Versatz) und `src/lib/utils/client/embedScript.test.ts` (Variante B entspricht `embed.js`). Ein Testaufbau zum lokalen Ausprobieren liegt in [test-iframe.html](test-iframe.html).

---

# Sichtungskarte per iframe einbetten

Stand 2026-11-02 bettet deutsches-meeresmuseum.de `https://www.ostsee-tiere.de/map` unter
_Wissenschaft → Sichtungen → Sichtungskarte_ in einen 4:3-Rahmen (`embed-responsive-4by3`)
einer rund 545px breiten Spalte ein — gemessen **545 × 409 px**.

## Was die Karte im iframe selbst anpasst

Die Karte erkennt die Einbettung (`window !== window.top`) und richtet sich darauf ein:

| Element                        | Eigene Seite | Im iframe                                                 |
| ------------------------------ | ------------ | --------------------------------------------------------- |
| Titel „Sichtungskarte 2026"    | sichtbar     | entfällt — die Museumsseite trägt die Überschrift         |
| Museumslogo unten rechts       | sichtbar     | entfällt — die Museumsseite trägt die Marke               |
| Runder Hilfe-Knopf unten links | sichtbar     | entfällt; „Tastaturkürzel anzeigen" steht in der Legende  |
| Link „Große Karte"             | —            | unten rechts, öffnet `/map` mit den aktuellen Filtern neu |

Unabhängig von der Einbettung gilt außerdem:

- **Größe der Bedienelemente nach Zeigerart.** Bei reiner Maus-/Trackpad-Bedienung sind Zoom,
  Panel-Reiter und Karte/Liste 32px groß, sobald ein Touch-Zeiger vorhanden ist 44px
  (`--map-control-min`, Begründung in `src/css/tokens.css`).
- **Kompakte Reiter in niedrigen Rahmen.** Unter 512px Höhe werden „Filter" und „Legende" zu
  Icon-Knöpfen oben rechts statt 128px hoher beschrifteter Reiter.

## Safari: Karte blieb nach der Einwilligung leer

Anders als das Formular lädt die Museumsseite die Karte erst nach der Einwilligung in externe
Inhalte: Im iframe steht zunächst ihr Platzhalter (`/iframe-placeholder?…`), die Adresse der
Karte nur in `data-src`. Nach der Zustimmung setzt das Cookie-Skript `src` um.

In einem so umgesetzten iframe ignoriert Safari `history.pushState` und `replaceState` still
([WebKit-Bug 227474](https://bugs.webkit.org/show_bug.cgi?id=227474)), `history.state` bleibt
`null`. Seit SvelteKit 3.1 (Release 2.24.0) liest der Router seine Metadaten beim Start
ungeprüft daraus zurück und bricht mit
`TypeError: undefined is not an object (evaluating 't.resetIndex')` ab. Weil `/map` nur im
Browser rendert, blieb die Fläche leer; Chrome war nicht betroffen.

`static/history-guard.js` fängt das ab. Es läuft aus `src/app.html` vor SvelteKit, wirkt nur im
iframe und erst, wenn ein Aufruf nachweislich ins Leere ging, und hält dann den Zustand selbst
vor. Abgesichert in `src/lib/utils/client/historyGuard.test.ts` und `e2e/map-embed.spec.ts`
(„Safari ignoriert die History-API“, nachgestellt per Init-Skript, weil Chromium den Fehler
nicht hat).

Wer die Datei entfernen will, prüft vorher, ob SvelteKit die Stelle selbst absichert
(`set_history_options` in `runtime/client/client.js`; in 3.1.1 noch ungeprüft).

## Empfehlung an die Museumsseite: mehr Höhe

Der 4:3-Rahmen ist für eine Karte flach — die Ostsee ist breiter als hoch, aber die
Bedienelemente brauchen oben und unten Platz. Besser:

```html
<iframe
	src="https://www.ostsee-tiere.de/map"
	title="Sichtungskarte Meeressäugetiere Ostsee"
	style="display:block; width:100%; height:600px; border:0;"
></iframe>
```

Ab 512px Höhe kehren die beschrifteten Panel-Reiter zurück. Das ist eine Empfehlung, keine
Voraussetzung: Die Karte bleibt auch im heutigen 4:3-Rahmen vollständig bedienbar.

Abgesichert in `e2e/map-embed.spec.ts` (echte Einbettung in einen 545×409-Rahmen).
