/**
 * CLI für den i18n-Extraktor.
 *
 * **Voreinstellung ist weiterhin der Trockenlauf.** Ohne Schalter wird nichts
 * geschrieben; der Bericht geht nach stdout, wer ihn behalten will, leitet um.
 *
 * Der Grund steht im Auftrag: erst ein Trockenlauf mit Diff-Vorschau, dann die
 * Anwendung. Ein Werkzeug, das beides von Anfang an kann, wird beim ersten
 * ungeduldigen Lauf mit einem Schreib-Schalter benutzt, bevor jemand den Diff
 * gelesen hat.
 *
 * Seit Aufgabe 3.1 gibt es genau EINEN Schreib-Schalter: `--write-messages`.
 * Er schreibt ausschließlich `messages/de.json` und `messages/en.json` — die
 * Botschaften aus `planExtraction()`, einsortiert in die vorhandenen Dateien.
 * Der strukturelle Umbau der Quelldateien (17 formOptions-Module) bleibt
 * bewusst Handarbeit (Aufgabe 3.2/3.3): Er lässt sich nicht mechanisch
 * ableiten, siehe die Warnung in `render.ts` zur Modulkonstante. Diese Datei
 * kennt deshalb absichtlich keinen Schalter, der Quelldateien anfassen würde —
 * nur den einen oben für den Botschaftskatalog.
 *
 * Diese Datei ist bewusst eine dünne Hülle: Argumente lesen, `planExtraction`
 * rufen, Bericht ausgeben — und, nur mit `--write-messages`, den
 * Botschaftskatalog schreiben. Die eigentliche API steht in
 * `i18n-extract/plan.ts`.
 *
 * Ausführung: `npm run i18n:extract` (Trockenlauf) oder
 * `npm run i18n:extract -- --write-messages`.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectMessages, mergeMessageCatalogue, planExtraction } from './i18n-extract/plan';
import type { ExtractionPlan } from './i18n-extract/render';
import { renderDryRunReport } from './i18n-extract/render';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..', '..');

/** Die einzigen zwei Pfade, die `--write-messages` je anfasst. */
const DE_MESSAGES_PATH = 'messages/de.json';
const EN_MESSAGES_PATH = 'messages/en.json';

/**
 * Aufgabe 2.3a, Welle 1 — der Umfang, den `--write-sources` anfassen darf.
 *
 * Acht bis zehn Dateien mit hoher Nutzersichtbarkeit und guter E2E-Deckung
 * (Auftrag): das Meldeformular (Einstiegsseite, Schrittnavigation,
 * Absende-Status, Erfolgsseite) und die öffentliche Navigation/Fußzeile.
 * Bewusst NICHT `routes/about/+page.svelte` — die größte Datei (67 Funde),
 * gehört laut Plan in eine spätere Welle.
 *
 * Welle 2 (Entwurf 5.3, „Meldeformular → Karte"): die restlichen
 * Meldeformular-Komponenten mit der höchsten Nutzersichtbarkeit — der
 * mehrschrittige Formularkörper (`ModernReportForm`, die vier `steps/*`,
 * Standort-/Consent-/Upload-Eingaben, die Fotoschritt-Dropzone) — sowie die
 * komplette Karte (Wrapper, Filter-/Legenden-/Range-Panel, Listen- und
 * Kartenansicht). Weiterhin NICHT dabei: die kleinteiligen 1–2-Fund-Sections
 * (`sections/*`, generische Feld-Primitive `fields/Base*`/`FieldRenderer`) —
 * eine eigene, fokussierte Welle statt über zwei Themen verteilt — sowie die
 * drei explizit zurückgestellten Inhaltsseiten
 * (`routes/about/+page.svelte`, `SpeciesIdentificationHelp.svelte`,
 * `routes/bestimmungshilfe/+page.svelte`).
 *
 * Jeder Eintrag ist ein Pfad ab Repo-Wurzel mit `/` als Trenner — genau die
 * Form, die `planExtraction()` in `ExtractionPlan.files[].file` liefert.
 */
