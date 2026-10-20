/**
 * Reine Auswahl-Logik für verwaiste Uploads.
 *
 * Bewusst frei von `#lib`-Aliassen, Drizzle und SvelteKit: Das CLI-Werkzeug
 * `src/tools/cleanup-orphaned-uploads.ts` lädt dieses Modul unter Node-Type-
 * Stripping über einen relativen `.ts`-Import und muss ohne Anwendungslaufzeit
 * auskommen. Die Anbindung an Datenbank und Storage steht im Aufrufer.
 *
 * `scanUploadDir` liegt hier trotz `node:fs`, weil es drei Absicherungen trägt,
 * die keine Zweitfassung verlieren darf: Ausschluss von `_old_uploads`,
 * Überspringen von Punktdateien und ENOENT-Toleranz.
 */
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { ORPHAN_RETENTION } from '../../constants/uploadRetention.ts';

const RETENTION_PATTERN = /^(\d+)([hd])$/i;

const MILLIS_PER_HOUR = 60 * 60 * 1000;

const MILLIS_PER_DAY = 24 * MILLIS_PER_HOUR;

/**
 * Vorgabe: einen Tag. Formularentwürfe liegen in sessionStorage und überstehen
 * das Schließen des Tabs nicht — was 24 Stunden unverknüpft liegt, kann nicht
 * mehr abgesendet werden.
 */
export const DEFAULT_RETENTION = ORPHAN_RETENTION;

const EXCLUDED_DIRS = new Set(['_old_uploads']);

/**
 * Wandelt eine Fristangabe wie `24h` oder `7d` in Millisekunden um.
 * Wirft bei allem anderen — ein stiller Default wäre hier gefährlich,
 * weil die Frist bestimmt, was gelöscht wird.
 */
export function parseRetention(input: string): number {
	const match = RETENTION_PATTERN.exec(input.trim());
	if (!match) {
		throw new Error(`Ungültige Frist: ${JSON.stringify(input)}. Erwartet z. B. "24h" oder "7d".`);
	}

	const [, rawAmount = '', rawUnit = ''] = match;

	const amount = Number(rawAmount);
	if (amount <= 0) {
		throw new Error(`Ungültige Frist: ${JSON.stringify(input)}. Muss größer als 0 sein.`);
	}

	return rawUnit.toLowerCase() === 'h' ? amount * MILLIS_PER_HOUR : amount * MILLIS_PER_DAY;
}

/**
 * Bildet den Grenzzeitpunkt. Alles, was strikt davor liegt, gilt als verwaist.
 * Bewusst eine einzige Stelle: Klasse A und Klasse B müssen dieselbe Grenze
 * verwenden, sonst räumt ein Lauf die Datei ab und lässt die Zeile stehen.
 */
export function computeCutoff(now: Date, retentionMs: number): Date {
	return new Date(now.getTime() - retentionMs);
}

export interface OrphanRow {
	id: number;
	/** Pfad relativ zum Upload-Verzeichnis, wie in `datei_pfad` gespeichert. */
	filePath: string;
	uploadedAt: Date;
}

/**
 * Wählt die Zeilen, deren Upload strikt vor dem Grenzzeitpunkt liegt.
 * Strikt, damit ein Datensatz exakt auf der Grenze geschont wird.
 */
export function selectOrphanedRows(rows: OrphanRow[], cutoff: Date): OrphanRow[] {
	return rows.filter((row) => row.uploadedAt.getTime() < cutoff.getTime());
}

export interface DiskEntry {
	/** Pfad relativ zum Upload-Verzeichnis, mit `/` als Trennzeichen. */
	relativePath: string;
	modifiedAt: Date;
}

/**
 * Bringt einen Pfad in die Form, in der `datei_pfad` gespeichert wird:
 * Schrägstriche als Trennzeichen, kein führendes `/` oder `./`, Unicode als NFC.
 *
 * Die NFC-Angleichung ist der kritische Teil: macOS liefert Dateinamen zerlegt
 * (NFD), PostgreSQL zusammengesetzt (NFC). Ohne sie gilt jede Datei mit Umlaut
 * als verwaist, obwohl ihre Zeile existiert — am echten Bestand waren das 10
 * Dateien echter Sichtungen, die das Tool gelöscht hätte.
 */
export function normalizeRelativePath(input: string): string {
	return input.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').normalize('NFC');
}

