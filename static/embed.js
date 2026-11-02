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
