import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { get } from 'svelte/store';
import { renderWithFormContext } from '#lib/report/components/testing/renderWithFormContext.testutil.ts';
import type { StoredWeatherData } from '#lib/services/weatherService.ts';
import Step3Observations from './Step3Observations.svelte';

/**
 * Die Gegenprobe zu `Step2SightingDetails.svelte.test.ts`: Was auf Schritt 2
 * angekommen ist, darf auf Schritt 3 nicht zusätzlich stehen.
 *
 * Der Einleitungstext gehört mit umgezogen. Er warb für „Verhaltensinformationen,
 * Umweltbedingungen und **Fotos/Videos**" — eine Aufzählung dessen, was der
 * Schritt enthält. Bliebe der Halbsatz stehen, verspräche der Kopf etwas, das
 * einen Schritt weiter vorne liegt, und das ausgerechnet direkt über dem
 * „Schritt überspringen"-Knopf.
 */
function renderStep3(): void {
	renderWithFormContext(Step3Observations);
}

describe('Step3Observations — Medien sind auf Schritt 2 gewandert', () => {
	it('rendert die Medien-Einwilligung nicht mehr', () => {
		renderStep3();

		expect(document.querySelector('[data-field="mediaConsent"]')).toBeNull();
	});

	it('nennt Fotos/Videos nicht mehr in der Einleitung', () => {
		renderStep3();

		expect(document.body.textContent).not.toContain('Fotos/Videos');
	});

	// Gegenprobe: Der Schritt behält, was ihn ausmacht — sonst prüfte der Test
	// oben nur, dass die Komponente überhaupt nichts rendert.
	it('wirbt weiterhin mit Verhalten und Umweltbedingungen', () => {
		renderStep3();

		const text = document.body.textContent ?? '';
		expect(text).toContain('Verhaltensinformationen');
		expect(text).toContain('Umweltbedingungen');
	});
});

/**
 * Die Karte „Weitere Sichtungsdetails" stand im Meldeformular leer da: Beide
 * Felder sind `adminMode`-only (`distribution` seit PR #746, `shipCount` seit
 * dem Umzug nach `BoatInfo` — inzwischen, Task 12, weiter nach
 * `Environment.svelte`), die Karte selbst wurde aber unbedingt gerendert.
 *
 * Der Test sitzt bewusst **auch** hier und nicht nur an der Sektion selbst: Die
 * Sektion schützt sich inzwischen zwar selbst, aber der Fehler war ein Fehler
 * der Einbindung — Schritt 3 hat eine Komponente gerendert, die für ihn nichts
 * mehr zu zeigen hatte.
 */
describe('Step3Observations — keine leere Sichtungsdetail-Karte', () => {
	it('zeigt die Karte „Weitere Sichtungsdetails" nicht mehr', () => {
		renderStep3();

		expect(document.body.textContent).not.toContain('Weitere Sichtungsdetails');
	});
});

/**
 * Review-Befund zu Task 8: `getFormSteps` entfernt `behavior`/`behaviorText`/
 * `reaction` beim Totfund nur aus der Validierung (`stepValidation.ts` liest
 * ausschließlich daraus). Gerendert wurde die Karte „Verhalten der Tiere"
 * bislang unbedingt — ein Totfund-Melder sah die Fragen weiterhin, konnte sie
 * ausfüllen, und die Werte gingen unvalidiert ans Backend. Sichtbarkeit und
 * Validierung müssen dieselbe Bedingung teilen (`isDeadFinding($form.isDead)`),
 * sonst entsteht genau diese Lücke wieder — nur mit vertauschten Vorzeichen.
 */
describe('Step3Observations — Verhaltens-Karte folgt dem Totfund-Zweig', () => {
	it('blendet „Verhalten der Tiere" beim Totfund aus', () => {
		renderWithFormContext(Step3Observations, { overrides: { isDead: true } });

		expect(document.body.textContent).not.toContain('Verhalten der Tiere');
	});

	it('zeigt „Verhalten der Tiere" bei einer Lebendbeobachtung', () => {
		renderWithFormContext(Step3Observations, { overrides: { isDead: false } });

		expect(document.body.textContent).toContain('Verhalten der Tiere');
	});

	it('behält Umweltbedingungen und Bootsangaben, wenn die Verhaltens-Karte beim Totfund fehlt', () => {
		renderWithFormContext(Step3Observations, { overrides: { isDead: true } });

		const text = document.body.textContent ?? '';
		expect(text).toContain('Umweltbedingungen');
		expect(text).toContain('Boot-/Schiffsinformationen');
	});

	/**
	 * Abschlussreview (nicht blockierend): Der Einleitungssatz warb beim
	 * Totfund weiterhin mit „Verhaltensinformationen … helfen bei der
	 * Artbestimmung", obwohl die Karte direkt darunter fehlt — ein Versprechen,
	 * das der Schritt nicht einlöst. `step3ObservationsIntro` (`wording.ts`)
	 * hängt den Satz an denselben Zweig wie die Karte selbst.
	 */
	it('verspricht Verhaltensinformationen im Kopf nicht mehr, wenn die Karte beim Totfund fehlt', () => {
		renderWithFormContext(Step3Observations, { overrides: { isDead: true } });

		expect(document.body.textContent).not.toContain('Verhaltensinformationen');
	});
});

