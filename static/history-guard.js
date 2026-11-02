/*
 * Schutz für den Start der App in einem iframe unter Safari.
 *
 * Das Meeresmuseum lädt die Sichtungskarte erst nach der Einwilligung: Sein
 * Cookie-Skript tauscht `src` des iframes vom Platzhalter auf die App. In einem
 * so umgesetzten iframe ignoriert Safari pushState/replaceState still
 * (https://bugs.webkit.org/show_bug.cgi?id=227474) — `history.state` bleibt
 * null. SvelteKit 3.1 schreibt beim Start seine Metadaten per replaceState und
 * liest sie ungeprüft zurück; ohne diesen Schutz bricht der Start mit
 * „undefined is not an object (evaluating 't.resetIndex')" ab, und /map
 * (ssr = false) bleibt leer.
 *
 * Wirkt nur im iframe und erst, nachdem ein Aufruf nachweislich ins Leere ging:
 * Dann hält das Skript den zuletzt übergebenen Zustand selbst vor und liefert
 * ihn über `history.state` aus. Neue Einträge in der Browser-Historie entstehen
 * in Safari damit weiterhin nicht — die braucht die eingebettete Karte nicht.
 *
 * Klassisches Skript, kein Modul: Es muss vor dem Start von SvelteKit laufen.
 * Als Datei statt inline, weil die CSP sonst je nach Seite (Hash statt
 * 'unsafe-inline') zuschlagen könnte. Abgesichert durch
 * src/lib/utils/client/historyGuard.test.ts und e2e/map-embed.spec.ts.
 */
(function () {
	if (window === window.top) return;

	var proto = History.prototype;
	var descriptor = Object.getOwnPropertyDescriptor(proto, 'state');
	if (!descriptor || !descriptor.get) return;

	var nativeState = descriptor.get;
	var ignored = false;
	var shadow = null;

	function copy(state) {
		if (typeof structuredClone !== 'function') return state;
		try {
			return structuredClone(state);
		} catch (_error) {
			return state;
		}
	}

	function guard(name) {
		var original = proto[name];
		proto[name] = function (state) {
			var result = original.apply(this, arguments);
			if (!ignored && state != null && nativeState.call(this) == null) ignored = true;
			if (ignored) shadow = copy(state);
			return result;
		};
	}

	guard('pushState');
	guard('replaceState');

	Object.defineProperty(proto, 'state', {
		configurable: true,
		enumerable: descriptor.enumerable,
		get: function () {
			return ignored ? shadow : nativeState.call(this);
		}
	});
})();
