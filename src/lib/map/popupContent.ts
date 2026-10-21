import * as m from '#lib/paraglide/messages.js';
/**
 * HTML-Inhalte für Popups und Hover-Infos der Sichtungskarte (M6).
 *
 * Reine String-Builder ohne DOM-/OpenLayers-Abhängigkeit, damit sie in
 * Node-Unit-Tests prüfbar sind. Alle Nutzdaten laufen durch sanitizeText;
 * die Darstellung kommt aus CSS-Klassen in mapStyles.css — keine
 * Inline-Styles am Theme vorbei.
 */
import { getLocale } from '#lib/paraglide/runtime.js';
import { sanitizeText } from '#lib/utils/sanitize.ts';
import { resolveDisplayLocale } from '#lib/utils/format/dateTime.ts';
import {
	SIGHTING_STATUS_PRESENTATION,
	type SightingStatus
} from '#lib/components/admin/sightingStatus.ts';
import type { MapTranslations } from './mapUtils';

/** Feature-Properties einer Sichtung, wie sie im GeoJSON ankommen. */
export interface SightingPopupProperties {
	ta: string | number; // Tierart
	ct: number; // Anzahl
	jt?: number; // Jungtiere
	ts?: number; // Timestamp (Unix-Sekunden)
	tf?: boolean; // Totfund
	st?: SightingStatus; // Bearbeitungszustand (öffentlich immer 'approved')
	shipname?: string;
	waterway?: string;
	name?: string;
	firstname?: string;
}

/**
 * Wort zum Bearbeitungsstand — `null` für freigegebene Sichtungen.
 *
 * Der Ring codiert den Zustand über sein Strichmuster (`STATUS_LINE_DASH`);
 * ohne Wort im Popup lässt sich ein gestrichelter Ring nirgends verifizieren.
 * Für Nicht-Admins ist `st` immer `'approved'` — dass genau dieser Zustand
 * kein Wort trägt, hält die öffentliche Karte damit unverändert, ohne dass die
 * Popup-Builder einen Admin-Kontext kennen müssten.
 *
 * Die Beschriftung kommt aus den Botschaften und **nicht** aus
 * `SIGHTING_STATUS_PRESENTATION[...].label`: Das sind deutsche Literale fürs
 * Backoffice. Die `badgeClass` von dort ist dagegen genau die eine Quelle für
 * die Farbe und wird übernommen.
 */
const STATUS_LABELS: Record<SightingStatus, () => string> = {
	open: m.components_map_panel_filterpanel_text_status_offen,
	approved: m.components_map_panel_filterpanel_text_status_freigegeben,
	rejected: m.components_map_panel_filterpanel_text_status_abgelehnt
};

function statusLabel(status: SightingStatus | undefined): string | null {
	if (!status || status === 'approved') return null;
	return STATUS_LABELS[status]();
}

function statusBadge(status: SightingStatus | undefined, extraClass = ''): string {
	const label = statusLabel(status);
	if (!label || !status) return '';
	const classes = ['badge', 'badge-sm', SIGHTING_STATUS_PRESENTATION[status].badgeClass, extraClass]
		.filter(Boolean)
		.join(' ');
	return `<span class="${classes}">${sanitizeText(label)}</span>`;
}

// M5: timeZone explizit setzen, sonst bestimmt die Browser-Zone das Datum
// (bis zu ±1 Tag Abweichung von der Berlin-Anzeige).
function formatSightingDate(ts: number | undefined, fallback: string): string {
	return ts
		? new Date(ts * 1000).toLocaleDateString(resolveDisplayLocale(getLocale()), {
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
				timeZone: 'Europe/Berlin'
			})
		: fallback;
}

/** Artname aus der speciesMap, sanitisiert; der Fallback-Text variiert je Kontext. */
function speciesName(
	props: SightingPopupProperties,
	translations: MapTranslations,
	fallback: string
): string {
	return sanitizeText(translations.speciesMap[props.ta.toString()] || fallback);
}

/** Detail-Inhalt für das Klick-Popup einer einzelnen Sichtung. */
export function createSightingPopupContent(
	props: SightingPopupProperties,
	translations: MapTranslations
): string {
	const date = formatSightingDate(props.ts, m.map_popupcontent_text_unbekannt());

	let content = `
		<div class="sighting-popup">
			<h3 class="popup-title">${speciesName(props, translations, `Unbekannte Art (${props.ta})`)}</h3>
			<div class="popup-row">
				<strong>${sanitizeText(translations.count)}:</strong> ${props.ct}
			</div>
	`;

	if (props.jt && props.jt > 0) {
		content += `
			<div class="popup-row">
				<strong>${sanitizeText(translations.young)}:</strong> ${props.jt}
			</div>
		`;
	}

	if (props.tf) {
		content += `
			<div class="popup-row popup-row-dead">
				<strong>${sanitizeText(translations.found_dead)}:</strong> Ja
			</div>
		`;
	}

	content += `
			<div class="popup-row">
				<strong>${sanitizeText(translations.report_date)}</strong> ${date}
			</div>
	`;

	const status = statusBadge(props.st);
	if (status) {
		content += `
			<div class="popup-row">
				<strong>${m.map_popupcontent_text_bearbeitungsstand()}:</strong> ${status}
			</div>
		`;
	}

	if (props.waterway) {
		content += `
			<div class="popup-row">
				<strong>${sanitizeText(translations.area)}:</strong> ${sanitizeText(props.waterway)}
			</div>
		`;
	}

	if (props.name || props.firstname) {
		const fullName = [props.firstname, props.name]
			.filter(Boolean)
			.map((v) => sanitizeText(v!))
			.join(' ');
		content += `
			<div class="popup-row">
				<strong>${sanitizeText(translations.name)}:</strong> ${fullName}
			</div>
		`;
	}

	if (props.shipname) {
		content += `
			<div class="popup-row">
				<strong>${sanitizeText(translations.ship)}:</strong> ${sanitizeText(props.shipname)}
			</div>
		`;
	}

	content += '</div>';
	return content;
}

