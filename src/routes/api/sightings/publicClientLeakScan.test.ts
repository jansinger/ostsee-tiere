import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectHits, sourceFiles, stripComments } from '#lib/testing/sourceScan.testutil.ts';

/**
 * @fileoverview `entryClient` darf in keiner öffentlichen Antwort auftauchen.
 *
 * Das Feld ist eine interne Diagnosegröße (Spalte `eingangs_client`). Einmal
 * ausgegeben, wäre es Teil eines öffentlichen Vertrags, aus dem es nicht mehr
 * herauskommt — die Legacy-Clients (`.claude/rules/legacy-api.md`) zeigen, wie
 * lange ein einmal gelieferter Feldname bindet.
 *
 * Kommentare sind ausgenommen, sonst verbietet die Regel ihre eigene
 * Begründung (deshalb `stripComments`, dieselbe Aufbereitung wie in
 * `verifiedReadScan.test.ts`).
 *
 * **Warum die Muster nicht einfach `\bentryClient\b` sind.** Der naheliegende
 * Entwurf — ein nacktes Wortgrenzen-Muster über die ganze Datei — schlägt am
 * eigenen Bestand fehl: `src/routes/api/sightings/+server.ts` ist zugleich die
 * öffentliche Sichtungsliste (`GET`, ungeschützt) UND der moderne
 * Schreibpfad (`POST`), der `entryClient` legitim berechnet und an
 * `saveSighting()` übergibt — nachweislich:
 *
 *   const entryClient = resolveEntryClient({ ... });
 *   const { id } = await saveSighting(formDataWithDefaults, weatherData, spamCheck, entryClient);
 *
 * Ein Datei-weites `\bentryClient\b` träfe diese beiden Zeilen und wäre vom
 * ersten Lauf an rot — nicht wegen eines Lecks, sondern wegen des Schreibpfads
 * im selben Modul. Die Muster hier sind deshalb an die Form gebunden, in der
 * ein Wert tatsächlich in eine JSON-Antwort geraten kann: als Objektschlüssel
 * (Spaltenauswahl, Response-Objekt), als Punktzugriff/Bracket-Zugriff auf ein
 * Objekt (`row.entryClient`, `row['entryClient']`), als Stringliteral (SQL,
 * Spaltenlisten) oder als Shorthand-Property/Destructuring am Rand eines
 * Objektliterals (`{ …, entryClient }` / `{ entryClient }`) — nicht als bloße
 * Variable in einer Zuweisung oder einem Funktionsargument. Beleg dafür steht
 * unten unter „Gegenproben — der echte Schreibpfad".
 *
 * **Fund aus dem Review (Critical 1).** Die ursprüngliche Fassung kannte nur
 * `\bentryClient\b\s*:` — einen Doppelpunkt HINTER dem Bezeichner. In den
 * gescannten Dateien heißt aber kein Antwortschlüssel `entryClient`: Sie
 * benutzen durchweg Kurzformen (`ts`, `dt`, `lat`, `ct`, …). Ein reales Leck
 * sähe deshalb so aus:
 *
 *   cl: sightings.entryClient,
 *
 * — der Doppelpunkt steht vor dem Alias, nicht hinter der Spalte. Das alte
 * Muster hätte das nicht gesehen. Der Punktzugriff (`\.\s*entryClient\b`)
 * schlägt hier an, ohne den Schreibpfad zu treffen: Dort steht vor
 * `entryClient` nie ein Punkt, nur `const `, `, ` oder `(`.
 *
 * **Bekannte Unschärfe.** Eine Shorthand-Property mitten in einem
 * Objektliteral (`{ entryClient, other }`) sieht textuell identisch aus wie
 * ein mittleres Funktionsargument (`foo(entryClient, other)`) — beides ist
 * `, entryClient,`. Ohne echten Parser lässt sich das nicht sauber trennen;
 * das Muster hier erkennt deshalb nur die shorthand-Form am Rand eines
 * Objekts (unmittelbar vor `}`, wie im Beispiel unten) zuverlässig. Derselbe
 * Kompromiss steht bereits in `sourceScan.testutil.ts` für `stripComments()`
 * dokumentiert.
 *
 * **Was dieser Guard NICHT sieht (Review, Runde 2).** Ein Guard über
 * Quelltext-Muster ist nie lückenlos. Bekannt und bewusst nicht geschlossen:
 *
 *  1. ~~**Antwortaufbau in einer Datei außerhalb der gescannten Liste.**~~
 *     **Geschlossen** (Runde 3). Der Critical-Fund aus Runde 2 war genau das:
 *     `api/map/sightings/+server.ts` selektiert nur Spalten, die eigentliche
 *     Antwort baut `sightingsToGeoJSON()` in `src/lib/map/mapUtils.ts` — eine
 *     Datei, die weder in `PUBLIC_ROUTES` noch im `src/routes`-Baum steht.
 *     Sie war seither als Eintrag in `MAP_RESPONSE_BUILDERS` aufgenommen,
 *     aber eben von Hand: Ein **zweiter** solcher Helfer wäre wieder lautlos
 *     ungeschützt gewesen. Statt die Liste zu pflegen, gleicht sie jetzt
 *     `Abhängigkeiten` unten mechanisch ab — es liest die `#lib`-Importe
 *     jeder gescannten Datei und verlangt für jeden davon entweder, dass er
 *     selbst gescannt wird, oder einen begründeten Eintrag in
 *     `LIB_IMPORT_WAIVERS`. Dieselbe Polaritätsumkehr wie im
 *     Vollständigkeits-Selbsttest für Routen: Default ist „nicht gedeckt",
 *     nicht „nicht bemerkt".
 *
 *     Mitgeprüft werden **beide** Importformen: `#lib/…` und der relative
 *     Nachbarpfad. Die erste Fassung dieses Abgleichs las nur `#lib` — und
 *     hätte damit dieselbe Lücke offen gelassen, nur über einen anderen
 *     Pfad: `api/map/sightings/+server.ts` holt sich `./publicMapConditions`
 *     und `./statusFilter` relativ, und ein nach
 *     `src/routes/api/map/sightings/toGeoJSON.ts` verschobenes
 *     `sightingsToGeoJSON()` wäre weder hier noch im Bestand-Selbsttest
 *     aufgefallen (ein reiner Zeilen-Mapper importiert `sightings` nicht aus
 *     dem Schema — `statusFilter.ts` belegt, dass es solche Route-Helfer
 *     ohne Schema-Import gibt).
 *
 *     Was daran Judgement bleibt: Ein Waiver behauptet „dieses Modul kann
 *     kein Antwortfeld beisteuern", und **dessen** Importe werden dann nicht
 *     weiterverfolgt. Wer ein Modul einträgt, das doch Zeilenfelder ausgibt,
 *     schaltet den Abgleich für dessen ganzen Teilbaum ab. Ebenfalls nicht
 *     erfasst: ein dynamisches `await import('…')` — es hat kein `from` und
 *     fällt durch dasselbe Loch wie Punkt 3 — und die virtuellen Module des
 *     Frameworks (`./$types`, `$app/…`, `$env/…`), die keine Tabelle lesen
 *     können und deshalb bewusst außen vor bleiben.
 *  2. **Indirektion über das Repository.** `getSightingById` und
 *     `getSightingByReferenceId` in `sightingRepository.ts` nutzen
 *     `db.select()` ohne Argument und laden damit `entryClient` mit — heute
 *     folgenlos, weil beide Aufrufer admin-gated sind. Bewusst NICHT in
 *     diese Scan-Liste aufgenommen: Die Datei setzt `entryClient` an anderer
 *     Stelle völlig legitim (Schreibpfad), ein Guard träfe dort sofort ein
 *     Falsch-Positiv. Dokumentiert stattdessen im Dateikopf von
 *     `sightingRepository.ts`.
 *  3. **Namespace-Import.** `importsSightingsFromSchema()` (siehe „Bestand"
 *     unten) erkennt `import * as schema from '.../schema'` nur, wenn
 *     `schema.sightings` textuell im selben File auftaucht. Ein Re-Export des
 *     Alias, ein Bracket-Zugriff (`schema['sightings']`) oder ein
 *     dynamisches `import()` entkommen weiterhin.
 *  4. **Ganze Zeile ohne Feldnamen jenseits von `.select()`/`.returning()`.**
 *     `{ ...row }`, `Object.assign({}, row)` oder `JSON.stringify(row)` ohne
 *     das Wort `entryClient` im selben Ausdruck erzeugen keinen Treffer —
 *     `WIDE_SELECT_PATTERNS` kennt nur die leeren Klammern von
 *     `.select()`/`.returning()`.
 *  5. **Spaltenauswahl über `getTableColumns()` oder die relationale
 *     Drizzle-API.** `select({ ...getTableColumns(sightings) })` liefert
 *     ebenso alle Spalten wie ein leeres `.select()`, ist textuell aber
 *     nicht `.select()` — genauso `db.query.sightings.findFirst()` /
 *     `.findMany()` ohne `columns`-Option. Keines der beiden Muster ist
 *     heute im Bestand, keines wird erkannt.
 *
 * Ein Guard muss die realistischen Fälle fangen und dort, wo er es nicht
 * kann, es benennen — nicht eine Deckung behaupten, die es nicht gibt.
 */

