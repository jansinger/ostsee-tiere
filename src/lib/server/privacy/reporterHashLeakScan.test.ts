/**
 * Guard: Der Melder-Hash verlässt den Server nie.
 *
 * Er ist ein Pseudonym (Art. 4 Nr. 5 DSGVO): Wer ihn zusammen mit dem
 * Schlüssel hat, kann eine genannte Adresse wiederfinden, und wer viele davon
 * sammelt, kann Meldungen derselben Person verknüpfen. In Antworten, Exporten
 * oder URLs landete er dort, wo keine Löschfrist gilt — Browser-Verlauf,
 * Zugriffsprotokolle, heruntergeladene Dateien
 * (docs/ANONYMISIERUNG_KONZEPT.md, Abschnitt 6.2).
 *
 * Deshalb darf ihn kein Route- und kein Komponenten-Code beim Namen nennen.
 * Ganze Zeilen werden vor der Ausgabe mit `omitReporterIdentity` bereinigt;
 * die Laufzeit-Tests dazu stehen neben den vier Handlern, die ganze Zeilen
 * ausliefern (`reporterIdentity.test.ts`). Verknüpft wird serverseitig über die
 * ID einer Meldung. Eine Route, die den Hash legitim serverseitig liest,
 * gehört mit Begründung in `ALLOWED`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectHits, sourceFiles, stripComments } from '#lib/testing/sourceScan.testutil.ts';

// Der Modulpfad `#lib/server/privacy/reporterHash.ts` heißt wie das Feld; ein
// Import ist kein Leck, deshalb weder nach `/` noch vor `.ts`.
const PATTERNS = [
	/(?<!\/)\breporterHash\b(?!\.ts)/g,
	/\breporterInternal\b/g,
	/\bmelder_hash\b/g,
	/\bmelder_intern\b/g
];

/** Dateien, die den Hash serverseitig lesen dürfen — mit Begründung. */
const ALLOWED: Readonly<Record<string, string>> = {};

const SCANNED = [
	...sourceFiles('src/routes', /\.(ts|svelte)$/),
	...sourceFiles('src/lib/components', /\.(ts|svelte)$/)
].filter((file) => !/\.test\.ts$|\.testutil\.ts$/.test(file));

describe('Melder-Hash in Routen und Komponenten', () => {
	it('scannt überhaupt etwas', () => {
		expect(SCANNED.length).toBeGreaterThan(100);
	});

	it.each(SCANNED.filter((file) => !(file in ALLOWED)))('%s nennt den Hash nicht', (file) => {
		const hits = collectHits(stripComments(readFileSync(file, 'utf8')), PATTERNS);

		expect(hits).toEqual([]);
	});

	it('führt keine Ausnahme für eine Datei, die es nicht mehr gibt', () => {
		expect(Object.keys(ALLOWED).filter((file) => !SCANNED.includes(file))).toEqual([]);
	});
});
