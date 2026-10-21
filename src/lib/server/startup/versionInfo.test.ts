import { beforeEach, describe, expect, it, vi } from 'vitest';
import { version as packageVersion } from '../../../../package.json';

vi.mock('#lib/server/env.ts', () => ({
	env: { APP_GIT_SHA: 'abcdef1234567890', APP_BUILD_DATE: '2026-07-31T10:00:00Z' }
}));

describe('formatStartupBanner', () => {
	it('enthält Version, Commit und Umgebung', async () => {
		const { formatStartupBanner, resolveBuildInfo } = await import('./versionInfo');
		const info = resolveBuildInfo('2.7.0', 'abc1234', '2026-07-31T10:00:00Z');

		const banner = formatStartupBanner(info, 'production');

		expect(banner).toContain('2.7.0');
		expect(banner).toContain('abc1234');
		expect(banner).toContain('2026-07-31T10:00:00Z');
		expect(banner).toContain('production');
	});

	it('kürzt einen vollen 40-Zeichen-SHA auf 7 Stellen, wie git es üblicherweise anzeigt', async () => {
		const { formatStartupBanner, resolveBuildInfo } = await import('./versionInfo');
		const info = resolveBuildInfo('2.7.0', '1234567890abcdef1234567890abcdef12345678', null);

		const banner = formatStartupBanner(info, 'production');

		expect(banner).toContain('1234567');
		expect(banner).not.toContain('1234567890abcdef');
	});

	it('markiert fehlende Werte als "unknown" statt sie zu verschweigen', async () => {
		// Ein lokaler `docker run` ohne Build-Args (kein --build-arg beim Bauen) liefert
		// leere Env-Variablen. Stillschweigend wegzulassen würde einen Docker-Start optisch
		// nicht von einem `npm run dev`-Start unterscheidbar machen — genau das soll die
		// Banner-Zeile verhindern.
		const { formatStartupBanner, resolveBuildInfo } = await import('./versionInfo');
		const info = resolveBuildInfo('2.7.0', null, null);

		const banner = formatStartupBanner(info, 'development');

		expect(banner).toContain('unknown');
	});
});

describe('resolveBuildInfo', () => {
	it('kürzt den SHA und behält Version/Build-Datum unverändert', async () => {
		const { resolveBuildInfo } = await import('./versionInfo');
		const info = resolveBuildInfo('2.7.0', '1234567890abcdef', '2026-07-31T10:00:00Z');

		expect(info).toEqual({
			version: '2.7.0',
			gitSha: '1234567890abcdef',
			shortGitSha: '1234567',
			buildDate: '2026-07-31T10:00:00Z'
		});
	});

	it('behandelt fehlenden/leeren SHA und Build-Datum als null bzw. "unknown"', async () => {
		const { resolveBuildInfo } = await import('./versionInfo');

		expect(resolveBuildInfo('2.7.0', undefined, undefined)).toEqual({
			version: '2.7.0',
			gitSha: null,
			shortGitSha: 'unknown',
			buildDate: null
		});

		// Ein leerer String ist der Zustand eines Build-Args, das zwar gesetzt aber
		// nicht befüllt wurde (z.B. `--build-arg VCS_REF=`) — soll wie "fehlt" behandelt werden.
		expect(resolveBuildInfo('2.7.0', '', '').gitSha).toBeNull();
	});
});

describe('getBuildInfo', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('liest Version aus package.json und Commit/Build-Datum aus den Docker-Build-Args', async () => {
		const { getBuildInfo } = await import('./versionInfo');

		const info = getBuildInfo();

		expect(info.version).toBe(packageVersion);
		expect(info.gitSha).toBe('abcdef1234567890');
		expect(info.shortGitSha).toBe('abcdef1');
		expect(info.buildDate).toBe('2026-07-31T10:00:00Z');
	});

	it('cached das Ergebnis statt bei jedem Aufruf neu aufzulösen', async () => {
		const { getBuildInfo } = await import('./versionInfo');

		// Gleiche Objekt-Referenz über mehrere Aufrufe hinweg belegt, dass nicht jedes Mal
		// neu berechnet wird — relevant, weil `/health` von Docker alle 30s abgefragt wird.
		expect(getBuildInfo()).toBe(getBuildInfo());
	});
});
