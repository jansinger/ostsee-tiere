import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	checkRateLimit,
	createRateLimitIdentifier,
	enforceRateLimit,
	resetRateLimits
} from './rateLimit';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

const TEST_CONFIG = {
	windowMs: 60 * 1000, // 1 Minute
	maxRequests: 3
};

describe('checkRateLimit', () => {
	beforeEach(() => {
		// Use unique endpoint per test to avoid shared state between tests
	});

	it('erlaubt den ersten Request', () => {
		const result = checkRateLimit('user:test', TEST_CONFIG, `test-first-${Date.now()}`);
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(2); // 3 max - 1 used
	});

	it('erlaubt Requests bis zum Limit', () => {
		const endpoint = `test-limit-${Date.now()}`;
		const id = 'user:limit-test';

		const r1 = checkRateLimit(id, TEST_CONFIG, endpoint);
		expect(r1.allowed).toBe(true);
		expect(r1.remaining).toBe(2);

		const r2 = checkRateLimit(id, TEST_CONFIG, endpoint);
		expect(r2.allowed).toBe(true);
		expect(r2.remaining).toBe(1);

		const r3 = checkRateLimit(id, TEST_CONFIG, endpoint);
		expect(r3.allowed).toBe(true);
		expect(r3.remaining).toBe(0);
	});

	it('blockiert Requests nach Limit-Überschreitung', () => {
		const endpoint = `test-block-${Date.now()}`;
		const id = 'user:block-test';

		// Exhaust the limit
		for (let i = 0; i < 3; i++) {
			checkRateLimit(id, TEST_CONFIG, endpoint);
		}

		// Next request should be blocked
		const result = checkRateLimit(id, TEST_CONFIG, endpoint);
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
	});

	it('setzt Limit nach Fenster-Ablauf zurück', async () => {
		const endpoint = `test-reset-${Date.now()}`;
		const id = 'user:reset-test';
		const shortConfig = { windowMs: 50, maxRequests: 1 }; // 50ms window

		// Exhaust the limit
		checkRateLimit(id, shortConfig, endpoint);

		// Wait for window to expire
		await new Promise((r) => setTimeout(r, 60));

		const result = checkRateLimit(id, shortConfig, endpoint);
		expect(result.allowed).toBe(true);
	});

	it('trackt verschiedene Identifier unabhängig', () => {
		const endpoint = `test-independent-${Date.now()}`;
		const config = { windowMs: 60_000, maxRequests: 1 };

		checkRateLimit('user:a', config, endpoint);
		const resultA = checkRateLimit('user:a', config, endpoint);
		expect(resultA.allowed).toBe(false); // A is blocked

		const resultB = checkRateLimit('user:b', config, endpoint);
		expect(resultB.allowed).toBe(true); // B is independent
	});

	it('trackt verschiedene Endpoints unabhängig', () => {
		const id = `user:multi-endpoint-${Date.now()}`;
		const config = { windowMs: 60_000, maxRequests: 1 };

		checkRateLimit(id, config, 'endpoint-1');
		const r1 = checkRateLimit(id, config, 'endpoint-1');
		expect(r1.allowed).toBe(false); // endpoint-1 blocked

		const r2 = checkRateLimit(id, config, 'endpoint-2');
		expect(r2.allowed).toBe(true); // endpoint-2 independent
	});
});

describe('createRateLimitIdentifier', () => {
	it('nutzt User-ID für authentifizierte User', () => {
		expect(createRateLimitIdentifier('auth0|123', '1.2.3.4', true)).toBe('user:auth0|123');
	});

	it('nutzt IP für anonyme User', () => {
		expect(createRateLimitIdentifier(undefined, '1.2.3.4', false)).toBe('ip:1.2.3.4');
	});

	it('nutzt IP wenn userSub undefined aber authenticated', () => {
		expect(createRateLimitIdentifier(undefined, '1.2.3.4', true)).toBe('ip:1.2.3.4');
	});
});

describe('enforceRateLimit', () => {
	it('wirft 429 HttpError nach Limit-Überschreitung', () => {
		const endpoint = `test-enforce-${Date.now()}`;
		const id = `user:enforce-${Date.now()}`;
		const config = { windowMs: 60_000, maxRequests: 1 };

		// First request OK
		expect(() => enforceRateLimit(id, config, endpoint)).not.toThrow();

		// Second request should throw SvelteKit HttpError with status 429
		try {
			enforceRateLimit(id, config, endpoint);
			expect.unreachable('Should have thrown');
		} catch (e: unknown) {
			const httpError = e as { status: number; body: { message: string } };
			expect(httpError.status).toBe(429);
			expect(httpError.body.message).toMatch(/Rate limit exceeded/);
		}
	});
});

describe('resetRateLimits', () => {
	it('gibt einem ausgeschöpften Schlüssel das volle Kontingent zurück', () => {
		const endpoint = 'test-reset-store';
		const id = 'ip:127.0.0.1';
		const config = { windowMs: 60_000, maxRequests: 1 };

		checkRateLimit(id, config, endpoint);
		expect(checkRateLimit(id, config, endpoint).allowed).toBe(false);

		resetRateLimits();

		const nachReset = checkRateLimit(id, config, endpoint);
		expect(nachReset.allowed).toBe(true);
		expect(nachReset.remaining).toBe(0); // 1 max - 1 genutzt: Zähler startet neu
	});
});
