import { afterEach, expect, vi } from 'vitest';
import './src/tests/contract/helpers/specSetup';
import { assertNoMissingMockExports } from './src/tests/contract/helpers/strictModuleMock';

// Set NODE_ENV to test to prevent automatic service initialization
process.env.NODE_ENV = 'test';

/** Verzeichnis der Contract-Tests — dort und nur dort steht `strictModuleMock`. */
const CONTRACT_TESTS = '/src/tests/contract/';

// Holt einen fehlenden Export aus einer `strictModuleMock`-Attrappe wieder
// hervor. Nötig, weil der Wurf im try-Block einer Route passiert: Deren catch
// macht daraus eine 500 und der Test meldet sonst nur „expected 500 to be 200"
// (so geschehen in PR #701).
//
// Dieses Setup gilt für alle Server-Tests, die Prüfung ist aber bewusst auf die
// Contract-Tests eingegrenzt: So ist belegt, dass der Hook die übrigen rund 200
// Testdateien nicht berühren kann. Wer `strictModuleMock` außerhalb dieses
// Verzeichnisses einsetzt, muss den Pfad hier erweitern — sonst bleibt der
// verschluckte Wurf wieder unsichtbar.
afterEach(() => {
	if (expect.getState().testPath?.includes(CONTRACT_TESTS)) {
		assertNoMissingMockExports();
	}
});

// Global mock for EmailService to prevent any real email sending during tests
vi.mock('#lib/server/services/emailService.ts', () => ({
	EmailService: {
		sendNewSightingNotification: vi.fn().mockResolvedValue(true),
		sendTestEmail: vi.fn().mockResolvedValue(true),
		initialize: vi.fn().mockResolvedValue(undefined),
		clearCaches: vi.fn(),
		clearTemplateCache: vi.fn(),
		// Static methods that might be called
		getEmailConfig: vi.fn().mockResolvedValue({
			enabled: false,
			recipient: '',
			sender: 'noreply@test.com',
			senderName: 'Test'
		})
	}
}));

// Prevent any SMTP connections during tests
vi.mock('nodemailer', () => ({
	createTransport: vi.fn(() => ({
		verify: vi.fn().mockResolvedValue(true),
		sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' })
	}))
}));

console.log('✅ Email services mocked for tests - no real emails will be sent');