const REMEDIATION = [
	'`entryClient` (Spalte `eingangs_client`) ist eine interne Diagnosegröße.',
	'Sie gehört nicht in eine öffentliche Antwort — weder in die Spaltenauswahl',
	'noch in ein Mapping. Für den Admin liest sie AdminSightingView direkt.'
].join('\n');

/**
 * Zweite, eigenständige Regel derselben Datei (Critical 2): Eine Zeile ohne
 * Feldnamen entkommt jedem Muster oben, weil `entryClient` im Quelltext gar
 * nicht vorkommt:
 *
 *   const rows = await db.select().from(sightings);  return json(rows);
 *   const [row] = await db.insert(sightings).values(v).returning();
 *
 * `db.select()` ohne Argument steht im Repo an mehreren Stellen (siehe
 * `src/routes/admin/sichtungen/listColumns.ts`, dessen Datei-Doc genau davor
 * warnt: „ein zurückgedrehtes db.select() ohne Argument fällt sonst erst beim
 * Nutzer auf"). Geprüft wurde vor dieser Ergänzung, ob eine der fünf
 * geschützten Dateien das heute legitim tut — keine tut es: Alle Selects dort
 * benennen ihre Spalten explizit (siehe `Bestand` unten, „öffentliche Routen
 * wählen ihre Spalten explizit").
 */
const REMEDIATION_WIDE_SELECT = [
	'Eine öffentliche Route wählt ihre Spalten immer explizit aus — nie die',
	'ganze Zeile. `db.select()`/`.returning()` ohne Argument liefern alle',
	'Spalten, auch `entryClient`, und entkommen damit jedem Muster, das nach',
	'dem Feldnamen sucht. Stattdessen:',
	'  db.select({ id: sightings.id, … }).from(sightings)',
	'  db.insert(sightings).values(v).returning({ id: sightings.id })'
].join('\n');

/**
 * Öffentliche Antwortbauer — keine Admin-Route, keine Testdatei.
 *
 * Alle fünf sind ohne Anmeldung erreichbar und lesen `sightings`-Zeilen für
 * ihre Antwort:
 *  - `api/sightings/+server.ts` — moderne Sichtungsliste (`GET`, öffentliche
 *    Grundmenge über `approvedOnly()`; enthält zugleich den `POST`-Schreibpfad).
 *  - `sichtungen/showreports.json/+server.ts` — Legacy-Antwort; hat einen
 *    Admin-Zweig (breitere Suche), bleibt aber ohne Anmeldung erreichbar.
 *  - `rest_sichtungen/antworten.json/+server.ts` — Legacy-Optionsliste.
 *  - `api/map/sightings/+server.ts` und `.../years/+server.ts` — Kartendaten;
 *    laut `.claude/rules/api.md` ohne `status`-Parameter identisch mit der
 *    öffentlichen Grundmenge, der Parameter selbst verlangt eine Admin-Session.
 *
 * Ausdrücklich NICHT dabei: `rest_sichtungen/+server.ts` (reiner Schreibpfad,
 * die Antwort ist ein fixes `{ message: 'Saved' }`, keine Zeilenfelder) und
 * `rest_sichtungen/inBaltic.json/+server.ts` (prüft nur eine Koordinate,
 * berührt die `sightings`-Tabelle nicht). Beide bauen keine Antwort aus einer
 * Sichtungszeile und sind damit kein Leckpfad für dieses Feld.
 *
 * Ob diese Liste **vollständig** ist — also ob es noch eine sechste
 * ungeschützte, lesende Route gibt —, prüft nicht diese Liste selbst, sondern
 * der Vollständigkeits-Selbsttest unten in „Bestand" (Important 3).
 */
const PUBLIC_ROUTES = [
	'src/routes/api/sightings/+server.ts',
	'src/routes/sichtungen/showreports.json/+server.ts',
	'src/routes/rest_sichtungen/antworten.json/+server.ts',
	'src/routes/api/map/sightings/+server.ts',
	'src/routes/api/map/sightings/years/+server.ts'
];

/**
 * Response-Builder, die keine Route sind, aber die öffentliche Antwort einer
 * `PUBLIC_ROUTES`-Route zusammensetzen (Critical-Fund, Runde 2).
 *
 * `api/map/sightings/+server.ts` selektiert nur Spalten; den eigentlichen
 * Antwort-Body baut `sightingsToGeoJSON()` in `mapUtils.ts`, Alias-Form
 * inklusive (`ct: dbSighting.totalCount, …` — exakt die Form, gegen die
 * Critical 1 oben antritt). Diese Datei liegt außerhalb von `src/routes` und
 * wird deshalb von keinem Scan hier automatisch gefunden — der
 * Vollständigkeits-Selbsttest unten in „Bestand" sieht nur `src/routes`.
 * Dass dieser Eintrag existiert, erzwingt seit Runde 3 der Abgleich in
 * `Abhängigkeiten` unten: `api/map/sightings/+server.ts` importiert
 * `#lib/map/mapUtils`, und jeder `#lib`-Import einer gescannten Datei muss
 * entweder selbst gescannt sein oder in `LIB_IMPORT_WAIVERS` stehen. Nähme
 * jemand `mapUtils.ts` hier heraus, würde dieser Abgleich rot — die Liste
 * wird also nicht mehr nur gepflegt, sie wird nachgerechnet.
 *
 * `readFileSync` braucht keinen Routen-Pfad — jede Datei, die eine
 * öffentliche Antwort baut, gehört hierher, unabhängig davon, ob sie unter
 * `src/routes` liegt.
 */
const MAP_RESPONSE_BUILDERS = ['src/lib/map/mapUtils.ts'];

/** Alle Dateien, die auf `entryClient`/weite Selects gescannt werden. */
const SCANNED_RESPONSE_FILES = [...PUBLIC_ROUTES, ...MAP_RESPONSE_BUILDERS];

/**
 * `#lib`-Module, die eine gescannte Datei importiert, die aber selbst **nicht**
 * gescannt werden — je mit Begründung, warum sie kein Antwortfeld beisteuern
 * können.
 *
 * Schlüssel ist bei `#lib`-Modulen der Modulpfad, wie er im `import` steht,
 * ohne `.js`-Endung (`#lib/legacy-api/date-utils.js` und
 * `#lib/legacy-api/date-utils.js` sind derselbe Eintrag). Bei **relativ**
 * importierten Nachbarmodulen ist der Schlüssel der aufgelöste Pfad im Repo
 * (`src/routes/api/map/sightings/statusFilter.ts`) — derselbe Helfer heißt aus
 * `sightings/` `./statusFilter` und aus `sightings/years/` `../statusFilter`,
 * über den Specifier bräuchte er zwei Einträge und die zweite Schreibweise
 * wäre beim Anlegen leicht zu vergessen. Ein Schlüssel mit `/` am Ende deckt das ganze
 * Verzeichnis — bewusst nur für die zwei Verzeichnisse, deren Dateien
 * gleichförmig sind und in denen eine neue Datei denselben Charakter hat:
 * generierte i18n-Artefakte und die Enum-/Label-Tabellen des Formulars. Für
 * alles andere gilt der exakte Pfad, damit ein neues Modul im selben
 * Verzeichnis nicht stillschweigend mitgedeckt ist.
 */