export const WRITE_SOURCES_SCOPE: readonly string[] = [
	'src/lib/report/components/ReportKindChoice.svelte',
	'src/lib/report/components/form/StepNavigation.svelte',
	'src/lib/report/components/form/FormActions.svelte',
	'src/lib/report/components/form/StepProgressCompact.svelte',
	'src/lib/report/components/form/FormSteps.svelte',
	'src/lib/report/components/form/SubmitStatus.svelte',
	'src/lib/report/components/SubmissionSuccess.svelte',
	'src/lib/components/PublicNavbar.svelte',
	'src/lib/components/PublicFooter.svelte',
	// Welle 2 — Meldeformular (Rest)
	'src/lib/report/components/ModernReportForm.svelte',
	'src/lib/report/components/FormHelp.svelte',
	'src/lib/report/components/steps/Step1LocationTime.svelte',
	'src/lib/report/components/steps/Step2SightingDetails.svelte',
	'src/lib/report/components/steps/Step3Observations.svelte',
	'src/lib/report/components/steps/Step4Contact.svelte',
	'src/lib/report/components/form/LocationInput.svelte',
	'src/lib/report/components/form/VerifyLocation.svelte',
	'src/lib/report/components/form/position/PositionPanel.svelte',
	'src/lib/report/components/form/RequiredConsent.svelte',
	'src/lib/report/components/form/UploadNotice.svelte',
	'src/lib/report/components/form/fields/DropzoneEnhanced.svelte',
	// Welle 2 — Karte
	'src/lib/components/map/LazyMapWrapper.svelte',
	'src/lib/components/map/Panel/DualRangeSlider.svelte',
	'src/lib/components/map/Panel/FilterPanel.svelte',
	'src/lib/components/map/Panel/LegendPanel.svelte',
	// Fehlte bisher trotz Welle 2 „Karte" — hatte in Welle 2 keine Fundstelle
	// (nur `dynamic-attribute`), bekommt aber im Stage-2-Review 2026-08-12
	// eine mechanisierte Botschaft (`MapPanel.svelte:139`, `"{title} schließen"`).
	'src/lib/components/map/Panel/MapPanel.svelte',
	'src/lib/components/map/SightingsListView.svelte',
	'src/lib/components/map/SightingsMapView.svelte',
	// Welle 3 — alles ausser den drei zurückgestellten Inhaltsseiten: die
	// kleinteiligen Formular-Sections, die generischen Feld-Primitive,
	// Toasts/Dialoge/Fehlerseiten und der verbliebene Rest.
	'src/lib/components/ConnectionBadge.svelte',
	'src/lib/components/MaintenanceBanner.svelte',
	'src/lib/components/OstseeTiereLogo.svelte',
	'src/lib/components/Toast.svelte',
	'src/lib/components/UserMenu.svelte',
	'src/lib/components/UserMenuMobile.svelte',
	'src/lib/components/charts/BarChart.svelte',
	'src/lib/components/form/UnifiedDropzone.svelte',
	'src/lib/components/info/DataUsageNotice.svelte',
	'src/lib/components/info/DeadFindingNotice.svelte',
	'src/lib/components/media/MediaGallery.svelte',
	'src/lib/components/media/MediaModal.svelte',
	'src/lib/components/media/MediaThumbnail.svelte',
	'src/lib/components/ui/Dialog/DeleteDialog.svelte',
	'src/lib/components/weather/WeatherDataFetcher.svelte',
	'src/lib/components/weather/WeatherDisplay.svelte',
	'src/lib/report/components/ReportKindFeedback.svelte',
	'src/lib/report/components/form/fields/BaseCheckbox.svelte',
	'src/lib/report/components/form/fields/BaseToggle.svelte',
	'src/lib/report/components/form/fields/FieldRenderer.svelte',
	'src/lib/report/components/form/position/LocationDescription.svelte',
	'src/lib/report/components/sections/Administrative.svelte',
	'src/lib/report/components/sections/AnimalInfo.svelte',
	'src/lib/report/components/sections/Behavior.svelte',
	'src/lib/report/components/sections/BoatInfo.svelte',
	'src/lib/report/components/sections/DateTime.svelte',
	'src/lib/report/components/sections/DeadAnimal.svelte',
	'src/lib/report/components/sections/Environment.svelte',
	'src/lib/report/components/sections/Location.svelte',
	'src/lib/report/components/sections/Media.svelte',
	'src/lib/report/components/sections/OptionalSightingDetails.svelte',
	'src/routes/+error.svelte',
	'src/routes/+layout.svelte',
	'src/routes/+page.svelte',
	'src/routes/maintenance/+page.svelte',
	'src/routes/map/+page.svelte',
	// Welle 4 — die drei zurückgestellten Inhaltsseiten. Fachlich Schicht E
	// (Museumstext, englische Übersetzung folgt später als Diff), aber laut
	// Entscheidung vom 2026-08-11 strukturell jetzt mit derselben Mechanik
	// umgebaut statt zweimal angefasst.
	'src/routes/about/+page.svelte',
	'src/lib/report/components/form/fields/SpeciesIdentificationHelp.svelte',
	'src/routes/bestimmungshilfe/+page.svelte'
];

