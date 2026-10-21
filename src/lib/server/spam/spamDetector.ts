import { createLogger } from '#lib/logger.server.ts';
import type { SpamCheckResult, SpamDetectionInput } from '#lib/types/spam.ts';
import { isUnknownOrMissingSpecies } from '#lib/utils/format/sightingFormatter.ts';
import { DISPOSABLE_EMAIL_DOMAINS } from './disposableEmailDomains';
import { checkMxRecords } from './mxCheck';

import { HIGH_RISK_THRESHOLD } from '#lib/types/spam.ts';

export type { SpamCheckResult, SpamDetectionInput };

const logger = createLogger('spamDetector');

const ENGLISH_SPAM_KEYWORDS = [
	'sale',
	'discount',
	'free',
	'win',
	'prize',
	'money',
	'cash',
	'deal',
	'offer',
	'viagra',
	'casino',
	'loan'
];

const GERMAN_SPAM_KEYWORDS = [
	'kostenlos',
	'gewinn',
	'gratis',
	'kredit',
	'verdienst',
	'rabatt',
	'angebot',
	'sonderangebot',
	'investition',
	'garantiert'
];

// Wortgrenzen statt Substring: „win" darf nicht in „Wind" matchen,
// „gewinn" nicht in „Gewinnspiel". Einmal kompiliert, nicht pro Aufruf.
const toWordPatterns = (keywords: string[]): Array<{ keyword: string; pattern: RegExp }> =>
	keywords.map((keyword) => ({ keyword, pattern: new RegExp(`\\b${keyword}\\b`) }));

const ENGLISH_SPAM_PATTERNS = toWordPatterns(ENGLISH_SPAM_KEYWORDS);
const GERMAN_SPAM_PATTERNS = toWordPatterns(GERMAN_SPAM_KEYWORDS);

// Single-pass HTML entity decoding to avoid double-unescaping (e.g. &amp;gt; → &gt; → >)
const HTML_ENTITIES: Record<string, string> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'"
};

/**
 * Decodes common HTML entities in text before analysis.
 * Uses a single-pass replacement to prevent double-unescaping.
 */
function decodeHtmlEntities(text: string): string {
	return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (match) => HTML_ENTITIES[match] ?? match);
}

/**
 * Detects spam indicators in a sighting submission using heuristic checks.
 */
