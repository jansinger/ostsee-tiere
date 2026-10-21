import { describe, expect, it } from 'vitest';
import * as yup from 'yup';
import { getSightingSchema } from '#lib/form/validation/sightingSchema.ts';

// Testet weiterhin den deutschen Ist-Zustand (Default-Locale) — unveraendert
// gegenueber der frueheren Modulkonstante.
const sightingSchema = getSightingSchema();
import {
	dateSectionIntro,
	dateSectionTitle,
	detailsSectionTitle,
	environmentIntro,
	mapHint,
	observationQuestion,
	outsideBalticNotice,
	outsideBalticSeverity,
	positionQuestion,
	sightingFromQuestion,
	speciesQuestion,
	step3ObservationsIntro
} from './wording';

/**
 * Das Museum will für den Totfund eine eigene Ansprache („Was haben Sie
 * gefunden?", „Funddetails"). Die beiden getrennten Formulare, die das Dokument
 * dafür vorsieht, gibt es noch nicht — der Totfund-Schalter steht aber seit
 * PR 2 ganz oben auf Schritt 2, und alles darunter kann auf ihn reagieren.
 *
 * Die Entscheidung „welches Wort bei welchem Zustand" steht deshalb hier an
 * EINER Stelle und nicht als Ternär in drei Komponenten: Sie wird beim Bau der
 * getrennten Formulare wieder gebraucht, und drei Kopien würden bis dahin
 * auseinanderlaufen.
 */
