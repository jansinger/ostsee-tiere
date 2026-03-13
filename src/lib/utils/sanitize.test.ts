import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText } from '$lib/utils/sanitize';

/**
 * Note: Tests run in a server environment (no window/DOM).
 * sanitizeHtml and sanitizeText use the server-side fallback (tag stripping).
 * Client-side DOMPurify sanitization is tested via E2E tests.
 */

describe('sanitizeHtml (server fallback)', () => {
	it('strips all tags on server (SSR fallback)', () => {
		const input = '<a href="https://example.com">link</a> <em>emphasis</em> <strong>bold</strong>';
		const result = sanitizeHtml(input);
		expect(result).toBe('link emphasis bold');
	});

	it('strips script tags and their content', () => {
		const result = sanitizeHtml('<script>alert("xss")</script>Safe text');
		expect(result).not.toContain('<script>');
		expect(result).not.toContain('alert');
		expect(result).toContain('Safe text');
	});

	it('strips event handlers', () => {
		const result = sanitizeHtml('<a href="#" onclick="alert(1)">click</a>');
		expect(result).not.toContain('onclick');
		expect(result).toContain('click');
	});

	it('strips javascript: URLs', () => {
		const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
		expect(result).not.toContain('javascript:');
	});

	it('returns empty string for null', () => {
		expect(sanitizeHtml(null)).toBe('');
	});

	it('returns empty string for undefined', () => {
		expect(sanitizeHtml(undefined)).toBe('');
	});

	it('returns empty string for empty string', () => {
		expect(sanitizeHtml('')).toBe('');
	});

	it('preserves text content from copyright HTML', () => {
		const copyright =
			'© <a href="https://commons.wikimedia.org/wiki/File:Example.jpg">Author</a>, <a href="http://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via Wikimedia Commons';
		const result = sanitizeHtml(copyright);
		expect(result).toContain('Author');
		expect(result).toContain('CC BY-SA 3.0');
		expect(result).toContain('via Wikimedia Commons');
	});

	it('strips dangerous tags like iframe', () => {
		const result = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
		expect(result).not.toContain('<iframe');
	});
});

describe('sanitizeText', () => {
	it('strips ALL HTML tags', () => {
		const result = sanitizeText('<b>bold</b> and <a href="#">link</a>');
		expect(result).toBe('bold and link');
	});

	it('returns plain text', () => {
		const result = sanitizeText('plain text');
		expect(result).toBe('plain text');
	});

	it('returns empty string for null', () => {
		expect(sanitizeText(null)).toBe('');
	});

	it('returns empty string for undefined', () => {
		expect(sanitizeText(undefined)).toBe('');
	});

	it('strips script tags and their content', () => {
		const result = sanitizeText('<script>alert("xss")</script>Safe');
		expect(result).not.toContain('alert');
		expect(result).toContain('Safe');
	});
});

describe('sanitizeText - map popup XSS scenarios', () => {
	it('removes script injection from shipname field', () => {
		const result = sanitizeText('<script>alert("xss")</script>MS Stralsund');
		expect(result).not.toContain('<script>');
		expect(result).not.toContain('alert');
		expect(result).toContain('MS Stralsund');
	});

	it('removes img onerror payload from waterway field', () => {
		const result = sanitizeText('<img src=x onerror=alert(1)>Kieler Förde');
		expect(result).not.toContain('<img');
		expect(result).not.toContain('onerror');
		expect(result).toContain('Kieler Förde');
	});

	it('removes svg onload payload entirely', () => {
		const result = sanitizeText('<svg onload=alert(1)>evil</svg>Klaus');
		expect(result).not.toContain('<svg');
		expect(result).not.toContain('onload');
		expect(result).not.toContain('evil');
		expect(result).toContain('Klaus');
	});

	it('preserves normal Unicode names', () => {
		expect(sanitizeText('Jörg Müller-Ström')).toBe('Jörg Müller-Ström');
	});

	it('handles empty shipname gracefully', () => {
		expect(sanitizeText('')).toBe('');
		expect(sanitizeText(null)).toBe('');
		expect(sanitizeText(undefined)).toBe('');
	});
});
