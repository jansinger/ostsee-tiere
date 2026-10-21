import { describe, expect, it } from 'vitest';
import type { SpamCheckResponse, SpamCheckResult } from '#lib/types/spam.ts';
import { HIGH_RISK_THRESHOLD } from '#lib/types/spam.ts';
import {
	SPAM_DRIFT_PRESENTATION,
	SPAM_RISK_PRESENTATION,
	SPAM_SUSPICIOUS_THRESHOLD,
	getSpamDrift,
	getSpamRisk,
	getSpamRiskFromResult
} from './spamScorePresentation';

describe('getSpamRisk', () => {
	it('unterscheidet „nie bewertet" von „bewertet, unauffällig"', () => {
		// Der eigentliche Grund für dieses Modul: In der Eingangskarte war NULL
		// bis 2026-08 ein `badge-ghost` mit „Spam: –" und damit optisch dasselbe
		// wie Score 0 — „geprüft, sauber". `docs/SPAM_DETECTION.md` sagt das
		// Gegenteil: NULL heißt Altbestand/Legacy-Eingang, nie geprüft.
		expect(getSpamRisk(null)).toBe('unrated');
		expect(getSpamRisk(0)).toBe('clean');
		expect(getSpamRisk(null)).not.toBe(getSpamRisk(0));
	});

	it('behandelt undefined wie null', () => {
		expect(getSpamRisk(undefined)).toBe('unrated');
	});

	it.each([
		[0, 'clean'],
		[1, 'clean'],
		[2, 'suspicious'],
		[4, 'suspicious'],
		[5, 'high'],
		[10, 'high']
	] as const)('Score %i → %s', (score, erwartet) => {
		expect(getSpamRisk(score)).toBe(erwartet);
	});

	it('hängt an den Schwellen und nicht an kopierten Zahlen', () => {
		expect(getSpamRisk(SPAM_SUSPICIOUS_THRESHOLD - 1)).toBe('clean');
		expect(getSpamRisk(SPAM_SUSPICIOUS_THRESHOLD)).toBe('suspicious');
		expect(getSpamRisk(HIGH_RISK_THRESHOLD - 1)).toBe('suspicious');
		expect(getSpamRisk(HIGH_RISK_THRESHOLD)).toBe('high');
	});
});

describe('getSpamRiskFromResult', () => {
	function ergebnis(overrides: Partial<SpamCheckResult>): SpamCheckResult {
		return { score: 0, isHighRisk: false, indicators: [], ...overrides };
	}

	it('folgt dem Server-Urteil `isHighRisk`, nicht dem nachgerechneten Score', () => {
		// Für eine geglückte Prüfung sagen beide dasselbe (`score >= 5`) — die
		// Client-Schwelle wäre also meist folgenlos. Verlassen darf man sich
		// darauf trotzdem nicht: `isHighRisk` ist das Urteil des Servers.
		expect(getSpamRiskFromResult(ergebnis({ score: 5, isHighRisk: true }))).toBe('high');
		expect(getSpamRiskFromResult(ergebnis({ score: 3, isHighRisk: false }))).toBe('suspicious');
		expect(getSpamRiskFromResult(ergebnis({ score: 0, isHighRisk: false }))).toBe('clean');
	});

	it('eine fehlgeschlagene Prüfung ist nicht bewertet — trotz `isHighRisk: true`', () => {
		// Der Fail-Safe-Zweig in `spamDetector.ts` liefert Score 0 UND
		// `isHighRisk: true`. Beides wörtlich zu nehmen ergäbe „Hochrisiko ohne
		// einen einzigen Indikator". Es ist derselbe Fall wie NULL in der
		// Datenbank: geprüft wurde nichts.
		const fehlgeschlagen = ergebnis({
			score: 0,
			isHighRisk: true,
			indicators: ['Spam-Prüfung fehlgeschlagen'],
			failed: true
		});
		expect(getSpamRiskFromResult(fehlgeschlagen)).toBe('unrated');
	});
});

