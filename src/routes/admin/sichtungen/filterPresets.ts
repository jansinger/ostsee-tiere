/**
 * Gespeicherte Filteransichten der Admin-Sichtungstabelle (Spec B4).
 *
 * Reine Serialisierungs-, Vergleichs- und Listenlogik ohne Zugriff auf
 * `window` — wie in `columnPreferences.ts` entscheidet der Aufrufer, wann
 * `localStorage` überhaupt erreichbar ist (SSR-Guard bleibt in der Seite).
 *
 * Format ist versioniert (`{ v: 1, presets: [...] }`), damit ein künftiger
 * Formatwechsel den Altbestand gezielt verwerfen kann, statt ihn
 * misszuinterpretieren.
 */

import type { ReadonlyURL } from '$app/state';
import { TABELLEN_PARAMETER } from '../[id]/tableReturnUrl';

export const FILTER_PRESETS_STORAGE_KEY = 'admin.sichtungen.filterPresets';
const CURRENT_VERSION = 1;

/**
 * Der speicherbare Teil des Query-Strings.
 *
 * Abgeleitet aus `TABELLEN_PARAMETER` statt daneben gepflegt: Diese Liste ist
 * schon einmal auseinandergelaufen (siehe Kommentar in `tableReturnUrl.ts`),
 * und ein Preset, das einen später hinzugekommenen Filter nicht mitspeichert,
 * führt genauso still in die falsche Menge wie der Rückweg damals.
 *
 * Ausgenommen ist `page`: Eine Filteransicht beschreibt eine Menge, keine
 * Position darin. Gespeichert stünde man beim Anwenden auf Seite 7 einer
 * Liste, die inzwischen drei Seiten hat.
 */
export const PRESET_PARAMETER = TABELLEN_PARAMETER.filter((param) => param !== 'page');

export interface FilterPreset {
	id: string;
	name: string;
	params: Record<string, string>;
}

interface GespeichertesFormat {
	v: number;
	presets: FilterPreset[];
}

/** Liest die speicherbaren Filter aus einer URL. Leere Werte zählen als nicht gesetzt. */
export function capturePresetParams(url: ReadonlyURL): Record<string, string> {
	const params: Record<string, string> = {};
	for (const param of PRESET_PARAMETER) {
		const wert = url.searchParams.get(param);
		if (wert) params[param] = wert;
	}
	return params;
}

/**
 * Baut die Ziel-URL eines Presets.
 *
 * Bewusst von `/admin/sichtungen` aus neu aufgebaut statt die aktuelle URL zu
 * ergänzen: Ein Preset soll den Filterzustand *ersetzen*. Würde man nur die
 * gespeicherten Parameter setzen, bliebe ein davor aktiver Filter (etwa eine
 * Freitext-Suche) heimlich stehen, und die angezeigte Menge wäre eine andere
 * als die, auf deren Chip man geklickt hat.
 */
export function presetUrl(preset: FilterPreset, currentUrl: ReadonlyURL): string {
	const zielUrl = new URL('/admin/sichtungen', currentUrl.origin);
	for (const [key, wert] of Object.entries(preset.params)) {
		zielUrl.searchParams.set(key, wert);
	}
	zielUrl.searchParams.set('page', '1');
	return zielUrl.toString();
}

/** Markiert ein Preset als aktiv, wenn die URL exakt seine Filtermenge trägt. */
export function matchesPreset(preset: FilterPreset, url: ReadonlyURL): boolean {
	const aktuell = capturePresetParams(url);
	const gespeichert = preset.params;
	const schluessel = Object.keys(gespeichert);
	if (schluessel.length !== Object.keys(aktuell).length) return false;
	return schluessel.every((key) => aktuell[key] === gespeichert[key]);
}

/**
 * Prüft einen einzelnen gespeicherten Eintrag und säubert seine Parameter.
 * Unbekannte Parameter fliegen raus — sonst trüge ein Preset nach dem Entfernen
 * eines Filters dauerhaft einen Wert mit, den die Tabelle nicht mehr liest.
 */
function parsePreset(kandidat: unknown): FilterPreset | null {
	if (typeof kandidat !== 'object' || kandidat === null) return null;
	const { id, name, params } = kandidat as Partial<FilterPreset>;
	if (typeof id !== 'string' || !id) return null;
	if (typeof name !== 'string' || !name.trim()) return null;
	if (typeof params !== 'object' || params === null) return null;

	const gesaeubert: Record<string, string> = {};
	for (const param of PRESET_PARAMETER) {
		const wert = (params as Record<string, unknown>)[param];
		if (typeof wert === 'string' && wert) gesaeubert[param] = wert;
	}
	return { id, name: name.trim(), params: gesaeubert };
}

