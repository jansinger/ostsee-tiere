/**
 * Sammelt die Stellen in `sightingSchema.ts`, die zu Botschaften werden.
 *
 * Ergebnis sind Zeichen-Offsets, keine Textersetzungen: Wer den Diff baut
 * (`render.ts`), schneidet damit exakt das Literal samt Anführungszeichen aus.
 * Eine Ersetzung per Suchen-und-Ersetzen über den Rohtext wäre an den 19
 * Dubletten falsch.
 *
 * Was NICHT gesammelt wird, wird nicht verschwiegen: Jede übersprungene
 * Zeichenkette landet mit Grund in `skipped` und erscheint im Trockenlauf. Das
 * ist die einzige Stelle, an der ein Mensch eine zu enge Allowlist bemerken
 * kann.
 */
import { parse } from 'svelte/compiler';
import ts from 'typescript';
import {
	checkValue,
	isKnownNoMessageMethod,
	messageArgumentIndex,
	metaKeyDecision,
	type SkipReason
} from './allowlist';
import {
	formOptionsMessageKey,
	resolveFieldName,
	schemaMessageKey,
	svelteMessageKey
} from './messageKey';

export interface ExtractionSite {
	file: string;
	line: number;
	/** Zeichen-Offset des Literals, einschließlich Anführungszeichen. */
	start: number;
	end: number;
	text: string;
	key: string;
	aspect: string;
	field: string;
	/**
	 * Nur bei mechanisierten dynamischen Attributen (Gruppe 2, siehe
	 * `allowlist.ts` bei `dynamic-attribute`): die benannten Platzhalter der
	 * ICU-Botschaft in `text` (`{name}`), mit dem JS-Ausdruck, der beim Aufruf
	 * an `m.<key>({ name: ausdruck })` übergeben wird (`apply.ts`).
	 */
	params?: Array<{ name: string; expression: string }>;
}

export interface SkippedSite {
	file: string;
	line: number;
	text: string;
	aspect: string;
	reason: SkipReason;
	explanation: string;
}

export interface CollectResult {
	sites: ExtractionSite[];
	skipped: SkippedSite[];
}

/**
 * Der lokale Name, unter dem `#lib/paraglide/messages.js` als Namespace
 * importiert ist (`import * as m from '#lib/paraglide/messages'` → `'m'`).
 *
 * `undefined`, wenn die Datei das Modul nicht (mehr) per Namespace-Import
 * bindet — dann kann auch kein Aufruf als Paraglide-Botschaftsaufruf gelten.
 * Bewusst kein Raten über den Bezeichner: Nur ein Namespace-Import aus genau
 * diesem Modulpfad zählt, kein benannter Import und kein anderes Modul, das
 * zufällig auch `m` heißt.
 */
function paraglideMessagesNamespace(sourceFile: ts.SourceFile): string | undefined {
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
			continue;
		}
		if (statement.moduleSpecifier.text !== '#lib/paraglide/messages.js') {
			continue;
		}
		const bindings = statement.importClause?.namedBindings;
		if (bindings && ts.isNamespaceImport(bindings)) {
			return bindings.name.text;
		}
	}
	return undefined;
}

/**
 * Ist `node` ein Aufruf `<messagesNamespace>.<schlüssel>(...)` — also genau
 * die Form, in der Schicht A und B umgebaute Stellen tatsächlich schreiben
 * (`m.sighting_latitude_meta_helptext({}, { locale })`,
 * `m.formoptions_species_harbor_porpoise({}, { locale })`)? Prüft nur den
 * Callee, nicht die Argumentliste — die Signatur ist nicht Teil der
 * Erkennung, nur die Herkunft aus dem Paraglide-Botschaftsmodul.
 */
function isParaglideMessageCall(
	node: ts.Node,
	messagesNamespace: string | undefined
): node is ts.CallExpression {
	if (messagesNamespace === undefined || !ts.isCallExpression(node)) {
		return false;
	}
	return (
		ts.isPropertyAccessExpression(node.expression) &&
		ts.isIdentifier(node.expression.expression) &&
		node.expression.expression.text === messagesNamespace
	);
}