export async function detectSpamIndicators(sighting: SpamDetectionInput): Promise<SpamCheckResult> {
	try {
		const indicators: string[] = [];
		let score = 0;

		// Raw (non-lowercased) text fields needed for capital-letter heuristic
		const rawTextFields = [
			sighting.notes || '',
			sighting.firstName || '',
			sighting.lastName || '',
			sighting.waterway || '',
			sighting.seaMark || ''
		]
			.map(decodeHtmlEntities)
			.join(' ');

		// Keyword-, URL- und Satzzeichen-Checks laufen bewusst OHNE die E-Mail:
		// Adressen enthalten .com by design, und legitime Provider-Domains
		// triggerten Keywords als Substring (z. B. „free" in freenet.de).
		// Die E-Mail hat unten ihre eigenen Prüfungen.
		const nonEmailTextFields = rawTextFields.toLowerCase();

		// --- Heuristic checks ---

		if (nonEmailTextFields && nonEmailTextFields.length >= 3) {
			// URLs or links in text fields (excluding email to avoid false positives)
			if (
				/(https?:\/\/|www\.|\.com|\.org|\.de\/|\[url\]|\[link\]|[a-z0-9-]{2,}\.[a-z]{2,4}\/[^\s]{3,})/i.test(
					nonEmailTextFields
				)
			) {
				indicators.push('Enthält verdächtige URLs oder Links');
				score += 3;
			}
		}

		if (nonEmailTextFields && nonEmailTextFields.length >= 3) {
			// English spam keywords (word-bounded)
			const foundEnglish = ENGLISH_SPAM_PATTERNS.filter(({ pattern }) =>
				pattern.test(nonEmailTextFields)
			).map(({ keyword }) => keyword);
			if (foundEnglish.length > 0) {
				indicators.push(`Spam-Keywords gefunden: ${foundEnglish.join(', ')}`);
				score += foundEnglish.length * 2;
			}

			// German spam keywords (word-bounded)
			const foundGerman = GERMAN_SPAM_PATTERNS.filter(({ pattern }) =>
				pattern.test(nonEmailTextFields)
			).map(({ keyword }) => keyword);
			if (foundGerman.length > 0) {
				indicators.push(`Deutsche Spam-Keywords gefunden: ${foundGerman.join(', ')}`);
				score += foundGerman.length * 2;
			}

			// Excessive punctuation (lowercased text) or excessive capitals (raw text)
			if (/[!]{3,}|[?]{3,}/.test(nonEmailTextFields) || /[A-Z]{10,}/.test(rawTextFields)) {
				indicators.push('Übermäßige Satzzeichen oder Großbuchstaben');
				score += 2;
			}
		}

		// Unknown or missing species
		if (isUnknownOrMissingSpecies(sighting.species)) {
			indicators.push('Keine oder unbekannte Tierart angegeben');
			score += 1;
		}

		// Email-based checks
		if (sighting.email) {
			const emailLower = sighting.email.toLowerCase();
			const domain = emailLower.split('@')[1] ?? '';

			// Disposable email domains (gepflegte Community-Liste, vendored)
			if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
				indicators.push(`Wegwerf-E-Mail-Domain erkannt: ${domain}`);
				score += 3;
			}

			// Noreply / donotreply addresses
			if (emailLower.includes('noreply') || emailLower.includes('donotreply')) {
				indicators.push('Verdächtige E-Mail-Adresse (noreply)');
				score += 2;
			}

			// Many digits before @
			if (/\d{5,}@/.test(sighting.email)) {
				indicators.push('E-Mail mit vielen Zahlen (verdächtig)');
				score += 1;
			}

			// MX-Lookup: Domain, die keine Mails empfangen kann, ist erfunden
			// oder vertippt. Fail-open — 'unknown' (Timeout/DNS-Fehler) zählt nicht.
			if (domain && (await checkMxRecords(domain)) === 'no-mx') {
				indicators.push('E-Mail-Domain ohne MX-Record (kann keine Mails empfangen)');
				score += 3;
			}
		}

		// Position außerhalb des Kartenbereichs — nach dem DB-Wert `ostsee_geo`
		// (>0 = drin, auch der Altbestandswert 2), nicht nach eigener Rechnung.
		// Ohne Position sagt ostsee_geo = 0 nichts über Spam aus, und ohne
		// mitgelieferten Wert bleibt die Prüfung bewusst stumm.
		if (
			sighting.latitude != null &&
			sighting.longitude != null &&
			sighting.inBalticSeaGeo != null &&
			sighting.inBalticSeaGeo === 0
		) {
			indicators.push('Position weit außerhalb der Ostsee');
			score += 2;
		}

		// Duplikat-Signale (zählt der Aufrufer per countRecentDuplicateSignals).
		// Schwelle für sameEmail bewusst hoch: mehrere Meldungen derselben Person
		// am selben Tag sind bei Citizen Science normal (eine Bootstour, fünf
		// Schweinswale). Ein identischer Bemerkungstext ist es nicht.
		if (sighting.recentDuplicates) {
			const { sameEmail, sameNotes } = sighting.recentDuplicates;
			if (sameNotes >= 1) {
				indicators.push('Identischer Bemerkungstext wie bei einer früheren Meldung');
				score += 2;
			}
			if (sameEmail >= 5) {
				indicators.push('Auffällig viele Meldungen mit derselben E-Mail-Adresse in 24 Stunden');
				score += 2;
			}
		}

		// Submission-Kontext (Zeit-Token) — existiert nur zum Meldezeitpunkt,
		// nachträgliche Prüfungen lassen ihn weg und scoren entsprechend milder.
		if (sighting.submission) {
			const { tokenStatus, ageSeconds } = sighting.submission;
			if (tokenStatus === 'missing') {
				indicators.push('Formular-Token fehlt');
				score += 2;
			} else if (tokenStatus === 'invalid') {
				indicators.push('Formular-Token ungültig');
				score += 2;
			} else if (ageSeconds !== undefined && ageSeconds < 5) {
				indicators.push('Formular verdächtig schnell abgeschickt');
				score += 2;
			}
		}

		return {
			score: Math.min(score, 10), // clamp to 0–10 scale
			isHighRisk: score >= HIGH_RISK_THRESHOLD,
			indicators
		};
	} catch (error: unknown) {
		logger.warn({ error }, 'Fehler bei Spam-Erkennung – markiere als Hochrisiko (Fail-Safe)');
		// Mark as high risk on failure: an inconclusive check should not be shown as "no spam".
		// `failed` verhindert, dass der Score 0 persistiert wird (saveSighting).
		return {
			score: 0,
			isHighRisk: true,
			indicators: ['Spam-Prüfung fehlgeschlagen'],
			failed: true
		};
	}
}