const LIB_IMPORT_WAIVERS: ReadonlyMap<string, string> = new Map([
	[
		'#lib/paraglide/',
		'Von Paraglide generierte i18n-Artefakte (Messages, Runtime, baseLocale). Kennen weder Datenbank noch Schema; liefern Übersetzungen und Locale-Namen, nie Zeilenfelder.'
	],
	[
		'#lib/report/formOptions/',
		'Enum-Definitionen und Label-Tabellen des Formulars (Art, Seegang, Windrichtung, …). Reine Konstanten und Label-Funktionen ohne Datenbankzugriff — sie können nur ausgeben, was ihnen übergeben wird.'
	],
	[
		'#lib/server/env',
		'Namespace-Re-Export der Umgebungsvariablen aus $app/env/private und $app/env/public (Ersatz für $env/dynamic/* seit SvelteKit 3). Liest keine Datenbank, kennt das Schema nicht und liefert nur Konfigurationswerte.'
	],
	[
		'#lib/logger.server',
		'Pino-Logger. Schreibt ins Log, nicht in die Antwort — ein hier geloggter Wert erreicht keinen HTTP-Body.'
	],
	[
		'#lib/form/validation/sightingSchema',
		'Yup-Schema für die Eingabevalidierung im POST-Pfad. Prüft eingehende Formulardaten und kennt die Datenbankzeile nicht.'
	],
	[
		'#lib/legacy-api/date-utils',
		'Datums-/Zeitformatierung für die Legacy-Antwort (formatDateDDMMYY, toUnixTimestamp, getYearRange). Nimmt einzelne Datumswerte entgegen, nie eine Zeile.'
	],
	[
		'#lib/utils/format/dateTime',
		'Formatiert einen einzelnen Datumswert (berlinCalendarDayIso). Nimmt ein Date entgegen und gibt einen String zurück — keine Zeile, kein Feldname.'
	],
	[
		'#lib/server/datetime/berlinDayRange',
		'Rechnet einen Berliner Kalendertag in ein UTC-Intervall um. Reine Datumsarithmetik für den WHERE-Filter, ohne Datenbankzugriff.'
	],
	[
		'#lib/server/db/index',
		'Die Drizzle-Verbindung selbst (Lazy-Proxy). Führt aus, was die Route formuliert; die Spaltenauswahl steht in der Route und wird dort gescannt.'
	],
	[
		'#lib/server/db/schema',
		'Die Tabellendefinition. Dass sie `entryClient` kennt, ist der Grund für diesen Guard — ausgeliefert wird die Spalte erst durch eine Auswahl in der Route, und die steht im Scan.'
	],
	[
		'#lib/server/db/approvalFilter',
		'Baut nur das Freigabe-Prädikat (approvedOnly) für die WHERE-Klausel. Wählt keine Spalten aus und gibt keine Antwort zurück.'
	],
	[
		'#lib/server/db/consentGatedSearch',
		'Baut nur Suchbedingungen für die WHERE-Klausel (consentGatedNameSearch, containsPattern) — keine Spaltenauswahl, keine Antwort.'
	],
	[
		'#lib/server/db/sqlTimeZone',
		'Liefert SQL-Fragmente für die Zeitzonenumrechnung einer bestimmten Datumsspalte (berlinToChar, berlinDatePart). Ein Fragment kann keine zusätzliche Spalte in die Auswahl holen.'
	],
	[
		'#lib/server/db/sightingRepository',
		'Schreibpfad und Duplikatszählung (saveSighting, countRecentDuplicateSignals). Gibt der Route eine Id bzw. Zahlen zurück, nie eine Zeile — die bekannte Unschärfe der breiten Selects dort steht im Dateikopf jener Datei (Punkt 2 oben).'
	],
	[
		'#lib/server/db/mapFormToSighting',
		'Bildet Formulardaten auf eine Insert-Zeile ab — Richtung Datenbank, nicht Richtung Antwort.'
	],
	[
		'#lib/server/utils/getClientIp',
		'Liest die Client-IP aus den Request-Headern für Rate-Limit und Spam-Prüfung. Berührt die Sichtungszeile nicht.'
	],
	[
		'#lib/server/utils/resolveEntryClient',
		'Berechnet den Wert dieser Spalte — aber nur für den Schreibpfad: Das Ergebnis geht an saveSighting(), nicht in die Antwort. Genau diese Stelle belegen die Gegenproben unter „der echte Schreibpfad".'
	],
	[
		'#lib/server/startup/versionInfo',
		'Liefert Build-Metadaten (Version, Commit) für den Antwort-Header bzw. die Spam-Prüfung. Kennt die Sichtungstabelle nicht.'
	],
	[
		'#lib/server/spam/spamDetector',
		'Bewertet eine eingehende Meldung im POST-Pfad. Arbeitet auf den Formulardaten, nicht auf einer gelesenen Zeile.'
	],
	[
		'#lib/server/spam/formToken',
		'Prüft das Formular-Token einer eingehenden Meldung. Reine Token-Verifikation ohne Zeilenzugriff.'
	],
	[
		'#lib/server/services/emailService',
		'Versendet Benachrichtigungen per SMTP. Was dort hineingeht, verlässt die Anwendung per Mail an den Betreiber und nicht als HTTP-Antwort an den Melder.'
	],
	[
		'#lib/server/validation/requestValidation',
		'Validiert eingehende Requests (checkForbiddenAdminFields, validateSightingFormData). Richtung Eingang, nicht Richtung Antwort.'
	],
	[
		'#lib/server/middleware/rateLimit',
		'Rate-Limit-Prüfung und deren Header. Gibt Zähler und Limits aus, nie Felder einer Sichtungszeile.'
	],
	[
		'#lib/server/auth/auth',
		'Erkennt die Admin-Session (isAdminUser) für den breiteren Suchzweig. Entscheidet über die Menge der Zeilen, nicht über die Auswahl der Spalten.'
	],
	[
		'#lib/services/configService',
		'Laufzeit-Konfiguration (ServerConfigService). Liefert Einstellungswerte, keine Sichtungsfelder.'
	],
	[
		'src/routes/api/map/sightings/statusFilter.ts',
		'Nachbarmodul beider Karten-Routen, relativ importiert. Parst den status-Parameter und entscheidet, wer ihn setzen darf — ohne DB-Import und ohne Zeilenzugriff (siehe Dateikopf dort: „bewusst rein funktional und ohne SvelteKit- oder DB-Import").'
	],
	[
		'src/routes/api/map/sightings/publicMapConditions.ts',
		'Nachbarmodul beider Karten-Routen, relativ importiert. Baut nur WHERE-Bedingungen (mapSightingConditions) — dieselbe Begründung wie in ALLOWED_UNPROTECTED weiter unten: liest keine Zeile, gibt keine Antwort zurück.'
	],
	[
		'#lib/components/admin/sightingStatus',
		'Leitet den Anzeigestatus aus approvedAt/rejectedAt ab (Import aus mapUtils.ts). Bekommt genau diese zwei Werte übergeben und gibt einen Statusnamen zurück.'
	]
]);

/**
 * Jede Schreibweise, mit der das Feld in eine Antwort geraten kann.
 *
 * 1. Objektschlüssel — Spaltenauswahl oder Response-Mapping:
 *    `entryClient: sightings.entryClient` / `entryClient: value`.
 * 2. Der rohe Spaltenname — SQL-Template oder Stringliteral.
 * 3. Shorthand-Property/Destructuring am Rand eines Objektliterals:
 *    `{ ...row, entryClient }`, `{ entryClient }`, `const { entryClient } = row;`.
 *    Erkannt an `{`/`,` davor und `}` danach — das schließt Zuweisungen
 *    (`= resolveEntryClient(`) und Funktionsargumente (`, entryClient);`) aus,
 *    weil dort kein `}` unmittelbar folgt.
 * 4. Punktzugriff auf ein Objekt: `row.entryClient`, `sightings.entryClient`.
 *    Das ist die Form aus dem Critical-1-Fund — der reale Leckpfad in diesem
 *    Bestand, weil hier die Spalte immer über einen Alias läuft
 *    (`cl: sightings.entryClient`) und nie unter ihrem eigenen Namen als
 *    Objektschlüssel steht.
 * 5. Bracket-Zugriff: `row['entryClient']`.
 * 6. Stringliteral: `'entryClient'` — z. B. in einer ausgelagerten
 *    Spaltenliste oder einem `pick()`/`omit()`-Aufruf. Deckt Nummer 5 zwar
 *    mit ab, steht aber als eigenes Muster mit eigenem konstruierten Beispiel,
 *    weil der Bracket-Zugriff der konkretere und wahrscheinlichere Fall ist
 *    (Vorbild: `verifiedReadScan.test.ts` nennt ihn als eine von drei Lücken
 *    seiner ersten Fassung).
 */
