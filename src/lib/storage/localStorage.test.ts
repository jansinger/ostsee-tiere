import type { UserContactData } from '#lib/types/index.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearStorage,
	loadFromStorage,
	loadUserContactData,
	saveToStorage,
	saveUserContactData,
	saveUserContactDataToSession,
	saveUserContactDataWithConsent,
	STORAGE_KEYS
} from './localStorage';

// Mock localStorage für Node.js Tests
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
		length: Object.keys(store).length,
		key: (index: number) => Object.keys(store)[index] || null
	};
})();

// Mock sessionStorage für Node.js Tests
const sessionStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
		length: Object.keys(store).length,
		key: (index: number) => Object.keys(store)[index] || null
	};
})();

// Mock $app/env to simulate browser environment
vi.mock('$app/env', () => ({
	browser: true
}));

Object.defineProperty(global, 'localStorage', { value: localStorageMock });
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });
Object.defineProperty(global, 'window', { value: global });

describe('localStorage utilities', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	describe('basic storage operations', () => {
		it('should save and load data correctly', () => {
			const testData = { name: 'test', value: 123 };
			saveToStorage('test-key', testData);

			const loaded = loadFromStorage('test-key', null);
			expect(loaded).toEqual(testData);
		});

		it('should return default value for non-existent key', () => {
			const defaultValue = { default: true };
			const result = loadFromStorage('non-existent', defaultValue);
			expect(result).toEqual(defaultValue);
		});

		it('should handle JSON parse errors gracefully', () => {
			localStorage.setItem('corrupted-key', 'invalid-json');
			const defaultValue = { fallback: true };

			const result = loadFromStorage('corrupted-key', defaultValue);
			expect(result).toEqual(defaultValue);
		});
	});

	describe('loadFromStorage — sanitization (SEC-1)', () => {
		it('should reject non-object data when object is expected', () => {
			sessionStorage.setItem(STORAGE_KEYS.FORM_DATA, '"string-instead-of-object"');
			const result = loadFromStorage(STORAGE_KEYS.FORM_DATA, { species: 0 });
			expect(result).toEqual({ species: 0 });
		});

		it('should reject array data when object is expected', () => {
			sessionStorage.setItem(STORAGE_KEYS.FORM_DATA, '[1,2,3]');
			const result = loadFromStorage(STORAGE_KEYS.FORM_DATA, { species: 0 });
			expect(result).toEqual({ species: 0 });
		});

		it('should filter out unknown fields (whitelist based on default)', () => {
			sessionStorage.setItem(
				STORAGE_KEYS.FORM_DATA,
				JSON.stringify({ species: 0, totalCount: 2, malicious: '<script>alert(1)</script>' })
			);
			const result = loadFromStorage(STORAGE_KEYS.FORM_DATA, {
				species: -1,
				totalCount: 0
			});
			expect(result).toEqual({ species: 0, totalCount: 2 });
			expect((result as Record<string, unknown>)['malicious']).toBeUndefined();
		});

		it('should fill missing fields with defaults', () => {
			sessionStorage.setItem(STORAGE_KEYS.FORM_DATA, JSON.stringify({ species: 0 }));
			const result = loadFromStorage(STORAGE_KEYS.FORM_DATA, {
				species: -1,
				totalCount: 0
			});
			expect(result).toEqual({ species: 0, totalCount: 0 });
		});

		it('should pass through primitive defaults without sanitization', () => {
			sessionStorage.setItem(STORAGE_KEYS.CURRENT_STEP, '2');
			const result = loadFromStorage(STORAGE_KEYS.CURRENT_STEP, 0);
			expect(result).toBe(2);
		});
	});

	describe('clearStorage', () => {
		it('should clear all storage except user contact data', () => {
			saveToStorage(STORAGE_KEYS.FORM_DATA, { test: 'data' });
			saveToStorage(STORAGE_KEYS.CURRENT_STEP, 1);
			saveToStorage(STORAGE_KEYS.USER_CONTACT_DATA, { name: 'Test User' });

			clearStorage();

			// Form data und current step sollten gelöscht sein (sie sind in sessionStorage)
			expect(loadFromStorage(STORAGE_KEYS.FORM_DATA, null)).toBeNull();
			expect(loadFromStorage(STORAGE_KEYS.CURRENT_STEP, null)).toBeNull();
			// User contact data sollte erhalten bleiben (es ist in localStorage)
			expect(loadFromStorage(STORAGE_KEYS.USER_CONTACT_DATA, null)).toEqual({ name: 'Test User' });
		});
	});

	describe('user contact data', () => {
		it('should save and load user contact data', async () => {
			const contactData = {
				firstName: 'John',
				lastName: 'Doe',
				email: 'john@example.com',
				persistentDataConsent: true
			} as UserContactData;

			saveUserContactData(contactData);
			// Kurze Wartezeit simulieren (z.B. für asynchrone Speicherung)
			await new Promise((resolve) => setTimeout(resolve, 10));
			const loaded = loadUserContactData();

			expect(loaded).toMatchObject(contactData);
		});

		it('should return defaults with empty values for no contact data', () => {
			const result = loadUserContactData();
			expect(result.firstName).toBe('');
			expect(result.lastName).toBe('');
			expect(result.email).toBe('');
			expect(result.persistentDataConsent).toBe(false);
		});
	});

	describe('saveUserContactDataWithConsent (GDPR)', () => {
		const contactBase = {
			firstName: 'Max',
			lastName: 'Mustermann',
			email: 'max@example.com'
		} as UserContactData;

		it('stores in localStorage when consent is given', () => {
			saveUserContactDataWithConsent({ ...contactBase, persistentDataConsent: true });
			expect(localStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).not.toBeNull();
			expect(sessionStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).toBeNull();
		});

		it('stores in sessionStorage when consent is NOT given', () => {
			saveUserContactDataWithConsent({ ...contactBase, persistentDataConsent: false });
			expect(sessionStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).not.toBeNull();
			expect(localStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).toBeNull();
		});

		it('sessionStorage data is correct JSON when consent is NOT given', () => {
			const data = { ...contactBase, persistentDataConsent: false };
			saveUserContactDataWithConsent(data);
			const raw = sessionStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA);
			expect(JSON.parse(raw!)).toEqual(data);
		});

		it('loadUserContactData reads back session-only contact data when consent is NOT given', () => {
			const data = { ...contactBase, persistentDataConsent: false };
			saveUserContactDataWithConsent(data);

			expect(sessionStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).not.toBeNull();
			expect(localStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).toBeNull();

			const loaded = loadUserContactData();
			// Sanitization adds missing fields with defaults, so use toMatchObject
			expect(loaded).toMatchObject(data);
			expect(loaded.firstName).toBe('Max');
		});

		it('revoking consent clears persisted localStorage user contact data', () => {
			const withConsent = { ...contactBase, persistentDataConsent: true };
			const withoutConsent = { ...contactBase, persistentDataConsent: false };

			// Save with consent → data persisted in localStorage
			saveUserContactDataWithConsent(withConsent);
			expect(localStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).not.toBeNull();
			expect(sessionStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).toBeNull();

			// User revokes consent → data should move to sessionStorage and be cleared from localStorage
			saveUserContactDataWithConsent(withoutConsent);

			expect(localStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).toBeNull();
			expect(sessionStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).not.toBeNull();

			const loadedAfterRevocation = loadUserContactData();
			expect(loadedAfterRevocation).toMatchObject(withoutConsent);
		});
	});

	describe('saveUserContactDataToSession', () => {
		it('writes only to sessionStorage, not localStorage', () => {
			const data = { firstName: 'Anna', email: 'anna@example.com' } as UserContactData;
			saveUserContactDataToSession(data);
			expect(sessionStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).not.toBeNull();
			expect(localStorage.getItem(STORAGE_KEYS.USER_CONTACT_DATA)).toBeNull();
		});
	});

	describe('STORAGE_KEYS', () => {
		it('should have all required keys', () => {
			expect(STORAGE_KEYS.CURRENT_STEP).toBeDefined();
			expect(STORAGE_KEYS.FORM_DATA).toBeDefined();
			expect(STORAGE_KEYS.USER_CONTACT_DATA).toBeDefined();
		});

		it('should have unique key values', () => {
			const keys = Object.values(STORAGE_KEYS);
			const uniqueKeys = [...new Set(keys)];
			expect(keys.length).toBe(uniqueKeys.length);
		});
	});
});
