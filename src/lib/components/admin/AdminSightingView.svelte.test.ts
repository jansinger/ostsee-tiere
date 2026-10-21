/**
 * @fileoverview Foto-Ankündigung in der Admin-Detailansicht.
 *
 * Der neu gebaute iOS-Client setzt `mediaUpload`, kann aber keine Datei
 * hochladen — das Foto kommt per E-Mail nach. Ohne Einordnung zeigte die
 * Detailansicht dafür nur „Upload: Ja" ohne jede Datei, was wie ein defekter
 * Datensatz aussieht. Siehe `#lib/utils/media/photoAnnouncement.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AdminSightingView from './AdminSightingView.svelte';
import { DEAD_FINDING_PRESENTATION } from './deadFinding';
import type { FrontendSighting } from '#lib/types/index.ts';
import { EntryChannelEnum } from '#lib/report/formOptions/entryChannel.ts';
import {
	PHOTO_ANNOUNCEMENT_LABEL,
	PHOTO_ANNOUNCEMENT_TITLE
} from '#lib/utils/media/photoAnnouncement.ts';

// Minimales Objekt, wie an anderer Stelle bereits üblich
// (src/lib/server/export/csvExport.timezone.test.ts) — die Komponente prüft
// zur Laufzeit nur die tatsächlich gelesenen Felder, nicht das volle Schema.
// `created` liegt bewusst NACH NEW_IOS_CLIENT_LAUNCH_DATE (2026-07-30): nur
// Sichtungen ab dann können „wartet auf E-Mail" bedeuten — siehe den
// eigenen Test unten für Altbestand vor diesem Datum.
function baseSighting(overrides: Record<string, unknown> = {}): FrontendSighting {
	return {
		id: 1,
		species: 0,
		totalCount: 1,
		sightingDate: new Date('2026-07-30T10:00:00Z'),
		created: new Date('2026-07-30T09:00:00Z'),
		mediaFile: null,
		mediaUpload: 0,
		mediaConsent: 0,
		// App-Kanal: Nur dort kann ein Client ein Foto ankündigen, ohne es zu
		// übertragen (`photoAnnouncement.ts`). Ein eigener Test unten deckt die
		// übrigen Kanäle ab.
		entryChannel: EntryChannelEnum.APP,
		uploadedFiles: [],
		...overrides
	} as unknown as FrontendSighting;
}

describe('AdminSightingView — Foto-Ankündigung', () => {
	it('zeigt einen Hinweis statt der reinen Ja/Nein-Anzeige, wenn ein Foto angekündigt, aber keine Datei angehängt ist', async () => {
		await render(AdminSightingView, {
			sighting: baseSighting({ mediaUpload: 1, uploadedFiles: [] })
		});

		const hint = page.getByText(PHOTO_ANNOUNCEMENT_LABEL);
		await expect.element(hint).toBeVisible();
		await expect.element(hint).toHaveClass(/badge-info/);
		await expect.element(hint).toHaveAttribute('title', PHOTO_ANNOUNCEMENT_TITLE);
	});

	it('zeigt weiterhin die einfache Ja/Nein-Anzeige, wenn kein Foto angekündigt wurde', async () => {
		await render(AdminSightingView, {
			sighting: baseSighting({ mediaUpload: 0, uploadedFiles: [] })
		});

		// Mehrere Zeilen zeigen „Nein" (Namensnennung, Schiffsnennung, …) —
		// deshalb gezielt die Upload-Zeile über ihre Beschriftung greifen.
		await expect.element(page.getByRole('row', { name: 'Upload Nein' })).toBeVisible();
		expect(document.body.textContent).not.toContain(PHOTO_ANNOUNCEMENT_LABEL);
	});

	it('zeigt keinen Ankündigungs-Hinweis mehr, sobald eine Datei angehängt wurde (Medien-Galerie übernimmt)', async () => {
		await render(AdminSightingView, {
			sighting: baseSighting({
				mediaUpload: 1,
				uploadedFiles: [
					{
						id: 1,
						fileName: 'foto.jpg',
						originalName: 'foto.jpg',
						mimeType: 'image/jpeg',
						size: 1234,
						url: '/uploads/foto.jpg'
					}
				]
			})
		});

		expect(document.body.textContent).not.toContain(PHOTO_ANNOUNCEMENT_LABEL);
	});

	// Live auf der lokalen DB gefunden: `aufnahmeHochladen` trägt 13 Jahre
	// Altbestand, dessen Bedeutung nicht „wartet auf E-Mail vom neuen Client"
	// ist. Eine Sichtung von vor dem Client-Start darf den Hinweis deshalb
	// trotz gesetztem Flag und fehlender Datei nicht zeigen.
	it('zeigt keinen Ankündigungs-Hinweis für Altbestand von vor dem Client-Start', async () => {
		await render(AdminSightingView, {
			sighting: baseSighting({
				mediaUpload: 1,
				uploadedFiles: [],
				created: new Date('2015-03-12T08:00:00Z')
			})
		});

		await expect.element(page.getByRole('row', { name: 'Upload Ja' })).toBeVisible();
		expect(document.body.textContent).not.toContain(PHOTO_ANNOUNCEMENT_LABEL);
	});
});

/**
 * Totfund vs. Lebendsichtung.
 *
 * **Der Befund:** Die Karte „Totfund" wurde bei *jeder* Sichtung gerendert —
 * `deadAnimalRows` enthielt immer mindestens die Zeile „Totfund: Nein". Eine
 * Lebendsichtung behauptete damit optisch einen Totfund-Abschnitt, und beim
 * Überfliegen sahen beide Arten gleich aus.
 */
