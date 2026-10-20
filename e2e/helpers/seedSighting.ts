import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

/**
 * seedSighting.ts — eine einzelne Sichtung für E2E-Tests anlegen und wieder
 * entfernen.
 *
 * **Warum überhaupt seeden:** Die Entwicklungs-Datenbank ist laut
 * `docs/WORKTREES.md` von allen Worktrees geteilt, und ihr Bestand ist
 * gewachsen statt gepflegt. Ein Test, der eine bestimmte Ausprägung braucht
 * (eine lange Referenz-ID, einen Totfund, eine Position mit voller Auflösung),
 * darf nicht darauf hoffen, dass zufällig eine passende Zeile auf Seite 1
 * steht — sonst ist er entweder grün ohne Aussage oder rot ohne Ursache im
 * Code.
 *
 * **Warum ein eigener `postgres`-Client** statt `#lib/server/db/index.js`: dieselbe
 * Begründung wie in `adminSession.ts` — Playwright läuft als gewöhnliches
 * Node-Programm ohne SvelteKit-Bundler, also ohne `#lib`-Alias und ohne
 * `$env/dynamic/private`.
 *
 * **Pflichtfelder:** In `sichtungen` sind nur `sichtungsdatum` und `created`
 * NOT NULL ohne Default (`src/lib/server/db/schema.ts`). Alles Weitere ist
 * optional und wird nur dann in das INSERT aufgenommen, wenn ein Test es
 * angibt — ein ausgelassenes Feld bekommt damit den Spaltendefault und nicht
 * etwa NULL. Der Unterschied ist keine Feinheit: `totfund`, `vonwo`,
 * `entfernung`, `tierart`, `anzahl_gesamt` und
 * `datenschutz_einverstaendnis` sind NOT NULL DEFAULT 0, ein ausgeschriebenes
 * NULL ließe das INSERT scheitern.
 *
 * **Warum trotzdem `kommentar_intern`:** `scripts/seed-e2e.ts` räumt über genau
 * diesen Marker auf. Ohne ihn bleibt eine Zeile, deren `deleteSighting` nicht
 * mehr lief (abgebrochener Lauf, getöteter CI-Job), unauffindbar in der über
 * alle Worktrees geteilten Entwicklungs-DB liegen — und zwar unter Umständen
 * mit einem Sichtungsdatum in der Zukunft, also dauerhaft an der Spitze der
 * Default-Sortierung, wo sie den nächsten Test auf Seite 1 stört.
 */

/* Playwright lädt .env nicht von sich aus — siehe adminSession.ts. */
loadEnv();

/* Muss wörtlich mit `scripts/seed-e2e.ts` übereinstimmen — dessen Aufräumlauf
   löscht über `WHERE kommentar_intern = 'e2e-seed'`. */
const SEED_MARKER = 'e2e-seed';

/**
 * Präfix, an dem `deleteSighting` eine Referenz-ID als selbst vergeben erkennt.
 *
 * Nur für den Löschpfad verbindlich, nicht für den Seed: Die App vergibt
 * Referenz-IDs als cuid2, ein `e2e-` davor kommt im Bestand nicht vor.
 */
export const E2E_REFERENCE_PREFIX = 'e2e-';

/**
 * Öffnet eine Verbindung zur Entwicklungs-Datenbank.
 *
 * Exportiert für Tests, die die geschriebene Zeile anschließend mit einer
 * eigenen Abfrage nachlesen (`admin-edit-preserves-record.spec.ts` liest
 * Koordinaten und Zeitstempel bewusst als Text). Angelegt und entfernt wird
 * ausschließlich über `seedSighting`/`deleteSighting` — sonst fehlt der Zeile
 * der Aufräum-Marker.
 */
export function openTestDatabase(): postgres.Sql {
	const databaseUrl = process.env.DATABASE_POSTGRES_URL;
	if (!databaseUrl) {
		throw new Error(
			'DATABASE_POSTGRES_URL fehlt — ohne Datenbank kann keine Test-Sichtung angelegt werden. ' +
				'Lokal steht sie in .env, in CI entsteht sie aus .env.example (ci.yml).'
		);
	}
	return postgres(databaseUrl, { max: 1 });
}

/**
 * Sichtungsdatum für den Test, der die **einzige** neueste Zeile braucht —
 * `admin-table-mobile-reference-overflow.spec.ts` ruft die Tabelle mit
 * `?perPage=1` auf und sieht damit genau eine.
 *
 * Nicht der 1. Januar: `app-shell-height.spec.ts` filtert auf
 * `2099-01-01..2099-01-02` und erwartet dort eine leere Trefferliste.
 */
export const NEWEST_ROW_DATE = new Date('2099-06-01T12:00:00.000Z');

