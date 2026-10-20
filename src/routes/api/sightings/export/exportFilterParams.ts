import { isValidDateParam } from '../../../admin/sichtungen/dateParam';
import { eq, gte, lt } from 'drizzle-orm';
import { berlinDayRangeUtc } from '#lib/server/datetime/berlinDayRange.ts';
import { sightings as sightingsTable } from '#lib/server/db/schema.ts';
import { mediaUploadCondition } from '#lib/server/db/mediaUploadFilter.ts';
import { balticSeaCondition } from '#lib/server/db/balticSeaFilter.ts';
import { deadFindingCondition } from '#lib/server/db/deadFindingFilter.ts';
import { statusCondition } from '../../../admin/sichtungen/statusFilter';
import { searchCondition } from '#lib/server/db/sightingSearchFilter.ts';

export function xmlEscape(str: string | null | undefined): string {
	if (!str) return '';
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export type ExportFilterParams = {
	fromDate: string;
	toDate: string;
	verified: string | null;
	entryChannel: string | null;
	mediaUpload: string | null;
	deadFinding: string | null;
	balticSea: string | null;
	q: string | null;
};

type ValidationError = { field: 'fromDate' | 'toDate'; message: string };
export type ParseExportFilterResult = { params: ExportFilterParams } | { error: ValidationError };

export function parseExportFilterParams(url: URL): ParseExportFilterResult {
	const fromDate = url.searchParams.get('fromDate') || '';
	const toDate = url.searchParams.get('toDate') || '';
	const verified = url.searchParams.get('verified');
	const entryChannel = url.searchParams.get('entryChannel');
	const mediaUpload = url.searchParams.get('mediaUpload');
	const deadFinding = url.searchParams.get('deadFinding');
	const balticSea = url.searchParams.get('balticSea');
	const q = url.searchParams.get('q');

	if (fromDate && !isValidDateParam(fromDate)) {
		return {
			error: { field: 'fromDate', message: 'Ungültiges fromDate-Format. Erwartet: YYYY-MM-DD' }
		};
	}
	if (toDate && !isValidDateParam(toDate)) {
		return {
			error: { field: 'toDate', message: 'Ungültiges toDate-Format. Erwartet: YYYY-MM-DD' }
		};
	}

	return {
		params: { fromDate, toDate, verified, entryChannel, mediaUpload, deadFinding, balticSea, q }
	};
}

export function buildExportConditions(params: ExportFilterParams) {
	const { fromDate, toDate, verified, entryChannel, mediaUpload, deadFinding, balticSea, q } =
		params;
	const conditions = [];

	// fromDate/toDate meinen Berliner Kalendertage, die Spalte hält UTC.
	// Halboffenes Intervall statt BETWEEN, damit der letzte Tag vollständig
	// enthalten ist; beide Grenzen treffen den Index auf der rohen Spalte.
	//
	// Jede Grenze gilt für sich: Der Export erbt die Filter der Tabelle
	// (`/admin/sichtungen`), die seit 2026-08 ebenfalls offene Grenzen kennt —
	// sonst enthielte die Datei mehr Zeilen, als der Nutzer gesehen hat.
	if (isValidDateParam(fromDate)) {
		conditions.push(gte(sightingsTable.sightingDate, berlinDayRangeUtc(fromDate, fromDate).start));
	}
	if (isValidDateParam(toDate)) {
		conditions.push(
			lt(sightingsTable.sightingDate, berlinDayRangeUtc(toDate, toDate).endExclusive)
		);
	}
	// Dieselbe Logik wie die Tabelle — sonst enthält die CSV eine andere Menge,
	// als der Nutzer im Filter gesehen hat.
	const statusFilter = statusCondition(verified);
	if (statusFilter) {
		conditions.push(statusFilter);
	}
	if (entryChannel && entryChannel !== 'all') {
		const channelId = parseInt(entryChannel, 10);
		if (!isNaN(channelId)) {
			conditions.push(eq(sightingsTable.entryChannel, channelId));
		}
	}
	// Inkl. „angekündigt, aber keine Datei angehängt" (announced_missing),
	// siehe mediaUploadFilter.ts — dieselbe Bedingung wie in der Admin-Liste.
	const mediaCondition = mediaUploadCondition(mediaUpload);
	if (mediaCondition) {
		conditions.push(mediaCondition);
	}
	// Dieselbe Meldeart-Bedingung (Totfund/Lebendsichtung) wie die Admin-Liste,
	// siehe deadFindingFilter.ts.
	const deadFindingFilterCondition = deadFindingCondition(deadFinding);
	if (deadFindingFilterCondition) {
		conditions.push(deadFindingFilterCondition);
	}
	// Dieselbe Ostsee-Status-Bedingung wie die Admin-Liste, siehe balticSeaFilter.ts.
	const balticSeaFilterCondition = balticSeaCondition(balticSea);
	if (balticSeaFilterCondition) {
		conditions.push(balticSeaFilterCondition);
	}

	// Dieselbe Freitext-Suche wie die Admin-Liste, siehe sightingSearchFilter.ts.
	const searchFilterCondition = searchCondition(q);
	if (searchFilterCondition) {
		conditions.push(searchFilterCondition);
	}

	return conditions;
}