describe('getSpamDrift', () => {
	function antwort(
		stored: { score: number; indicators: string[] } | null,
		recomputed: Partial<SpamCheckResult>
	): SpamCheckResponse {
		return { stored, recomputed: { score: 0, isHighRisk: false, indicators: [], ...recomputed } };
	}

	it('meldet keine Abweichung, wenn beide Läufe denselben Score ergeben', () => {
		expect(getSpamDrift(antwort({ score: 3, indicators: ['a'] }, { score: 3 }))).toBe('unchanged');
	});

	it('erkennt den Regelfall: die Neuberechnung liegt niedriger', () => {
		// Genau der Fall, für den es dieses Modul gibt. Vier Indikatoren wiegen je
		// 2 Punkte und sind nachträglich nicht rekonstruierbar (Formular-Token,
		// Absendedauer, beide Duplikatsignale) — der Nachlauf kommt dann auf 0,
		// während die Tabelle weiterhin 2 zeigt.
		const drift = getSpamDrift(
			antwort({ score: 2, indicators: ['Formular verdächtig schnell abgeschickt'] }, { score: 0 })
		);
		expect(drift).toBe('lower');
	});

	it('erkennt eine höhere Neuberechnung', () => {
		expect(getSpamDrift(antwort({ score: 1, indicators: [] }, { score: 4 }))).toBe('higher');
	});

	it('vergleicht nicht gegen einen Altbestand ohne Bewertung', () => {
		// `stored: null` heißt „nie bewertet" und nicht „Score 0". Ein Vergleich
		// dagegen behauptete eine Veränderung, wo es keinen Vorzustand gibt.
		expect(getSpamDrift(antwort(null, { score: 3 }))).toBe('incomparable');
		expect(getSpamDrift(antwort(null, { score: 0 }))).toBe('incomparable');
	});

	it('vergleicht nicht gegen eine fehlgeschlagene Neuberechnung', () => {
		// Fail-Safe: Score 0 mit `isHighRisk: true`. Als „liegt niedriger"
		// gelesen wäre das eine Aussage über eine Prüfung, die nie lief.
		const drift = getSpamDrift(
			antwort({ score: 3, indicators: [] }, { score: 0, isHighRisk: true, failed: true })
		);
		expect(drift).toBe('incomparable');
	});
});

describe('SPAM_DRIFT_PRESENTATION', () => {
	it('erklärt jede echte Abweichung im Klartext', () => {
		for (const drift of ['lower', 'higher'] as const) {
			expect(SPAM_DRIFT_PRESENTATION[drift].note).toBeTruthy();
		}
	});

	it('schweigt, wo es nichts zu erklären gibt', () => {
		expect(SPAM_DRIFT_PRESENTATION.unchanged.note).toBeNull();
		expect(SPAM_DRIFT_PRESENTATION.incomparable.note).toBeNull();
	});
});

describe('SPAM_RISK_PRESENTATION', () => {
	it('gibt „nie bewertet" bewusst kein Badge', () => {
		expect(SPAM_RISK_PRESENTATION.unrated.badgeClass).toBeNull();
	});

	it('trägt die Bedeutung nicht allein über die Farbe (WCAG 1.4.1)', () => {
		const bewertet = ['clean', 'suspicious', 'high'] as const;
		const icons = bewertet.map((risk) => SPAM_RISK_PRESENTATION[risk].icon);
		expect(icons.every((icon) => typeof icon === 'string' && icon.length > 0)).toBe(true);
		expect(new Set(icons).size).toBe(bewertet.length);
	});

	it('verwendet Flächenfarben ohne `-strong`-Suffix', () => {
		for (const risk of ['clean', 'suspicious', 'high'] as const) {
			expect(SPAM_RISK_PRESENTATION[risk].badgeClass).toMatch(/^badge-(?!.*-strong)/);
		}
	});

	it('benennt jeden Zustand eindeutig', () => {
		const labels = Object.values(SPAM_RISK_PRESENTATION).map((p) => p.label);
		expect(new Set(labels).size).toBe(labels.length);
	});
});