/**
 * Sichtungsdatum für Tests, denen „irgendwo auf Seite 1" genügt.
 *
 * Bewusst **unter** `NEWEST_ROW_DATE`: Läge es darüber, verdeckte diese Zeile
 * die des `?perPage=1`-Tests, sobald beide Dateien parallel laufen — genau so
 * beobachtet, als `admin-table-dead-finding.spec.ts` und
 * `admin-table-mobile-reference-overflow.spec.ts` in einem Lauf lagen. Die
 * Reihenfolge der beiden Konstanten ist deshalb in `seedSighting.test.ts`
 * festgehalten und nicht bloß hier beschrieben.
 */
export const FIRST_PAGE_DATE = new Date('2098-06-01T08:30:00.000Z');

/** Melderdaten. Vollständig optional — kein Feld davon ist NOT NULL. */
export interface SeedReporter {
	firstName?: string;
	lastName?: string;
	email?: string;
	street?: string;
	zipCode?: string;
	city?: string;
}

/**
 * Die seedbaren Felder.
 *
 * Bewusst nicht das ganze Schema: Aufgenommen ist, was ein bestehender Test
 * belegt oder als Voraussetzung braucht. Wer ein weiteres Feld benötigt, nimmt
 * es hier auf — eine Liste „auf Vorrat" wäre nur eine zweite, schlechtere
 * Kopie von `schema.ts`.
 */
export interface SeedSightingData {
	referenceId: string;
	/**
	 * Der Zeitpunkt der Sichtung, als absoluter Moment — gespeichert wird er als
	 * UTC.
	 *
	 * Die Admin-Tabelle sortiert per Vorgabe nach `sichtungsdatum` absteigend.
	 * Statt hier ein eigenes Datum zu erfinden, gehören Zeilen, die ein Test in
	 * der Tabelle wiederfinden muss, auf `NEWEST_ROW_DATE` oder
	 * `FIRST_PAGE_DATE` — die beiden Werte sind gegeneinander abgestimmt.
	 */
	sightingDate: Date;
	isDead?: boolean;
	species?: number;
	totalCount?: number;
	sightingFrom?: number;
	distance?: number;
	/**
	 * Koordinaten als Text, nicht als Zahl: So steht die erwartete Genauigkeit
	 * im Test als Literal und wird von Postgres nach `numeric(8,6)` gecastet,
	 * statt schon beim Schreiben durch eine Fließkommazahl zu wackeln.
	 */
	latitude?: string | null;
	longitude?: string | null;
	waterway?: string | null;
	reporter?: SeedReporter;
	privacyConsent?: boolean;
	/**
	 * Spam-Befund zum Meldezeitpunkt.
	 *
	 * Beide Felder sind seedbar, weil der interessante Fall im Bestand nicht
	 * vorkommt: Vier Indikatoren wiegen je 2 Punkte und existieren nur beim
	 * Absenden (Formular-Token, Absendedauer, Duplikat-Signale), und alle Scores
	 * der Entwicklungs-DB stammen aus dem Backfill, der sie nie hatte. Wer die
	 * Gegenüberstellung von gespeichertem und nachgerechnetem Score prüfen will,
	 * kann sich also auf keine vorhandene Zeile stützen
	 * (`admin-spam-check.spec.ts`).
	 *
	 * `undefined` lässt die Spalte auf `NULL` — „nie bewertet", nicht „Score 0"
	 * (`docs/SPAM_DETECTION.md`).
	 */
	spamScore?: number;
	spamIndicators?: string[];
}

/** Postgres kennt kein Boolean an diesen Spalten — `smallint` mit 0/1. */
function toFlag(value: boolean | undefined): number | undefined {
	return value === undefined ? undefined : Number(value);
}

