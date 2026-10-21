import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpamDetectionInput } from '#lib/types/spam.ts';

// Mock logger
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: vi.fn().mockReturnValue({
		warn: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn()
	})
}));

// Mock isUnknownOrMissingSpecies
vi.mock('#lib/utils/format/sightingFormatter.ts', () => ({
	isUnknownOrMissingSpecies: vi.fn().mockReturnValue(false)
}));

// Mock MX-Record-Prüfung (kein echtes DNS in Unit Tests)
vi.mock('./mxCheck', () => ({
	checkMxRecords: vi.fn().mockResolvedValue('unknown')
}));

import { detectSpamIndicators } from './spamDetector';
import { isUnknownOrMissingSpecies } from '#lib/utils/format/sightingFormatter.ts';
import { checkMxRecords } from './mxCheck';
import { DISPOSABLE_EMAIL_DOMAINS } from './disposableEmailDomains';

const mockIsUnknownOrMissingSpecies = vi.mocked(isUnknownOrMissingSpecies);
const mockCheckMxRecords = vi.mocked(checkMxRecords);

function buildSighting(overrides: Partial<SpamDetectionInput> = {}): SpamDetectionInput {
	return {
		firstName: 'Max',
		lastName: 'Muster',
		email: 'max@example.com',
		species: 0,
		notes: '',
		waterway: '',
		seaMark: '',
		latitude: undefined,
		longitude: undefined,
		...overrides
	};
}

