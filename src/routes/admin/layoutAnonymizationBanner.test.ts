/**
 * Die Hinweisleiste der Anonymisierung muss bei jeder Navigation im
 * Admin-Bereich frisch sein. SvelteKit lädt ein Layout bei Client-Navigation
 * nur neu, wenn sein `load` etwas liest, das sich ändert — ohne Zugriff auf
 * `url.pathname` bliebe die Leiste bis zum nächsten harten Reload auf dem
 * Stand der ersten Seite (Review PR #1013).
 */
import { describe, expect, it, vi } from 'vitest';

const { loadAnonymizationBanner } = vi.hoisted(() => ({ loadAnonymizationBanner: vi.fn() }));

vi.mock('#lib/server/auth/auth.ts', () => ({
	requireUserRole: vi.fn(),
	isSuperAdminUser: vi.fn(() => false)
}));
vi.mock('#lib/server/startup/versionInfo.ts', () => ({ getBuildInfo: () => ({}) }));
vi.mock('#lib/server/privacy/anonymizationStatus.ts', () => ({ loadAnonymizationBanner }));

import { load } from './+layout.server';

/** URL, die festhält, welche Eigenschaften gelesen wurden. */
function trackedUrl(href: string): { url: URL; read: Set<string> } {
	const read = new Set<string>();
	const target = new URL(href);
	const url = new Proxy(target, {
		get(object, property, receiver) {
			if (typeof property === 'string') read.add(property);
			const value = Reflect.get(object, property, receiver === url ? object : receiver);
			return typeof value === 'function' ? value.bind(object) : value;
		}
	});
	return { url, read };
}

describe('admin/+layout.server — Hinweisleiste', () => {
	it('liest url.pathname, damit das Layout bei jeder Navigation neu lädt', async () => {
		loadAnonymizationBanner.mockResolvedValue({ level: 'ok', reasons: [], overdue: 0 });
		const { url, read } = trackedUrl('https://x/admin/sichtungen');

		await load({ locals: { user: { sub: 'u', roles: ['admin'] } }, url } as never);

		expect(read.has('pathname')).toBe(true);
	});

	it('liefert den aktuellen Status bei jedem Aufruf', async () => {
		const { url } = trackedUrl('https://x/admin');
		loadAnonymizationBanner
			.mockResolvedValueOnce({ level: 'ok', reasons: [], overdue: 0 })
			.mockResolvedValueOnce({ level: 'alert', reasons: ['stale_run'], overdue: 0 });
		const event = { locals: { user: { sub: 'u', roles: ['admin'] } }, url } as never;

		const first = (await load(event)) as { anonymization: unknown };
		const second = (await load(event)) as { anonymization: unknown };

		expect(first.anonymization).toMatchObject({ level: 'ok' });
		expect(second.anonymization).toMatchObject({ level: 'alert' });
	});
});