describe('AdminSightingView — Totfund-Auszeichnung', () => {
	it('zeichnet einen Totfund über allen Angaben aus und zeigt die Totfund-Karte', async () => {
		await render(AdminSightingView, {
			sighting: baseSighting({ isDead: 1, deadCondition: 1, deadSize: 142 })
		});

		await expect.element(page.getByText(DEAD_FINDING_PRESENTATION.description)).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Totfund' })).toBeVisible();
		await expect.element(page.getByRole('row', { name: 'Größe 142 cm' })).toBeVisible();
	});

	// Die Überschrift der Karte sagt es bereits — die Zeile darunter wiederholte
	// sie nur und kostete eine Zeile in einer ohnehin dichten Ansicht.
	it('wiederholt „Totfund" nicht als eigene Ja-Zeile in der Karte', async () => {
		await render(AdminSightingView, {
			sighting: baseSighting({ isDead: 1, deadCondition: 1 })
		});

		await expect.element(page.getByRole('heading', { name: 'Totfund' })).toBeVisible();
		expect(page.getByRole('row', { name: 'Totfund Ja' }).elements()).toHaveLength(0);
	});

	it('zeigt bei einer Lebendsichtung weder Kennzeichen noch Totfund-Karte', async () => {
		await render(AdminSightingView, {
			sighting: baseSighting({ isDead: 0 })
		});

		// Erst auf etwas warten, das sicher gerendert ist — sonst prüfte die
		// Abwesenheit unter Umständen einen noch leeren Baum und wäre grün,
		// ohne etwas zu belegen.
		await expect.element(page.getByRole('heading', { name: 'Tierinformationen' })).toBeVisible();
		expect(document.body.textContent).not.toContain(DEAD_FINDING_PRESENTATION.description);
		expect(page.getByRole('heading', { name: 'Totfund' }).elements()).toHaveLength(0);
		expect(page.getByRole('row', { name: 'Totfund Nein' }).elements()).toHaveLength(0);
	});
});

describe('AdminSightingView — Eingangskanal der Foto-Ankündigung', () => {
	it.each([
		['Web', EntryChannelEnum.WEB],
		['E-Mail', EntryChannelEnum.EMAIL],
		['Post', EntryChannelEnum.MAIL]
	])(
		'zeigt bei einer über %s eingegangenen Meldung keinen Ankündigungs-Hinweis — dort liegt das Foto bereits vor',
		async (_kanal, entryChannel) => {
			await render(AdminSightingView, {
				sighting: baseSighting({ mediaUpload: 1, uploadedFiles: [], entryChannel })
			});

			await expect.element(page.getByRole('row', { name: 'Upload Ja' })).toBeVisible();
			expect(document.body.textContent).not.toContain(PHOTO_ANNOUNCEMENT_LABEL);
		}
	);
});

/**
 * Statusleiste im Kopfbereich (Task 7).
 *
 * Der Status stand vorher an drei verstreuten Stellen — „Verifiziert: Ja/Nein"
 * in der Status-Karte, „Abgelehnt am …" daneben, „Freigegeben am …" in der
 * Datum-Karte — und ließ sich nirgends ändern. Jetzt steht er als eine
 * Segmented-Control-Leiste im Kopfbereich und ist dort auch änderbar.
 */