/**
 * Ist `root` ein sauberer git-Arbeitsbaum?
 *
 * `--write-sources` bricht sonst ab (Auftrag, Teil 1): Der erzeugte Diff muss
 * nachträglich prüfbar bleiben — ein Lauf über bereits geänderte Dateien
 * macht das unmöglich, weil sich der Umbau-Diff nicht mehr von vorherigen
 * Änderungen trennen lässt.
 *
 * Kein `git`-Repository (oder `git` schlägt aus einem anderen Grund fehl)
 * gilt defensiv als UNSAUBER — ein Abbruch ist hier die sichere Richtung,
 * ein stilles Durchwinken nicht.
 */
export function isGitWorkingTreeClean(root: string): boolean {
	try {
		const output = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' });
		return output.trim().length === 0;
	} catch {
		return false;
	}
}

function readCatalogue(root: string, relativePath: string): Record<string, string> {
	const raw = readFileSync(resolve(root, relativePath), 'utf-8');
	return JSON.parse(raw) as Record<string, string>;
}

function formatConflict(
	file: string,
	c: { key: string; existingValue: string; incomingValue: string }
): string {
	return `  - ${file} ${c.key}: vorhanden "${c.existingValue}" ≠ neu "${c.incomingValue}"`;
}

/**
 * Schreibt den Botschaftskatalog aus `plan` in `messages/de.json` und
 * `messages/en.json`, einsortiert in die vorhandenen Dateien.
 *
 * Bricht ohne zu schreiben ab, wenn ein bestehender Schlüssel in einer der
 * beiden Dateien einen abweichenden Wert trägt (siehe `mergeMessageCatalogue`
 * in `plan.ts`) — sonst ginge z. B. eine gepflegte englische Übersetzung in
 * `en.json` beim nächsten Lauf still verloren.
 */
export function writeMessageCatalogue(
	root: string,
	plan: ReturnType<typeof planExtraction>
): { written: boolean; conflicts: string[] } {
	const incoming = collectMessages(plan);
	const existingDe = readCatalogue(root, DE_MESSAGES_PATH);
	const existingEn = readCatalogue(root, EN_MESSAGES_PATH);

	const de = mergeMessageCatalogue(existingDe, incoming);
	// en.json bekommt denselben deutschen Wortlaut — Etappe 1 liefert die
	// Mechanik, nicht die Übersetzung.
	const en = mergeMessageCatalogue(existingEn, incoming);

	// Befund B: je Konfliktzeile die Quelldatei nennen — sonst mischt der
	// Bericht Konflikte aus de.json und en.json in eine flache Liste, und man
	// muss beide Dateien von Hand durchsuchen, um herauszufinden, wo welcher
	// Konflikt herkommt.
	const conflictLines = [
		...de.conflicts.map((c) => formatConflict(DE_MESSAGES_PATH, c)),
		...en.conflicts.map((c) => formatConflict(EN_MESSAGES_PATH, c))
	];
	if (conflictLines.length > 0) {
		return { written: false, conflicts: conflictLines };
	}

	writeFileSync(resolve(root, DE_MESSAGES_PATH), `${JSON.stringify(de.merged, null, '\t')}\n`);
	writeFileSync(resolve(root, EN_MESSAGES_PATH), `${JSON.stringify(en.merged, null, '\t')}\n`);
	return { written: true, conflicts: [] };
}

