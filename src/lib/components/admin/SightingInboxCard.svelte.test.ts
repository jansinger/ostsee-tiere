import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import SightingInboxCard from './SightingInboxCard.svelte';
import { inboxDetailHref } from './adminReturn';
import type { SightingSelect } from '#lib/server/db/schema.ts';

/* actionLabel ('Freigeben'/'Ablehnen') trägt zufällig dieselben Wörter wie die
   frühere, fest verdrahtete Beschriftung — ein Test gegen die echte Quelle
   bewiese damit nicht, dass die Karte aus ihr liest. Der Mock trägt bewusst
   abweichende Werte, damit ein Rückfall auf feste Strings den Test rot macht. */
vi.mock('./sightingStatus', async () => {
	const actual = await vi.importActual<typeof import('./sightingStatus')>('./sightingStatus');
	return {
		...actual,
		SIGHTING_STATUS_PRESENTATION: {
			...actual.SIGHTING_STATUS_PRESENTATION,
			approved: { ...actual.SIGHTING_STATUS_PRESENTATION.approved, actionLabel: 'TESTFREIGABE' },
			rejected: { ...actual.SIGHTING_STATUS_PRESENTATION.rejected, actionLabel: 'TESTABLEHNUNG' }
		}
	};
});

const { SIGHTING_STATUS_PRESENTATION } = await import('./sightingStatus');

const basisSichtung = {
	id: 42,
	created: new Date('2026-08-01T10:00:00Z'),
	sightingDate: new Date('2026-07-30T08:00:00Z'),
	species: 0,
	totalCount: 3,
	juvenileCount: 1,
	isDead: 0,
	email: 'melder@example.com',
	firstName: 'Kim',
	lastName: 'Muster',
	spamScore: null,
	inBalticSea: 1,
	inBalticSeaGeo: 1
} as unknown as SightingSelect;

const noop = () => {};

/* Props des ersten Aufrufs — Grundlage für den Rest der Datei. Neue Tests
   bauen darauf auf, statt die Props erneut abzuschreiben. */
function basisProps() {
	return {
		sighting: basisSichtung,
		images: [],
		busy: false,
		onApprove: noop,
		onReject: noop
	};
}