export function collectSchemaSites(
	source: string,
	relativeFilePath: string,
	taken: Set<string>
): CollectResult {
	const sourceFile = ts.createSourceFile(relativeFilePath, source, ts.ScriptTarget.Latest, true);
	const messagesNamespace = paraglideMessagesNamespace(sourceFile);
	const skipped: SkippedSite[] = [];

	/**
	 * Fundstellen ohne Schlüssel. Die Vergabe passiert erst nach dem Sortieren.
	 *
	 * `ts.forEachChild` besucht bei einer Aufrufkette `.max().label().meta()` den
	 * ÄUSSERSTEN Aufruf zuerst — die Funde entstehen also in umgekehrter
	 * Quelltextreihenfolge. Würden die Schlüssel dabei vergeben, hinge das
	 * Zählsuffix `_2` an der im Quelltext FRÜHEREN Stelle, und der Diff läse sich
	 * rückwärts. Deshalb zwei Durchgänge.
	 */
	const candidates: Array<Omit<ExtractionSite, 'key'>> = [];

	const lineOf = (node: ts.Node): number =>
		sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

	const addSite = (literal: ts.StringLiteralLike, aspect: string): void => {
		const check = checkValue(literal.text);
		if (!check.ok) {
			skipped.push({
				file: relativeFilePath,
				line: lineOf(literal),
				text: literal.text,
				aspect,
				reason: check.reason,
				explanation: check.explanation
			});
			return;
		}
		candidates.push({
			file: relativeFilePath,
			line: lineOf(literal),
			start: literal.getStart(sourceFile),
			end: literal.getEnd(),
			text: literal.text,
			aspect,
			field: resolveFieldName(literal, sourceFile) ?? 'unbekanntesFeld'
		});
	};

	const addSkip = (
		node: ts.Node,
		text: string,
		aspect: string,
		reason: SkipReason,
		explanation: string
	): void => {
		skipped.push({
			file: relativeFilePath,
			line: lineOf(node),
			text,
			aspect,
			reason,
			explanation
		});
	};

	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
			const method = node.expression.name.text;

			if (method === 'label') {
				handlePositional(node, 0, 'label');
			} else if (method === 'meta') {
				handleMeta(node);
			} else if (method === 'test' && isTestObjectForm(node)) {
				handleTestObjectForm(node);
			} else {
				const index = messageArgumentIndex(method);
				if (index !== undefined) {
					if (method === 'test') {
						const nameArg = node.arguments[0];
						if (nameArg && ts.isStringLiteralLike(nameArg)) {
							addSkip(
								nameArg,
								nameArg.text,
								'test.name',
								'test-name-argument',
								'Argument 0 von .test() ist der Testname (errors[field].type)'
							);
						}
					}
					handlePositional(node, index, method);
				} else if (!isKnownNoMessageMethod(method)) {
					reportUnknownMethodLiterals(node, method);
				}
			}
		}
		ts.forEachChild(node, visit);
	};

	function handlePositional(node: ts.CallExpression, index: number, aspect: string): void {
		const arg = node.arguments[index];
		if (!arg) {
			return;
		}
		if (ts.isStringLiteralLike(arg)) {
			addSite(arg, aspect);
			return;
		}
		// Ein Ausdruck mit einem Literal darin (z.B. `other.spec.label ?? 'Rückfall'`,
		// sightingSchema.ts:1421). Ihn zu ersetzen änderte die Bedeutung des `??`.
		const inner = firstStringLiteralWithin(arg);
		if (inner) {
			addSkip(
				inner,
				inner.text,
				aspect,
				'non-literal-argument',
				'Argument ist ein Ausdruck, nicht ein Literal — von Hand zu entscheiden'
			);
		}
	}

	/**
	 * Die Aufgabe-4-Meldung: eine Methode, die weder eine bekannte
	 * Meldungsposition (`MESSAGE_ARGUMENT_INDEX`) noch eine bekannte
	 * Meldungsfreiheit (`NO_MESSAGE_METHOD_REASONS`) hat. Genau das war die
	 * Lücke, in der `.integer(message)` an vier Feldern verschwand — weder
	 * Fund noch Übersprungen.
	 *
	 * Meldet jedes DIREKTE String-Literal-Argument (keine verschachtelten
	 * Ausdrücke — dasselbe Prinzip wie `firstStringLiteralWithin` weiter unten:
	 * ein Literal aus einem Callback-Rumpf ist kein übergangenes
	 * Meldungsargument, sondern irgendein Vergleichstext im Prüfcode).
	 */
	function reportUnknownMethodLiterals(node: ts.CallExpression, method: string): void {
		for (const arg of node.arguments) {
			if (ts.isStringLiteralLike(arg)) {
				addSkip(
					arg,
					arg.text,
					method,
					'method-unknown',
					`.${method}(...) steht weder in MESSAGE_ARGUMENT_INDEX noch in ` +
						'NO_MESSAGE_METHOD_REASONS (allowlist.ts) — von Hand prüfen, ob dieses Argument ' +
						'eine Meldung trägt, und die passende Liste ergänzen'
				);
			}
		}
	}

	function handleMeta(node: ts.CallExpression): void {
		const arg = node.arguments[0];
		if (!arg) {
			// .meta() ohne Argument — nichts zu entscheiden, nichts zu melden.
			return;
		}
		if (!ts.isObjectLiteralExpression(arg)) {
			// z.B. `.meta(sightingFromTextBase.spec.meta ?? {})` (sightingSchema.ts:1422).
			// Die geschlossene Allowlist gilt nur für Objektliterale — hier kann sie gar
			// nicht prüfen, ob ein sprachlicher Schlüssel drinsteckt.
			addSkip(
				arg,
				arg.getText(sourceFile),
				'meta',
				'non-literal-argument',
				'meta(...) erhält kein Objektliteral, sondern einen Ausdruck — von Hand prüfen, ' +
					'ob die referenzierte(n) Quelle(n) sprachliche Schlüssel (helpText/placeholder/valueText) tragen'
			);
			return;
		}
		for (const prop of arg.properties) {
			if (ts.isSpreadAssignment(prop)) {
				// `{ ...base, type: 'x' }` — die gespreadeten Eigenschaften entziehen sich
				// der Schlüsselprüfung komplett.
				addSkip(
					prop,
					prop.getText(sourceFile),
					'meta',
					'non-literal-argument',
					'Spread in meta({...}) — von Hand prüfen, ob die gespreadete Quelle sprachliche ' +
						'meta-Schlüssel (helpText/placeholder/valueText) enthält'
				);
				continue;
			}
			if (ts.isShorthandPropertyAssignment(prop)) {
				// `{ helpText }` — derselbe erlaubte Schlüssel, aber ohne Literal-Initializer.
				const key = prop.name.getText(sourceFile);
				addSkip(
					prop,
					prop.getText(sourceFile),
					`meta.${key}`,
					'non-literal-argument',
					`meta.${key} steht als Kurzschreibweise ({ ${key} }) ohne Literal — von Hand prüfen, ` +
						`ob die referenzierte Variable ${key} sprachlich ist`
				);
				continue;
			}
			if (!ts.isPropertyAssignment(prop) || ts.isComputedPropertyName(prop.name)) {
				continue;
			}
			const key = prop.name.getText(sourceFile);
			const decision = metaKeyDecision(key);
			if (decision.kind === 'unknown') {
				throw new Error(
					`${relativeFilePath}:${lineOf(prop)} — ${decision.explanation}. ` +
						'Eintragen in TRANSLATABLE_META_KEYS oder META_DENY_REASONS (allowlist.ts), ' +
						'nicht raten.'
				);
			}
			if (decision.kind === 'skip') {
				if (ts.isStringLiteralLike(prop.initializer)) {
					addSkip(
						prop.initializer,
						prop.initializer.text,
						`meta.${key}`,
						decision.reason,
						decision.explanation
					);
				}
				continue;
			}
			if (ts.isStringLiteralLike(prop.initializer)) {
				addSite(prop.initializer, `meta.${key}`);
				continue;
			}
			if (isParaglideMessageCall(prop.initializer, messagesNamespace)) {
				// Schon umgebaut: `helpText: m.sighting_x_meta_helptext({}, { locale })` —
				// erledigte Arbeit, kein offener Fall (siehe SkipReason 'already-translated').
				addSkip(
					prop.initializer,
					prop.initializer.getText(sourceFile),
					`meta.${key}`,
					'already-translated',
					`meta.${key} ruft bereits eine Paraglide-Botschaftsfunktion auf — schon übersetzt`
				);
				continue;
			}
			// Erlaubter Schlüssel (z.B. helpText), aber der Wert ist kein Literal
			// (`{ helpText: someVar }`) — die Allowlist kann den Inhalt nicht prüfen.
			addSkip(
				prop.initializer,
				prop.initializer.getText(sourceFile),
				`meta.${key}`,
				'non-literal-argument',
				`meta.${key} ist ein sprachlicher Schlüssel, aber der Wert ist kein Literal — von Hand ` +
					'prüfen, ob der referenzierte Ausdruck einen Anzeigetext liefert'
			);
		}
	}

	function isTestObjectForm(node: ts.CallExpression): boolean {
		const arg = node.arguments[0];
		return arg !== undefined && ts.isObjectLiteralExpression(arg);
	}

	function handleTestObjectForm(node: ts.CallExpression): void {
		const arg = node.arguments[0];
		if (!arg || !ts.isObjectLiteralExpression(arg)) {
			return;
		}
		for (const prop of arg.properties) {
			if (ts.isSpreadAssignment(prop)) {
				// `{ ...base, message: 'x' }` — ob darin ein `message` steckt, entzieht
				// sich der Prüfung komplett.
				addSkip(
					prop,
					prop.getText(sourceFile),
					'test',
					'non-literal-argument',
					'Spread in der Objektform von .test({...}) — von Hand prüfen, ob die gespreadete ' +
						'Quelle eine message trägt'
				);
				continue;
			}
			if (ts.isShorthandPropertyAssignment(prop)) {
				// `{ message }` — derselbe erlaubte Schlüssel, aber ohne Literal-Initializer.
				const key = prop.name.getText(sourceFile);
				addSkip(
					prop,
					prop.getText(sourceFile),
					'test',
					'non-literal-argument',
					`test({ ${key} }) steht als Kurzschreibweise ohne Literal — von Hand prüfen, ob die ` +
						`referenzierte Variable ${key} sprachlich ist`
				);
				continue;
			}
			if (!ts.isPropertyAssignment(prop) || ts.isComputedPropertyName(prop.name)) {
				continue;
			}
			const key = prop.name.getText(sourceFile);
			if (key === 'name') {
				if (ts.isStringLiteralLike(prop.initializer)) {
					addSkip(
						prop.initializer,
						prop.initializer.text,
						'test.name',
						'test-name-argument',
						'name in der Objektform von .test() ist der Testname'
					);
				}
				continue;
			}
			if (key === 'message') {
				if (ts.isStringLiteralLike(prop.initializer)) {
					addSite(prop.initializer, 'test');
					continue;
				}
				if (isParaglideMessageCall(prop.initializer, messagesNamespace)) {
					// Schon umgebaut: `message: m.sighting_x_test({}, { locale })`.
					addSkip(
						prop.initializer,
						prop.initializer.getText(sourceFile),
						'test',
						'already-translated',
						'message in der Objektform von .test() ruft bereits eine Paraglide-Botschaftsfunktion ' +
							'auf — schon übersetzt'
					);
					continue;
				}
				// Erlaubter Schlüssel, aber der Wert ist kein Literal — von Hand zu prüfen.
				addSkip(
					prop.initializer,
					prop.initializer.getText(sourceFile),
					'test',
					'non-literal-argument',
					'message in der Objektform von .test() ist kein Literal — von Hand prüfen, ob der ' +
						'referenzierte Ausdruck einen Anzeigetext liefert'
				);
			}
		}
	}

	/**
	 * Das erste String-Literal in einem Ausdruck — für die Meldung „von Hand zu
	 * entscheiden".
	 *
	 * **Steigt nicht in Funktionsrümpfe ab.** Bei der zweiargumentigen Form
	 * `.test('name', (value) => …)` stünde an Position 1 eine Funktion; ein
	 * Literal aus deren Rumpf wäre kein „nicht ersetztes Argument", sondern
	 * irgendein Zeichenkettenvergleich im Prüfcode. Es zu melden füllte den
	 * Abschnitt „Übersprungen" mit Rauschen — genau den Abschnitt, den ein
	 * Mensch Zeile für Zeile lesen soll (Aufgabe 1.5, Schritt 10).
	 */
	function firstStringLiteralWithin(node: ts.Node): ts.StringLiteralLike | undefined {
		if (
			ts.isArrowFunction(node) ||
			ts.isFunctionExpression(node) ||
			ts.isFunctionDeclaration(node)
		) {
			return undefined;
		}
		let found: ts.StringLiteralLike | undefined;
		const walk = (n: ts.Node): void => {
			if (found) {
				return;
			}
			if (ts.isStringLiteralLike(n)) {
				found = n;
				return;
			}
			if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
				return;
			}
			ts.forEachChild(n, walk);
		};
		walk(node);
		return found;
	}

	visit(sourceFile);

	// Zweiter Durchgang: erst jetzt, in Quelltextreihenfolge, die Schlüssel.
	const sites: ExtractionSite[] = candidates
		.sort((a, b) => a.start - b.start)
		.map((candidate) => ({
			...candidate,
			key: schemaMessageKey(candidate.field, candidate.aspect, taken)
		}));

	skipped.sort((a, b) => a.line - b.line);
	return { sites, skipped };
}

/**
 * Sammelt die Werte der `export const xLabels: Record<Enum, string>`-Literale.
 *
 * Bewusst dasselbe strenge Muster wie `analyzeFormOptionsSource`
 * (i18n-inventory.ts:518) — nicht mehr. Die drei Gruppennamen in `speciesGroups`
 * sind Objekt-SCHLÜSSEL und zugleich Anzeigetext; sie brauchen eine Trennung von
 * Schlüssel und Text, die ein Werkzeug nicht raten kann. Sie stehen deshalb in
 * Entwurf Abschnitt 5 als benannte Handarbeit, nicht hier.
 */
