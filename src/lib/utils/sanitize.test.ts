import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText } from '#lib/utils/sanitize.ts';

/**
 * Tests run in a server environment (no window/DOM).
 * isomorphic-dompurify provides real DOMPurify sanitization on both server and client,
 * so both environments produce identical output.
 */

describe('sanitizeHtml', () => {
	it('preserves allowed tags', () => {
		const input = '<a href="https://example.com">link</a> <em>emphasis</em>';
		const result = sanitizeHtml(input);
		expect(result).toContain('<a href="https://example.com">link</a>');
		expect(result).toContain('<em>emphasis</em>');
	});

	it('strips script tags, keeps text content', () => {
		const result = sanitizeHtml('<script>alert("xss")</script>Safe text');
		expect(result).not.toContain('<script>');
		expect(result).toContain('Safe text');
	});

	it('strips disallowed tags like div', () => {
		const result = sanitizeHtml('<div class="evil">text</div>');
		expect(result).not.toContain('<div');
		expect(result).toContain('text');
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
});

describe('sanitizeText', () => {
	it('strips ALL HTML tags, returning plain text', () => {
		const result = sanitizeText('<b>bold</b> and <a href="#">link</a>');
		expect(result).not.toContain('<b>');
		expect(result).not.toContain('<a');
		expect(result).toContain('bold');
		expect(result).toContain('link');
	});

	it('returns plain text unchanged', () => {
		expect(sanitizeText('plain text')).toBe('plain text');
	});

	it('returns empty string for null', () => {
		expect(sanitizeText(null)).toBe('');
	});

	it('returns empty string for undefined', () => {
		expect(sanitizeText(undefined)).toBe('');
	});

	it('strips script tags, keeps safe text', () => {
		const result = sanitizeText('<script>alert("xss")</script>Safe');
		expect(result).not.toContain('<script>');
		expect(result).toContain('Safe');
	});
});

describe('sanitizeText - XSS scenarios', () => {
	it('strips script injection, keeps ship name', () => {
		const result = sanitizeText('<script>alert("xss")</script>MS Stralsund');
		expect(result).not.toContain('<script>');
		expect(result).toContain('MS Stralsund');
	});

	it('strips img onerror payload, keeps waterway text', () => {
		const result = sanitizeText('<img src=x onerror=alert(1)>Kieler Förde');
		expect(result).not.toContain('<img');
		expect(result).toContain('Kieler Förde');
	});

	it('strips svg onload payload, keeps plain text', () => {
		const result = sanitizeText('<svg onload=alert(1)>evil</svg>Klaus');
		expect(result).not.toContain('<svg');
		expect(result).toContain('Klaus');
	});

	it('preserves normal Unicode names', () => {
		expect(sanitizeText('Jörg Müller-Ström')).toBe('Jörg Müller-Ström');
	});

	it('handles empty input gracefully', () => {
		expect(sanitizeText('')).toBe('');
		expect(sanitizeText(null)).toBe('');
		expect(sanitizeText(undefined)).toBe('');
	});
});