describe('wording — Totfund-Ansprache auf Schritt 2', () => {
	describe('speciesQuestion', () => {
		it('fragt bei einer Sichtung nach dem, was gesehen wurde', () => {
			expect(speciesQuestion(false)).toBe('Welche Tierart haben Sie gesehen?');
		});

		it('fragt beim Totfund nach dem, was gefunden wurde', () => {
			expect(speciesQuestion(true)).toBe('Welche Tierart haben Sie gefunden?');
		});

		/**
		 * `'1'` ist der Wert, den die Datenbank und die Legacy-API für `isDead`
		 * liefern. `formConfig.ts`s `isDeadFinding` behandelt ihn als Totfund;
		 * die frühere, separate Kopie hier in `wording.ts` prüfte nur auf den
		 * String `'true'` und hätte `'1'` fälschlich als Sichtung gewertet —
		 * mit der Folge, dass das Formular die Verhaltensfelder ausblendet
		 * (`getFormSteps` in `formConfig.ts`), während die Überschrift hier
		 * weiterhin nach einer Sichtung fragt.
		 */
		it('behandelt den String "1" (DB-Wert) wie einen Totfund', () => {
			expect(speciesQuestion('1')).toBe('Welche Tierart haben Sie gefunden?');
		});
	});

	describe('observationQuestion', () => {
		it('fragt bei einer Sichtung nach der Beobachtung', () => {
			expect(observationQuestion(false)).toBe('Was haben Sie beobachtet?');
		});

		it('fragt beim Totfund nach dem Fund', () => {
			expect(observationQuestion(true)).toBe('Was haben Sie gefunden?');
		});
	});

	describe('detailsSectionTitle', () => {
		it('nennt die Karte bei einer Sichtung „Sichtungsdetails"', () => {
			expect(detailsSectionTitle(false)).toBe('Sichtungsdetails');
		});

		it('nennt die Karte beim Totfund „Funddetails"', () => {
			expect(detailsSectionTitle(true)).toBe('Funddetails');
		});
	});

	/**
	 * Die Karte heißt beim Totfund „Funddetails" (`detailsSectionTitle`), das
	 * erste Feld darunter fragte aber weiter „Von wo aus wurde die Sichtung
	 * gemacht?" — das Schema-Label, das nur den Lebend-Zweig kennt.
	 */
	describe('sightingFromQuestion', () => {
		/**
		 * Verbindliche Entscheidung des Auftraggebers (siehe Kopf von
		 * `dateSectionTitle`): Der Lebend-Weg darf sich nicht sichtbar ändern.
		 * Verglichen wird deshalb gegen das Schema-Label selbst und nicht gegen
		 * ein Literal — ein Textwechsel im Schema würde sonst still auseinander
		 * laufen, und die Admin-Maske zeigt weiterhin genau diesen Text.
		 */
		it('behält im Lebend-Zweig wörtlich das Schema-Label', () => {
			// `fields` ist bei Yup als `ISchema | Reference` typisiert; das Label
			// steht nur an der Schema-Variante.
			const schemaLabel = (sightingSchema.fields.sightingFrom as yup.NumberSchema).spec.label;
			expect(sightingFromQuestion(false)).toBe(schemaLabel);
			expect(sightingFromQuestion(false)).toBe('Von wo aus wurde die Sichtung gemacht?');
		});

		it('fragt beim Totfund nach dem Fund statt nach der Sichtung', () => {
			expect(sightingFromQuestion(true)).toBe('Von wo aus haben Sie das Tier gefunden?');
		});

		it('behandelt den String "1" (DB-Wert) wie einen Totfund', () => {
			expect(sightingFromQuestion('1')).toBe('Von wo aus haben Sie das Tier gefunden?');
		});
	});

	/**
	 * `isDead` ist im Schema `boolean().default(false)`. Für den Schalter selbst
	 * liefert `createForm.handleChange` einen echten Boolean (`target.checked`)
	 * — der String-Fall entsteht dort also nicht. `undefined` sehr wohl: die
	 * Admin-Maske füllt das Formular aus einem geladenen Datensatz.
	 *
	 * Die String-Werte stehen trotzdem in der Liste. Sie kosten nichts, und die
	 * Verwechslung ist in genau dieser Codebasis schon einmal teuer gewesen:
	 * `BaseRadio` verglich strikt gegen Zahlen, während im State der String aus
	 * dem DOM-Event lag — der Bootsantrieb ließ sich dadurch gar nicht auswählen
	 * (behoben in PR 4). Ein `if (isDead)` auf `"false"` wäre `true` und drehte
	 * die Ansprache um.
	 */
	describe('duldet die Werte, die tatsächlich im Formular-State stehen', () => {
		it.each([undefined, null, false, 'false', 0])('behandelt %o als Sichtung', (value) => {
			expect(observationQuestion(value)).toBe('Was haben Sie beobachtet?');
		});

		it.each([true, 'true', '1'])('behandelt %o als Totfund', (value) => {
			expect(observationQuestion(value)).toBe('Was haben Sie gefunden?');
		});
	});
});

describe('Schritt-1-Texte am Zweig', () => {
	it('benennt die Datumskarte je nach Zweig', () => {
		// Verbindliche Entscheidung des Auftraggebers (Review Task 6, Befund 1):
		// Der Lebend-Zweig behält wörtlich „Datum und Uhrzeit" — der bestehende
		// Weg für Lebend-Melder darf sich nicht sichtbar ändern.
		expect(dateSectionTitle(false)).toBe('Datum und Uhrzeit');
		expect(dateSectionTitle(true)).toBe('Funddatum');
	});

	it('ergänzt die Einleitung nur beim Totfund', () => {
		// Die Karte hat heute gar keine Einleitungszeile — beim Lebend-Zweig
		// darf deshalb keine entstehen (null = nichts rendern).
		expect(dateSectionIntro(false)).toBeNull();
		expect(dateSectionIntro(true)).toBe('An welchem Tag war der Fund?');
	});

	it('fragt beim Totfund nach „gefunden", sonst nach „gesehen"', () => {
		expect(positionQuestion(false)).toContain('gesehen');
		expect(positionQuestion(true)).toContain('gefunden');
	});

	it('dreht auch die Marker-Erklärung um', () => {
		expect(mapHint(true, true, false)).toContain('gefunden haben');
		expect(mapHint(true, false, false)).toContain('gefunden haben');
		expect(mapHint(false, true, false)).toContain('gesehen haben');
	});

	it('behält den GPS-Zusatz in beiden Zweigen', () => {
		expect(mapHint(true, true, true)).toContain('GPS-Button');
	});

	it('senkt beim Totfund die Dringlichkeit des Ostsee-Hinweises', () => {
		// Am Strand ist eine Position außerhalb des Polygons der Normalfall.
		// Eine Warnung, die immer kommt, wird weggeklickt.
		expect(outsideBalticSeverity(false)).toBe('warning');
		expect(outsideBalticSeverity(true)).toBe('info');
		expect(outsideBalticNotice(true)).toContain('Stränden oder Küstenabschnitten');
	});

	it('behandelt isDead aus allen Quellen gleich', () => {
		expect(dateSectionTitle(1)).toBe('Funddatum');
		expect(dateSectionTitle('1')).toBe('Funddatum');
		expect(dateSectionTitle(undefined)).toBe('Datum und Uhrzeit');
	});
});