describe('AdminSightingView — Statusleiste im Kopfbereich', () => {
	it('zeigt den Status im Kopfbereich statt in drei verstreuten Zeilen', async () => {
		const screen = await render(AdminSightingView, {
			sighting: baseSighting({ approvedAt: new Date('2026-03-12T09:00:00Z') }),
			onStatusChange: vi.fn()
		});

		await expect.element(screen.getByRole('radio', { name: 'Freigegeben' })).toBeChecked();
		expect(screen.container.textContent).not.toContain('Verifiziert');
		// Der Zeitpunkt zieht in die Statusleiste um (als Fließtext neben den
		// Radios) — geprüft ist hier, dass er nicht mehr als eigene Tabellenzeile
		// in der Datum-Karte auftaucht, wie vorher unter „Datum & Zeit".
		expect(screen.getByRole('row', { name: /^Freigegeben am/ }).elements()).toHaveLength(0);
	});

	it('nennt Zeitpunkt und Bearbeiter der Freigabe', async () => {
		const screen = await render(AdminSightingView, {
			sighting: baseSighting({
				approvedAt: new Date('2026-03-12T09:00:00Z'),
				approvedBy: 'bernd@example.org'
			}),
			onStatusChange: vi.fn()
		});

		await expect.element(screen.getByRole('radio', { name: 'Freigegeben' })).toBeChecked();
		expect(screen.container.textContent).toContain('bernd@example.org');
	});

	// Altbestand aus dem Altsystem trägt `freigegeben_von` = NULL. Ein „durch
	// null" wäre die sichtbare Folge eines naiven Templates.
	it('zeigt bei Altbestand ohne Person nur das Freigabedatum', async () => {
		const screen = await render(AdminSightingView, {
			sighting: baseSighting({ approvedAt: new Date('2026-03-12T09:00:00Z'), approvedBy: null }),
			onStatusChange: vi.fn()
		});

		await expect.element(screen.getByRole('radio', { name: 'Freigegeben' })).toBeChecked();
		expect(screen.container.textContent).toContain('Freigegeben am');
		expect(screen.container.textContent).not.toContain('durch');
	});

	it('nennt Zeitpunkt und Bearbeiter der Ablehnung', async () => {
		const screen = await render(AdminSightingView, {
			sighting: baseSighting({
				rejectedAt: new Date('2026-03-12T09:00:00Z'),
				rejectedBy: 'anna@example.org'
			}),
			onStatusChange: vi.fn()
		});

		await expect.element(screen.getByRole('radio', { name: 'Abgelehnt' })).toBeChecked();
		expect(screen.container.textContent).toContain('anna@example.org');
		// Dieselbe Information darf nicht doppelt stehen — die alte Tabellenzeile
		// „Abgelehnt" (Status-Karte) ist entfernt, wie „Freigegeben am" oben.
		expect(screen.getByRole('row', { name: /^Abgelehnt/ }).elements()).toHaveLength(0);
	});

	it('meldet den Wechsel als Verdict', async () => {
		const onStatusChange = vi.fn();
		const screen = await render(AdminSightingView, { sighting: baseSighting({}), onStatusChange });

		await screen.getByRole('radio', { name: 'Abgelehnt' }).click();
		expect(onStatusChange).toHaveBeenCalledWith('reject');
	});

	it('rendert ohne Bedienelement — nur die Pille —, wenn onStatusChange fehlt', async () => {
		const screen = await render(AdminSightingView, { sighting: baseSighting({}) });

		expect(screen.getByRole('radiogroup').elements()).toHaveLength(0);
		await expect.element(screen.getByText('Offen')).toBeVisible();
	});
});

/**
 * Melder-Historie in der Kontakt-Karte (Task 6).
 *
 * `email` ist hier bewusst gesetzt (`basisProps()`), damit der
 * „Alle Meldungen dieses Melders"-Link geprüft werden kann.
 */
function basisProps(overrides: Record<string, unknown> = {}) {
	return {
		sighting: baseSighting({ email: 'melder@example.org', ...overrides })
	};
}