export interface KnownState {
	/** Alle `datei_pfad`-Werte der Tabelle, auch die verknüpften. */
	paths: Iterable<string>;
	/** Alle `referenz_id`-Werte aus `sichtungen`. */
	referenceIds: Iterable<string>;
}

/**
 * Wählt Dateien, zu denen es keine Zeile gibt und die strikt älter als der
 * Grenzzeitpunkt sind.
 *
 * Der Altersfilter ist hier kein Komfort, sondern Schutz: Der Upload schreibt
 * erst die Datei und danach die DB-Zeile. Ohne Filter würde genau diese Lücke
 * als Waise gedeutet und ein laufender Upload zerstört.
 */
export function selectOrphanedFiles(
	entries: DiskEntry[],
	known: KnownState,
	cutoff: Date
): DiskEntry[] {
	const knownPaths = new Set<string>();
	for (const path of known.paths) {
		knownPaths.add(normalizeRelativePath(path));
	}

	const knownReferenceIds = new Set<string>();
	for (const referenceId of known.referenceIds) {
		knownReferenceIds.add(referenceId.normalize('NFC'));
	}

	return entries.filter((entry) => {
		const normalized = normalizeRelativePath(entry.relativePath);

		if (entry.modifiedAt.getTime() >= cutoff.getTime()) return false;
		if (knownPaths.has(normalized)) return false;

		// Zweite, unabhängige Absicherung: Der erste Pfadabschnitt ist die
		// `referenz_id`. Gehört sie zu einer echten Sichtung, ist die Datei
		// tabu — auch ohne Zeile. Genau dann ist sie die einzige Kopie.
		const referenceId = normalized.split('/')[0];
		if (referenceId && knownReferenceIds.has(referenceId)) return false;

		return true;
	});
}

/**
 * Löst einen relativen Pfad gegen das Upload-Verzeichnis auf und gibt `null`
 * zurück, wenn das Ergebnis die Basis verlässt.
 *
 * `datei_pfad` kommt aus der Datenbank, nicht aus dem Code — dieselbe
 * Absicherung wie in `LocalStorageProvider.validatePath()`.
 */
export function resolveSafeTarget(baseDir: string, relativePath: string): string | null {
	// Ein absoluter Pfad in `datei_pfad` ist eine Datenanomalie. Ihn durch
	// Abschneiden des führenden Schrägstrichs als relativ umzudeuten wäre
	// stillschweigendes Raten — dann zeigte `/etc/passwd` auf
	// `uploads/etc/passwd`. Lieber ablehnen und melden.
	if (isAbsolute(relativePath) || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
		return null;
	}

	const normalized = normalizeRelativePath(relativePath);
	if (normalized === '') {
		return null;
	}

	const resolvedBase = resolve(baseDir);
	const target = resolve(resolvedBase, normalized);
	const rel = relative(resolvedBase, target);

	if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
		return null;
	}

	return target;
}

/**
 * Läuft das Upload-Verzeichnis rekursiv ab und liefert alle Dateien mit
 * ihrem relativen Pfad und ihrer Änderungszeit.
 */
