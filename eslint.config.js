import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import { loadConfig } from '@sveltejs/load-config';

const svelteConfig = (await loadConfig('./', { traverse: false }))?.config;

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	// Erzeugter Paraglide-Code (Task 1, `.claude/rules/architecture.md`): liegt unter `src/`,
	// steht zwar auch in `.gitignore`, aber ESLint soll ihn unabhängig davon nie anfassen.
	{ ignores: ['src/lib/paraglide/**'] },
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			'no-unused-vars': 'off',
			// Disabled globally: false positives in Svelte runes and default-value-then-override patterns in .ts files
			'no-useless-assignment': 'off',

			// Svelte-spezifische Regeln
			'svelte/no-unused-svelte-ignore': 'error',
			'svelte/no-reactive-literals': 'warn',
			'svelte/no-navigation-without-resolve': 'off', // Allow external links and navigation

			// TypeScript-spezifische Regeln
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					args: 'all',
					argsIgnorePattern: '^_',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					ignoreRestSiblings: true
				}
			],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-explicit-any': 'warn'
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// .svelte.ts modules are processed by the Svelte compiler but parsed as TypeScript by ESLint
		files: ['**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parser: ts.parser
		}
	},
	{
		files: ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/ban-ts-comment': 'off'
		}
	},
	{
		// legacy-inbox ist bewusst reines JavaScript ohne Typdeklarationen
		// (siehe CLAUDE.md, Legacy REST API). Seit Aufgabe 9 importiert
		// src/tests/contract diese Module direkt, wodurch tsc sie über
		// `checkJs` in die Prüfung hineinzieht; `@ts-nocheck` markiert das
		// bewusst als außerhalb der TS-Konventionen von src/.
		files: ['legacy-inbox/**/*.js'],
		rules: {
			'@typescript-eslint/ban-ts-comment': 'off'
		}
	}
);