/** Baut die Spaltenzuordnung und lässt nicht angegebene Felder weg. */
function toColumns(data: SeedSightingData): Record<string, unknown> {
	const { reporter = {} } = data;
	const all: Record<string, unknown> = {
		/* `toISOString()` und nicht das `Date` selbst: `sichtungsdatum` ist
		   `timestamp without time zone` und trägt UTC. Ein `Date`-Parameter kommt
		   von `postgres.js` als **Ortszeit** formatiert an — die Zeile läge auf
		   einem Rechner in Europe/Berlin zwei Stunden neben der Absicht, und der
		   Test misst dann seine eigene Zeitzone statt der Anwendung. Drizzle
		   schreibt aus demselben Grund `toISOString()`. */
		sichtungsdatum: data.sightingDate.toISOString(),
		created: new Date().toISOString(),
		referenz_id: data.referenceId,
		kommentar_intern: SEED_MARKER,
		totfund: toFlag(data.isDead),
		tierart: data.species,
		anzahl_gesamt: data.totalCount,
		vonwo: data.sightingFrom,
		entfernung: data.distance,
		gps_breite: data.latitude,
		gps_laenge: data.longitude,
		fahrwasser: data.waterway,
		vorname: reporter.firstName,
		name: reporter.lastName,
		email: reporter.email,
		strasse: reporter.street,
		plz: reporter.zipCode,
		ort: reporter.city,
		datenschutz_einverstaendnis: toFlag(data.privacyConsent),
		spam_score: data.spamScore,
		/* `JSON.stringify` und nicht das Array selbst: `postgres.js` bindet ein
		   JS-Array als Postgres-Array (`text[]`), und die Spalte ist `jsonb` —
		   der Insert scheiterte sonst am Typ statt still das Falsche zu tun. */
		spam_indicators:
			data.spamIndicators === undefined ? undefined : JSON.stringify(data.spamIndicators)
	};

	/* `null` bleibt drin und wird geschrieben — „ausdrücklich ohne Position" ist
	   eine eigene Aussage. Nur `undefined` heißt „nicht angegeben". */
	return Object.fromEntries(Object.entries(all).filter(([, value]) => value !== undefined));
}

/** Legt eine Sichtung an und liefert ihre `id` zurück. */
export async function seedSighting(data: SeedSightingData): Promise<number> {
	const sql = openTestDatabase();
	try {
		/* `sql(objekt)` erzeugt Spaltenliste und VALUES aus den Schlüsseln und
		   bindet die Werte als Parameter — kein zusammengesetztes SQL. */
		const [row] = await sql<{ id: number }[]>`
			INSERT INTO sichtungen ${sql(toColumns(data))}
			RETURNING id
		`;
		return Number(row.id);
	} finally {
		// Sonst hält der offene Pool den Playwright-Prozess am Leben.
		await sql.end({ timeout: 5 });
	}
}

/**
 * Entfernt eine mit `seedSighting` angelegte Zeile wieder.
 *
 * Die `id` allein reicht als Bedingung **nicht**: Die Entwicklungs-DB ist über
 * alle Worktrees geteilt und enthält echte Meldungen. Eine falsch übergebene
 * `id` — vertauschte Variable, Wert aus einem früheren Lauf — löschte sonst
 * eine fremde Zeile, und zwar unbemerkt. Der Marker begrenzt den Schaden auf
 * das, was dieser Helfer selbst angelegt hat.
 *
 * `referenceId` ist für den einen Fall gedacht, in dem der Test den Marker
 * selbst überschreibt: `admin-edit-preserves-record.spec.ts` bearbeitet den
 * internen Kommentar über die Oberfläche. Die Zeile bleibt danach über ihre
 * Referenz-ID auffindbar — ein zweites Erkennungsmerkmal, statt die Bedingung
 * ersatzlos fallen zu lassen.
 *
 * Damit dieser Ausweg den Marker-Guard nicht aushebelt, muss die Referenz-ID
 * das Präfix `e2e-` tragen. Sonst genügte die Referenz-ID einer *echten*
 * Meldung, um sie zu löschen — versehentlich übergeben, unbemerkt weg. Die
 * Bedingung steht vor dem Verbindungsaufbau: Ein Aufruf, der so nicht gemeint
 * sein kann, soll scheitern und nicht erst eine Verbindung öffnen.
 */
export async function deleteSighting(
	id: number,
	options: { referenceId?: string } = {}
): Promise<void> {
	if (options.referenceId !== undefined && !options.referenceId.startsWith(E2E_REFERENCE_PREFIX)) {
		throw new Error(
			`deleteSighting: referenz_id „${options.referenceId}" trägt nicht das Präfix ` +
				`„${E2E_REFERENCE_PREFIX}" — als zweites Erkennungsmerkmal taugt nur eine ` +
				'Referenz-ID, die dieser Helfer selbst vergeben haben kann.'
		);
	}

	const sql = openTestDatabase();
	try {
		const byReference = options.referenceId ? sql`OR referenz_id = ${options.referenceId}` : sql``;
		await sql`
			DELETE FROM sichtungen
			WHERE id = ${id} AND (kommentar_intern = ${SEED_MARKER} ${byReference})
		`;
	} finally {
		await sql.end({ timeout: 5 });
	}
}

/** Ob die Zeile noch existiert — für Tests, die das Löschen selbst prüfen. */
export async function sightingExists(id: number): Promise<boolean> {
	const sql = openTestDatabase();
	try {
		const rows = await sql`SELECT id FROM sichtungen WHERE id = ${id}`;
		return rows.length > 0;
	} finally {
		await sql.end({ timeout: 5 });
	}
}
