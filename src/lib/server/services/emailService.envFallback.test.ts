/**
 * Unit Tests für den ENV-Fallback der SMTP-Konfiguration.
 *
 * Eigene Datei, weil `$env/dynamic/private` hier **gesetzte** SMTP-Variablen
 * mocken muss: `emailService.ts` liest sie beim Import in Modulkonstanten
 * (`const SMTP_HOST = env.SMTP_HOST ?? ''`), ein späteres Umstellen im Test
 * hätte also keine Wirkung. Die Nachbardatei `emailService.test.ts` mockt sie
 * bewusst leer und prüft damit den „nicht konfiguriert"-Pfad.
 *
 * Hintergrund (UX-/Config-Review 2026-07-30): `.claude/rules/email.md` legt die
 * Priorität als „Datenbank > Environment Variables" fest. In der Praxis war der
 * ENV-Zweig aber unerreichbar: `initializeDefaultConfigurations()` legt
 * `email.smtp.host`/`user`/`password` mit **Leerstring** an, und
 * `ConfigRepository.getString(key, default)` gibt den Default nur bei `null`
 * zurück — `''` ist nicht `null`. Sobald `/admin/settings` einmal geöffnet
 * wurde, war SMTP aus der Umgebung damit dauerhaft toter Code, und der Versand
 * brach nur mit einer Log-Warnung ab.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Das globale Setup in vitest-setup-server.ts mockt emailService — hier aufheben,
// damit die echte Implementierung getestet wird.
vi.unmock('#lib/server/services/emailService.ts');

const ENV_HOST = 'smtp.aus-der-umgebung.test';
const ENV_USER = 'env-user@example.com';
const ENV_PASSWORD = 'env-geheim';

vi.mock('#lib/server/env.ts', () => ({
	env: {
		NODE_ENV: 'test',
		SMTP_HOST: 'smtp.aus-der-umgebung.test',
		SMTP_PORT: '2525',
		SMTP_USER: 'env-user@example.com',
		SMTP_PASSWORD: 'env-geheim'
	},
	publicEnv: { PUBLIC_SITE_URL: 'https://example.com' }
}));

// Kein gemeinsamer Helper: vi.mock wird an den Dateianfang gehoist, eine
// Top-Level-Variable wäre dort noch nicht initialisiert.
vi.mock('#lib/logger.server.ts', () => ({
	createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));
vi.mock('#lib/logger.ts', () => ({
	createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('#lib/server/db/configRepository.ts', () => ({
	ConfigRepository: {
		getBoolean: vi.fn(),
		getString: vi.fn(),
		getNumber: vi.fn(),
		getArray: vi.fn()
	}
}));

vi.mock('#lib/server/db/index.ts', () => ({ db: { select: vi.fn() } }));
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
vi.mock('fs', () => ({ readFileSync: vi.fn(() => '<html>{{referenceId}}</html>') }));
vi.mock('#lib/utils/format/sightingFormatter.ts', () => ({
	formatSightingForDisplay: vi.fn(),
	isUnknownOrMissingSpecies: vi.fn()
}));
vi.mock('#lib/server/spam/spamDetector.ts', () => ({
	detectSpamIndicators: vi.fn().mockResolvedValue({ score: 0, isHighRisk: false, indicators: [] })
}));
vi.mock('#lib/utils/format/dateTime.ts', () => ({ formatLocalDateTime: vi.fn() }));

import { ConfigRepository } from '#lib/server/db/configRepository.ts';
import nodemailer from 'nodemailer';
import { EmailService } from './emailService';

/**
 * Setzt die DB-Antworten. `getString` verhält sich absichtlich wie das Original:
 * Der Default greift nur, wenn der Test `undefined` durchreicht — ein in der DB
 * gespeicherter Leerstring wird als Leerstring geliefert. Genau dieser Fall ist
 * der Regressionsfall.
 */
function setupDbConfig(values: Record<string, string | number | boolean>) {
	vi.mocked(ConfigRepository.getString).mockImplementation(async (key, defaultValue) =>
		key in values ? String(values[key]) : defaultValue
	);
	vi.mocked(ConfigRepository.getNumber).mockImplementation(async (key, defaultValue) =>
		key in values ? Number(values[key]) : defaultValue
	);
	vi.mocked(ConfigRepository.getBoolean).mockImplementation(async (key, defaultValue) =>
		key in values ? Boolean(values[key]) : defaultValue
	);
	vi.mocked(ConfigRepository.getArray).mockImplementation(
		async (_key, defaultValue) => defaultValue
	);
}

function transportArgs() {
	const call = vi.mocked(nodemailer.createTransport).mock.calls.at(-1);
	return (call?.[0] ?? {}) as {
		host?: string;
		port?: number;
		auth?: { user?: string; pass?: string };
	};
}

describe('EmailService — SMTP-Konfiguration aus der Umgebung', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(nodemailer.createTransport).mockReturnValue({
			sendMail: vi.fn(),
			verify: vi.fn().mockResolvedValue(true),
			close: vi.fn()
		} as unknown as ReturnType<typeof nodemailer.createTransport>);
		// Der Transporter ist statisch und überlebt den einzelnen Test.
		EmailService.resetTransporter();
	});

	it('nimmt die ENV-Werte, wenn die DB-Einträge leer sind', async () => {
		// Genau der Zustand nach initializeDefaultConfigurations(): Zeilen
		// existieren, tragen aber Leerstrings.
		setupDbConfig({
			'notification.email.enabled': true,
			'email.smtp.host': '',
			'email.smtp.user': '',
			'email.smtp.password': ''
		});

		await EmailService.initialize(true);

		expect(transportArgs().host).toBe(ENV_HOST);
		expect(transportArgs().auth?.user).toBe(ENV_USER);
		expect(transportArgs().auth?.pass).toBe(ENV_PASSWORD);
	});

	it('lässt die DB gewinnen, wenn dort ein Wert gesetzt ist', async () => {
		setupDbConfig({
			'notification.email.enabled': true,
			'email.smtp.host': 'smtp.aus-der-datenbank.test',
			'email.smtp.user': 'db-user@example.com',
			'email.smtp.password': 'db-geheim'
		});

		await EmailService.initialize(true);

		expect(transportArgs().host).toBe('smtp.aus-der-datenbank.test');
		expect(transportArgs().auth?.user).toBe('db-user@example.com');
		expect(transportArgs().auth?.pass).toBe('db-geheim');
	});

	it('nimmt den ENV-Port, solange die DB keinen abweichenden Wert liefert', async () => {
		// Ergänzt die beiden Fälle oben um den Port: der geht weiterhin über den
		// `defaultValue`-Mechanismus, weil sich beim Port „bewusst auf 587 gestellt"
		// nicht von „nur geseedet" unterscheiden lässt (Begründung in emailService.ts).
		setupDbConfig({ 'notification.email.enabled': true, 'email.smtp.host': '' });

		await EmailService.initialize(true);

		expect(transportArgs().port).toBe(2525);
	});

	// Der Pfad „gar nichts konfiguriert" (weder DB noch ENV) gehört nicht hierher:
	// diese Datei mockt SMTP_* bewusst gesetzt. Abgedeckt ist er in
	// `emailService.test.ts`, wo die ENV-Variablen leer sind.
});