export async function scanUploadDir(baseDir: string, prefix = ''): Promise<DiskEntry[]> {
	let dirEntries;
	try {
		dirEntries = await readdir(join(baseDir, prefix), { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return [];
		}
		throw error;
	}

	const results: DiskEntry[] = [];
	for (const entry of dirEntries) {
		// Punktdateien sind nie Uploads (`.DS_Store`, `.gitkeep`). Sie liegen
		// real im Verzeichnis und wären sonst als Waise gelöscht worden.
		if (entry.name.startsWith('.')) {
			continue;
		}

		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

		if (entry.isDirectory()) {
			if (EXCLUDED_DIRS.has(entry.name) && prefix === '') {
				continue;
			}
			results.push(...(await scanUploadDir(baseDir, relativePath)));
		} else if (entry.isFile()) {
			const stats = await stat(join(baseDir, relativePath));
			results.push({ relativePath, modifiedAt: stats.mtime });
		}
	}
	return results;
}

export interface CleanupPorts {
	/** Zeilen ohne Sichtung, deren Upload vor `cutoff` liegt (Klasse A). */
	findOrphanRows(cutoff: Date): Promise<OrphanRow[]>;
	/**
	 * Dateien ohne Zeile, älter als `cutoff` (Klasse B). `null`, wenn der
	 * Provider kein Dateisystem bietet.
	 *
	 * `cutoff` ist Schutz, kein Komfort: Der Upload schreibt erst die Datei und
	 * danach die DB-Zeile. Ohne Altersfilter gälte genau diese Lücke als Waise —
	 * ein laufender Upload würde zerstört.
	 */
	findOrphanFiles(cutoff: Date): Promise<DiskEntry[] | null>;
	deleteRow(id: number): Promise<void>;
	deleteFile(relativePath: string): Promise<void>;
}

export interface CleanupOptions {
	now: Date;
	retentionMs: number;
	/** `false` ermittelt nur und fasst nichts an. */
	execute: boolean;
	/** Obergrenze bearbeiteter **Fundstücke**; eine Zeile samt Datei zählt als eins. */
	limit: number;
	ports: CleanupPorts;
	onError?: (subject: string, error: unknown) => void;
}

export interface CleanupReport {
	rowsFound: number;
	/** `null` = Klasse B für diesen Provider nicht anwendbar. */
	filesFound: number | null;
	rowsDeleted: number;
	filesDeleted: number;
	failed: number;
	/** Vom Deckel übrig gelassene Fundstücke. */
	remaining: number;
	/** Nur im Vorschaumodus gefüllt. */
	preview?: { rows: OrphanRow[]; files: DiskEntry[] };
}

/**
 * Ermittelt verwaiste Uploads und entfernt sie, wenn `execute` gesetzt ist.
 *
 * Beide Klassen kommen aus einem Lesestand mit derselben Grenze — würde Klasse B
 * nach dem Löschen von Klasse A ermittelt, tauchten deren Dateien erneut auf.
 *
 * Reihenfolge: erst die DB-Zeile, dann die Datei. Bricht der zweite Schritt ab,
 * bleibt eine Datei liegen, auf die nichts mehr zeigt — der nächste Lauf sammelt
 * sie als Klasse B ein. Andersherum entstünde eine Zeile ohne Datei, die der
 * Nutzer als kaputtes Bild sieht und die keine der beiden Klassen mehr findet.
 * Siehe `.claude/rules/upload.md`.
 */
export async function cleanupOrphans(options: CleanupOptions): Promise<CleanupReport> {
	const { now, retentionMs, execute, limit, ports, onError } = options;

	const cutoff = computeCutoff(now, retentionMs);
	const rows = await ports.findOrphanRows(cutoff);
	const files = await ports.findOrphanFiles(cutoff);

	const report: CleanupReport = {
		rowsFound: rows.length,
		filesFound: files === null ? null : files.length,
		rowsDeleted: 0,
		filesDeleted: 0,
		failed: 0,
		remaining: 0
	};

	if (!execute) {
		// Auch die Liste deckeln, nicht nur das Löschen: Ein großer Rückstand
		// ergäbe sonst eine Antwort von etlichen MB, die die Admin-Oberfläche
		// vollständig rendern müsste. Die Zählungen bleiben vollständig.
		report.preview = { rows: rows.slice(0, limit), files: (files ?? []).slice(0, limit) };
		report.remaining = Math.max(0, rows.length + (files?.length ?? 0) - limit);
		return report;
	}

	let budget = limit;

	for (const row of rows) {
		if (budget <= 0) break;
		budget--;
		try {
			await ports.deleteRow(row.id);
			report.rowsDeleted++;
		} catch (error) {
			report.failed++;
			onError?.(`row:${row.id}`, error);
			continue;
		}
		// Die Zeile ist weg. Ein Fehlschlag hier macht das nicht rückgängig und
		// hinterlässt nur eine unerreichbare Datei.
		try {
			await ports.deleteFile(row.filePath);
			report.filesDeleted++;
		} catch (error) {
			report.failed++;
			onError?.(`file:${row.filePath}`, error);
		}
	}

	for (const file of files ?? []) {
		if (budget <= 0) break;
		budget--;
		try {
			await ports.deleteFile(file.relativePath);
			report.filesDeleted++;
		} catch (error) {
			report.failed++;
			onError?.(`file:${file.relativePath}`, error);
		}
	}

	report.remaining = Math.max(0, rows.length + (files?.length ?? 0) - limit);
	return report;
}