describe('detectSpamIndicators', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsUnknownOrMissingSpecies.mockReturnValue(false);
		mockCheckMxRecords.mockResolvedValue('unknown');
	});

	describe('URL-Erkennung', () => {
		it('erkennt https:// URL in notes und gibt score +3', async () => {
			const sighting = buildSighting({ notes: 'Schöne Sichtung auf https://spam.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
			expect(result.indicators).toContain('Enthält verdächtige URLs oder Links');
		});

		it('erkennt www. Link in notes', async () => {
			const sighting = buildSighting({ notes: 'Besuche www.spam.de für mehr Infos' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
			expect(result.indicators).toContain('Enthält verdächtige URLs oder Links');
		});

		it('erkennt .com Domain in waterway', async () => {
			const sighting = buildSighting({ waterway: 'spam.com area' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
		});

		it('erkennt URL-Shortener ohne https:// (z.B. rb.gy/abc123)', async () => {
			const sighting = buildSighting({ notes: 'Hier klicken > rb.gy/34p7i3' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
			expect(result.indicators).toContain('Enthält verdächtige URLs oder Links');
		});

		it('erkennt URL in HTML-kodiertem Text (&gt; statt >)', async () => {
			const sighting = buildSighting({
				notes: 'Hier klicken &gt; rb.gy/34p7i3',
				waterway: 'Hier klicken &gt; rb.gy/34p7i3'
			});
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
			expect(result.indicators).toContain('Enthält verdächtige URLs oder Links');
		});

		it('erkennt URL in seaMark-Feld', async () => {
			const sighting = buildSighting({ seaMark: 'Klicken Sie hier rb.gy/spam123' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
		});
	});

	describe('Englische Spam-Keywords', () => {
		it('erkennt "sale" und gibt score +2', async () => {
			const sighting = buildSighting({ notes: 'big sale today' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators.some((i) => i.includes('sale'))).toBe(true);
		});

		it('erkennt "viagra" und gibt score +2', async () => {
			const sighting = buildSighting({ notes: 'buy viagra cheap' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
		});

		it('erkennt mehrere Keywords mit kumulativem Score', async () => {
			const sighting = buildSighting({ notes: 'free money win prize casino' });
			const result = await detectSpamIndicators(sighting);
			// 5 keywords × 2 = 10
			expect(result.score).toBeGreaterThanOrEqual(10);
		});
	});

	describe('Deutsche Spam-Keywords', () => {
		it('erkennt "kostenlos" und gibt score +2', async () => {
			const sighting = buildSighting({ notes: 'jetzt kostenlos testen' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators.some((i) => i.includes('kostenlos'))).toBe(true);
		});

		it('erkennt "gratis" in firstName', async () => {
			const sighting = buildSighting({ firstName: 'Gratis Angebot' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
		});

		it('erkennt "sonderangebot" und gibt score +2', async () => {
			const sighting = buildSighting({ notes: 'exklusives sonderangebot für sie' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
		});

		it('erkennt "garantiert" in notes', async () => {
			const sighting = buildSighting({ notes: 'garantiert gewinn' });
			const result = await detectSpamIndicators(sighting);
			// "garantiert" (+2) + "gewinn" (+2) = 4
			expect(result.score).toBeGreaterThanOrEqual(4);
		});
	});

	describe('Wegwerf-Email-Domains', () => {
		it('erkennt mailinator.com und gibt score +3', async () => {
			const sighting = buildSighting({ email: 'test@mailinator.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
			expect(result.indicators.some((i) => i.includes('Wegwerf'))).toBe(true);
		});

		it('erkennt tempmail.com und gibt score +3', async () => {
			const sighting = buildSighting({ email: 'anon@tempmail.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
		});

		it('erkennt guerrillamail.com', async () => {
			const sighting = buildSighting({ email: 'user@guerrillamail.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
		});

		it('erkennt yopmail.com', async () => {
			const sighting = buildSighting({ email: 'x@yopmail.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
		});

		it('akzeptiert legitime Email-Domain', async () => {
			const sighting = buildSighting({ email: 'user@gmail.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators.some((i) => i.includes('Wegwerf'))).toBe(false);
		});
	});

	describe('Noreply-Email', () => {
		it('erkennt noreply@ und gibt score +2', async () => {
			const sighting = buildSighting({ email: 'noreply@example.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators).toContain('Verdächtige E-Mail-Adresse (noreply)');
		});

		it('erkennt donotreply@ und gibt score +2', async () => {
			const sighting = buildSighting({ email: 'donotreply@example.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
		});
	});

	describe('E-Mail mit 5+ Ziffern', () => {
		it('erkennt E-Mail mit 5 Ziffern vor @ und gibt score +1', async () => {
			const sighting = buildSighting({ email: '12345@example.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(1);
			expect(result.indicators).toContain('E-Mail mit vielen Zahlen (verdächtig)');
		});

		it('akzeptiert E-Mail mit weniger als 5 Ziffern', async () => {
			const sighting = buildSighting({ email: 'max1234@example.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain('E-Mail mit vielen Zahlen (verdächtig)');
		});
	});

	describe('Position außerhalb Ostsee', () => {
		// Der Detektor rechnet die Bounding Box nicht mehr selbst aus lat/lng,
		// sondern nutzt den übergebenen DB-Wert `inBalticSeaGeo` (Spalte ostsee_geo:
		// 0 = außerhalb des Kartenbereichs, > 0 = drin).
		it('erkennt Position mit inBalticSeaGeo 0 als außerhalb und gibt score +2', async () => {
			const sighting = buildSighting({ latitude: 10.0, longitude: 50.0, inBalticSeaGeo: 0 });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators).toContain('Position weit außerhalb der Ostsee');
		});

		it('akzeptiert Position mit inBalticSeaGeo 1', async () => {
			const sighting = buildSighting({ latitude: 54.5, longitude: 12.0, inBalticSeaGeo: 1 });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain('Position weit außerhalb der Ostsee');
		});

		it('akzeptiert Altbestand-Wert inBalticSeaGeo 2 als „drin" (Regel: > 0)', async () => {
			const sighting = buildSighting({ latitude: 54.5, longitude: 12.0, inBalticSeaGeo: 2 });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain('Position weit außerhalb der Ostsee');
		});

		it('gibt keinen Indikator ohne Position, auch bei inBalticSeaGeo 0', async () => {
			const sighting = buildSighting({
				latitude: undefined,
				longitude: undefined,
				inBalticSeaGeo: 0
			});
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain('Position weit außerhalb der Ostsee');
		});

		it('gibt keinen Indikator ohne inBalticSeaGeo — keine eigene Bounding-Box-Rechnung mehr', async () => {
			// Kern der Änderung: Aufrufer ohne DB-Wert bekommen keine Aussage,
			// die alte eigene Rechnung darf NICHT mehr anspringen.
			const sighting = buildSighting({ latitude: 54.5, longitude: 12.0 });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain('Position weit außerhalb der Ostsee');
		});
	});

	describe('Duplikat-Signale', () => {
		// Werte liefert der Aufrufer per `recentDuplicates` — der Detektor macht keine DB-Abfragen.
		it('gibt score +2 und Indikator bei identischem Bemerkungstext', async () => {
			const sighting = buildSighting({ recentDuplicates: { sameEmail: 0, sameNotes: 1 } });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators).toContain(
				'Identischer Bemerkungstext wie bei einer früheren Meldung'
			);
		});

		it('gibt score +2 und Indikator bei 5 Meldungen mit derselben E-Mail in 24 Stunden', async () => {
			const sighting = buildSighting({ recentDuplicates: { sameEmail: 5, sameNotes: 0 } });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators).toContain(
				'Auffällig viele Meldungen mit derselben E-Mail-Adresse in 24 Stunden'
			);
		});

		it('gibt keinen Duplikat-Indikator bei nur 4 Meldungen mit derselben E-Mail', async () => {
			const sighting = buildSighting({ recentDuplicates: { sameEmail: 4, sameNotes: 0 } });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain(
				'Auffällig viele Meldungen mit derselben E-Mail-Adresse in 24 Stunden'
			);
			expect(result.indicators).not.toContain(
				'Identischer Bemerkungstext wie bei einer früheren Meldung'
			);
		});

		it('gibt beide Indikatoren und score >= 4 bei E-Mail- und Notes-Duplikaten', async () => {
			const sighting = buildSighting({ recentDuplicates: { sameEmail: 5, sameNotes: 2 } });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(4);
			expect(result.indicators).toContain(
				'Auffällig viele Meldungen mit derselben E-Mail-Adresse in 24 Stunden'
			);
			expect(result.indicators).toContain(
				'Identischer Bemerkungstext wie bei einer früheren Meldung'
			);
		});

		it('gibt keinen Duplikat-Indikator ohne recentDuplicates', async () => {
			const sighting = buildSighting({});
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain(
				'Auffällig viele Meldungen mit derselben E-Mail-Adresse in 24 Stunden'
			);
			expect(result.indicators).not.toContain(
				'Identischer Bemerkungstext wie bei einer früheren Meldung'
			);
		});
	});

	describe('Unbekannte Tierart', () => {
		it('gibt score +1 bei unbekannter Tierart', async () => {
			mockIsUnknownOrMissingSpecies.mockReturnValue(true);
			const sighting = buildSighting({ species: 8 }); // 8 = Unbekannte Walart
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(1);
			expect(result.indicators).toContain('Keine oder unbekannte Tierart angegeben');
		});

		it('gibt keinen Bonus bei bekannter Tierart', async () => {
			mockIsUnknownOrMissingSpecies.mockReturnValue(false);
			const sighting = buildSighting({ species: 0 }); // Schweinswal
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain('Keine oder unbekannte Tierart angegeben');
		});
	});

	describe('Leeres Sighting', () => {
		it('gibt score 0 und isHighRisk false bei minimalem Sighting', async () => {
			const sighting = buildSighting({});
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBe(0);
			expect(result.isHighRisk).toBe(false);
			expect(result.indicators).toHaveLength(0);
		});
	});

	describe('isHighRisk', () => {
		it('ist true wenn score >= 5', async () => {
			// 5 english keywords × 2 = 10
			const sighting = buildSighting({ notes: 'free money win prize casino' });
			const result = await detectSpamIndicators(sighting);
			expect(result.isHighRisk).toBe(true);
		});

		it('ist false wenn score < 5', async () => {
			// 1 keyword × 2 = 2
			const sighting = buildSighting({ notes: 'sale item' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeLessThan(5);
			expect(result.isHighRisk).toBe(false);
		});
	});

	describe('Fail-Safe bei interner Exception', () => {
		it('gibt isHighRisk: true und Fehler-Indikator zurück wenn isUnknownOrMissingSpecies wirft', async () => {
			mockIsUnknownOrMissingSpecies.mockImplementation(() => {
				throw new Error('Interner Fehler');
			});
			const sighting = buildSighting({});
			const result = await detectSpamIndicators(sighting);
			expect(result.isHighRisk).toBe(true);
			expect(result.indicators).toContain('Spam-Prüfung fehlgeschlagen');
		});
	});

	describe('SpamCheckResult Interface', () => {
		it('gibt alle Pflichtfelder zurück', async () => {
			const sighting = buildSighting({});
			const result = await detectSpamIndicators(sighting);
			expect(result).toHaveProperty('score');
			expect(result).toHaveProperty('isHighRisk');
			expect(result).toHaveProperty('indicators');
			expect(typeof result.score).toBe('number');
			expect(typeof result.isHighRisk).toBe('boolean');
			expect(Array.isArray(result.indicators)).toBe(true);
		});
	});

	describe('Wortgrenzen bei Keywords', () => {
		it('matcht "win" nicht als Substring in "Wind"', async () => {
			const sighting = buildSighting({ notes: 'starker Wind aus West' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBe(0);
			expect(result.indicators.some((i) => i.includes('Keyword'))).toBe(false);
		});

		it('matcht "win" nicht als Substring in "Winter"', async () => {
			const sighting = buildSighting({ notes: 'Winter an der Küste' });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators.some((i) => i.includes('Keyword'))).toBe(false);
		});

		it('matcht "gewinn" nicht als Substring in "Gewinnspiel"', async () => {
			const sighting = buildSighting({ notes: 'tolles Gewinnspiel' });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators.some((i) => i.includes('gewinn'))).toBe(false);
		});

		it('erkennt "gewinn" als eigenständiges Wort', async () => {
			const sighting = buildSighting({ notes: 'jetzt gewinn sichern' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators.some((i) => i.includes('gewinn'))).toBe(true);
		});
	});

	describe('E-Mail-Adresse nicht im Keyword-Text', () => {
		it('matcht "free" nicht in der E-Mail-Domain freenet.de', async () => {
			const sighting = buildSighting({
				firstName: '',
				lastName: '',
				email: 'info@freenet.de',
				notes: '',
				waterway: '',
				seaMark: ''
			});
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBe(0);
			expect(result.indicators.some((i) => i.includes('free'))).toBe(false);
		});

		it('matcht "gewinn" nicht im Local-Part der E-Mail', async () => {
			const sighting = buildSighting({ email: 'gewinn@example.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators.some((i) => i.includes('Keyword'))).toBe(false);
		});
	});

	describe('MX-Prüfung der E-Mail-Domain', () => {
		it('gibt score +3 und Indikator wenn Domain keinen MX-Record hat', async () => {
			mockCheckMxRecords.mockResolvedValue('no-mx');
			const sighting = buildSighting({ email: 'max@example.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(3);
			expect(result.indicators).toContain(
				'E-Mail-Domain ohne MX-Record (kann keine Mails empfangen)'
			);
		});

		it('gibt keinen Indikator wenn Domain MX-Records hat', async () => {
			mockCheckMxRecords.mockResolvedValue('has-mx');
			const sighting = buildSighting({ email: 'max@example.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain(
				'E-Mail-Domain ohne MX-Record (kann keine Mails empfangen)'
			);
		});

		it('gibt keinen Indikator bei unbekanntem MX-Status (fail-open)', async () => {
			mockCheckMxRecords.mockResolvedValue('unknown');
			const sighting = buildSighting({ email: 'max@example.com' });
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain(
				'E-Mail-Domain ohne MX-Record (kann keine Mails empfangen)'
			);
		});

		it('ruft checkMxRecords mit kleingeschriebener Domain auf', async () => {
			const sighting = buildSighting({ email: 'Max@Example.COM' });
			await detectSpamIndicators(sighting);
			expect(mockCheckMxRecords).toHaveBeenCalledWith('example.com');
		});

		it('ruft checkMxRecords ohne E-Mail nicht auf', async () => {
			const sighting = buildSighting({ email: '' });
			await detectSpamIndicators(sighting);
			expect(mockCheckMxRecords).not.toHaveBeenCalled();
		});
	});

	describe('Submission-Kontext (Formular-Token)', () => {
		it('gibt score +2 und Indikator bei fehlendem Token', async () => {
			const sighting = buildSighting({ submission: { tokenStatus: 'missing' } });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators).toContain('Formular-Token fehlt');
		});

		it('gibt score +2 und Indikator bei ungültigem Token', async () => {
			const sighting = buildSighting({ submission: { tokenStatus: 'invalid' } });
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators).toContain('Formular-Token ungültig');
		});

		it('gibt score +2 und Indikator bei verdächtig schneller Absendung', async () => {
			const sighting = buildSighting({
				submission: { tokenStatus: 'valid', ageSeconds: 2 }
			});
			const result = await detectSpamIndicators(sighting);
			expect(result.score).toBeGreaterThanOrEqual(2);
			expect(result.indicators).toContain('Formular verdächtig schnell abgeschickt');
		});

		it('gibt keinen Token-Indikator bei gültigem Token und normaler Ausfüllzeit', async () => {
			const sighting = buildSighting({
				submission: { tokenStatus: 'valid', ageSeconds: 60 }
			});
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain('Formular-Token fehlt');
			expect(result.indicators).not.toContain('Formular-Token ungültig');
			expect(result.indicators).not.toContain('Formular verdächtig schnell abgeschickt');
		});

		it('gibt keinen Token-Indikator ohne submission-Feld', async () => {
			const sighting = buildSighting({});
			const result = await detectSpamIndicators(sighting);
			expect(result.indicators).not.toContain('Formular-Token fehlt');
			expect(result.indicators).not.toContain('Formular-Token ungültig');
			expect(result.indicators).not.toContain('Formular verdächtig schnell abgeschickt');
		});
	});

	describe('Wegwerf-Domain-Liste (vendored)', () => {
		it('enthält mailinator.com', () => {
			expect(DISPOSABLE_EMAIL_DOMAINS.has('mailinator.com')).toBe(true);
		});

		it('enthält 10minutemail.com', () => {
			expect(DISPOSABLE_EMAIL_DOMAINS.has('10minutemail.com')).toBe(true);
		});

		it('enthält gmail.com nicht', () => {
			expect(DISPOSABLE_EMAIL_DOMAINS.has('gmail.com')).toBe(false);
		});

		it('umfasst mehr als 1000 Domains', () => {
			expect(DISPOSABLE_EMAIL_DOMAINS.size).toBeGreaterThan(1000);
		});
	});
});