export interface WriteSourceFilesResult {
	/** Die tatsächlich geschriebenen Dateien, ab Repo-Wurzel, `/`-getrennt. */
	written: string[];
	/** Gesetzt statt zu schreiben, wenn der Arbeitsbaum unsauber war. */
	aborted?: string;
}

export interface WriteSourceFilesOptions {
	/** Nur diese Dateien dürfen angefasst werden. Default: `WRITE_SOURCES_SCOPE`. */
	scope?: readonly string[];
	/** Austauschbar für Tests — Default ruft echtes `git status --porcelain`. */
	isWorkingTreeClean?: (root: string) => boolean;
}

/**
 * Schreibt `plan.files[].after` für jede Datei, die BEIDES ist: im `scope`
 * gelistet UND mit mindestens einer Fundstelle. Eine Scope-Datei ohne
 * Fundstelle bleibt unangetastet — ein No-op-Schreibvorgang träte sonst in
 * jedem Diff auf, ohne etwas zu ändern.
 *
 * Bricht VOR jedem Schreibvorgang ab, wenn der Arbeitsbaum unsauber ist
 * (siehe `isGitWorkingTreeClean`) — dieselbe Auflage wie in Teil 1 des
 * Auftrags.
 */
export function writeSourceFiles(
	root: string,
	plan: ExtractionPlan,
	options: WriteSourceFilesOptions = {}
): WriteSourceFilesResult {
	const scope = options.scope ?? WRITE_SOURCES_SCOPE;
	const isClean = options.isWorkingTreeClean ?? isGitWorkingTreeClean;

	if (!isClean(root)) {
		return {
			written: [],
			aborted:
				'Abgebrochen — unsauberer Arbeitsbaum. Der erzeugte Diff muss nachträglich prüfbar bleiben; committe oder verwirf zuerst die vorhandenen Änderungen.'
		};
	}

	const written: string[] = [];
	for (const entry of plan.files) {
		if (!scope.includes(entry.file)) {
			continue;
		}
		if (entry.sites.length === 0) {
			continue;
		}
		writeFileSync(resolve(root, entry.file), entry.after);
		written.push(entry.file);
	}
	return { written };
}

export function main(argv: string[]): void {
	const rootArg = argv.find((arg) => arg.startsWith('--root='));
	const root = rootArg ? resolve(rootArg.slice('--root='.length)) : DEFAULT_ROOT;
	const plan = planExtraction(root);
	console.log(renderDryRunReport(plan));

	if (argv.includes('--write-messages')) {
		const result = writeMessageCatalogue(root, plan);
		if (!result.written) {
			console.error('Abgebrochen — bestehende Schlüssel mit abweichendem Wert:');
			for (const line of result.conflicts) {
				console.error(line);
			}
			process.exitCode = 1;
			return;
		}
		console.log(`Geschrieben: ${DE_MESSAGES_PATH}, ${EN_MESSAGES_PATH}`);
	}

	// Reihenfolge (Auftrag, Teil 1): erst `--write-messages`, dann
	// `npm run i18n:compile`, dann `--write-sources` — sonst referenziert der
	// Quelltext Botschaften, die es im kompilierten `#lib/paraglide/messages.js`
	// noch nicht gibt, und der Typ-Check bricht. Diese Reihenfolge ist ein
	// Ablaufschritt zwischen drei separaten npm-Läufen und wird hier bewusst
	// NICHT programmatisch erzwungen — die Datei kennt den Compile-Schritt
	// nicht. Sie steht dokumentiert im Auftrag und in `docs/i18n/PLAN_ETAPPE2.md`.
	if (argv.includes('--write-sources')) {
		const result = writeSourceFiles(root, plan);
		if (result.aborted) {
			console.error(result.aborted);
			process.exitCode = 1;
			return;
		}
		console.log(`Geschrieben (--write-sources): ${result.written.length} Datei(en)`);
		for (const file of result.written) {
			console.log(`  - ${file}`);
		}
	}
}

const isMainModule =
	typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
	main(process.argv.slice(2));
}