const DOT_ACCESS = /\.\s*entryClient\b/g;
const BRACKET_ACCESS = /\[\s*(['"`])entryClient\1\s*\]/g;
const STRING_LITERAL = /(['"`])entryClient\1/g;

const PATTERNS = [
	/\bentryClient\b\s*:/g,
	/\beingangs_client\b/g,
	/[{,]\s*\bentryClient\b\s*\}/g,
	DOT_ACCESS,
	BRACKET_ACCESS,
	STRING_LITERAL
];

/** Argumentloses `.select()`/`.returning()` — Critical 2, eigenes Muster und eigene Meldung. */
const WIDE_SELECT_PATTERNS = [/\.select\(\s*\)/g, /\.returning\(\s*\)/g];

describe('Öffentliche Antworten geben die Client-Kennung nicht aus', () => {
	it.each(SCANNED_RESPONSE_FILES)('%s nennt entryClient nicht', (datei) => {
		const hits = collectHits(stripComments(readFileSync(datei, 'utf8')), PATTERNS);

		expect(hits, `${datei}:\n${REMEDIATION}`).toEqual([]);
	});

	it.each(SCANNED_RESPONSE_FILES)('%s liest keine ganze Zeile ohne Spaltenauswahl', (datei) => {
		const hits = collectHits(stripComments(readFileSync(datei, 'utf8')), WIDE_SELECT_PATTERNS);

		expect(hits, `${datei}:\n${REMEDIATION_WIDE_SELECT}`).toEqual([]);
	});

	describe('Mustererkennung — jede Schreibweise muss anschlagen', () => {
		it.each([
			['Spaltenauswahl', 'select({ id: sightings.id, entryClient: sightings.entryClient })'],
			['Shorthand-Property am Rand des Objekts', 'return { ...row, entryClient }'],
			['Destructuring am Rand des Objekts', 'const { id, entryClient } = row;'],
			['roher Spaltenname in SQL', 'sql`SELECT eingangs_client FROM sichtungen`'],
			['roher Spaltenname als Stringliteral', "const column = 'eingangs_client';"],
			// Critical 1: der reale Leckpfad — Punktzugriff über einen Alias.
			['Punktzugriff über Alias (Critical-1-Fund)', 'cl: sightings.entryClient,'],
			['Punktzugriff auf eine geladene Zeile', 'return json({ cl: row.entryClient });'],
			// Important 1: Bracket-Zugriff und Stringliteral.
			['Bracket-Zugriff', "const cl = row['entryClient'];"],
			['Stringliteral in einer Spaltenliste', "const publicFields = ['id', 'entryClient'];"]
		])('%s', (_fall, code) => {
			expect(collectHits(stripComments(code), PATTERNS)).not.toEqual([]);
		});

		it.each([
			['db.select() ohne Argument', 'const rows = await db.select().from(sightings);'],
			[
				'db.select() ohne Argument, mit anschließendem Rückgabewert',
				'const rows = await db.select().from(sightings); return json(rows);'
			],
			[
				'.returning() ohne Argument',
				'const [row] = await db.insert(sightings).values(v).returning();'
			],
			[
				'.returning() ohne Argument nach mehreren Zeilen',
				'const rows = await db.update(sightings).set(v).where(cond).returning();'
			]
		])('%s (Critical 2)', (_fall, code) => {
			expect(collectHits(stripComments(code), WIDE_SELECT_PATTERNS)).not.toEqual([]);
		});
	});

	describe('Gegenproben — das darf NICHT anschlagen', () => {
		it.each([
			['Kommentar mit Begründung', '// entryClient bleibt intern'],
			// Important 4: echte Trennschärfe-Gegenprobe. `entryClientLabel` ist
			// kein `entryClient` — an keinem Muster oben, weder Wortgrenze noch
			// Anführungszeichen noch Punktzugriff.
			['ähnlicher, anderer Bezeichner', 'const entryClientLabel = 1;'],
			['ähnlicher Bezeichner als Objektschlüssel', 'return { entryClientLabel: 1 };'],
			['ähnlicher Bezeichner als Stringliteral', "const x = 'entryClientLabel';"]
		])('%s', (_fall, code) => {
			expect(collectHits(stripComments(code), PATTERNS)).toEqual([]);
		});

		it.each([
			['explizite Spaltenauswahl', 'db.select({ id: sightings.id }).from(sightings)'],
			[
				'explizites .returning() mit Spaltenliste',
				'await tx.delete(sightingFiles).where(cond).returning({ filePath: sightingFiles.filePath });'
			]
		])('%s (Critical 2)', (_fall, code) => {
			expect(collectHits(stripComments(code), WIDE_SELECT_PATTERNS)).toEqual([]);
		});
	});

	/**
	 * Der echte Schreibpfad aus `api/sightings/+server.ts` — wörtlich, nicht
	 * nachgebaut. Diese Gruppe belegt, warum die Muster oben so eng gefasst
	 * sind: Ein naives `\bentryClient\b` würde genau hier zünden, obwohl der
	 * Wert nie in die Antwort gelangt (`saveSighting()` schreibt nur in die
	 * DB). Bricht dieser Test, hat sich entweder der Schreibpfad geändert oder
	 * das Muster ist wieder zu weit geworden.
	 */
	describe('Gegenproben — der echte Schreibpfad', () => {
		it.each([
			[
				'Zuweisung aus resolveEntryClient',
				"const entryClient = resolveEntryClient({ source: 'web', appVersion });"
			],
			[
				'Übergabe als Funktionsargument an saveSighting',
				'const { id } = await saveSighting(formDataWithDefaults, weatherData, spamCheck, entryClient);'
			]
		])('%s', (_fall, code) => {
			expect(collectHits(stripComments(code), PATTERNS)).toEqual([]);
		});

		it('der tatsächliche Schreibpfad in api/sightings/+server.ts bleibt unauffällig', () => {
			const source = readFileSync('src/routes/api/sightings/+server.ts', 'utf8');
			// Minor-Fund: Ein Filter auf `\bentryClient\b` behauptet bei einem
			// echten Leck fälschlich „das Muster ist wieder zu weit geworden" —
			// das Wort steht auch im legitimen Schreibpfad. Eingegrenzt auf die
			// beiden Funktionsnamen, die den Schreibpfad tatsächlich ausmachen,
			// bleibt die Diagnose richtig: Bricht dieser Test, ist entweder einer
			// dieser Aufrufe verschwunden (Selbsttest unten), oder eine NEUE Zeile
			// mit `resolveEntryClient`/`saveSighting` enthält einen echten Treffer.
			const writePathLines = stripComments(source)
				.split('\n')
				.filter((line) => /resolveEntryClient|saveSighting/.test(line));

			// Selbsttest: Es MUSS Schreibpfad-Zeilen geben, sonst prüft dieser
			// Test nichts (die Datei hätte den Bezeichner entfernt).
			expect(writePathLines.length).toBeGreaterThan(0);

			for (const line of writePathLines) {
				expect(collectHits(line, PATTERNS)).toEqual([]);
			}
		});
	});
});

/**
 * Vollständigkeits-Selbsttest (Important 3).
 *
 * `PUBLIC_ROUTES` oben ist eine von Hand gepflegte Liste — fünf Pfade, die
 * jemand als „die öffentlichen, lesenden Routen" erkannt hat. Eine neue Route,
 * die aus `sightings` liest und ohne Anmeldung erreichbar ist, wäre ab Tag
 * eins ungeschützt, ohne dass etwas rot wird — genau die falsche Polarität,
 * die die beiden Vorbilder (`verifiedReadScan.test.ts`,
 * `approvalPredicateScan.test.ts`) vermeiden, indem sie über `sourceFiles(...)`
 * den ganzen Baum einlesen und eine ALLOWED-Liste pflegen statt einer
 * geschützten Liste.
 *
 * Diese Gruppe dreht die Polarität um: Sie findet **jede** `.ts`-Datei unter
 * `src/routes`, die `sightings` aus dem Schema importiert (also potenziell
 * eine Zeile der Tabelle lesen kann), und verlangt für jede von ihnen einen
 * von drei Nachweisen:
 *
 *  1. Sie steht in `PUBLIC_ROUTES` — oben durch die Mustererkennung geschützt.
 *  2. Sie liegt unter `src/routes/admin/` — der Auth-Guard sitzt zentral in
 *     `admin/+layout.server.ts` (`.claude/rules/admin.md`, „Auth Pattern"),
 *     einzelne Routen prüfen bewusst nicht noch einmal.
 *  3. Sie ruft `requireUserRole(...)` selbst auf (Routen außerhalb `admin/`,
 *     die trotzdem admin-geschützt sind, z. B. `/api/sightings/[id]`) — oder
 *     sie steht mit Begründung in `ALLOWED_UNPROTECTED` (Helfer, die selbst
 *     keinen Header senden, oder öffentliche Routen, die nachweislich nur
 *     aggregierte bzw. bereits freigegebene Felder ausgeben).
 *
 * Was das nicht ersetzt: Ein Eintrag in `ALLOWED_UNPROTECTED` behauptet nur
 * „diese Datei ist kein Leckpfad", er scannt sie nicht auf `entryClient`. Wer
 * eine Datei dort einträgt, die doch Zeilenfelder ausgibt, muss das selbst
 * begründen — der Selbsttest erzwingt nur, dass niemand eine neue Route
 * lautlos an allen drei Nachweisen vorbeischreibt.
 */
describe('Bestand — jede lesende Route ist erfasst oder begründet ausgenommen', () => {
	const ADMIN_PREFIX = 'src/routes/admin/';

	/**
	 * Jede Schreibweise des Schema-Modulpfads, die im Bestand vorkommt oder
	 * vorkommen könnte: `#lib`-Alias oder relativer Pfad, mit oder ohne
	 * `.js`-Endung, ein- oder doppelte Anführungszeichen. Nur `schema`
	 * (lowercase) am Pfadende — `sightingSchema` (Yup, camelCase) trifft
	 * dieses Muster nicht, siehe Gegenprobe unten.
	 */
	const SCHEMA_MODULE_PATH = String.raw`(?:'|")(?:[$#]lib\/server\/db\/schema(?:\.(?:js|ts))?|\.\.?\/[\w./-]*schema(?:\.js)?)(?:'|")`;

	/**
	 * Erkennt den benannten Schema-Import über den Namen, nicht über eine
	 * Import-Zeile mit fester Reihenfolge — `import { sightings, type X }
	 * from …` und `import type { sightings } from …` müssen beide treffen.
	 * `[^}]*` frisst dabei auch Zeilenumbrüche (kein `.`, keine `s`-Flag nötig).
	 */
	const NAMED_SCHEMA_IMPORT = new RegExp(
		String.raw`import\s+(?:type\s+)?\{[^}]*\bsightings\b[^}]*\}\s*from\s*` + SCHEMA_MODULE_PATH
	);

	/**
	 * Namespace-Import (`import * as schema from '.../schema'`) — im Repo
	 * bereits benutzt (`src/tools/generate-reference-ids.ts`,
	 * `src/tools/migrate-old-uploads.ts`). Die Import-Zeile selbst nennt
	 * `sightings` nicht; erst eine Fundstelle wie `schema.sightings`
	 * anderswo in der Datei macht sie zu einer lesenden Route. Erkennt daher
	 * nur den lokalen Alias-Namen, die eigentliche Prüfung erfolgt in
	 * {@link importsSightingsFromSchema}. Bekannte Lücke: ein Re-Export des
	 * Alias oder `schema['sightings']` entkommen weiterhin — siehe Dateikopf,
	 * „Was dieser Guard NICHT sieht", Punkt 3.
	 */
	const NAMESPACE_SCHEMA_IMPORT = new RegExp(
		String.raw`import\s+\*\s+as\s+(\w+)\s+from\s*` + SCHEMA_MODULE_PATH
	);

	function importsSightingsFromSchema(source: string): boolean {
		if (NAMED_SCHEMA_IMPORT.test(source)) return true;

		const namespaceMatch = source.match(NAMESPACE_SCHEMA_IMPORT);
		if (!namespaceMatch) return false;

		const alias = namespaceMatch[1];
		return new RegExp(`\\b${alias}\\.sightings\\b`).test(source);
	}

	function sightingReadingRouteFiles(): string[] {
		return sourceFiles('src/routes', /\.ts$/)
			.filter((path) => !path.endsWith('.test.ts'))
			.filter((path) => importsSightingsFromSchema(readFileSync(path, 'utf8')));
	}

	/**
	 * Mustererkennung für `importsSightingsFromSchema` (Important 2, Review
	 * Runde 2). Jede dieser Formen fiel vor der Erweiterung durch das alte,
	 * einzeilige `SCHEMA_IMPORT`-Muster (feste `#lib`-Alias-Form, einfache
	 * Anführungszeichen, kein Namespace-Import).
	 */
	describe('importsSightingsFromSchema — jede Schreibweise muss anschlagen', () => {
		it.each([
			[
				'#lib-Alias, einfache Anführungszeichen',
				"import { sightings } from '#lib/server/db/schema';"
			],
			['doppelte Anführungszeichen', 'import { sightings } from "#lib/server/db/schema";'],
			[
				'.js-Endung auf ein .ts-Modul (Bestand seit SvelteKit 3)',
				"import { sightings } from '#lib/server/db/schema.ts';"
			],
			['alter $lib-Alias (vor SvelteKit 3)', "import { sightings } from '$lib/server/db/schema';"],
			['relativer Pfad', "import { sightings } from '../db/schema';"],
			[
				'relativer Pfad mit .js-Endung',
				"import { type SightingSelect, sightings } from '../../server/db/schema.js';"
			],
			[
				'Namespace-Import mit Punktzugriff (Bestand: generate-reference-ids.ts, migrate-old-uploads.ts)',
				"import * as schema from '#lib/server/db/schema';\nconst rows = await db.select().from(schema.sightings);"
			]
		])('%s', (_fall, code) => {
			expect(importsSightingsFromSchema(code)).toBe(true);
		});

		it.each([
			[
				'Namespace-Import ohne Verwendung von .sightings',
				"import * as schema from '#lib/server/db/schema';\nconst rows = await db.select().from(schema.sightingFiles);"
			],
			[
				'ähnlicher, anderer Import (Yup-Schema, camelCase)',
				"import { sightingSchema } from '#lib/form/validation/sightingSchema';"
			],
			[
				'Import ohne sightings im selben Schlüsselwortblock',
				"import { sightingFiles } from '#lib/server/db/schema';"
			]
		])('%s (darf NICHT anschlagen)', (_fall, code) => {
			expect(importsSightingsFromSchema(code)).toBe(false);
		});
	});

	/**
	 * Dateien außerhalb von `admin/`, die aus `sightings` lesen können, ohne
	 * selbst `requireUserRole(...)` aufzurufen — je mit Begründung, warum sie
	 * trotzdem kein Leckpfad für `entryClient` sind.
	 */
	const ALLOWED_UNPROTECTED: ReadonlyMap<string, string> = new Map([
		[
			'src/routes/about/+page.server.ts',
			'Öffentlich, aber liest nur COUNT()/MIN()-Aggregate (Gesamtzahl, Melderzahl, frühestes Jahr) — nie eine Zeile, nie eine Spalte namens entryClient.'
		],
		[
			'src/routes/api/media/[...path]/+server.ts',
			'Öffentlich erreichbar für freigegebene Medien (docs/DESIGN_GUIDE.md, Privacy-Review), selektiert für die Freigabeprüfung aber ausschließlich approvedAt — nie die ganze Zeile, nie entryClient.'
		],
		[
			'src/routes/uploads/[...path]/+server.ts',
			'Gleiche Konstruktion wie api/media: öffentlich, selektiert nur approvedAt für den Freigabe-Check.'
		],
		[
			'src/routes/api/map/sightings/publicMapConditions.ts',
			'Baut nur WHERE-Bedingungen (mapSightingConditions) für die beiden PUBLIC_ROUTES-Karten-Endpunkte — liest keine Zeile und gibt keine Antwort zurück, kann die Spalte also nicht ausliefern.'
		],
		[
			'src/routes/api/sightings/export/toFrontendSighting.ts',
			'Reiner Zeilen-Mapper für den Export, aufgerufen ausschließlich von den fünf Export-Routen unter api/sightings/export/**, die alle requireUserRole(admin) aufrufen. Der Typ-Import von sightings dient nur InferSelectModel, es gibt keinen HTTP-Handler in dieser Datei.'
		],
		[
			'src/routes/api/sightings/export/exportFilterParams.ts',
			'Baut nur WHERE-Bedingungen für den Export-Filter, aufgerufen ausschließlich von den admin-geschützten Export-Routen (requireUserRole). Kein HTTP-Handler, keine Zeilenauswahl, keine Antwort.'
		],
		[
			'src/routes/api/admin/inbox-status/+server.ts',
			'Admin-geschützt über isAdminUser(...) statt requireUserRole(...): Letzteres wirft redirect(302), und der Poller der Eingangsseite würde die Weiterleitung samt Login-HTML als Erfolg werten. Liest ausschließlich max(id) über openOnly() — nie eine Zeile, nie eine Spalte namens entryClient.'
		]
	]);

	function isCovered(path: string): boolean {
		if (PUBLIC_ROUTES.includes(path)) return true;
		if (path.startsWith(ADMIN_PREFIX)) return true;
		if (ALLOWED_UNPROTECTED.has(path)) return true;
		// stripComments: sonst zählt ein requireUserRole(...) in einem
		// Kommentar (z. B. einer Begründung, warum eine Route KEINEN Guard
		// braucht) fälschlich als Schutz (Minor-Fund, Review Runde 2).
		return /requireUserRole\(/.test(stripComments(readFileSync(path, 'utf8')));
	}

	it('jede lesende Route ist geschützt, admin-gesperrt oder ausdrücklich ausgenommen', () => {
		const offenders = sightingReadingRouteFiles().filter((path) => !isCovered(path));

		expect(
			offenders,
			`Neue Route liest aus sightings, ohne durch PUBLIC_ROUTES, admin/-Layout,\n` +
				`requireUserRole(...) oder ALLOWED_UNPROTECTED gedeckt zu sein:\n\n` +
				offenders.join('\n')
		).toEqual([]);
	});

	/* Zwei Selbsttests. Ein Scan, der nichts liest oder nichts erkennt, ist grün
	   und beweist nichts — das ist die Sorte Deckung, die keine ist. */
	it('findet überhaupt lesende Routen', () => {
		expect(sightingReadingRouteFiles().length).toBeGreaterThan(10);
	});

	/**
	 * `antworten.json/+server.ts` fehlt hier bewusst: Es liefert eine statische
	 * Dropdown-Optionsliste aus Enum-Labeln und importiert `sightings` nirgends
	 * — der Schema-Import-Scan findet es also korrekt nicht. Es bleibt trotzdem
	 * in `PUBLIC_ROUTES` (Verteidigung in der Tiefe, falls die Route später
	 * einmal Zeilenfelder ausliefert), nur eben ohne diesen Nachweis.
	 */
	it('findet die vier Sichtungszeilen lesenden PUBLIC_ROUTES wieder — sonst schützt die Liste die falschen Pfade', () => {
		const found = sightingReadingRouteFiles();
		const readsTable = PUBLIC_ROUTES.filter(
			(route) => route !== 'src/routes/rest_sichtungen/antworten.json/+server.ts'
		);

		expect(readsTable.length).toBeGreaterThan(0);
		for (const route of readsTable) {
			expect(found, `${route} taucht im Scan nicht auf — Pfad falsch geschrieben?`).toContain(
				route
			);
		}
	});

	it('nennt für jede Ausnahme eine Begründung — und jede Ausnahme wird gebraucht', () => {
		const found = sightingReadingRouteFiles();

		for (const [path, reason] of ALLOWED_UNPROTECTED) {
			expect(
				found,
				`Ausnahme zeigt auf eine Datei, die den Schema-Import nicht (mehr) hat: ${path}`
			).toContain(path);
			expect(reason.length, `Ausnahme ohne Begründung: ${path}`).toBeGreaterThan(40);
			expect(
				// stripComments: siehe Begründung in isCovered() oben.
				stripComments(readFileSync(path, 'utf8')).includes('requireUserRole('),
				`${path} ruft requireUserRole(...) auf — gehört nicht mehr in ALLOWED_UNPROTECTED, der dynamische Nachweis greift bereits.`
			).toBe(false);
		}
	});
});

/**
 * Abhängigkeiten — der Abgleich der Scan-Liste selbst (Runde 3, Gap 1).
 *
 * `SCANNED_RESPONSE_FILES` war eine von Hand gepflegte Liste, und genau das war
 * der Critical-Fund der zweiten Review-Runde: Die Karten-Route stand darin, der
 * Antwortbauer `mapUtils.ts` nicht. Der Eintrag wurde nachgetragen — aber ein
 * nachgetragener Eintrag schützt nur den einen Fall, den jemand gesehen hat.
 * Importiert eine geschützte Route morgen einen zweiten Helfer, entsteht
 * dieselbe Lücke lautlos.
 *
 * Diese Gruppe dreht die Polarität um — dieselbe Bewegung, die der
 * Vollständigkeits-Selbsttest oben für Routen macht: Sie liest die Importe
 * **jeder** gescannten Datei und verlangt für jeden davon einen von zwei
 * Nachweisen:
 *
 *  1. Das Modul wird selbst gescannt (steht in `SCANNED_RESPONSE_FILES`).
 *  2. Es steht mit Begründung in `LIB_IMPORT_WAIVERS`.
 *
 * Weil auch die Builder aus `MAP_RESPONSE_BUILDERS` mitgeprüft werden, ist der
 * Abgleich über die gescannte Menge geschlossen: Wer `mapUtils.ts` in die Liste
 * holt, holt damit auch dessen Importe in die Nachweispflicht.
 *
 * **Beide Importformen, nicht nur `#lib`.** Ein `#lib`-Import ist im Bestand
 * der übliche Weg zu einem Helfer, aber nicht der einzige: Die Karten-Route
 * holt sich `./publicMapConditions` und `./statusFilter` relativ. Ein nur auf
 * `#lib` schauender Abgleich hätte den Gap-1-Fall damit bloß verschoben — ein
 * Response-Builder als Nachbardatei der Route wäre weiterhin unsichtbar
 * gewesen. Relative Pfade werden deshalb gegen das Verzeichnis der
 * importierenden Datei aufgelöst und mit demselben Maß gemessen.
 *
 * **Was bewusst draußen bleibt.** Die virtuellen Module des Frameworks:
 * `./$types` (von SvelteKit generiert, existiert im Quellbaum gar nicht),
 * `$app/…` und `$env/…`. Keines davon kann die Sichtungstabelle lesen, und
 * `./$types` ließe sich ohne `.svelte-kit/`-Lauf nicht einmal auflösen.
 *
 * **Importe ohne Wertbindung sind ausgenommen** — `import type { … }` ebenso
 * wie die Liste, in der jeder Specifier sein eigenes `type` trägt
 * (`import { type Foo } from '…'`). Nicht, weil „Typen ohnehin verschwinden":
 * Mit `verbatimModuleSyntax: true` bleibt bei der zweiten Form ein
 * `import {} from '…'` stehen, das Modul wird also geladen. Es entsteht nur
 * kein Name im Gültigkeitsbereich, und ohne Bindung kann die Datei aus dem
 * Modul kein Antwortfeld holen. Das ist die einzige Unterscheidung hier, die
 * sich mechanisch treffen lässt; alles andere ist Nachweis oder Waiver.
 */
describe('Abhängigkeiten — jeder Import einer gescannten Datei ist gedeckt', () => {
	/**
	 * Ein `import`/`export … from '…'` mit allem, was dazwischen stehen darf.
	 *
	 * `[^;]*?` statt `[\s\S]*?` — und der Grund ist ein anderer als der zuerst
	 * hier notierte (Review Runde 3). Nachgemessen unterscheiden sich die
	 * beiden Fassungen **nicht** darin, welche Pfade sie finden: Ein
	 * Seiteneffekt-Import (`import '…';`) hat kein `from` und ist für beide
	 * unsichtbar, doppelt gezählt wird auch nichts. Der Unterschied liegt
	 * allein im eingefangenen Clause, und der entscheidet über die
	 * Typ-Erkennung: Ohne die Semikolon-Grenze beginnt der Clause von
	 * `import '#lib/polyfill';\nimport type { T } from '$lib/b';` mit dem
	 * Seiteneffekt-Import statt mit `type`, `/^\s*type\b/` greift nicht, und
	 * ein reiner Typ-Import wird als Wert-Import gemeldet. Die Gegenprobe
	 * „Seiteneffekt-Import vor einem reinen Typ-Import" unten fixiert genau
	 * das; sie wird rot, wenn jemand die Grenze wieder aufweicht.
	 *
	 * Zeilenumbrüche frisst `[^;]` weiterhin, deshalb trifft das Muster auch
	 * den mehrzeiligen Klammerblock, wie ihn Prettier in
	 * `antworten.json/+server.ts` erzeugt.
	 */
	const MODULE_IMPORT = /(?:import|export)\b([^;]*?)\bfrom\s*(['"])([^'"]+)\2/g;

	/** Von SvelteKit generiert bzw. virtuell — kein Quelltext, keine Tabelle. */
	const FRAMEWORK_MODULES = /^(?:\$app\/|\$env\/)|\$types$/;

	/**
	 * Alle Module, die `source` zur **Laufzeit** lädt — `#lib`-Alias und
	 * relative Nachbarpfade, ohne die virtuellen Framework-Module.
	 *
	 * Die Dateiendung (`.ts`, bei generierten Modulen `.js`) wird abgeschnitten,
	 * damit `#lib/legacy-api/date-utils.ts` und eine Schreibweise ohne Endung
	 * derselbe Eintrag sind — sonst bräuchte dieselbe Datei zwei Waiver.
	 */
	/**
	 * Ob ein Import-Clause **keine** Wertbindung erzeugt.
	 *
	 * Zwei Formen zählen dazu (Review Copilot, Runde 4): das vorangestellte
	 * `import type { … }` und die Liste, in der **jeder** Specifier sein
	 * eigenes `type` trägt — `import { type Foo } from '…'`,
	 * `export { type Foo } from '…'`. Die zweite fehlte und hätte einen
	 * Waiver für ein Modul verlangt, aus dem gar nichts gebunden wird.
	 *
	 * Wichtig ist dabei die Begründung, nicht die Faustregel „Typen sind
	 * weg": `.svelte-kit/tsconfig.json` setzt `verbatimModuleSyntax: true`,
	 * und damit bleibt aus `import { type Foo } from 'x'` sehr wohl ein
	 * `import {} from 'x'` stehen — das Modul wird geladen. Was es nicht
	 * gibt, ist eine **Bindung**: Ohne Namen im Gültigkeitsbereich kann die
	 * Datei aus diesem Modul kein Antwortfeld holen. Ein reiner
	 * Seiteneffekt-Import ist für diesen Scan ohnehin unsichtbar (kein
	 * `from`), die Behandlung ist also konsistent.
	 *
	 * Gemischt heißt Wert-Import: `{ buildBody, type Body }` bindet
	 * `buildBody`, ebenso `rb, { type Body }` (Default-Bindung außerhalb der
	 * Klammern). Deshalb muss der Clause **vollständig** aus einem
	 * Klammerblock bestehen.
	 *
	 * Bewusst konservativ bleibt die Grammatik-Ecke `{ type as T }` — das
	 * importiert eine Bindung namens `type` unter dem Namen `T` und ist
	 * damit ein Wert-Import; `{ type }` ebenso. Beide fordern hier weiterhin
	 * einen Waiver, was die richtige Richtung ist: lieber ein Eintrag zu
	 * viel als eine unbemerkte Bindung.
	 */
	function isTypeOnlyClause(clause: string): boolean {
		if (/^\s*type\b/.test(clause)) return true;

		const braced = clause.match(/^\s*\{([^}]*)\}\s*$/);
		if (!braced) return false;

		const specifiers = (braced[1] ?? '')
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean);

		return specifiers.length > 0 && specifiers.every((entry) => /^type\s+(?!as\b)\w/.test(entry));
	}

	function valueImportSpecifiers(source: string): string[] {
		const specifiers = new Set<string>();

		for (const match of stripComments(source).matchAll(MODULE_IMPORT)) {
			const clause = match[1] ?? '';
			const specifier = match[3] ?? '';
			if (isTypeOnlyClause(clause)) continue;
			if (FRAMEWORK_MODULES.test(specifier)) continue;
			if (!specifier.startsWith('#lib/') && !specifier.startsWith('.')) continue;
			specifiers.add(specifier.replace(/\.(?:js|ts)$/, ''));
		}

		return [...specifiers].sort();
	}

	/**
	 * Der Pfad im Repo, den ein Specifier meint — `undefined`, wenn dort keine
	 * Datei liegt.
	 *
	 * `.js` und `.svelte.ts` stehen neben `.ts` in der Kandidatenliste, weil
	 * nicht jedes Modul unter `src/lib` eine `.ts`-Datei ist: `#lib/paraglide/`
	 * enthält ausschließlich generierte `.js`-Dateien. Ohne diese Kandidaten
	 * meldete die Waiver-Hygiene unten für einen völlig korrekten Eintrag
	 * „Modul umbenannt oder Pfad vertippt" (Review Runde 3).
	 */
	function resolveModule(importer: string, specifier: string): string | undefined {
		// posix.normalize statt eigener `../`-Arithmetik: Ein einzelner
		// Regex-Durchlauf löst aufeinanderfolgende Aufstiege nicht auf
		// (`a/b/../../c` bleibt halb stehen) — nachgemessen an
		// `../../../../lib/map/mapUtils`, das damit nicht auf mapUtils.ts zeigte.
		// `#lib/…` trägt seit SvelteKit 3 eine Dateiendung (Node-Subpath-Imports);
		// sie wird abgeschnitten und unten über die Kandidatenliste wieder aufgelöst.
		const ohneEndung = specifier.replace(/\.(?:js|ts)$/, '');
		const base = ohneEndung.startsWith('#lib/')
			? `src/lib/${ohneEndung.slice('#lib/'.length)}`
			: posix.normalize(posix.join(posix.dirname(importer), ohneEndung));

		return [
			`${base}.ts`,
			`${base}/index.ts`,
			`${base}.js`,
			`${base}/index.js`,
			`${base}.svelte.ts`
		].find((path) => existsSync(path));
	}

	/**
	 * Der Waiver-Eintrag — `#lib`-Module stehen unter ihrem Specifier, relative
	 * Nachbarmodule unter ihrem aufgelösten Pfad (siehe Doc der Map).
	 */
	function waiverFor(specifier: string, resolved: string | undefined): string | undefined {
		const exact =
			LIB_IMPORT_WAIVERS.get(specifier) ?? (resolved && LIB_IMPORT_WAIVERS.get(resolved));
		if (exact !== undefined) return exact;

		for (const [key, reason] of LIB_IMPORT_WAIVERS) {
			if (key.endsWith('/') && specifier.startsWith(key)) return reason;
		}
		return undefined;
	}

	/**
	 * Die eigentliche Regel: Importe ohne einen der beiden Nachweise.
	 *
	 * Ein relativer Import, der auf keine Datei zeigt, gilt als **nicht**
	 * gedeckt und nicht als „nicht vorhanden, also egal": Er ist entweder ein
	 * Tippfehler oder ein Modul, das dieser Abgleich nicht sieht — beides will
	 * man wissen, und beides ist billiger als ein stilles Durchwinken.
	 */
	function uncoveredImports(importer: string, source: string): string[] {
		return valueImportSpecifiers(source).filter((specifier) => {
			const resolved = resolveModule(importer, specifier);
			if (resolved !== undefined && SCANNED_RESPONSE_FILES.includes(resolved)) return false;
			return waiverFor(specifier, resolved) === undefined;
		});
	}

	const REMEDIATION_IMPORT = [
		'Eine gescannte Datei importiert ein Modul, das weder selbst gescannt',
		'wird noch begründet ausgenommen ist. Genau so entstand der',
		'Critical-Fund aus Runde 2: Die Route stand in der Liste, der',
		'Antwortbauer (mapUtils.ts) nicht. Zwei Wege:',
		'  • Das Modul baut Antwortfelder → in MAP_RESPONSE_BUILDERS aufnehmen,',
		'    damit es auf entryClient und weite Selects gescannt wird.',
		'  • Es kann kein Antwortfeld beisteuern → in LIB_IMPORT_WAIVERS mit',
		'    einer Begründung eintragen, die sagt WARUM (nicht: „ist harmlos").',
		'Schlüssel ist der #lib-Specifier bzw. — bei relativem Import — der',
		'aufgelöste Pfad im Repo. Zeigt ein relativer Import ins Leere, ist er',
		'hier ebenfalls ein Befund: Tippfehler oder unsichtbares Modul.'
	].join('\n');

	it.each(SCANNED_RESPONSE_FILES)('%s importiert nur Gedecktes', (datei) => {
		const offenders = uncoveredImports(datei, readFileSync(datei, 'utf8'));

		expect(offenders, `${datei}:\n${REMEDIATION_IMPORT}\n\n${offenders.join('\n')}`).toEqual([]);
	});

	/**
	 * Selbsttest: Ein Import-Scanner, der nichts findet, ist grün und beweist
	 * nichts — dieselbe Sorte Deckung, die keine ist, gegen die auch die
	 * Selbsttests unter „Bestand" stehen.
	 */
	it.each(SCANNED_RESPONSE_FILES)('%s liefert überhaupt Importe', (datei) => {
		expect(valueImportSpecifiers(readFileSync(datei, 'utf8')).length).toBeGreaterThan(0);
	});

	/** Die Route, aus deren Sicht die konstruierten Beispiele importiert werden. */
	const KARTEN_ROUTE = 'src/routes/api/map/sightings/+server.ts';

	describe('Import-Erkennung — jede Schreibweise muss anschlagen', () => {
		it.each([
			[
				'der Gap-1-Fall: ein zweiter, ungescannter Response-Builder',
				"import { sightingsToGeoJSON } from '#lib/map/mapUtilsV2';",
				'#lib/map/mapUtilsV2'
			],
			[
				'derselbe Fall über einen relativen Nachbarpfad (Review Runde 3)',
				"import { toGeoJSON } from './toGeoJSON';",
				'./toGeoJSON'
			],
			[
				'relativer Ausbruch nach src/lib',
				"import { toRow } from '../../../../lib/map/mapUtilsV2';",
				'../../../../lib/map/mapUtilsV2'
			],
			[
				'relativer Import auf eine existierende, ungedeckte Datei',
				"import { toFrontendSighting } from '../../sightings/export/toFrontendSighting';",
				'../../sightings/export/toFrontendSighting'
			],
			[
				'doppelte Anführungszeichen',
				'import { buildBody } from "#lib/map/responseBuilder";',
				'#lib/map/responseBuilder'
			],
			[
				'mehrzeiliger Klammerblock (Prettier-Umbruch)',
				"import {\n\tbuildBody,\n\tbuildHeader\n} from '#lib/map/responseBuilder';",
				'#lib/map/responseBuilder'
			],
			[
				'Namespace-Import',
				"import * as builder from '#lib/map/responseBuilder';",
				'#lib/map/responseBuilder'
			],
			[
				'Default-Import',
				"import builder from '#lib/map/responseBuilder';",
				'#lib/map/responseBuilder'
			],
			[
				're-exportierter Antwortbauer',
				"export { buildBody } from '#lib/map/responseBuilder';",
				'#lib/map/responseBuilder'
			],
			[
				'.js-Endung wird normalisiert (derselbe Eintrag wie ohne)',
				"import { buildBody } from '#lib/map/responseBuilder.js';",
				'#lib/map/responseBuilder'
			],
			[
				'gemischter Import mit Inline-type-Schlüsselwort ist ein Wert-Import',
				"import { buildBody, type Body } from '#lib/map/responseBuilder';",
				'#lib/map/responseBuilder'
			],
			[
				'Default-Bindung neben einem Inline-Typ ist ein Wert-Import',
				"import builder, { type Body } from '#lib/map/responseBuilder';",
				'#lib/map/responseBuilder'
			],
			[
				'Bindung, die literal `type` heißt, ist ein Wert-Import',
				"import { type } from '#lib/map/responseBuilder';",
				'#lib/map/responseBuilder'
			],
			[
				'Bindung `type` unter neuem Namen (Grammatik-Ecke) bleibt Wert-Import',
				"import { type as T } from '#lib/map/responseBuilder';",
				'#lib/map/responseBuilder'
			],
			[
				'neue Datei im waiver-freien Verzeichnis ist NICHT vom Präfix gedeckt',
				"import { readRow } from '#lib/server/db/rowReader';",
				'#lib/server/db/rowReader'
			]
		])('%s', (_fall, code, erwartet) => {
			expect(uncoveredImports(KARTEN_ROUTE, code)).toContain(erwartet);
		});
	});

	describe('Gegenproben — das darf NICHT anschlagen', () => {
		it.each([
			[
				KARTEN_ROUTE,
				'gescanntes Modul (mapUtils, der Fund aus Runde 2)',
				"import { sightingsToGeoJSON, type DBSighting } from '#lib/map/mapUtils';"
			],
			[
				KARTEN_ROUTE,
				'gescanntes Modul über einen relativen Pfad',
				"import { sightingsToGeoJSON } from '../../../../lib/map/mapUtils';"
			],
			[KARTEN_ROUTE, 'exakter Waiver', "import { createLogger } from '#lib/logger.server';"],
			[
				KARTEN_ROUTE,
				'exakter Waiver mit .js-Endung',
				"import { getYearRange } from '#lib/legacy-api/date-utils.ts';"
			],
			[
				KARTEN_ROUTE,
				'Verzeichnis-Waiver (formOptions)',
				"import { SpeciesEnum, getSpeciesLabel } from '#lib/report/formOptions/species';"
			],
			[
				KARTEN_ROUTE,
				'relativer Nachbar, über den aufgelösten Pfad gewaivert',
				"import { resolveMapStatuses } from './statusFilter';"
			],
			[
				// Derselbe Helfer, andere Schreibweise, ein Waiver — das ist der
				// Grund für die Pfad- statt Specifier-Schlüssel bei relativen
				// Importen.
				'src/routes/api/map/sightings/years/+server.ts',
				'derselbe Nachbar aus dem Unterverzeichnis (../statusFilter)',
				"import { resolveMapStatuses } from '../statusFilter';"
			],
			[
				KARTEN_ROUTE,
				'reiner Typ-Import — verschwindet beim Kompilieren',
				"import type { StoredWeatherData } from '#lib/services/weatherService';"
			],
			[
				KARTEN_ROUTE,
				'reiner Typ-Re-Export',
				"export type { StoredWeatherData } from '#lib/services/weatherService';"
			],
			[
				// Review Copilot, Runde 4: bindet nichts, verlangt deshalb keinen
				// Waiver — auch wenn verbatimModuleSyntax das Modul noch lädt.
				KARTEN_ROUTE,
				'Inline-type-Specifier als einziger Eintrag',
				"import { type DBSighting } from '#lib/map/mapUtilsV2';"
			],
			[
				KARTEN_ROUTE,
				'mehrere Inline-type-Specifier, mit Alias und über mehrere Zeilen',
				"import {\n\ttype DBSighting,\n\ttype GeoJSONResponse as Response\n} from '#lib/map/mapUtilsV2';"
			],
			[
				KARTEN_ROUTE,
				'Inline-type-Re-Export',
				"export { type DBSighting } from '#lib/map/mapUtilsV2';"
			],
			[
				// Runde 3: die Gegenprobe, die die [^;]-Grenze im MODULE_IMPORT
				// tatsächlich belegt — mit [\s\S] beginnt der Clause hier mit dem
				// Seiteneffekt-Import statt mit `type`, und #lib/b würde gemeldet.
				KARTEN_ROUTE,
				'Seiteneffekt-Import vor einem reinen Typ-Import',
				"import '#lib/polyfill';\nimport type { T } from '#lib/b';"
			],
			[KARTEN_ROUTE, 'SvelteKit-Typen', "import type { RequestHandler } from './$types';"],
			[
				KARTEN_ROUTE,
				'virtuelles Framework-Modul',
				"import { env } from '$env/dynamic/private';\nimport { page } from '$app/state';"
			],
			[KARTEN_ROUTE, 'Paket-Import', "import { and, gte, lt, sql } from 'drizzle-orm';"],
			[
				KARTEN_ROUTE,
				'Import im Kommentar',
				"// import { sightingsToGeoJSON } from '#lib/map/mapUtilsV2';\nconst x = 1;"
			]
		])('%s: %s', (importer, _fall, code) => {
			expect(uncoveredImports(importer, code)).toEqual([]);
		});
	});

	describe('Pfadauflösung', () => {
		it.each([
			['#lib ohne Endung', KARTEN_ROUTE, '#lib/logger.server', 'src/lib/logger.server.ts'],
			[
				'#lib mit .js auf ein .ts-Modul (Bestand seit SvelteKit 3)',
				KARTEN_ROUTE,
				'#lib/server/db/schema.ts',
				'src/lib/server/db/schema.ts'
			],
			['#lib als Verzeichnis', KARTEN_ROUTE, '#lib/server/db', 'src/lib/server/db/index.ts'],
			// Runde 3: generierte Paraglide-Module sind .js — ohne diesen
			// Kandidaten meldete die Waiver-Hygiene einen korrekten Eintrag als
			// Tippfehler.
			[
				'#lib mit .js (Paraglide)',
				KARTEN_ROUTE,
				'#lib/paraglide/runtime.js',
				'src/lib/paraglide/runtime.js'
			],
			[
				'relativer Nachbar',
				KARTEN_ROUTE,
				'./statusFilter',
				'src/routes/api/map/sightings/statusFilter.ts'
			],
			[
				'relativer Aufstieg aus dem Unterverzeichnis',
				'src/routes/api/map/sightings/years/+server.ts',
				'../statusFilter',
				'src/routes/api/map/sightings/statusFilter.ts'
			],
			[
				'relativer Ausbruch nach src/lib',
				KARTEN_ROUTE,
				'../../../../lib/map/mapUtils',
				'src/lib/map/mapUtils.ts'
			]
		])('%s', (_fall, importer, specifier, erwartet) => {
			expect(resolveModule(importer, specifier)).toBe(erwartet);
		});

		it('meldet ein nicht existierendes Modul als unauflösbar', () => {
			expect(resolveModule(KARTEN_ROUTE, './toGeoJSON')).toBeUndefined();
			expect(resolveModule(KARTEN_ROUTE, '#lib/map/mapUtilsV2')).toBeUndefined();
		});
	});

	describe('Waiver-Hygiene', () => {
		const exactWaivers = [...LIB_IMPORT_WAIVERS.keys()].filter((key) => !key.endsWith('/'));

		it.each([...LIB_IMPORT_WAIVERS.entries()])('%s nennt eine Begründung', (pfad, grund) => {
			expect(grund.length, `Ausnahme ohne Begründung: ${pfad}`).toBeGreaterThan(40);
		});

		it.each(exactWaivers)('%s zeigt auf ein existierendes Modul', (pfad) => {
			// Ein Pfad-Schlüssel (relativer Nachbar) steht schon als Repo-Pfad da,
			// ein $lib-Schlüssel muss erst aufgelöst werden.
			const vorhanden = pfad.startsWith('#lib/')
				? resolveModule(KARTEN_ROUTE, pfad) !== undefined
				: existsSync(pfad);

			expect(
				vorhanden,
				`Waiver zeigt ins Leere — Modul umbenannt oder Pfad vertippt: ${pfad}`
			).toBe(true);
		});

		it('jeder Waiver wird gebraucht', () => {
			const genutzt = new Set<string>();
			for (const datei of SCANNED_RESPONSE_FILES) {
				for (const specifier of valueImportSpecifiers(readFileSync(datei, 'utf8'))) {
					const resolved = resolveModule(datei, specifier);
					genutzt.add(specifier);
					if (resolved) genutzt.add(resolved);
				}
			}

			const ungenutzt = [...LIB_IMPORT_WAIVERS.keys()].filter((key) =>
				key.endsWith('/')
					? ![...genutzt].some((specifier) => specifier.startsWith(key))
					: !genutzt.has(key)
			);

			expect(
				ungenutzt,
				`Waiver ohne Importeur — der Import ist weg, der Eintrag sollte es auch sein:\n${ungenutzt.join('\n')}`
			).toEqual([]);
		});

		it('kein Waiver deckt eine gescannte Datei ab', () => {
			const beschattet = exactWaivers.filter((key) => {
				const resolved = key.startsWith('#lib/') ? resolveModule(KARTEN_ROUTE, key) : key;
				return resolved !== undefined && SCANNED_RESPONSE_FILES.includes(resolved);
			});

			expect(
				beschattet,
				`Diese Module werden gescannt UND freigestellt — der Waiver ist irreführend:\n${beschattet.join('\n')}`
			).toEqual([]);
		});
	});
});
