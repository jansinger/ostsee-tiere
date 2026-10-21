import { describe, it, expect, vi } from 'vitest';
import { POST } from '../../routes/api/csp-report/+server';
import { createEvent } from './helpers/createEvent';

vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

describe('Contract: POST /api/csp-report', () => {
	it('returns 204 for a valid CSP report', async () => {
		const event = createEvent('/api/csp-report', {
			method: 'POST',
			body: {
				'csp-report': {
					'document-uri': 'https://example.com/',
					'violated-directive': 'script-src',
					'blocked-uri': 'https://evil.com/script.js'
				}
			}
		});
		const res = await POST(event);

		expect(res.status).toBe(204);
		// 204 has no body — do not call toSatisfyApiSpec()
		expect(res.body).toBeNull();
	});

	it('returns 400 for invalid JSON (non-parseable body)', async () => {
		const event = {
			...createEvent('/api/csp-report', { method: 'POST' }),
			request: {
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => {
					throw new SyntaxError('Unexpected token');
				}
			}
		} as any;

		const res = await POST(event);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body).toMatchObject({ success: false, error: expect.any(String) });
	});
});
