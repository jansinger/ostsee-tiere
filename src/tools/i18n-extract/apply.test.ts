import { describe, expect, it } from 'vitest';
import { applySitesToSource, applySvelteSitesToSource } from './apply';
import { collectSchemaSites, collectSvelteSites } from './collect';
import { createKeyRegistry } from './messageKey';

// Verschoben aus render.test.ts (Befund E): applySitesToSource ist die
// eigentliche Quelltransformation und lebt jetzt in apply.ts, nicht mehr in
// der Berichtsformatierung.
describe('applySitesToSource', () => {
	it('ersetzt das Literal durch den Botschaftsaufruf', () => {
		const source = `const s = yup.object().shape({ a: yup.string().label('Titel') });`;
		const { sites } = collectSchemaSites(source, 'probe.ts', createKeyRegistry());
		expect(applySitesToSource(source, sites)).toBe(
			`const s = yup.object().shape({ a: yup.string().label(m.sighting_a_label({}, { locale })) });`
		);
	});

	// Von hinten nach vorn ersetzen: Sonst verschieben frühere Ersetzungen die
	// Offsets aller späteren. Zwei Literale im selben Aufruf machen das sichtbar.
	it('hält die Offsets bei mehreren Ersetzungen in einer Zeile', () => {
		const source = `const s = yup.object().shape({ a: yup.string().max(9, 'zu lang').label('Titel') });`;
		const { sites } = collectSchemaSites(source, 'probe.ts', createKeyRegistry());
		const result = applySitesToSource(source, sites);
		expect(result).toContain('m.sighting_a_max({}, { locale })');
		expect(result).toContain('m.sighting_a_label({}, { locale })');
		expect(result).not.toContain(`'zu lang'`);
		expect(result).not.toContain(`'Titel'`);
	});

	it('lässt die Quelle unverändert, wenn es keine Fundstellen gibt', () => {
		const source = `const x = 1;`;
		expect(applySitesToSource(source, [])).toBe(source);
	});
});

// Gefunden bei der ersten echten Ausführung von --write-sources (Welle 1,
// Aufgabe 2.3a): `applySvelteSitesToSource` ersetzte Textknoten/Attribute
// zwar korrekt durch `m.key()`, setzte aber nie den Namespace-Import
// `import * as m from '#lib/paraglide/messages';` — anders als bei
// Schema/formOptions (Schicht A/B), wo der Import schon vor der Extraktion
// vorhanden war. svelte-check meldete das erst beim Typ-Check ("Cannot find
// name 'm'"), nicht beim reinen Neu-Parsen aus Aufgabe 2.2 — ein fehlender
// Import ist syntaktisch gültiges Svelte-Markup, nur semantisch falsch.
describe('applySvelteSitesToSource — Paraglide-Import', () => {
	it('setzt den m-Import direkt nach dem Skript-Tag, wenn er fehlt', () => {
		const source = `<script lang="ts">\n\tlet x = 1;\n</script>\n\n<p>Hallo Welt</p>\n`;
		const { sites } = collectSvelteSites(source, 'probe.svelte', createKeyRegistry());
		const result = applySvelteSitesToSource(source, sites);

		expect(result).toContain(`import * as m from '#lib/paraglide/messages';`);
		expect(result).toContain('{m.probe_text_hallo_welt()}');
		// Der Import steht VOR der ersten Verwendung.
		expect(result.indexOf(`import * as m`)).toBeLessThan(result.indexOf('m.probe_text_hallo_welt'));
	});

	it('fügt den Import nicht doppelt ein, wenn er schon vorhanden ist', () => {
		const source = `<script lang="ts">\n\timport * as m from '#lib/paraglide/messages';\n\tlet x = 1;\n</script>\n\n<p>Hallo Welt</p>\n`;
		const { sites } = collectSvelteSites(source, 'probe.svelte', createKeyRegistry());
		const result = applySvelteSitesToSource(source, sites);

		expect(result.split(`import * as m from '#lib/paraglide/messages';`)).toHaveLength(2);
	});

	it('fügt keinen Import ein, wenn es keine Fundstellen gibt', () => {
		const source = `<script lang="ts">\n\tlet x = 1;\n</script>\n\n<p>1</p>\n`;
		expect(applySvelteSitesToSource(source, [])).toBe(source);
	});

	// SubmitStatus.svelte hat genau diese Form: ein `<script module>`-Block
	// (kann in Svelte 5 keine Laufzeitwerte für die Vorlage exportieren, nur
	// Typen) VOR dem eigentlichen Instanz-Skript. Der Import muss in den
	// Instanz-Block, nicht in den Modul-Block.
	it('setzt den Import in den Instanz-Block, nicht in einen vorangehenden module-Block', () => {
		const source =
			`<script module lang="ts">\n\texport type State = 'a';\n</script>\n\n` +
			`<script lang="ts">\n\tlet x = 1;\n</script>\n\n<p>Hallo Welt</p>\n`;
		const { sites } = collectSvelteSites(source, 'probe.svelte', createKeyRegistry());
		const result = applySvelteSitesToSource(source, sites);

		const moduleScriptEnd = result.indexOf('</script>');
		const importIndex = result.indexOf(`import * as m from '#lib/paraglide/messages';`);
		expect(importIndex).toBeGreaterThan(moduleScriptEnd);
	});
});
