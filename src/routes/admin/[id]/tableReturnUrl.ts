/**
 * Baut den Rückweg aus der Detailansicht — zurück in die Tabelle
 * (`/admin/sichtungen`) oder in den Eingang (`/admin`), je nach Herkunft.
 *
 * Die Detailansicht wird mit **allen** Parametern der Tabelle aufgerufen
 * (`viewSightingDetails` kopiert sie unbesehen); zurück gehen darf nur, was die
 * Tabelle auch liest. Diese Liste lag bis 2026-08 inline im `+layout.svelte` —
 * und hat `balticSea` und `deadFinding` nie nachgezogen, als die beiden Filter
 * dazukamen: Wer nach Ostsee-Status oder Meldeart filterte, eine Sichtung
 * öffnete und zurückging, stand wieder vor der ungefilterten Tabelle. Deshalb
 * eigenes Modul statt Inline-Liste — `tableReturnUrl.test.ts` gleicht sie gegen
 * die tatsächlich in `sichtungen/` gelesenen Parameter ab und meldet die nächste
 * solche Lücke, statt sie still entstehen zu lassen.
 *
 * Die Herkunft steht bewusst in der URL und nicht in `history.back()`: Die
 * Detailansicht ändert Status per `invalidateAll()`, löscht ggf. den Datensatz
 * und führt über „Bearbeiten" weiter — der History-Eintrag hinter uns ist
 * danach nicht verlässlich derselbe. Ein Parameter überlebt Reload, Bookmark
 * und Direktaufruf.
 */
import type { ReadonlyURL } from '$app/state';
import {
	HERKUNFT_EINGANG,
	HERKUNFT_PARAMETER,
	inboxAnchor
} from '#lib/components/admin/adminReturn.ts';

export const TABELLEN_PARAMETER = [
	'fromDate',
	'toDate',
	'verified',
	'entryChannel',
	'mediaUpload',
	'balticSea',
	'deadFinding',
	'q',
	'sort',
	'order',
	'page',
	'perPage'
] as const;

function pickTableParams(currentUrl: ReadonlyURL): URLSearchParams {
	const params = new URLSearchParams();

	for (const param of TABELLEN_PARAMETER) {
		const wert = currentUrl.searchParams.get(param);
		if (wert) params.set(param, wert);
	}

	return params;
}

export function tableReturnUrl(currentUrl: ReadonlyURL): string {
	const zielUrl = new URL('/admin/sichtungen', currentUrl.origin);

	for (const [param, wert] of pickTableParams(currentUrl)) {
		zielUrl.searchParams.set(param, wert);
	}

	return zielUrl.toString();
}

export interface ReturnTarget {
	href: string;
	label: string;
}

/**
 * Rückweg samt Beschriftung. `sightingId` setzt den Anker auf die Karte, von
 * der man kam — weglassen, wenn die Sichtung das Ziel nicht mehr erreicht
 * (gelöscht, oder gerade aus dem Eingang heraus entschieden).
 */
export function returnTarget(currentUrl: ReadonlyURL, sightingId?: number | string): ReturnTarget {
	if (currentUrl.searchParams.get(HERKUNFT_PARAMETER) === HERKUNFT_EINGANG) {
		const zielUrl = new URL('/admin', currentUrl.origin);
		/* `order` ist der einzige Parameter, den der Eingang selbst führt — ohne
		   ihn steht die Liste nach dem Rückweg wieder auf `desc`, und der Anker
		   trifft dieselbe Karte an anderer Stelle. Die übrigen
		   TABELLEN_PARAMETER gehören hier nicht hin: `istTabellenUrl`
		   (`admin/tableRedirect.ts`) leitete `/admin` mit ihnen sofort auf die
		   Tabelle um — der Rückweg landete also genau dort, wo er nicht hin soll.
		   Nur `asc`/`desc`: Alles andere coerct `+page.server.ts` ohnehin zu
		   `desc`, stünde aber sichtbar in der Adresszeile und behauptete eine
		   Sortierung, die es nicht gibt. */
		const order = currentUrl.searchParams.get('order');
		if (order === 'asc' || order === 'desc') zielUrl.searchParams.set('order', order);
		if (sightingId != null) zielUrl.hash = inboxAnchor(sightingId);
		return { href: zielUrl.toString(), label: 'Zurück zum Eingang' };
	}

	return { href: tableReturnUrl(currentUrl), label: 'Zurück zur Tabelle' };
}

/**
 * Query-String, den die Detailansicht an weiterführende Routen (`/edit`)
 * durchreicht — inklusive führendem `?`, oder leer.
 *
 * Ohne das endet der Rückweg beim ersten Zwischenschritt: `edit` sprang bis
 * 2026-08 auf `/admin/${id}` **ohne** Parameter, der Weg Tabelle → Detail →
 * Bearbeiten → zurück verlor also die Filter — derselbe Fehler wie beim
 * Eingang, nur eine Route weiter.
 */
export function carryReturnParams(currentUrl: ReadonlyURL): string {
	const params = new URLSearchParams();

	const herkunft = currentUrl.searchParams.get(HERKUNFT_PARAMETER);
	if (herkunft) params.set(HERKUNFT_PARAMETER, herkunft);

	for (const [param, wert] of pickTableParams(currentUrl)) {
		params.set(param, wert);
	}

	const query = params.toString();
	return query ? `?${query}` : '';
}