/**
 * Scrollbare Liste aller Sichtungen eines Clusters.
 * Erwartet bereits sortierte Properties (via sortFeaturesByDate im Controller).
 */
export function createClusterListContent(
	propsList: SightingPopupProperties[],
	translations: MapTranslations
): string {
	const count = propsList.length;

	let items = '';
	propsList.forEach((props, index) => {
		const name = speciesName(props, translations, m.map_popupcontent_text_art_id({ id: props.ta }));
		const date = formatSightingDate(props.ts, m.map_popupcontent_text_unbekannt());
		const deadBadge = props.tf ? '<span class="cluster-item-dead">&#x2020;</span>' : '';
		// ICU-Plural statt `> 1 ? 'Tiere' : 'Tier'`: Die Grenze liegt nicht in jeder
		// Sprache bei eins, und das geschützte Leerzeichen steht als Zeichen IN der
		// Botschaft statt als HTML-Entität daneben.
		const tiere = m.map_popupcontent_text_tiere_plural({ count: props.ct });
		// In der Liste ist der Ring nicht mehr zu sehen — der Bearbeitungsstand
		// wäre hier sonst vollständig verloren. Auch im aria-label, sonst hört
		// die Sprachausgabe die Unterscheidung nicht, die das Auge sieht.
		const statusName = statusLabel(props.st);
		const status = statusBadge(props.st, 'cluster-item-status');

		items += `
			<li>
				<button
					type="button"
					data-cluster-index="${index}"
					class="cluster-list-item"
					aria-label="${name}, ${tiere}, ${date}${statusName ? `, ${sanitizeText(statusName)}` : ''}"
				>
					<span class="cluster-item-species">${name}${deadBadge}</span>
					<span class="cluster-item-count">${tiere}</span>
					<span class="cluster-item-date">${date}</span>
					${status}
				</button>
			</li>
		`;
	});

	return `
		<div class="cluster-popup">
			<h3 class="popup-title">${m.map_popupcontent_text_sichtungen_an_diesem_ort({ sichtungen: m.map_popupcontent_text_sichtungen_plural({ count }) })}</h3>
			<ul class="cluster-list" aria-label="${m.map_popupcontent_text_sichtungen_plural({ count })}">
				${items}
			</ul>
		</div>
	`;
}

/** Kompakte Hover-Info einer einzelnen Sichtung. */
export function createInfoText(
	props: SightingPopupProperties,
	translations: MapTranslations
): string {
	const species = speciesName(props, translations, m.map_popupcontent_text_unbekannte_art());
	const count = props.ct || 0;
	const date = formatSightingDate(props.ts, m.map_popupcontent_text_unbekanntes_datum());
	const isDead = props.tf ? ` (${sanitizeText(translations.found_dead)})` : '';
	// M6: Fahrwasser konsistent auch im Hover anzeigen, nicht nur im Popup
	const waterway = props.waterway
		? `<br>${sanitizeText(translations.area)}: ${sanitizeText(props.waterway)}`
		: '';
	return `
		<div class="p-2 text-sm">
			<strong>${species}</strong><br>
			${sanitizeText(translations.count)}: ${count}${isDead}<br>
			${sanitizeText(translations.report_date)} ${date}${waterway}
		</div>
	`;
}

/** Hover-Zusammenfassung eines Clusters (häufigste Arten). */
export function createClusterInfoText(
	propsList: SightingPopupProperties[],
	translations: MapTranslations
): string {
	const count = propsList.length;
	const speciesCount: Record<string, number> = {};

	propsList.forEach((props) => {
		const speciesKey = props.ta.toString();
		speciesCount[speciesKey] = (speciesCount[speciesKey] || 0) + 1;
	});

	const sortedSpecies = Object.entries(speciesCount)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 3) // Zeige nur die 3 häufigsten Arten
		.map(([speciesId, speciesTotal]) => {
			const name = sanitizeText(
				translations.speciesMap[speciesId] || m.map_popupcontent_text_unbekannte_art()
			);
			return `${name}: ${speciesTotal}`;
		});

	return `
		<div class="p-2 text-sm">
			<strong>${m.map_popupcontent_text_sichtungen_plural({ count })}</strong><br>
			${sortedSpecies.join('<br>')}
		</div>
	`;
}
