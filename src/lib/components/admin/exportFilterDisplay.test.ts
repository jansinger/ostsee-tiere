import { describe, expect, it } from 'vitest';
import { formatWallClockDateTime } from '#lib/utils/format/formatWallClockDateTime.ts';
import { AUFNAHME_LABEL, MELDEART_LABEL } from '#lib/components/admin/filterLabels.ts';
import { SIGHTING_STATUS_PRESENTATION } from '#lib/components/admin/sightingStatus.ts';
import { DEAD_FINDING_PRESENTATION } from '#lib/components/admin/deadFinding.ts';
import { getEntryChannelOptions } from '#lib/report/formOptions/entryChannel.ts';
import { MEDIA_UPLOAD_ANNOUNCED_MISSING } from '#lib/utils/media/photoAnnouncement.ts';
import { getActiveFiltersDisplay } from './exportFilterDisplay';

describe('getActiveFiltersDisplay', () => {
	it('meldet ohne Filter „Keine Filter aktiv"', () => {
		expect(getActiveFiltersDisplay({})).toEqual(['Keine Filter aktiv']);
	});

	// WP4: „Von"/„Bis" nannten kein Bezugsfeld. Der Export-Dialog beschreibt
	// dieselben Filter wie das Panel und Filter-Chips (+page.svelte,
	// filterChips.ts) und muss deshalb dasselbe Wort benutzen —
	// „Sichtung von"/„Sichtung bis", da der Bereich serverseitig das
	// Sichtungsdatum filtert (`sightingCalendarDate`).
	it('benennt den Datumsfilter nach dem Sichtungsdatum', () => {
		expect(getActiveFiltersDisplay({ fromDate: '2026-06-01' })).toEqual([
			`Sichtung von: ${formatWallClockDateTime('2026-06-01')}`
		]);
		expect(getActiveFiltersDisplay({ toDate: '2026-06-30' })).toEqual([
			`Sichtung bis: ${formatWallClockDateTime('2026-06-30')}`
		]);
	});

	it('zeigt den Suchbegriff an', () => {
		// Der Export erbt die Suche der Tabelle (exportFilterParams.ts). Fehlte
		// sie hier, versprächen die Badges eine größere Menge als die Datei
		// enthält — dieselbe Falle wie bei balticSea und deadFinding.
		expect(getActiveFiltersDisplay({ q: 'müller' })).toContain('Suche: „müller"');
	});

	it('ignoriert einen leeren Suchbegriff', () => {
		expect(getActiveFiltersDisplay({ q: '   ' })).toEqual(['Keine Filter aktiv']);
	});

	it('zeigt die Suche neben anderen aktiven Filtern', () => {
		const anzeige = getActiveFiltersDisplay({
			q: 'ostsee',
			verified: 'approved',
			deadFinding: '1'
		});

		expect(anzeige).toContain('Suche: „ostsee"');
		expect(anzeige).toContain(`Status: ${SIGHTING_STATUS_PRESENTATION.approved.label}`);
		expect(anzeige).toHaveLength(3);
	});

	// Der Kanal stand als rohe Datenbank-Zahl im Dialog („Kanal: 0"), während
	// der Chip derselben Seite „Kanal: Web" sagte — beide gleichzeitig sichtbar.
	// Aufgelöst wird über dieselbe Quelle wie im Panel und im Chip.
	it('löst die Kanal-ID über getEntryChannelOptions auf', () => {
		for (const option of getEntryChannelOptions()) {
			expect(getActiveFiltersDisplay({ entryChannel: String(option.value) })).toEqual([
				`Kanal: ${option.label}`
			]);
		}
	});

	// Gleiche Begründung wie beim Chip: Ein Wert, den keine Quelle kennt
	// (veraltetes Lesezeichen), erscheint unverändert — besser als ein Badge,
	// das einen wirksamen Filter verschweigt.
	it('zeigt eine unbekannte Kanal-ID unverändert', () => {
		expect(getActiveFiltersDisplay({ entryChannel: '99' })).toEqual(['Kanal: 99']);
	});

	it('lässt den Kanal-Filter bei „all" aus', () => {
		expect(getActiveFiltersDisplay({ entryChannel: 'all' })).toEqual(['Keine Filter aktiv']);
	});

	// Die Statuswörter sind dieselben wie an den Statusreitern der Tabelle —
	// „Offen"/„Freigegeben"/„Abgelehnt", nicht „Nur offene Sichtungen".
	it('benennt den Status wie die Statusreiter', () => {
		expect(getActiveFiltersDisplay({ verified: 'open' })).toEqual([
			`Status: ${SIGHTING_STATUS_PRESENTATION.open.label}`
		]);
		expect(getActiveFiltersDisplay({ verified: 'rejected' })).toEqual([
			`Status: ${SIGHTING_STATUS_PRESENTATION.rejected.label}`
		]);
		// Alias aus dem alten Filter-Parameter (`?verified=1`).
		expect(getActiveFiltersDisplay({ verified: '1' })).toEqual([
			`Status: ${SIGHTING_STATUS_PRESENTATION.approved.label}`
		]);
	});

	// Satzbau bleibt, das Wort kommt aus AUFNAHME_LABEL — sonst heißt derselbe
	// Filter im Panel „Mit" und im Export „mit Aufnahmen", sobald einer der
	// beiden angefasst wird.
	it('baut den Aufnahme-Satz aus AUFNAHME_LABEL', () => {
		expect(getActiveFiltersDisplay({ mediaUpload: '1' })).toEqual([
			`Nur ${AUFNAHME_LABEL['1'].toLowerCase()} Aufnahmen`
		]);
		expect(getActiveFiltersDisplay({ mediaUpload: '0' })).toEqual([
			`Nur ${AUFNAHME_LABEL['0'].toLowerCase()} Aufnahmen`
		]);
		expect(getActiveFiltersDisplay({ mediaUpload: MEDIA_UPLOAD_ANNOUNCED_MISSING })).toEqual([
			`Nur ${AUFNAHME_LABEL[MEDIA_UPLOAD_ANNOUNCED_MISSING].toLowerCase()}`
		]);
	});

	it('benennt die Meldeart aus MELDEART_LABEL', () => {
		expect(getActiveFiltersDisplay({ deadFinding: '1' })).toEqual([
			`Meldeart: ${DEAD_FINDING_PRESENTATION.label}`
		]);
		expect(getActiveFiltersDisplay({ deadFinding: '0' })).toEqual([
			`Meldeart: ${MELDEART_LABEL['0']}`
		]);
	});
});
