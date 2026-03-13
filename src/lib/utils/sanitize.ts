import DOMPurify from 'dompurify';

/**
 * Regex to match dangerous HTML elements WITH their content.
 * Used as SSR fallback when DOMPurify (browser-only) is unavailable.
 */
const DANGEROUS_CONTENT_REGEX =
	/<(script|style|svg|math|iframe|object|embed|applet)[^>]*>[\s\S]*?<\/\1>/gi;
const SELF_CLOSING_DANGEROUS_REGEX = /<(img|input|embed|object|source|link)[^>]*\/?>/gi;
const ALL_TAGS_REGEX = /<[^>]*>/g;

/**
 * Server-side tag stripping fallback.
 * Removes dangerous tags WITH their content, then strips remaining tags.
 */
function serverStripTags(html: string): string {
	let result = html.replace(DANGEROUS_CONTENT_REGEX, '');
	result = result.replace(SELF_CLOSING_DANGEROUS_REGEX, '');
	return result.replace(ALL_TAGS_REGEX, '');
}

export function sanitizeHtml(dirty: string | null | undefined): string {
	if (!dirty) return '';
	if (typeof window === 'undefined') {
		// SSR fallback: strip all tags (client will re-render with proper sanitization)
		return serverStripTags(dirty);
	}
	return DOMPurify.sanitize(dirty, {
		ALLOWED_TAGS: ['a', 'em', 'strong', 'br', 'span', 'p', 'i', 'b'],
		ALLOWED_ATTR: ['href', 'class', 'target', 'rel']
	});
}

export function sanitizeText(dirty: string | null | undefined): string {
	if (!dirty) return '';
	if (typeof window === 'undefined') {
		return serverStripTags(dirty);
	}
	return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
}
