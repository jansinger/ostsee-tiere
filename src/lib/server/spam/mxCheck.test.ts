import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn().mockReturnValue({
		warn: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn()
	})
}));

import { checkMxRecords, clearMxCache } from './mxCheck';

type MxRecord = { exchange: string; priority: number };

function resolverWith(records: MxRecord[]): (domain: string) => Promise<MxRecord[]> {
	return vi.fn().mockResolvedValue(records);
}

function resolverThrowing(code?: string): (domain: string) => Promise<MxRecord[]> {
	const error = new Error(code ? `DNS-Fehler ${code}` : 'Generischer Fehler') as Error & {
		code?: string;
	};
	if (code) {
		error.code = code;
	}
	return vi.fn().mockRejectedValue(error);
}

describe('checkMxRecords', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearMxCache();
	});

	it('gibt has-mx zurück wenn MX-Records existieren', async () => {
		const resolveMx = resolverWith([{ exchange: 'mx1.example.com', priority: 10 }]);
		const result = await checkMxRecords('example.com', { resolveMx });
		expect(result).toBe('has-mx');
	});

	it('gibt no-mx zurück bei leerer Record-Liste', async () => {
		const resolveMx = resolverWith([]);
		const result = await checkMxRecords('example.com', { resolveMx });
		expect(result).toBe('no-mx');
	});

	it('gibt no-mx zurück bei ENOTFOUND (Domain existiert nicht)', async () => {
		const resolveMx = resolverThrowing('ENOTFOUND');
		const result = await checkMxRecords('nichtexistent.example', { resolveMx });
		expect(result).toBe('no-mx');
	});

	it('gibt no-mx zurück bei ENODATA (Domain ohne MX-Einträge)', async () => {
		const resolveMx = resolverThrowing('ENODATA');
		const result = await checkMxRecords('ohne-mx.example', { resolveMx });
		expect(result).toBe('no-mx');
	});

	it('gibt unknown zurück bei generischem Fehler ohne code', async () => {
		const resolveMx = resolverThrowing();
		const result = await checkMxRecords('example.com', { resolveMx });
		expect(result).toBe('unknown');
	});

	it('gibt unknown zurück bei DNS-Timeout', async () => {
		const resolveMx = vi.fn().mockReturnValue(new Promise<MxRecord[]>(() => {}));
		const result = await checkMxRecords('langsam.example', { resolveMx, timeoutMs: 50 });
		expect(result).toBe('unknown');
	});

	it('cacht Ergebnisse pro Domain (Resolver nur einmal aufgerufen)', async () => {
		const resolveMx = resolverWith([{ exchange: 'mx1.example.com', priority: 10 }]);
		const first = await checkMxRecords('example.com', { resolveMx });
		const second = await checkMxRecords('example.com', { resolveMx });
		expect(first).toBe('has-mx');
		expect(second).toBe('has-mx');
		expect(resolveMx).toHaveBeenCalledTimes(1);
	});

	it('ruft den Resolver nach clearMxCache erneut auf', async () => {
		const resolveMx = resolverWith([{ exchange: 'mx1.example.com', priority: 10 }]);
		await checkMxRecords('example.com', { resolveMx });
		clearMxCache();
		await checkMxRecords('example.com', { resolveMx });
		expect(resolveMx).toHaveBeenCalledTimes(2);
	});

	it('cacht unknown-Ergebnisse nicht', async () => {
		const failingResolver = resolverThrowing();
		const workingResolver = resolverWith([{ exchange: 'mx1.example.com', priority: 10 }]);

		const first = await checkMxRecords('example.com', { resolveMx: failingResolver });
		const second = await checkMxRecords('example.com', { resolveMx: workingResolver });

		expect(first).toBe('unknown');
		expect(second).toBe('has-mx');
		expect(failingResolver).toHaveBeenCalledTimes(1);
		expect(workingResolver).toHaveBeenCalledTimes(1);
	});

	it('behandelt Groß-/Kleinschreibung der Domain als denselben Cache-Eintrag', async () => {
		const resolveMx = resolverWith([{ exchange: 'mx1.example.com', priority: 10 }]);
		const first = await checkMxRecords('Example.COM', { resolveMx });
		const second = await checkMxRecords('example.com', { resolveMx });
		expect(first).toBe('has-mx');
		expect(second).toBe('has-mx');
		expect(resolveMx).toHaveBeenCalledTimes(1);
	});
});