/**
 * Antwort von `/api/weather/historical`, Form wie in dessen `+server.ts`. Das
 * Datum liegt fest in der Vergangenheit — der Zweig `historical` im Test hängt
 * damit nicht am Kalender des Laufs.
 */
const WEATHER_RESPONSE = {
	success: true,
	weather: {
		time: '2026-07-01T12:00',
		windSpeed: 18.5,
		windDirection: 270,
		windDirectionCardinal: 'W',
		temperature: 17.4,
		weatherCode: 3,
		weatherDescription: 'Bedeckt',
		visibility: 24000,
		seaState: 3,
		pressure: 1013
	},
	formFields: { windForce: '5', windDirection: 'W', seaState: '3', visibility: 4 },
	metadata: {
		source: 'Open-Meteo Historical Weather API',
		dataType: 'historical',
		cached: false,
		latitude: 54.5,
		longitude: 12.5
	}
};

/** Position und Datum, wie sie aus Schritt 1 kommen — die Vorbedingung des Abrufs. */
const POSITION_AND_DATE = {
	latitude: 54.5,
	longitude: 12.5,
	sightingDate: '2026-07-01',
	sightingTime: '12:00'
};

/** Überschrift des Vorschlagsblocks in `WeatherDataFetcher.svelte`. */
const SUGGESTION_HEADING = 'Vorgeschlagene Wetterdaten für die angegebene Position';

const WEATHER_ENDPOINT = '/api/weather/historical';

function stubWeatherApi(): ReturnType<typeof vi.fn> {
	const fetchSpy = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => WEATHER_RESPONSE
	});
	vi.stubGlobal('fetch', fetchSpy);
	return fetchSpy;
}

/**
 * Nur die Wetter-Anfragen aus dem global gestubbten `fetch`. Gezählt wird
 * gefiltert und nicht über `toHaveBeenCalledTimes`: Lädt eine Schwesterkarte
 * dieses Schritts später etwas nach, wäre das sonst ein irreführender
 * Fehlschlag in einem Test, der mit dem Wetter nichts zu tun hätte.
 */
function weatherRequests(fetchSpy: ReturnType<typeof vi.fn>): URL[] {
	return fetchSpy.mock.calls
		.map(([input]) => new URL(String(input), 'https://localhost:4000'))
		.filter((url) => url.pathname === WEATHER_ENDPOINT);
}

/**
 * Risiko 5 der Einstiegsseiten-Spezifikation
 * (`docs/archive/PLAN_EINSTIEGSSEITE_MELDEFORMULAR_2026-08-05.md`, Abschnitt 11) und
 * Punkt 10 der Definition of Done: Die Karte „Umweltbedingungen" trägt einen
 * **automatischen** Wetter-Abruf, der bei gesetzter Position und gesetztem
 * Datum von selbst anspringt und über `handleFullWeatherData` einen
 * vollständigen Datensatz ins Formular schreibt. Fassung 1 der Spezifikation
 * wollte die Karte im Totfund-Zweig ausblenden — das hätte diese
 * Forschungsdaten still verloren, und zwar Daten, die den Melder keinen
 * einzigen Klick kosten.
 *
 * **Warum der Test hier steht und nicht in `Environment.svelte.test.ts`.**
 * `Environment.svelte` kennt den Zweig gar nicht — es liest `latitude`,
 * `longitude`, `sightingDate`, `sightingTime` und `adminMode`, aber nie
 * `isDead`. Ein Test dort mit `overrides: { isDead: true }` verhielte sich
 * identisch zu einem mit `isDead: false`: Er wäre in beiden Zweigen grün und
 * könnte über den Totfund-Zweig deshalb nichts aussagen. Die Entscheidung, ob
 * die Karte im Totfund-Zweig überhaupt gerendert wird, fällt eine Ebene höher
 * — genau hier, wo `<Behavior>` hinter `isDeadFinding($form.isDead)` steht und
 * `<Environment>` bewusst nicht. Wer Risiko 5 versehentlich eintreten lässt,
 * tut das durch ein `{#if}` an dieser Aufrufstelle; davon wird dieser Test rot
 * (vorgeführt am 2026-08-06: `<Environment>` hinter dieselbe Bedingung gesetzt
 * → alle drei Tests rot; nur `autoFetch={false}` in `Environment.svelte` →
 * die zwei positiven Tests rot, die Gegenprobe unten bleibt grün).
 *
 * **Warum kein E2E.** Der Abruf geht gegen `/api/weather/historical` und von
 * dort gegen Open-Meteo. Ein E2E müsste diese Route ebenso abfangen wie dieser
 * Test `fetch` — an echte Wetterdaten käme es also nicht näher, bräuchte aber
 * eine eigene Spec-Datei samt Shard-Zuordnung. Den einen Teil, den es
 * zusätzlich prüfte (`?meldung=totfund` kommt als `isDead` im Formular an),
 * deckt `e2e/report-kind-choice.spec.ts` bereits ab.
 *
 * **Was der Test damit ausdrücklich nicht prüft:** die Server-Route und
 * Open-Meteo selbst. Geprüft wird die Strecke, um die es in Risiko 5 geht —
 * Totfund-Zweig → Karte wird gerendert → Abruf springt an → Antwort landet im
 * Formular.
 */