/**
 * Abschlussreview (nicht blockierend): `Step3Observations.svelte` versprach im
 * Totfund-Zweig „Verhaltensinformationen … helfen bei der Artbestimmung" — die
 * Verhaltenskarte (`Behavior.svelte`) ist dort seit Task 8b aber ausgeblendet
 * (`isDeadFinding($form.isDead)` in der Komponente). Wie die übrigen
 * Zweigtexte gehört die Entscheidung hierher, nicht als Ternär in die
 * Step-Komponente.
 */
describe('step3ObservationsIntro', () => {
	it('wirbt bei einer Sichtung mit Verhalten UND Umweltbedingungen', () => {
		expect(step3ObservationsIntro(false)).toContain('Verhaltensinformationen');
		expect(step3ObservationsIntro(false)).toContain('Umweltbedingungen');
	});

	it('nennt Verhalten beim Totfund nicht mehr — die Karte fehlt dort', () => {
		expect(step3ObservationsIntro(true)).not.toContain('Verhalten');
		expect(step3ObservationsIntro(true)).toContain('Umweltbedingungen');
	});
});

/**
 * Wunsch des Deutschen Meeresmuseums (2026-08-13): Die Umweltkarte auf
 * Schritt 3 warb in beiden Zweigen mit „Wetter- und Seebedingungen
 * beeinflussen sowohl die Sichtbarkeit als auch das Tierverhalten". Beim
 * Totfund ist beides gegenstandslos — das Tier verhält sich nicht mehr, und
 * entdeckt wurde es bereits. Was die Bedingungen dort tatsächlich beeinflussen,
 * ist der Zustand des Fundes.
 *
 * Wie bei `step3ObservationsIntro` steht die Entscheidung hier und nicht als
 * Ternär in `Environment.svelte`: Die Karte wird von Melde- und Admin-Maske
 * gemeinsam benutzt.
 */
describe('environmentIntro', () => {
	it('nennt bei einer Sichtung Sichtbarkeit und Tierverhalten', () => {
		expect(environmentIntro(false)).toBe(
			'Wetter- und Seebedingungen beeinflussen sowohl die Sichtbarkeit als auch das Tierverhalten'
		);
	});

	it('nennt beim Totfund den Zustand des Tieres', () => {
		expect(environmentIntro(true)).toBe(
			'Wetter- und Seebedingungen können den Zustand des Tieres beeinflussen'
		);
	});

	/**
	 * `'1'` ist der Wert, den Datenbank und Legacy-API für `isDead` liefern —
	 * dieselbe Falle wie bei `speciesQuestion` weiter oben. Ohne
	 * `isDeadFinding` als einzige Normalisierung stünde in der Admin-Maske
	 * einer Totfund-Meldung der Sichtungs-Satz.
	 */
	it('behandelt den Datenbankwert 1 als Totfund', () => {
		expect(environmentIntro('1')).toBe(environmentIntro(true));
	});
});
