/**
 * @fileoverview Foto-Ankündigung in der Admin-Detailansicht.
 *
 * Der neu gebaute iOS-Client setzt `mediaUpload`, kann aber keine Datei
 * hochladen — das Foto kommt per E-Mail nach. Ohne Einordnung zeigte die
 * Detailansicht dafür nur „Upload: Ja" ohne jede Datei, was wie ein defekter
 * Datensatz aussieht. Siehe `$lib/utils/media/photoAnnouncement.ts`.
 */
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AdminSightingView from './AdminSightingView.svelte';
import type { FrontendSighting } from '$lib/types';
import {
	PHOTO_ANNOUNCEMENT_LABEL,
	PHOTO_ANNOUNCEMENT_TITLE
} from '$lib/utils/media/photoAnnouncement';

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
		uploadedFiles: [],
		...overrides
	} as unknown as FrontendSighting;
}

describe('AdminSightingView — Foto-Ankündigung', () => {
	it('zeigt einen Hinweis statt der reinen Ja/Nein-Anzeige, wenn ein Foto angekündigt, aber keine Datei angehängt ist', async () => {
		render(AdminSightingView, {
			sighting: baseSighting({ mediaUpload: 1, uploadedFiles: [] })
		});

		const hint = page.getByText(PHOTO_ANNOUNCEMENT_LABEL);
		await expect.element(hint).toBeVisible();
		await expect.element(hint).toHaveClass(/badge-info/);
		await expect.element(hint).toHaveAttribute('title', PHOTO_ANNOUNCEMENT_TITLE);
	});

	it('zeigt weiterhin die einfache Ja/Nein-Anzeige, wenn kein Foto angekündigt wurde', async () => {
		render(AdminSightingView, {
			sighting: baseSighting({ mediaUpload: 0, uploadedFiles: [] })
		});

		// Mehrere Zeilen zeigen „Nein" (Totfund, Namensnennung, …) — deshalb
		// gezielt die Upload-Zeile über ihre Beschriftung greifen.
		await expect.element(page.getByRole('row', { name: 'Upload Nein' })).toBeVisible();
		expect(document.body.textContent).not.toContain(PHOTO_ANNOUNCEMENT_LABEL);
	});

	it('zeigt keinen Ankündigungs-Hinweis mehr, sobald eine Datei angehängt wurde (Medien-Galerie übernimmt)', async () => {
		render(AdminSightingView, {
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
		render(AdminSightingView, {
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