describe('AdminSightingView — Melder-Historie', () => {
	it('zeigt die Melder-Historie in der Kontakt-Karte', async () => {
		await render(AdminSightingView, {
			...basisProps(),
			reporterHistory: { approved: 23, rejected: 0, open: 2, since: '2019-03-04T08:00:00Z' }
		});

		await expect
			.element(page.getByTestId('reporter-badge'))
			.toHaveTextContent('Melder: 23 freigegeben');
		await expect.element(page.getByText('Melder seit 03/2019')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Alle Meldungen dieses Melders' }))
			.toHaveAttribute('href', '/admin/sichtungen?q=melder%40example.org');
	});

	/* Der Monat wird aus den UTC-Feldern zusammengesetzt und nicht über
	   `toLocaleDateString` formatiert: Dort käme das Trennzeichen aus den
	   ICU-Daten der Laufzeit („03/2019" oder „03.2019", je nach Version), und
	   die Zeitzone aus der des Browsers. Ein `since` am Monatsletzten kurz vor
	   Mitternacht UTC ist der Fall, an dem beides auffällt. */
	it('nennt den Monat in UTC, nicht in Browser-Ortszeit', async () => {
		await render(AdminSightingView, {
			...basisProps(),
			reporterHistory: { approved: 23, rejected: 0, open: 0, since: '2019-03-31T23:00:00Z' }
		});

		await expect.element(page.getByText('Melder seit 03/2019')).toBeVisible();
	});

	/* Die Gestaltprüfung im Loader prüft den Typ von `since`, nicht sein Format.
	   Eine unbrauchbare Zeichenkette darf deshalb nicht als „NaN/NaN" auf der
	   Arbeitsfläche landen — dann lieber gar keine Angabe. */
	it('verschweigt ein unbrauchbares Datum, statt NaN anzuzeigen', async () => {
		await render(AdminSightingView, {
			...basisProps(),
			reporterHistory: { approved: 23, rejected: 0, open: 0, since: 'kein Datum' }
		});

		await expect.element(page.getByTestId('reporter-badge')).toBeVisible();
		await expect.element(page.getByText(/Melder seit/)).not.toBeInTheDocument();
	});

	/* „Nicht ermittelt" ist nicht „keine Vorgeschichte" — der Fehlschlag muss
	   als dritter Fall sichtbar sein, sonst liest sich eine Lücke wie ein
	   Befund (gleiche Konstruktion wie beim Status-Log). */
	it('benennt einen Fehlschlag statt eine leere Historie zu behaupten', async () => {
		await render(AdminSightingView, {
			...basisProps(),
			reporterHistory: null,
			reporterHistoryFailed: true
		});

		await expect
			.element(page.getByText('Melder-Historie konnte nicht geladen werden'))
			.toBeVisible();
		await expect.element(page.getByTestId('reporter-badge')).not.toBeInTheDocument();
	});

	/* `since` enthält bewusst die aktuelle Meldung. Bei einem Erstmelder stünde
	   dort das heutige Datum — „Melder seit 08/2026" behauptete eine
	   Vorgeschichte, die es gerade nicht gibt. */
	it('nennt kein „Melder seit" bei einer Erstmeldung', async () => {
		await render(AdminSightingView, {
			...basisProps(),
			reporterHistory: { approved: 0, rejected: 0, open: 0, since: '2026-08-10T09:00:00Z' }
		});

		await expect.element(page.getByTestId('reporter-badge')).toHaveTextContent('Erstmeldung');
		await expect.element(page.getByText(/Melder seit/)).not.toBeInTheDocument();
	});

	/* Ohne Adresse gibt es weder Badge noch Link. Ohne die Bedingung am Wrapper
	   bliebe eine leere Trennlinie samt Abstand stehen — ein Rahmen um nichts. */
	it('rendert ohne E-Mail-Adresse gar keinen Historien-Block', async () => {
		const props = basisProps();
		await render(AdminSightingView, {
			...props,
			sighting: { ...props.sighting, email: null },
			reporterHistory: null
		});

		await expect.element(page.getByTestId('reporter-history-block')).not.toBeInTheDocument();
	});
});

describe('AdminSightingView — Client-Kennung', () => {
	it('zeigt die Client-Kennung als eigene Zeile', async () => {
		await render(AdminSightingView, {
			sighting: baseSighting({ entryClient: 'OstSeeTiere/8' })
		});

		await expect.element(page.getByRole('row', { name: 'Client OstSeeTiere/8' })).toBeVisible();
	});

	it('lässt die Zeile bei Altbestand ohne Kennung weg', async () => {
		// NULL heißt „vor Einführung der Spalte". Eine leere Zeile wäre eine
		// Aussage, die die Daten nicht hergeben.
		await render(AdminSightingView, { sighting: baseSighting({ entryClient: null }) });

		expect(document.body.textContent).not.toContain('Client');
	});
});
