import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { ReporterHistory } from '#lib/types/reporterHistory.ts';
import ReporterHistoryBadge from './ReporterHistoryBadge.svelte';

function historie(overrides: Partial<ReporterHistory> = {}): ReporterHistory {
	return { approved: 0, rejected: 0, open: 0, since: '2019-03-04T08:00:00Z', ...overrides };
}

describe('ReporterHistoryBadge', () => {
	it('nennt die Zahl der freigegebenen Meldungen', async () => {
		await render(ReporterHistoryBadge, { history: historie({ approved: 23 }) });

		await expect
			.element(page.getByTestId('reporter-badge'))
			.toHaveTextContent('Melder: 23 freigegeben');
	});

	it('zeigt die Erstmeldung als eigenen Befund', async () => {
		await render(ReporterHistoryBadge, { history: historie() });

		await expect.element(page.getByTestId('reporter-badge')).toHaveTextContent('Erstmeldung');
	});

	/* Ohne Daten gibt es nichts zu behaupten — ein graues „Melder: –" läse sich
	   wie ein Befund. Gleiche Regel wie beim Spam-Badge für `NULL`. */
	it('rendert ohne Historie gar kein Badge', async () => {
		await render(ReporterHistoryBadge, { history: null });

		await expect.element(page.getByTestId('reporter-badge')).not.toBeInTheDocument();
	});

	it('warnt sichtbar bei überwiegend abgelehnten Meldungen', async () => {
		await render(ReporterHistoryBadge, { history: historie({ approved: 1, rejected: 2 }) });

		const badge = page.getByTestId('reporter-badge');
		await expect.element(badge).toHaveClass(/badge-warning/);
		await expect.element(badge).toHaveTextContent('Melder: 2 von 3 abgelehnt');
	});

	/* Der `title` ist nur per Maus erreichbar — dieselbe Aussage muss für
	   Screenreader danebenstehen (WCAG 1.4.1, wie beim Spam-Badge). */
	it('trägt die Erklärung zusätzlich für Screenreader', async () => {
		await render(ReporterHistoryBadge, { history: historie({ approved: 23 }) });

		await expect
			.element(page.getByText('Viele frühere Meldungen dieser Adresse wurden freigegeben'))
			.toBeInTheDocument();
	});

	/* Fünf der sechs Stufen teilen sich `badge-ghost` — das Icon ist die
	   farbunabhängige Unterscheidung (WCAG 1.4.1). Eine reine Text-Assertion
	   bemerkt es nicht, wenn die `<Icon>`-Zeile verschwindet: Der Badge-Text
	   bliebe unverändert. Geprüft wird deshalb im DOM (`<svg>` im Badge), nicht
	   über den Quelltext. */
	it('rendert ein Icon im Badge', async () => {
		await render(ReporterHistoryBadge, { history: historie({ approved: 23 }) });

		const badge = page.getByTestId('reporter-badge');
		await expect.element(badge).toBeInTheDocument();
		expect(badge.element().querySelector('svg')).not.toBeNull();
	});

	/* Zwei Stufen mit unterschiedlichem Icon — die Unterscheidung muss nicht
	   nur „irgendein Icon", sondern ein je nach Stufe verschiedenes sein. */
	it('zeigt bei flagged ein anderes Icon als bei first', async () => {
		const { container: flaggedContainer } = await render(ReporterHistoryBadge, {
			history: historie({ approved: 1, rejected: 2 })
		});
		const flaggedIcon = flaggedContainer.querySelector('[data-testid="reporter-badge"] svg');

		const { container: firstContainer } = await render(ReporterHistoryBadge, {
			history: historie()
		});
		const firstIcon = firstContainer.querySelector('[data-testid="reporter-badge"] svg');

		expect(flaggedIcon).not.toBeNull();
		expect(firstIcon).not.toBeNull();
		expect(flaggedIcon?.outerHTML).not.toBe(firstIcon?.outerHTML);
	});

	/* Text und Icon sind bei 5 und bei 30 Freigaben identisch — ohne die
	   Flächenfarbe wäre die Stufe im DOM nicht vorhanden, und die Schwelle 10
	   bliebe eine reine Tooltip-Angelegenheit. Ein Zwischenschritt mit Tönungen
	   (`bg-primary/10` und `/20`) war im Betrieb nicht zu erkennen; deshalb
	   jetzt eine Vollton-Fläche. Geprüft wird die gerenderte Klasse, nicht das
	   Präsentationsobjekt: Die Komponente könnte sie sonst still fallenlassen. */
	it('hebt die etablierte Stufe farblich von der bekannten ab', async () => {
		const klasse = async (approved: number) => {
			const { container } = await render(ReporterHistoryBadge, { history: historie({ approved }) });
			return container.querySelector('[data-testid="reporter-badge"]')?.className ?? '';
		};

		// Vollton bei 30, Soft-Variante bei 5 — beide tragen `badge-success`,
		// unterschieden werden sie über `badge-soft`.
		expect(await klasse(30)).toContain('badge-success');
		expect(await klasse(30)).not.toContain('badge-soft');
		expect(await klasse(5)).toContain('badge-soft');
		expect(await klasse(1)).toContain('badge-soft');
		expect(await klasse(0)).toContain('badge-neutral');
	});
});