describe('SightingInboxCard', () => {
	it('zeigt Tierart, Anzahl, E-Mail und Meldedatum', async () => {
		const screen = await render(SightingInboxCard, basisProps());
		await expect.element(screen.getByText(/Schweinswal/)).toBeInTheDocument();
		await expect.element(screen.getByText('melder@example.com')).toBeInTheDocument();
	});

	it('zeigt Fahrwasser/Ort, wenn angegeben', async () => {
		const screen = await render(SightingInboxCard, {
			sighting: { ...basisSichtung, waterway: 'Kieler Förde, Höhe Laboe' } as SightingSelect,
			images: [],
			busy: false,
			onApprove: noop,
			onReject: noop
		});
		await expect.element(screen.getByText(/Kieler Förde, Höhe Laboe/)).toBeInTheDocument();
	});

	it('zeichnet einen Totfund aus, eine Lebendsichtung nicht', async () => {
		const tot = await render(SightingInboxCard, {
			sighting: { ...basisSichtung, isDead: 1 } as SightingSelect,
			images: [],
			busy: false,
			onApprove: noop,
			onReject: noop
		});
		await expect.element(tot.getByText('Totfund')).toBeInTheDocument();
	});

	it('Spam-Score: hoher Score → error-Badge', async () => {
		const hoch = await render(SightingInboxCard, {
			sighting: { ...basisSichtung, spamScore: 7 } as SightingSelect,
			images: [],
			busy: false,
			onApprove: noop,
			onReject: noop
		});
		const badge = hoch.getByTestId('spam-badge');
		await expect.element(badge).toHaveClass(/badge-error/);
		// Die Bedeutung hängt nicht allein an der Farbe (WCAG 1.4.1).
		await expect.element(badge).toHaveTextContent('Hochrisiko');
	});

	it('Spam-Score null bekommt kein Badge — „nie bewertet" ist kein Prüfergebnis', async () => {
		// `basisSichtung` trägt `spamScore: null`. Die Karte zeigte dafür ein
		// graues „Spam: –" und sah damit aus wie Score 0 („geprüft, unauffällig").
		// Die Tabellenspalte lässt das Badge weg; jetzt beide gleich.
		const ohne = await render(SightingInboxCard, {
			sighting: basisSichtung,
			images: [],
			busy: false,
			onApprove: noop,
			onReject: noop
		});
		expect(ohne.container.querySelector('[data-testid="spam-badge"]')).toBeNull();
	});

	it('Spam-Score 0 bekommt ein Badge — bewertet und unauffällig', async () => {
		const null_ist_nicht_null = await render(SightingInboxCard, {
			sighting: { ...basisSichtung, spamScore: 0 } as SightingSelect,
			images: [],
			busy: false,
			onApprove: noop,
			onReject: noop
		});
		const badge = null_ist_nicht_null.getByTestId('spam-badge');
		await expect.element(badge).toHaveTextContent('Spam: 0');
	});

	it('Freigeben/Ablehnen rufen die Callbacks, busy deaktiviert beide', async () => {
		const onApprove = vi.fn();
		const onReject = vi.fn();
		const screen = await render(SightingInboxCard, {
			sighting: basisSichtung,
			images: [],
			busy: false,
			onApprove,
			onReject
		});
		await screen
			.getByRole('button', { name: SIGHTING_STATUS_PRESENTATION.approved.actionLabel })
			.click();
		expect(onApprove).toHaveBeenCalledOnce();
		await screen
			.getByRole('button', { name: SIGHTING_STATUS_PRESENTATION.rejected.actionLabel })
			.click();
		expect(onReject).toHaveBeenCalledOnce();
	});

	/* Die Karte benennt die Triage-Ziele wie Tabelle und Detailansicht — sonst
	   heißt derselbe Vorgang je nach Seite anders. Zustandswort und
	   Handlungswort sind verschieden: Das Segment heißt „Freigegeben", der
	   Knopf „Freigeben". */
	it('beschriftet die Aktionen aus der gemeinsamen Statusquelle', async () => {
		const screen = await render(SightingInboxCard, {
			sighting: basisSichtung,
			images: [],
			busy: false,
			onApprove: vi.fn(),
			onReject: vi.fn()
		});

		await expect
			.element(
				screen.getByRole('button', { name: SIGHTING_STATUS_PRESENTATION.approved.actionLabel })
			)
			.toBeInTheDocument();
		await expect
			.element(
				screen.getByRole('button', { name: SIGHTING_STATUS_PRESENTATION.rejected.actionLabel })
			)
			.toBeInTheDocument();
	});

	/* Duplikat-Hinweis (Spec B2). Er ist ausdrücklich nur ein Hinweis: kein
	   Auto-Merge, keine Vorauswahl — deshalb prüfen die Tests, dass er ohne
	   Kandidaten gar nicht erscheint und mit Kandidaten in die Detailansicht
	   verlinkt, statt selbst etwas zu entscheiden. */
	describe('Duplikat-Hinweis', () => {
		const kandidaten = [
			{ id: 101, sightingDate: '2026-07-30T08:30:00Z', species: 0, reason: 'email' as const },
			{ id: 102, sightingDate: '2026-07-30T09:15:00Z', species: 1, reason: 'position' as const }
		];

		it('bleibt ohne Kandidaten unsichtbar', async () => {
			const screen = await render(SightingInboxCard, {
				sighting: basisSichtung,
				images: [],
				duplicates: [],
				busy: false,
				onApprove: noop,
				onReject: noop
			});
			await expect.element(screen.getByTestId('duplicate-badge')).not.toBeInTheDocument();
		});

		it('nennt die Anzahl ähnlicher Meldungen', async () => {
			const screen = await render(SightingInboxCard, {
				sighting: basisSichtung,
				images: [],
				duplicates: kandidaten,
				busy: false,
				onApprove: noop,
				onReject: noop
			});
			await expect
				.element(screen.getByTestId('duplicate-badge'))
				.toHaveTextContent('2 ähnliche Meldungen');
		});

		it('sagt bei genau einem Kandidaten „1 ähnliche Meldung"', async () => {
			const screen = await render(SightingInboxCard, {
				sighting: basisSichtung,
				images: [],
				duplicates: kandidaten.slice(0, 1),
				busy: false,
				onApprove: noop,
				onReject: noop
			});
			await expect
				.element(screen.getByTestId('duplicate-badge'))
				.toHaveTextContent('1 ähnliche Meldung');
		});

		it('verlinkt jeden Kandidaten auf seine Detailansicht', async () => {
			const screen = await render(SightingInboxCard, {
				sighting: basisSichtung,
				images: [],
				duplicates: kandidaten,
				busy: false,
				onApprove: noop,
				onReject: noop
			});
			await screen.getByTestId('duplicate-badge').click();

			await expect
				.element(screen.getByRole('link', { name: /#101/ }))
				.toHaveAttribute('href', inboxDetailHref(101));
			await expect
				.element(screen.getByRole('link', { name: /#102/ }))
				.toHaveAttribute('href', inboxDetailHref(102));
		});
	});

	/* Ohne den Herkunfts-Marker führt der Zurück-Knopf der Detailansicht in die
	   Tabelle statt in den Eingang — das Abarbeiten der Liste reißt dann bei
	   jedem Blick ins Detail ab. Der Marker gehört an *jeden* Link der Karte,
	   nicht nur an den auffälligsten. */
	it('markiert jeden Detail-Link mit der Herkunft „Eingang"', async () => {
		const screen = await render(SightingInboxCard, {
			sighting: basisSichtung,
			images: [],
			busy: false,
			onApprove: noop,
			onReject: noop
		});

		await expect
			.element(screen.getByRole('link', { name: 'Details' }))
			.toHaveAttribute('href', inboxDetailHref(42));
		await expect
			.element(screen.getByRole('link', { name: /Schweinswal/ }))
			.toHaveAttribute('href', inboxDetailHref(42));
	});

	/* Die Sortierung muss mit auf die Reise: Sie gehört dem Eingang, nicht der
	   Tabelle, und ohne sie steht die Liste nach dem Rückweg wieder auf `desc`. */
	it('nimmt die Sortierung des Eingangs in den Detail-Link auf', async () => {
		const screen = await render(SightingInboxCard, {
			sighting: basisSichtung,
			images: [],
			order: 'asc' as const,
			busy: false,
			onApprove: noop,
			onReject: noop
		});

		await expect
			.element(screen.getByRole('link', { name: 'Details' }))
			.toHaveAttribute('href', inboxDetailHref(42, 'asc'));
		expect(inboxDetailHref(42, 'asc')).toContain('order=asc');
	});

	it('rendert Bild-Vorschauen über /api/media', async () => {
		const screen = await render(SightingInboxCard, {
			sighting: basisSichtung,
			images: [{ id: 1, filePath: '2026/08/foo.jpg', originalName: 'foo.jpg' }],
			busy: false,
			onApprove: noop,
			onReject: noop
		});
		const img = screen.getByRole('img', { name: 'foo.jpg' });
		await expect.element(img).toHaveAttribute('src', '/api/media/2026/08/foo.jpg');
	});

	it('zeigt die Melder-Historie neben dem Spam-Badge', async () => {
		await render(SightingInboxCard, {
			...basisProps(),
			reporterHistory: { approved: 23, rejected: 0, open: 1, since: '2019-03-04T08:00:00Z' }
		});

		await expect
			.element(page.getByTestId('reporter-badge'))
			.toHaveTextContent('Melder: 23 freigegeben');
	});

	/* Die Historie ist Zusatzinformation und wird fail-open geladen: Ohne sie
	   muss die Karte vollständig bedienbar bleiben. */
	it('bleibt ohne Melder-Historie vollständig', async () => {
		await render(SightingInboxCard, { ...basisProps(), reporterHistory: null });

		await expect.element(page.getByTestId('reporter-badge')).not.toBeInTheDocument();
		// Literal 'Freigeben' träfe nicht: die Datei mockt den Beschriftungstext
		// weiter oben bewusst auf 'TESTFREIGABE' (Begründung im Kommentar dort).
		await expect
			.element(
				page.getByRole('button', { name: SIGHTING_STATUS_PRESENTATION.approved.actionLabel })
			)
			.toBeVisible();
	});
});
