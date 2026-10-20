import { describe, expect, it } from 'vitest';
import { sanitizeHtml, sanitizeText } from '#lib/utils/sanitize.ts';

/**
 * Browser-environment tests for sanitize.ts.
 * These run against a real DOM (via Playwright), verifying that
 * isomorphic-dompurify produces identical output in the browser
 * as in the server (jsdom) environment.
 */

describe('sanitizeHtml — browser', () => {
	it('preserves allowed tags in the real DOM', () => {
		const result = sanitizeHtml('<a href="https://example.com">link</a> <em>text</em>');
		expect(result).toContain('<a href="https://example.com">link</a>');
		expect(result).toContain('<em>text</em>');
	});

	it('strips script tags in the real DOM', () => {
		const result = sanitizeHtml('<script>alert("xss")</script>Safe');
		expect(result).not.toContain('<script>');
		expect(result).toContain('Safe');
	});

	it('returns empty string for null', () => {
		expect(sanitizeHtml(null)).toBe('');
	});
});

describe('sanitizeText — browser', () => {
	it('strips all tags in the real DOM', () => {
		const result = sanitizeText('<b>bold</b> text');
		expect(result).not.toContain('<b>');
		expect(result).toContain('bold');
		expect(result).toContain('text');
	});

	it('matches server output: plain text passes through unchanged', () => {
		expect(sanitizeText('Jörg Müller-Ström')).toBe('Jörg Müller-Ström');
	});

	it('returns empty string for null', () => {
		expect(sanitizeText(null)).toBe('');
	});
});