/**
 * Parst den rohen `localStorage`-Wert. Kaputtes JSON oder eine fremde Version
 * ergeben eine leere Liste; einzelne unbrauchbare Einträge werden übersprungen,
 * statt die übrigen Ansichten mitzureißen.
 */
export function loadFilterPresets(raw: string | null): FilterPreset[] {
	if (!raw) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}

	if (typeof parsed !== 'object' || parsed === null) return [];
	const format = parsed as Partial<GespeichertesFormat>;
	if (format.v !== CURRENT_VERSION || !Array.isArray(format.presets)) return [];

	return format.presets
		.map(parsePreset)
		.filter((preset): preset is FilterPreset => preset !== null);
}

/** Serialisiert die Liste in das versionierte Speicherformat. */
export function serializeFilterPresets(presets: FilterPreset[]): string {
	const format: GespeichertesFormat = { v: CURRENT_VERSION, presets };
	return JSON.stringify(format);
}

/* `crypto.randomUUID` ist in Browsern und Node vorhanden, aber nur in sicheren
   Kontexten garantiert — der Zähler-Fallback hält die Ansicht auch dort
   benutzbar, statt beim Anlegen zu werfen. */
let idZaehler = 0;
function neueId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	idZaehler += 1;
	return `preset-${idZaehler}-${Date.now()}`;
}

/**
 * Prüft, ob der Name schon an eine **andere** Ansicht vergeben ist.
 *
 * Der Name ist das einzige Unterscheidungsmerkmal der Chips — zwei gleich
 * benannte Ansichten wären in der Leiste nicht auseinanderzuhalten, und welche
 * von beiden man anwendet, entschiede die Reihenfolge. Verglichen wird
 * unabhängig von Groß-/Kleinschreibung: „Offen" und „offen" sähen im Chip
 * verschieden aus, meinen aber dasselbe und lösen das Problem nicht.
 *
 * `toLowerCase`, **nicht** `toLocaleLowerCase`: Die Locale-Variante richtet
 * sich nach der Umgebung des Browsers, und im türkischen Gebietsschema wird
 * aus „I" ein punktloses „ı" statt „i". Ob zwei Namen als gleich gelten,
 * hinge damit davon ab, wer die Ansicht anlegt — dieselben zwei Namen wären
 * für einen Bearbeiter eine Dublette und für den nächsten nicht.
 *
 * `ausserId` klammert die Ansicht aus, die gerade umbenannt wird — sonst
 * scheiterte das Ändern der reinen Schreibweise am eigenen Namen.
 */
function nameVergeben(presets: FilterPreset[], name: string, ausserId?: string): boolean {
	const vergleich = name.toLowerCase();
	return presets.some(
		(preset) => preset.id !== ausserId && preset.name.toLowerCase() === vergleich
	);
}

/**
 * Legt ein Preset aus dem aktuellen Filterzustand an. Ein leerer oder bereits
 * vergebener Name ergibt keine Ansicht; die Liste kommt dann **unverändert**
 * (identische Referenz) zurück — daran erkennt der Aufrufer, dass er eine
 * Rückmeldung geben muss.
 */
export function addFilterPreset(
	presets: FilterPreset[],
	name: string,
	params: Record<string, string>
): FilterPreset[] {
	const getrimmt = name.trim();
	if (!getrimmt || nameVergeben(presets, getrimmt)) return presets;
	return [...presets, { id: neueId(), name: getrimmt, params }];
}

/**
 * Benennt ein Preset um. Leerer Name, unbekannte id oder ein an eine andere
 * Ansicht vergebener Name lassen die Liste unverändert.
 */
export function renameFilterPreset(
	presets: FilterPreset[],
	id: string,
	name: string
): FilterPreset[] {
	const getrimmt = name.trim();
	if (!getrimmt || nameVergeben(presets, getrimmt, id)) return presets;
	return presets.map((preset) => (preset.id === id ? { ...preset, name: getrimmt } : preset));
}

/** Entfernt ein Preset. Eine unbekannte id lässt die Liste unverändert. */
export function removeFilterPreset(presets: FilterPreset[], id: string): FilterPreset[] {
	return presets.filter((preset) => preset.id !== id);
}
