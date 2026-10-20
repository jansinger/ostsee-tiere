/**
 * Pagination and page data interfaces
 */

import type { FrontendSighting } from './FrontendSighting.js';

export interface Pagination {
	page: number;
	perPage: number;
	totalPages: number;
	total: number;
	maxPerPage?: number;
}

export interface PageData {
	sightings: FrontendSighting[];
	pagination: Pagination;
	/**
	 * Arbeitslisten-Zähler „Foto angekündigt, fehlt noch" — Sichtungen mit
	 * `mediaUpload` gesetzt, aber ohne angehängte Datei
	 * (`#lib/utils/media/photoAnnouncement.ts`). Unabhängig vom aktiven
	 * Filter, damit er im Dashboard-Kopf immer sichtbar ist.
	 */
	pendingPhotoAnnouncements?: number;
	/**
	 * Kommt aus `admin/+layout.server.ts` und liegt damit an jeder Admin-Seite
	 * an. Steuert die Bedienelemente für `POST /api/admin/test-email`, das
	 * `superadmin` verlangt. Optional, weil der Typ auch außerhalb des
	 * Admin-Layouts verwendet wird.
	 */
	isSuperAdmin?: boolean;
}