export function collectFormOptionsSites(
	source: string,
	relativeFilePath: string,
	taken: Set<string>
): CollectResult {
	const sourceFile = ts.createSourceFile(relativeFilePath, source, ts.ScriptTarget.Latest, true);
	const sites: ExtractionSite[] = [];
	const skipped: SkippedSite[] = [];
	const fileBaseName = relativeFilePath.replace(/^.*[/\\]/, '').replace(/\.ts$/, '');

	const lineOf = (node: ts.Node): number =>
		sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

	/**
	 * Alle String-Literale unterhalb von `node`, ohne in verschachtelte
	 * Funktionsrümpfe abzusteigen (Befund 1c: eine Zeichenkette im Rumpf einer
	 * Callback-Funktion gehört nicht zur `return`-Anweisung, die sie umschließt).
	 */
	function collectStringLiteralsWithin(node: ts.Node): ts.StringLiteralLike[] {
		const found: ts.StringLiteralLike[] = [];
		const walk = (n: ts.Node): void => {
			if (ts.isStringLiteralLike(n)) {
				found.push(n);
				return;
			}
			if (ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isFunctionDeclaration(n)) {
				return;
			}
			ts.forEachChild(n, walk);
		};
		walk(node);
		return found;
	}

	/**
	 * Befund 1a/1b: ein `export const`, dessen Initializer ein Objekt- oder
	 * Arrayliteral mit String-Literalen ist, aber das strenge
	 * `Record<Enum, string>`-Muster nicht trifft — z.B. `speciesIdentification`
	 * (Record mit Fremdtyp-Werten) oder `PUBLIC_BOAT_DRIVE_OPTIONS`
	 * (Array-Literal). Wird NICHT eingesammelt, nur gemeldet: Die Struktur ist
	 * zu uneinheitlich, um sie automatisch in Schlüssel und Text zu zerlegen.
	 */
	function reportUnmatchedExport(exportName: string, initializer: ts.Expression): void {
		if (!ts.isObjectLiteralExpression(initializer) && !ts.isArrayLiteralExpression(initializer)) {
			return;
		}
		const literals = collectStringLiteralsWithin(initializer);
		if (literals.length === 0) {
			return;
		}
		skipped.push({
			file: relativeFilePath,
			line: lineOf(initializer),
			text: exportName,
			aspect: 'export',
			reason: 'record-pattern-miss',
			explanation:
				`export const ${exportName} enthält ${literals.length} String-Literal(e), passt aber ` +
				'nicht auf das Muster `export const x: Record<Enum, string>` — von Hand prüfen, ob und ' +
				'wie hier extrahiert werden muss'
		});
	}

	/**
	 * Befund 1c: Rückfalltexte wie `'Nicht angegeben'` oder `'Unbekannt'` in den
	 * `getXLabel`-Funktionen. Gezielt String-Literale in `return`-Anweisungen
	 * exportierter Funktionen — nicht jede Zeichenkette im Modul, sonst würde
	 * der Übersprungen-Abschnitt mit Rauschen aus Vergleichs- und Hilfscode
	 * gefüllt.
	 */
	function reportReturnLiterals(fnName: string, body: ts.Node): void {
		const walk = (n: ts.Node): void => {
			if (ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isFunctionDeclaration(n)) {
				return;
			}
			if (ts.isReturnStatement(n) && n.expression) {
				for (const literal of collectStringLiteralsWithin(n.expression)) {
					skipped.push({
						file: relativeFilePath,
						line: lineOf(literal),
						text: literal.text,
						aspect: `${fnName} (return)`,
						reason: 'record-pattern-miss',
						explanation:
							`Rückfalltext in einer return-Anweisung der exportierten Funktion ${fnName} — ` +
							'vom Muster `export const x: Record<Enum, string>` nicht erfasst, von Hand prüfen'
					});
				}
			}
			ts.forEachChild(n, walk);
		};
		ts.forEachChild(body, walk);
	}

	const isExported = (node: ts.Node): boolean =>
		ts.canHaveModifiers(node) &&
		(ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

	const visit = (node: ts.Node): void => {
		if (ts.isVariableStatement(node)) {
			for (const decl of node.declarationList.declarations) {
				if (!decl.initializer) {
					continue;
				}
				if (
					isStringRecordDeclaration(decl, sourceFile) &&
					ts.isObjectLiteralExpression(decl.initializer)
				) {
					const recordName = decl.name.getText(sourceFile);
					for (const prop of decl.initializer.properties) {
						if (!ts.isPropertyAssignment(prop) || !ts.isStringLiteralLike(prop.initializer)) {
							continue;
						}
						const enumKey = ts.isComputedPropertyName(prop.name)
							? prop.name.expression.getText(sourceFile)
							: prop.name.getText(sourceFile);
						const line = lineOf(prop.initializer);
						const check = checkValue(prop.initializer.text);
						if (!check.ok) {
							skipped.push({
								file: relativeFilePath,
								line,
								text: prop.initializer.text,
								aspect: `${recordName}[${enumKey}]`,
								reason: check.reason,
								explanation: check.explanation
							});
							continue;
						}
						sites.push({
							file: relativeFilePath,
							line,
							start: prop.initializer.getStart(sourceFile),
							end: prop.initializer.getEnd(),
							text: prop.initializer.text,
							key: formOptionsMessageKey(fileBaseName, enumKey, taken),
							aspect: `${recordName}[${enumKey}]`,
							field: recordName
						});
					}
					continue;
				}
				if (isExported(node)) {
					reportUnmatchedExport(decl.name.getText(sourceFile), decl.initializer);
				}
			}
		}
		if (ts.isFunctionDeclaration(node) && isExported(node) && node.body) {
			reportReturnLiterals(node.name?.getText(sourceFile) ?? 'anonym', node.body);
		}
		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return { sites, skipped };
}

function isStringRecordDeclaration(
	decl: ts.VariableDeclaration,
	sourceFile: ts.SourceFile
): boolean {
	return (
		decl.type !== undefined &&
		ts.isTypeReferenceNode(decl.type) &&
		decl.type.typeName.getText(sourceFile) === 'Record' &&
		decl.type.typeArguments?.length === 2 &&
		decl.type.typeArguments[1]?.kind === ts.SyntaxKind.StringKeyword
	);
}

// ---------------------------------------------------------------------------
// collectSvelteSites — Aufgabe 2.2 ("Der Extraktor lernt Svelte")
// ---------------------------------------------------------------------------

/**
 * Sammelt Textknoten und Attributwerte aus Svelte-Markup, die zu Botschaften
 * werden können.
 *
 * Traversierung angelehnt an `analyzeSvelteSource` (i18n-inventory.ts:424) —
 * VORLAGE, nicht Import (siehe Dateikopf): `classifyText` von dort liegt an
 * belegten Stellen falsch, dieser Sammler entscheidet stattdessen rein
 * strukturell (siehe Tabelle in `docs/i18n/PLAN_ETAPPE2.md`, Aufgabe 2.2).
 * Derselbe Grund, aus dem `Comment`-Knoten nie als Text erfasst werden, gilt
 * hier unverändert: Ihr Inhalt steckt im String-Feld `data`, die Traversierung
 * steigt dort nie ab (`visitNode` gibt für `'Comment'` sofort zurück).
 */
const SVELTE_TARGET_ATTRIBUTES = new Set(['placeholder', 'title', 'aria-label', 'alt']);

/**
 * Derselbe Namespace-Import wie `paraglideMessagesNamespace` (oben, für die
 * TS-Sammler), nur über den rohen Svelte-Quelltext statt über einen
 * `ts.SourceFile` — `collectSvelteSites` baut keinen TS-AST für die ganze
 * Datei auf. Ein Regex über `<script>` reicht: Die Importzeile hat immer
 * dieselbe Form (`import * as m from '#lib/paraglide/messages'`), die
 * Extraktor-Ausgabe schreibt nichts anderes.
 */
function paraglideMessagesNamespaceInSvelte(source: string): string | undefined {
	const match =
		/import\s*\*\s*as\s+(\w+)\s+from\s*['"][$#]lib\/paraglide\/messages(?:\.js)?['"]/.exec(source);
	return match?.[1];
}

/**
 * Ist `expression` (das `expression`-Feld eines Svelte-`ExpressionTag`, ein
 * estree-Knoten aus `svelte/compiler`) ein Aufruf `<messagesNamespace>.<schlüssel>(...)`?
 * Spiegelt `isParaglideMessageCall` (oben), aber für den estree-Knotentyp der
 * Svelte-Ausdrücke statt für den TS-AST — die beiden Sammler benutzen
 * unterschiedliche Parser für ihre Ausdrücke.
 */
function isParaglideMessageCallInSvelte(
	expression: unknown,
	messagesNamespace: string | undefined
): boolean {
	if (messagesNamespace === undefined || !isSvelteNode(expression)) {
		return false;
	}
	if (expression.type !== 'CallExpression') {
		return false;
	}
	const callee = expression.callee;
	if (!isSvelteNode(callee) || callee.type !== 'MemberExpression') {
		return false;
	}
	const object = callee.object;
	return isSvelteNode(object) && object.type === 'Identifier' && object.name === messagesNamespace;
}

/** Mindestens eine Buchstabengruppe — Unicode-bewusst (Umlaute zählen als Buchstaben). */
const LETTER_GROUP = /\p{L}/u;
const HAS_DIGIT = /\d/;

/**
 * Zählt, ob `text` mindestens ZWEI Buchstaben enthält — Unicode-bewusst wie
 * `LETTER_GROUP`.
 *
 * `LETTER_GROUP` allein reicht nicht: Der Name suggeriert eine Gruppe, aber
 * `/\p{L}/u` verlangt nur EINEN Treffer und lässt jeden Einzelbuchstaben
 * durch. Genau das ließ `H` (die Tastenbelegung des Kartenkürzels in
 * `LoadingOverlay.svelte`) als Botschaft durchrutschen — ein einzelner
 * Buchstabe ist in keiner Sprache ein zu übersetzender Satz, egal ob
 * Tastenkürzel, Aufzählungsbuchstabe oder Achsenbeschriftung. Echte
 * zweibuchstabige Anzeigetexte (Masseinheiten wie `MB`, Himmelsrichtungen
 * wie `NO`/`SW`) bleiben Botschaften — die Grenze liegt bei EINEM Buchstaben,
 * nicht bei zweien.
 */
function hasMinimumTwoLetters(text: string): boolean {
	return (text.match(/\p{L}/gu)?.length ?? 0) >= 2;
}

/**
 * Die beiden inhaltlichen Prüfungen, die für JEDEN Text gelten, egal ob er
 * über einen Attributwert oder einen Textknoten hereinkommt — Ziffer vor
 * Buchstabenzahl, in dieser Reihenfolge (ein Text wie `"3."` ist zuerst ein
 * Plural-Kandidat, nicht „zu wenig Buchstaben").
 *
 * Für Textknoten (`handleText`) MUSS diese Prüfung VOR der
 * Geschwister-Prüfung laufen, nicht erst in `addSite` danach: Reine
 * Satzzeichen neben einem dynamischen Geschwister (`BarChart.svelte:159`
 * meldet `(` und `)` neben `{value}`, `LegendPanel.svelte:173` meldet `/`)
 * landeten sonst unter `interpolation` statt unter `no-letter-group` — die
 * Geschwister-Prüfung griff zuerst und brach ab, bevor die Buchstabenprüfung
 * je zum Zug kam. Das verstellte den Blick auf die echten
 * Interpolationsfälle, die Handarbeit brauchen.
 */
function textQualityIssue(
	text: string
):
	| { reason: Extract<SkipReason, 'plural-candidate' | 'no-letter-group'>; explanation: string }
	| undefined {
	if (HAS_DIGIT.test(text)) {
		return {
			reason: 'plural-candidate',
			explanation:
				'enthält eine Ziffer — möglicher ICU-Plural, menschliche Entscheidung (Aufgabe 2.4)'
		};
	}
	if (!hasMinimumTwoLetters(text)) {
		return {
			reason: 'no-letter-group',
			explanation:
				'keine Buchstabengruppe (mindestens zwei Buchstaben) — reine Satzzeichen, Symbole, ' +
				'Zahlen oder ein einzelner Buchstabe (Tastenkürzel, Aufzählungsbuchstabe, Achsenbeschriftung)'
		};
	}
	return undefined;
}

interface SvelteAstNode {
	type?: string;
	start?: number;
	end?: number;
	data?: string;
	name?: string;
	[key: string]: unknown;
}

function isSvelteNode(value: unknown): value is SvelteAstNode {
	return (
		typeof value === 'object' && value !== null && typeof (value as SvelteAstNode).type === 'string'
	);
}

export function collectSvelteSites(
	source: string,
	relativeFilePath: string,
	taken: Set<string>
): CollectResult {
	const skipped: SkippedSite[] = [];
	const messagesNamespace = paraglideMessagesNamespaceInSvelte(source);

	// Zweiter Durchgang wie in `collectSchemaSites` (siehe dortiger Kommentar):
	// Kandidaten sammeln, nach `start` sortieren, dann erst Schlüssel vergeben.
	// Anders als bei `ts.forEachChild` über Aufrufketten besucht ein Walk über
	// die Kind-Arrays des Svelte-AST ein Fragment bereits in Quelltextreihenfolge
	// — der Test „liefert Fundstellen in Quelltextreihenfolge" unten belegt das.
	// Der zweite Durchgang bleibt trotzdem stehen: Er ist unabhängig von dieser
	// Beobachtung immer korrekt, und sich auf eine unbewiesene Traversierungs-
	// Eigenschaft zu verlassen wäre genau der Fehler, den `collectSchemaSites`
	// einmal gemacht hat.
	const candidates: Array<Omit<ExtractionSite, 'key'>> = [];

	let ast: ReturnType<typeof parse>;
	try {
		ast = parse(source, { modern: true });
	} catch {
		// Nicht parsebares Markup wird übersprungen statt den ganzen Lauf
		// abzubrechen — dieselbe Grenze wie `analyzeSvelteSource`.
		return { sites: [], skipped: [] };
	}

	const lineOf = (offset: number): number => {
		let line = 1;
		for (let i = 0; i < offset && i < source.length; i++) {
			if (source[i] === '\n') {
				line++;
			}
		}
		return line;
	};

	const addSite = (
		start: number,
		end: number,
		text: string,
		aspect: string,
		elementName: string
	): void => {
		const issue = textQualityIssue(text);
		if (issue) {
			skipped.push({
				file: relativeFilePath,
				line: lineOf(start),
				text,
				aspect,
				reason: issue.reason,
				explanation: issue.explanation
			});
			return;
		}
		candidates.push({
			file: relativeFilePath,
			line: lineOf(start),
			start,
			end,
			text,
			aspect,
			field: elementName
		});
	};

	/**
	 * Bekannte Ausnahme von der Mechanisierung: statischer Text mit
	 * mindestens zwei Buchstaben, der trotzdem nicht an Melder gerichtet ist.
	 * `Icon.svelte:277` meldet einen fehlenden Icon-Namen — eine
	 * Entwicklermeldung auf Englisch, die nur bei einem Tippfehler im
	 * Icon-Namen während der Entwicklung sichtbar wird, nie im Betrieb für
	 * Melder. Ohne diese Ausnahme würde `analyzeDynamicAttribute` unten den
	 * statischen Anteil ("Missing icon: ") als übersetzbaren Text erkennen
	 * und mechanisch eine (englische) Botschaft daraus bauen.
	 */
	const NON_USER_FACING_DYNAMIC_ATTRIBUTES: ReadonlyArray<{
		readonly file: string;
		readonly aspect: string;
		readonly staticTextStartsWith: string;
	}> = [
		{
			file: 'src/lib/components/Icon.svelte',
			aspect: 'title',
			staticTextStartsWith: 'Missing icon:'
		}
	];

	/**
	 * Läuft rekursiv über einen estree-Ausdrucksknoten und meldet, ob
	 * irgendwo darin eine `ConditionalExpression` (Ternary) steckt — auch
	 * verschachtelt in `||`/`??` (`title || (a ? b : c)`,
	 * `DropzoneEnhanced.svelte:1035`). Eine Ternary bedeutet: zwei (oder
	 * mehr) mögliche Botschaften plus eine Fallunterscheidung — Handarbeit,
	 * kein mechanischer Fall (Gruppe 3, siehe `allowlist.ts`).
	 *
	 * Bewusst ein generischer Objekt-Walk statt eine Liste bekannter
	 * Knotentypen: estree-Ausdrucksbäume aus `svelte/compiler` sind azyklisch
	 * (keine `parent`-Rückverweise auf Ausdrucksebene), ein Tiefenlimit fängt
	 * trotzdem jeden Überraschungsfall ab, ohne einen Stack-Overflow zu
	 * riskieren.
	 */
	function containsConditional(node: unknown, depth = 0): boolean {
		if (depth > 40 || !isSvelteNode(node)) {
			return false;
		}
		if (node.type === 'ConditionalExpression') {
			return true;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end' || key === 'loc' || key === 'type') {
				continue;
			}
			if (Array.isArray(value)) {
				if (value.some((item) => containsConditional(item, depth + 1))) {
					return true;
				}
			} else if (containsConditional(value, depth + 1)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Läuft wie `containsConditional`, prüft aber auf einen bereits erledigten
	 * Paraglide-Botschaftsaufruf irgendwo im Ausdruck (`m.foo()`). Mischtext
	 * mit einem solchen Aufruf bleibt Handarbeit statt mechanisiert zu werden
	 * (Gegentest `bleibt bei einem gemischten Attribut mit m.-Aufruf-Anteil
	 * bei dynamic-attribute`, collectSvelte.test.ts): Ein automatisch
	 * vergebener Parametername (`value`) für einen bereits übersetzten
	 * Aufruf verschleiert eher, als dass er hilft — ein Mensch soll
	 * entscheiden, ob die äußere Botschaft den inneren Aufruf überhaupt noch
	 * braucht.
	 */
	function containsParaglideMessageCall(node: unknown, depth = 0): boolean {
		if (depth > 40 || !isSvelteNode(node)) {
			return false;
		}
		if (isParaglideMessageCallInSvelte(node, messagesNamespace)) {
			return true;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end' || key === 'loc' || key === 'type') {
				continue;
			}
			if (Array.isArray(value)) {
				if (value.some((item) => containsParaglideMessageCall(item, depth + 1))) {
					return true;
				}
			} else if (containsParaglideMessageCall(value, depth + 1)) {
				return true;
			}
		}
		return false;
	}

	/** Erstbuchstabe groß — für die Kollisionsauflösung in `uniqueParamName`. */
	function capitalize(word: string): string {
		return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
	}

	/**
	 * Löst `||`/`??`-Fallbacks und optionales Chaining auf, bis ein Knoten
	 * übrig bleibt, aus dem sich ein lesbarer Name ableiten lässt — der linke
	 * Operand trägt die eigentliche Bedeutung (`counts.speciesCounts[key]?.visible
	 * || 0` soll `visible` heißen, nicht `0`).
	 */
	function coreExpressionForNaming(node: SvelteAstNode): SvelteAstNode {
		if (node.type === 'ChainExpression' && isSvelteNode(node.expression)) {
			return coreExpressionForNaming(node.expression);
		}
		if (
			node.type === 'LogicalExpression' &&
			(node.operator === '||' || node.operator === '??') &&
			isSvelteNode(node.left)
		) {
			return coreExpressionForNaming(node.left);
		}
		return node;
	}

	/**
	 * Die Namensregel (Auftrag: „Leite einen lesbaren, stabilen
	 * Parameternamen ab"): der letzte bedeutungstragende Teil des Ausdrucks —
	 *
	 *  - `Identifier` (`total`, `apiDefaultYear`) → der Bezeichner selbst.
	 *  - `MemberExpression` mit festem Namen (`group.label`,
	 *    `activeFilters.year`, `counts.speciesCounts[key]?.visible`) → der
	 *    letzte Eigenschaftsname (`label`, `year`, `visible`).
	 *  - `MemberExpression` mit berechnetem, nicht-literalem Schlüssel
	 *    (`arr[i]`) → fällt auf den Namen des Objekts zurück (`arr`), weil
	 *    der Schlüssel selbst keinen stabilen Namen liefert.
	 *  - `CallExpression` mit Bezeichner-Callee (`speciesLabel(speciesId)`,
	 *    `colorGroupLabel(colorGroup)`) → der Funktionsname, weil er die
	 *    Bedeutung trägt, nicht das Argument.
	 *  - alles andere → `value` als sicherer Rückfall.
	 *
	 * Stabil, weil sie nur von der Struktur des Ausdrucks abhängt, nicht vom
	 * umgebenden deutschen Text — ändert sich der Satz drumherum, bleibt der
	 * Parametername gleich.
	 */
	function baseParamName(node: SvelteAstNode): string {
		const core = coreExpressionForNaming(node);
		if (core.type === 'Identifier' && typeof core.name === 'string') {
			return core.name;
		}
		if (core.type === 'MemberExpression') {
			const property = core.property;
			if (
				!core.computed &&
				isSvelteNode(property) &&
				property.type === 'Identifier' &&
				typeof property.name === 'string'
			) {
				return property.name;
			}
			if (
				core.computed &&
				isSvelteNode(property) &&
				property.type === 'Literal' &&
				typeof property.value === 'string'
			) {
				return property.value;
			}
			if (isSvelteNode(core.object)) {
				return baseParamName(core.object);
			}
		}
		if (
			core.type === 'CallExpression' &&
			isSvelteNode(core.callee) &&
			core.callee.type === 'Identifier' &&
			typeof core.callee.name === 'string'
		) {
			return core.callee.name;
		}
		return 'value';
	}

	/**
	 * Macht `baseParamName` innerhalb EINER Botschaft eindeutig. Zwei
	 * verschiedene Ausdrücke mit demselben letzten Namensteil (`a.label` und
	 * `b.label` in derselben Botschaft) bekämen sonst denselben
	 * Platzhalter — die zweite Ersetzung würde den ersten Parameter
	 * überschreiben. Erste Stufe: den übergeordneten Namensteil voranstellen
	 * (`label` → `bLabel`). Bleibt es dabei, ein Zählsuffix.
	 */
	function uniqueParamName(node: SvelteAstNode, used: Set<string>): string {
		const base = baseParamName(node);
		if (!used.has(base)) {
			return base;
		}
		const core = coreExpressionForNaming(node);
		if (core.type === 'MemberExpression' && isSvelteNode(core.object)) {
			const withParent = `${baseParamName(core.object)}${capitalize(base)}`;
			if (!used.has(withParent)) {
				return withParent;
			}
		}
		let counter = 2;
		let candidate = `${base}${counter}`;
		while (used.has(candidate)) {
			counter++;
			candidate = `${base}${counter}`;
		}
		return candidate;
	}

	function exprSource(node: SvelteAstNode): string {
		const start = typeof node.start === 'number' ? node.start : 0;
		const end = typeof node.end === 'number' ? node.end : 0;
		return source.slice(start, end);
	}

	interface DynamicAttributeAnalysis {
		kind: 'conditional' | 'passthrough' | 'mixed';
		icuText?: string;
		params?: Array<{ name: string; expression: string }>;
	}

	/**
	 * Zerlegt einen JS-`TemplateLiteral` (`` `${a} Text ${b}` ``) in
	 * statischen Text mit `{name}`-Platzhaltern plus die dazugehörigen
	 * Parameter — dieselbe Zielform wie ein mehrteiliges Svelte-Attribut
	 * (`"Text {a} mehr {b}"`), nur eine Ebene tiefer im JS-Ausdruck
	 * verschachtelt (`` aria-label={`${file.originalName} öffnen`} ``,
	 * `MediaThumbnail.svelte:75`).
	 */
	function flattenTemplateLiteral(
		node: SvelteAstNode,
		used: Set<string>
	): { text: string; params: Array<{ name: string; expression: string }> } {
		const quasis = Array.isArray(node.quasis) ? node.quasis : [];
		const expressions = Array.isArray(node.expressions) ? node.expressions : [];
		let text = '';
		const params: Array<{ name: string; expression: string }> = [];
		for (let i = 0; i < quasis.length; i++) {
			const quasi = quasis[i];
			// `TemplateElement.value` ist `{ raw, cooked }` — ein reines
			// Datenobjekt ohne eigenes `type`-Feld, `isSvelteNode` (das ein
			// `type`-Feld verlangt) griffe hier immer daneben.
			const quasiValue = isSvelteNode(quasi) ? quasi.value : undefined;
			const cooked =
				typeof quasiValue === 'object' &&
				quasiValue !== null &&
				typeof (quasiValue as { cooked?: unknown }).cooked === 'string'
					? (quasiValue as { cooked: string }).cooked
					: '';
			text += cooked;
			const expr = expressions[i];
			if (expr !== undefined && isSvelteNode(expr)) {
				const paramName = uniqueParamName(expr, used);
				used.add(paramName);
				params.push({ name: paramName, expression: exprSource(expr) });
				text += `{${paramName}}`;
			}
		}
		return { text, params };
	}

	/**
	 * Klassifiziert ein dynamisches Attribut in die drei Gruppen aus dem
	 * Stage-2-Review (allowlist.ts, `dynamic-attribute`/
	 * `attribute-no-static-text`):
	 *
	 *  - `conditional` — irgendwo eine Ternary → Handarbeit, bleibt
	 *    `dynamic-attribute`.
	 *  - `passthrough` — kein einziger statischer Textteil mit mindestens
	 *    zwei Buchstaben → `attribute-no-static-text`, kein offener Fall.
	 *  - `mixed` — statischer Text UND mindestens ein Ausdruck, ohne
	 *    Verzweigung → mechanisch zu einer parametrisierten ICU-Botschaft
	 *    zusammengebaut.
	 */
	function analyzeDynamicAttribute(parts: unknown[]): DynamicAttributeAnalysis {
		// Einzelner ExpressionTag: entweder ein reiner Ausdruck (Identifier,
		// MemberExpression, CallExpression, …) oder ein JS-Template-Literal
		// mit eigenen `${…}`-Anteilen — Svelte selbst hat hier nur EINEN
		// Anteil erkannt, die Zerlegung passiert also im JS-Ausdruck.
		if (parts.length === 1 && isSvelteNode(parts[0]) && parts[0].type === 'ExpressionTag') {
			const expression = parts[0].expression;
			if (!isSvelteNode(expression)) {
				return { kind: 'passthrough' };
			}
			if (containsConditional(expression) || containsParaglideMessageCall(expression)) {
				return { kind: 'conditional' };
			}
			if (expression.type === 'TemplateLiteral') {
				const used = new Set<string>();
				const flattened = flattenTemplateLiteral(expression, used);
				const staticOnly = flattened.text.replace(/\{[^}]+\}/g, '');
				if (flattened.params.length === 0 || !hasMinimumTwoLetters(staticOnly)) {
					return { kind: 'passthrough' };
				}
				return { kind: 'mixed', icuText: flattened.text, params: flattened.params };
			}
			return { kind: 'passthrough' };
		}

		// Mehrteiliges Svelte-Attribut: Text- und ExpressionTag-Anteile lösen
		// einander ab (`"Text {a} mehr {b}"`).
		let icuText = '';
		const params: Array<{ name: string; expression: string }> = [];
		const used = new Set<string>();
		for (const part of parts) {
			if (!isSvelteNode(part)) {
				return { kind: 'passthrough' };
			}
			if (part.type === 'Text' && typeof part.data === 'string') {
				icuText += part.data;
				continue;
			}
			if (part.type === 'ExpressionTag') {
				if (containsConditional(part.expression) || containsParaglideMessageCall(part.expression)) {
					return { kind: 'conditional' };
				}
				if (!isSvelteNode(part.expression)) {
					return { kind: 'passthrough' };
				}
				const paramName = uniqueParamName(part.expression, used);
				used.add(paramName);
				params.push({ name: paramName, expression: exprSource(part.expression) });
				icuText += `{${paramName}}`;
				continue;
			}
			return { kind: 'passthrough' }; // unbekannter Knotentyp — sichere Richtung: nicht mechanisieren
		}
		const staticOnly = icuText.replace(/\{[^}]+\}/g, '');
		if (params.length === 0 || !hasMinimumTwoLetters(staticOnly)) {
			return { kind: 'passthrough' };
		}
		return { kind: 'mixed', icuText, params };
	}

	/** Attributwerte: `placeholder`/`title`/`aria-label`/`alt`, rein statisch. */
	function handleAttributes(attributes: unknown, elementName: string): void {
		if (!Array.isArray(attributes)) {
			return;
		}
		for (const attr of attributes) {
			if (!isSvelteNode(attr) || attr.type !== 'Attribute') {
				continue; // Spread-Attribute, Direktiven (`use:`, `on:`, …) — nicht unser Fall
			}
			const name = typeof attr.name === 'string' ? attr.name : '';
			if (!SVELTE_TARGET_ATTRIBUTES.has(name)) {
				continue;
			}
			const value = attr.value;
			if (value === true || value === undefined) {
				continue; // Bool-Shortcut (`disabled`) oder ohne Wert — kein Sprachtext
			}
			const start = typeof attr.start === 'number' ? attr.start : 0;
			const end = typeof attr.end === 'number' ? attr.end : 0;
			const parts: unknown[] = Array.isArray(value) ? value : [value];
			let text = '';
			let isDynamic = false;
			for (const part of parts) {
				if (isSvelteNode(part) && part.type === 'Text' && typeof part.data === 'string') {
					text += part.data;
				} else {
					isDynamic = true;
				}
			}
			if (isDynamic) {
				// Erledigte Arbeit erkennen, bevor sie als offener Fall gemeldet wird:
				// `attr={m.key()}` hat genau EINEN Anteil, und der ist ein ExpressionTag,
				// dessen Ausdruck exakt ein Aufruf des Paraglide-Namespace ist — keine
				// Text-Anteile drumherum. Nur DIESER enge Fall gilt als erledigt; ein
				// Attribut mit gemischtem Inhalt (`title="Stand: {m.key()}"`) hat einen
				// Text-Anteil neben dem ExpressionTag und bleibt unten `dynamic-attribute`.
				if (
					parts.length === 1 &&
					isSvelteNode(parts[0]) &&
					parts[0].type === 'ExpressionTag' &&
					isParaglideMessageCallInSvelte(parts[0].expression, messagesNamespace)
				) {
					skipped.push({
						file: relativeFilePath,
						line: lineOf(start),
						text: source.slice(start, end),
						aspect: name,
						reason: 'already-translated',
						explanation: `Attribut ${name} ruft bereits eine Paraglide-Botschaftsfunktion auf — schon übersetzt`
					});
					continue;
				}
				// Bekannte Entwicklermeldung trotz statischen Textes (siehe
				// `NON_USER_FACING_DYNAMIC_ATTRIBUTES` oben) — vor der
				// Mechanisierung prüfen, sonst baut `analyzeDynamicAttribute`
				// daraus eine (englische) Botschaft.
				const nonUserFacing = NON_USER_FACING_DYNAMIC_ATTRIBUTES.find(
					(entry) =>
						entry.file === relativeFilePath &&
						entry.aspect === name &&
						text.startsWith(entry.staticTextStartsWith)
				);
				if (nonUserFacing) {
					skipped.push({
						file: relativeFilePath,
						line: lineOf(start),
						text: source.slice(start, end),
						aspect: name,
						reason: 'attribute-no-static-text',
						explanation: `Attribut ${name} enthält zwar statischen Text ("${nonUserFacing.staticTextStartsWith}"), ist aber eine Entwicklermeldung, keine Botschaft für Melder`
					});
					continue;
				}

				const analysis = analyzeDynamicAttribute(parts);
				if (analysis.kind === 'conditional') {
					// Verzweigung (Ternary, auch in `||`/`??` verschachtelt) — zwei
					// oder mehr mögliche Botschaften plus Fallunterscheidung,
					// Handarbeit (Gruppe 3, allowlist.ts).
					skipped.push({
						file: relativeFilePath,
						line: lineOf(start),
						text: source.slice(start, end),
						aspect: name,
						reason: 'dynamic-attribute',
						explanation: `Attribut ${name} verzweigt (Ternary) zwischen mindestens zwei möglichen Botschaften — Handarbeit, nicht mechanisierbar`
					});
					continue;
				}
				if (analysis.kind === 'passthrough') {
					// Kein einziger statischer Textteil mit mindestens zwei
					// Buchstaben — strukturell nichts zu übersetzen (Gruppe 1,
					// allowlist.ts).
					skipped.push({
						file: relativeFilePath,
						line: lineOf(start),
						text: source.slice(start, end),
						aspect: name,
						reason: 'attribute-no-static-text',
						explanation: `Attribut ${name} reicht einen Ausdruck nur durch — kein statischer Text zum Übersetzen`
					});
					continue;
				}
				// analysis.kind === 'mixed': statischer Text UND mindestens ein
				// Ausdruck, ohne Verzweigung — mechanisch zu einer
				// parametrisierten ICU-Botschaft zusammengebaut (Gruppe 2,
				// allowlist.ts).
				const icuText = analysis.icuText ?? '';
				const staticOnly = icuText.replace(/\{[^}]+\}/g, '').trim();
				const issue = textQualityIssue(staticOnly);
				if (issue) {
					skipped.push({
						file: relativeFilePath,
						line: lineOf(start),
						text: source.slice(start, end),
						aspect: name,
						reason: issue.reason,
						explanation: issue.explanation
					});
					continue;
				}
				candidates.push({
					file: relativeFilePath,
					line: lineOf(start),
					start,
					end,
					text: icuText,
					aspect: name,
					field: elementName,
					...(analysis.params ? { params: analysis.params } : {})
				});
				continue;
			}
			const trimmed = text.trim();
			if (trimmed.length === 0) {
				continue; // z.B. `alt=""` — kein Fund, keine Meldung
			}
			addSite(start, end, trimmed, name, elementName);
		}
	}

	/** Knoten einer Geschwistergruppe, ohne reine Formatierung (Whitespace/Kommentar). */
	function significantNodes(nodes: SvelteAstNode[]): SvelteAstNode[] {
		return nodes.filter(
			(n) =>
				n.type !== 'Comment' &&
				!(n.type === 'Text' && typeof n.data === 'string' && n.data.trim() === '')
		);
	}

	/** Geschwister eines Textknotens, ohne reine Formatierung (Whitespace/Kommentar). */
	function significantSiblings(siblings: SvelteAstNode[], self: SvelteAstNode): SvelteAstNode[] {
		return significantNodes(siblings).filter((n) => n !== self);
	}

	/**
	 * Enthält `el` genau ein bedeutsames Kind, und ist das ein Textknoten? Liefert
	 * dessen getrimmten Text, sonst `null`. Grundlage für `findGlossPair` unten:
	 * ein Begriffs-Element (`<strong>GPS-Koordinaten:</strong>`) hat keinen
	 * gemischten Inhalt und keine Auszeichnung darunter — nur einen Text.
	 */
	function soleChildText(el: SvelteAstNode): string | null {
		if (typeof el.name !== 'string') {
			return null; // kein Element (Text/ExpressionTag/Block) — kein Begriffs-Kandidat
		}
		const fragment = el.fragment;
		if (!isSvelteNode(fragment) || fragment.type !== 'Fragment' || !Array.isArray(fragment.nodes)) {
			return null;
		}
		const inner = significantNodes(fragment.nodes.filter(isSvelteNode));
		if (inner.length !== 1 || inner[0]!.type !== 'Text') {
			return null;
		}
		return typeof inner[0]!.data === 'string' ? inner[0]!.data.trim() : null;
	}

	/**
	 * Muster A — „Begriff und Erläuterung", z.B.
	 * `<li><strong>GPS-Koordinaten:</strong> Am wertvollsten für die Forschung</li>`.
	 * Kein Satz, sondern ein Begriff mit Glosse: Die Wortstellung zwischen beiden
	 * wandert in KEINER Sprache — beide Textknoten sind eigenständige Botschaften,
	 * anders als bei einem echten Satz mit Auszeichnung (`Vielen Dank für Ihre
	 * <strong>Meldung</strong>!`).
	 *
	 * DER UNTERSCHEIDER, eng gefasst — alle drei Bedingungen zusammen, keine
	 * einzeln lockerbar (siehe Mutationstests in collectSvelte.test.ts):
	 * (a) das textbehaftete Geschwister-Element ist das ERSTE Kind seines
	 *     Elternelements — deshalb wird ausschließlich `sig[0]` als Begriffs-
	 *     Kandidat geprüft, nicht irgendein Element in der Geschwistergruppe;
	 * (b) sein Text endet mit einem Doppelpunkt;
	 * (c) der Textknoten (die Glosse) folgt UNMITTELBAR darauf, und danach ist
	 *     im Fragment nichts weiter — deshalb `sig.length === 2`.
	 * Eine Interpolation in der Glosse (`<strong>Achtung:</strong> Der Wert {n}
	 * ist zu hoch`) erfüllt (c) nicht (mehr als zwei bedeutsame Kinder: Element,
	 * Text, Ausdruck, Text) und bleibt deshalb verweigert — Muster A und
	 * Interpolation schließen sich nicht aus, die Interpolationsregel hat ohnehin
	 * Vorrang, weil sie in `handleText` zuerst geprüft wird.
	 */
	function findGlossPair(
		parentChildren: SvelteAstNode[]
	): { term: SvelteAstNode; glosse: SvelteAstNode } | null {
		const sig = significantNodes(parentChildren);

		// (a) erstes Kind des Elternelements
		const term = sig[0];
		if (term === undefined) {
			return null;
		}
		const termText = soleChildText(term);
		if (termText === null) {
			return null;
		}

		// (b) Text endet mit Doppelpunkt
		if (!termText.endsWith(':')) {
			return null;
		}

		// (c) unmittelbar gefolgt von genau einem Textknoten, sonst nichts
		if (sig.length !== 2 || sig[1]!.type !== 'Text') {
			return null;
		}

		return { term, glosse: sig[1]! };
	}

	/**
	 * Enthält dieser Teilbaum irgendwo einen Textknoten mit Buchstabengruppe?
	 * Icon-Komponenten (`<SaveIcon />`), `<svg>`, `<img>` oder ein leerer
	 * `<span>` haben keinen Text in ihrem Teilbaum — ein Geschwister ohne
	 * eigenen Text hat keine Wortstellung, die eine Übersetzung brechen könnte,
	 * und macht einen benachbarten Textknoten deshalb NICHT zum Satzfragment.
	 * `<strong>Meldung</strong>` dagegen enthält Text und bleibt fragmentbildend.
	 *
	 * Reine Text-Erkennung, nichts weiter: Ob ein Geschwister zusätzlich (oder
	 * stattdessen) DYNAMISCH ist — ein `{ausdruck}` oder ein Kontrollfluss-Block
	 * (`{#if}`/`{#each}`/`{#await}`/`{#key}`) —, entscheidet die eigenständige
	 * Funktion `nodeHasDynamicContent`. Die beiden Fragen sind unabhängig
	 * voneinander zu beantworten: `{#each admins as a}{a.name}{/each}` enthält
	 * keinen Textknoten (kein Treffer hier), ist aber dynamisch (Treffer dort).
	 */
	function nodeContainsLetterText(node: SvelteAstNode): boolean {
		if (node.type === 'Comment' || node.type === 'ExpressionTag') {
			return false;
		}
		if (node.type === 'Text') {
			const data = typeof node.data === 'string' ? node.data : '';
			return data.trim().length > 0 && LETTER_GROUP.test(data);
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end' || key === 'loc' || key === 'name_loc') {
				continue;
			}
			if (isSvelteNode(value) && value.type === 'Fragment' && Array.isArray(value.nodes)) {
				const typed = value.nodes.filter(isSvelteNode);
				if (typed.some(nodeContainsLetterText)) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Die Svelte-AST-Knotentypen der vier Kontrollfluss-Blöcke. Jeder von ihnen
	 * wählt seinen sichtbaren Inhalt zur Laufzeit aus (Bedingung, Iteration,
	 * Promise-Zustand) — unabhängig davon, ob ein Zweig selbst wieder ein
	 * `{ausdruck}` enthält oder nur statischen Text trägt.
	 */
	const DYNAMIC_BLOCK_TYPES = new Set(['IfBlock', 'EachBlock', 'AwaitBlock', 'KeyBlock']);

	/**
	 * Ist `node` selbst ein dynamischer Ausdruck oder enthält er irgendwo in
	 * seinem Teilbaum einen — ein `ExpressionTag` (`{count}`) oder einen der
	 * vier Kontrollfluss-Blöcke (`{#if}`/`{#each}`/`{#await}`/`{#key}`)?
	 *
	 * **Der Befund, den diese Funktion schließt:** `nodeContainsLetterText` gab
	 * für `ExpressionTag` bislang `false` zurück, und die Traversierung stieg
	 * für Kontrollfluss-Blöcke zwar in ihre Fragmente ab (um Buchstabentext
	 * DARIN zu finden), erkannte den Block selbst aber nirgends als dynamisch.
	 * Für `<p>Admins: {#each admins as a}{a.name}{/each}</p>` bedeutete das:
	 * Das `EachBlock`-Geschwister wurde weder über `nodeContainsLetterText`
	 * (sein Fragment enthält nur ein `ExpressionTag`, keinen Textknoten) noch
	 * über den ursprünglichen `n.type === 'ExpressionTag'`-Vergleich (der Typ
	 * ist `EachBlock`, keine direkte Ausdrucks-Geschwisterschaft) erfasst — der
	 * Textknoten „Admins:" rutschte unbemerkt durch beide Regeln und wurde
	 * extrahiert, obwohl seine Fortsetzung zur Laufzeit entsteht.
	 *
	 * Ein Kontrollfluss-Block gilt HIER bereits durch seinen Typ als dynamisch,
	 * unabhängig davon, ob ein Zweig ein `ExpressionTag` enthält: Auch
	 * `{#if online}online{:else}offline{/if}` hat keinen literalen `{ausdruck}`
	 * in seinen Zweigen, wählt aber zur Laufzeit zwischen zwei Texten — dieselbe
	 * Abhilfe (eine ICU-Botschaft mit Parameter, hier ein `select`) gilt trotzdem.
	 */
	function nodeHasDynamicContent(node: SvelteAstNode): boolean {
		if (node.type === 'ExpressionTag' || DYNAMIC_BLOCK_TYPES.has(node.type ?? '')) {
			return true;
		}
		if (node.type === 'Comment' || node.type === 'Text') {
			return false;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end' || key === 'loc' || key === 'name_loc') {
				continue;
			}
			if (isSvelteNode(value) && value.type === 'Fragment' && Array.isArray(value.nodes)) {
				const typed = value.nodes.filter(isSvelteNode);
				if (typed.some(nodeHasDynamicContent)) {
					return true;
				}
			}
		}
		return false;
	}

	function handleText(
		node: SvelteAstNode,
		siblings: SvelteAstNode[],
		elementName: string,
		ancestorMixed: boolean,
		termGlossOverride: boolean
	): void {
		const data = typeof node.data === 'string' ? node.data : '';
		if (data.trim().length === 0) {
			return; // reine Einrückung/Zeilenumbruch zwischen Elementen — kein Fund
		}
		const start = typeof node.start === 'number' ? node.start : 0;
		const end = typeof node.end === 'number' ? node.end : 0;
		const trimmed = data.trim();

		// VOR der Geschwister-Prüfung: Ziffer bzw. zu wenig Buchstaben sind
		// unabhängig von jedem Geschwister nie eine Botschaft. Reine
		// Satzzeichen neben einem dynamischen Geschwister (`(` und `)` neben
		// `{value}` in BarChart.svelte, `/` neben `{max}` in LegendPanel.svelte)
		// gehören deshalb zu `no-letter-group`, nicht zu `interpolation` — siehe
		// `textQualityIssue`.
		const qualityIssue = textQualityIssue(trimmed);
		if (qualityIssue) {
			skipped.push({
				file: relativeFilePath,
				line: lineOf(start),
				text: trimmed,
				aspect: 'text',
				reason: qualityIssue.reason,
				explanation: qualityIssue.explanation
			});
			return;
		}

		const others = significantSiblings(siblings, node);
		// Nur Geschwister, die selbst Text mit Buchstaben tragen oder dynamisch
		// sind (ein `{ausdruck}` oder ein Kontrollfluss-Block darunter — siehe
		// `nodeHasDynamicContent`), machen diesen Textknoten zum Fragment. Ein
		// Icon-Geschwister (`<SaveIcon />` neben "Speichern") hat weder Text noch
		// dynamischen Inhalt und bleibt deshalb außen vor.
		const fragmentCausingSiblings = others.filter(
			(n) => nodeHasDynamicContent(n) || nodeContainsLetterText(n)
		);
		if (fragmentCausingSiblings.length > 0) {
			// Fall 1 (Satzfragment) und Fall 2 (Interpolation) der Tabelle: Der
			// Textknoten ist nicht das einzige Kind seines Elements. Ist die
			// Geschwistergruppe dynamisch — ein `ExpressionTag` oder ein
			// Kontrollfluss-Block (`{#if}`/`{#each}`/`{#await}`/`{#key}`), gleich ob
			// direkt daneben oder eine Ebene darunter —, ist eine ICU-Botschaft mit
			// Parameter nötig (dieselbe Abhilfe für beide Formen, deshalb derselbe
			// Grund); sonst ist es rein statisch ausgezeichneter Text (z.B.
			// `<strong>`), dessen Wortstellung eine Übersetzung pro Teilknoten bricht.
			const hasExpressionSibling = fragmentCausingSiblings.some((n) => nodeHasDynamicContent(n));
			if (!hasExpressionSibling) {
				// Muster A prüfen, bevor als Satzfragment verworfen wird — siehe
				// `findGlossPair`. Interpolation hat ohnehin Vorrang (dieser Zweig
				// wird nur bei `!hasExpressionSibling` erreicht), Muster A und
				// Interpolation können deshalb nie gleichzeitig zuschlagen.
				const pair = findGlossPair(siblings);
				if (pair !== null && pair.glosse === node) {
					const leadingWs = data.length - data.trimStart().length;
					const trailingWs = data.length - data.trimEnd().length;
					addSite(start + leadingWs, end - trailingWs, data.trim(), 'text', elementName);
					return;
				}
			}
			skipped.push({
				file: relativeFilePath,
				line: lineOf(start),
				text: data.trim(),
				aspect: 'text',
				reason: hasExpressionSibling ? 'interpolation' : 'sentence-fragment',
				explanation: hasExpressionSibling
					? 'Geschwister ist dynamisch ({ausdruck} oder ein {#if}/{#each}/{#await}/{#key}-Block, ' +
						'auch verschachtelt) — braucht eine ICU-Botschaft mit Parameter'
					: 'Textknoten hat Geschwister-Elemente — einzeln übersetzt bricht die Wortstellung ' +
						'in jeder Zielsprache (Handarbeit, Aufgabe 2.3)'
			});
			return;
		}

		if (ancestorMixed) {
			if (termGlossOverride) {
				// Muster A, Begriffs-Teil: Dieser Textknoten ist das einzige Kind
				// eines Elements, das `findGlossPair` beim Besuch des Elternelements
				// als Begriff (Bedingungen a/b/c) erkannt hat — siehe
				// `visitFragmentNodes`. Trotz gemischtem Vorfahren eine eigenständige
				// Botschaft, keine Ausnahme von der Vorfahren-Regel im Allgemeinen.
				const leadingWs = data.length - data.trimStart().length;
				const trailingWs = data.length - data.trimEnd().length;
				addSite(start + leadingWs, end - trailingWs, data.trim(), 'text', elementName);
				return;
			}
			// Der Textknoten ist zwar selbst einziges Kind seines direkten
			// Elements (z.B. innerhalb von `<strong>`), aber ein VORFAHR hat
			// gemischten Inhalt — Textknoten mit Buchstaben UND Element-Kinder
			// im selben Fragment (z.B. das umschließende `<p>`). Die Regel „nur
			// direkte Geschwister prüfen" greift dort eine Ebene zu flach: Auf
			// Englisch steht das ausgezeichnete Wort an anderer Stelle im Satz
			// („Thank you for your report" vs. „Vielen Dank für Ihre Meldung"),
			// drei getrennte Botschaften ließen sich nicht zu einem korrekten
			// englischen Satz zusammensetzen (Auftrag, Diagnose).
			skipped.push({
				file: relativeFilePath,
				line: lineOf(start),
				text: data.trim(),
				aspect: 'text',
				reason: 'sentence-fragment',
				explanation:
					'ein Vorfahr-Element hat gemischten Inhalt (Text und Element-Kinder) — dieser ' +
					'Textknoten ist Teil eines Satzes, der zusammen mit den Geschwister-Elementen des ' +
					'Vorfahrs übersetzt werden muss (Handarbeit, Aufgabe 2.3)'
			});
			return;
		}

		// Einziges (bedeutsames) Kind, kein gemischter Vorfahr — aber die
		// Ersetzung soll die Einrückung drumherum nicht mit auffressen:
		// `<p>\n\tEin Text\n</p>` → nur "Ein Text" wird ersetzt, die
		// Zeilenumbrüche bleiben stehen.
		const leadingWs = data.length - data.trimStart().length;
		const trailingWs = data.length - data.trimEnd().length;
		addSite(start + leadingWs, end - trailingWs, data.trim(), 'text', elementName);
	}

	/**
	 * Hat dieses Fragment (eine Geschwistergruppe) gemischten Inhalt — mindestens
	 * einen Textknoten mit Buchstaben UND mindestens ein Element-/Ausdrucks-Kind?
	 * Whitespace-Text und Kommentare zählen für keine der beiden Seiten.
	 *
	 * Das ist die Definition aus dem Auftrag, wörtlich: „kein Vorfahr sowohl
	 * Textknoten mit Buchstaben ALS AUCH Element-Kinder besitzt". `<div><p>Text</p></div>`
	 * ist NICHT mixed — `div`s Fragment enthält nur das Element `p`, keinen Text;
	 * `<li>Nur Text</li>` ist NICHT mixed — `li`s Fragment enthält nur Text, kein
	 * Element. Erst `<p>Text <strong>x</strong></p>` ist mixed. Ein Element-Kind
	 * OHNE eigenen Text (Icon-Komponente, `<svg>`, leerer `<span>`) zählt dabei
	 * NICHT als „Element-Kind" im Sinne dieser Regel — `<h2><MapPin /> Titel</h2>`
	 * ist deshalb nicht mixed, siehe `nodeContainsLetterText`.
	 */
	function fragmentHasMixedContent(nodes: SvelteAstNode[]): boolean {
		let hasLetterText = false;
		let hasTranslationRelevantSibling = false;
		for (const n of nodes) {
			if (n.type === 'Comment') {
				continue;
			}
			if (n.type === 'Text') {
				const data = typeof n.data === 'string' ? n.data : '';
				if (data.trim().length > 0 && LETTER_GROUP.test(data)) {
					hasLetterText = true;
				}
				continue;
			}
			if (nodeHasDynamicContent(n) || nodeContainsLetterText(n)) {
				hasTranslationRelevantSibling = true;
			}
		}
		return hasLetterText && hasTranslationRelevantSibling;
	}

	function visitFragmentNodes(
		nodes: unknown,
		elementName: string,
		ancestorMixed: boolean,
		termGlossOverride = false
	): void {
		if (!Array.isArray(nodes)) {
			return;
		}
		const typed = nodes.filter(isSvelteNode);
		const disqualified = ancestorMixed || fragmentHasMixedContent(typed);
		// Muster A, Begriffs-Teil: nur relevant, wenn dieses Fragment sonst als
		// gemischt verworfen würde — `findGlossPair` läuft trotzdem immer, ist
		// aber billig (max. zwei Kandidaten) und hält die Bedingung an einer
		// Stelle statt dupliziert.
		const glossPair = disqualified ? findGlossPair(typed) : null;
		for (const node of typed) {
			const isGlossTerm = glossPair !== null && node === glossPair.term;
			visitNode(node, typed, elementName, disqualified, termGlossOverride || isGlossTerm);
		}
	}

	function visitNode(
		node: SvelteAstNode,
		siblings: SvelteAstNode[],
		parentElementName: string,
		ancestorMixed: boolean,
		termGlossOverride: boolean
	): void {
		if (node.type === 'Comment') {
			return; // bewusst kein Abstieg — die Kommentar-Gegenprobe im Test belegt das
		}
		if (node.type === 'Text') {
			handleText(node, siblings, parentElementName, ancestorMixed, termGlossOverride);
			return;
		}
		if (node.type === 'ExpressionTag') {
			return; // reiner Ausdrucksknoten, kein Markup darunter zu besuchen
		}

		const elementName = typeof node.name === 'string' ? node.name : parentElementName;
		if (Array.isArray(node.attributes)) {
			handleAttributes(node.attributes, elementName);
		}

		// Generischer Abstieg über jedes Feld, dessen Wert selbst ein
		// `Fragment`-Knoten ist: `fragment` bei Elementen/Komponenten,
		// `consequent`/`alternate` bei `IfBlock`, `body`/`fallback` bei
		// `EachBlock`, `then`/`catch`/`pending` bei `AwaitBlock`, `fragment` bei
		// `SnippetBlock`, … Jedes gefundene Fragment liefert eine EIGENE
		// Geschwistergruppe — ein Textknoten im `then`-Zweig hat nichts mit einem
		// im `else`-Zweig zu tun. `ancestorMixed` reicht weiter: Ist DIESES Element
		// selbst Teil eines gemischten Vorfahren-Fragments, gilt das für jedes
		// Fragment darunter ebenfalls.
		for (const [key, value] of Object.entries(node)) {
			if (key === 'start' || key === 'end' || key === 'loc' || key === 'name_loc') {
				continue; // reine Positions-Metadaten, keine Kindknoten
			}
			if (isSvelteNode(value) && value.type === 'Fragment') {
				visitFragmentNodes(value.nodes, elementName, ancestorMixed, termGlossOverride);
			}
		}
	}

	visitFragmentNodes((ast.fragment as { nodes?: unknown }).nodes, relativeFilePath, false);

	const sites: ExtractionSite[] = candidates
		.sort((a, b) => a.start - b.start)
		.map((candidate) => ({
			...candidate,
			key: svelteMessageKey(relativeFilePath, candidate.aspect, candidate.text, taken)
		}));

	skipped.sort((a, b) => a.line - b.line);
	return { sites, skipped };
}