describe('Step3Observations — der automatische Wetter-Abruf bleibt im Totfund-Zweig', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fragt die Wetterdaten beim Totfund von selbst ab und zeigt sie an', async () => {
		const fetchSpy = stubWeatherApi();

		renderWithFormContext(Step3Observations, {
			overrides: { isDead: true, ...POSITION_AND_DATE }
		});

		await expect.element(page.getByText(SUGGESTION_HEADING)).toBeVisible();
		await expect.element(page.getByText('Bedeckt')).toBeVisible();

		const requests = weatherRequests(fetchSpy);
		expect(requests).toHaveLength(1);
		expect(requests[0]?.searchParams.get('lat')).toBe('54.5');
		expect(requests[0]?.searchParams.get('lng')).toBe('12.5');
		expect(requests[0]?.searchParams.get('date')).toBe('2026-07-01');
		expect(requests[0]?.searchParams.get('time')).toBe('12:00');
	});

	/**
	 * Der eigentliche Wert des Abrufs ist nicht die Anzeige, sondern der
	 * Datensatz, der ohne Zutun des Melders in `weatherData` landet und mit der
	 * Sichtung gespeichert wird (`handleFullWeatherData` in
	 * `Environment.svelte`). Die drei Felder darüber — Seegang, Sichtweite,
	 * Windstärke — füllt erst „Daten übernehmen"; dieser Datensatz nicht.
	 */
	it('legt den vollständigen Datensatz beim Totfund ohne Zutun im Formular ab', async () => {
		stubWeatherApi();

		const context = renderWithFormContext(Step3Observations, {
			overrides: { isDead: true, ...POSITION_AND_DATE }
		});

		await expect.element(page.getByText(SUGGESTION_HEADING)).toBeVisible();

		const stored = get(context.form).weatherData as StoredWeatherData | undefined;
		expect(stored).toBeDefined();
		expect(stored?.provider).toBe('open-meteo');
		// Vergangenes Datum → `historical`, nicht `forecast` (Datumslogik in Environment.svelte).
		expect(stored?.data_type).toBe('historical');
		expect(stored?.location).toMatchObject({ latitude: 54.5, longitude: 12.5 });
		expect(stored?.processed.temperature).toBe(17.4);
		expect(stored?.processed.windDirectionCardinal).toBe('W');
	});

	/**
	 * Gegenprobe: Ohne die Vorbedingung darf nichts abgefragt werden. Ohne sie
	 * belegte der Test oben nur, dass irgendwann irgendein `fetch` läuft — die
	 * Aussage „springt an, **sobald** Position und Datum gesetzt sind" braucht
	 * den Fall, in dem er es nicht tut.
	 */
	it('fragt beim Totfund nichts ab, solange die Position fehlt', async () => {
		const fetchSpy = stubWeatherApi();

		renderWithFormContext(Step3Observations, {
			overrides: { isDead: true, sightingDate: '2026-07-01', sightingTime: '12:00' }
		});

		await expect.element(page.getByRole('heading', { name: 'Umweltbedingungen' })).toBeVisible();

		expect(weatherRequests(fetchSpy)).toHaveLength(0);
		expect(page.getByText(SUGGESTION_HEADING).elements()).toHaveLength(0);
	});
});
