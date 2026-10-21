/**
 * Bestimmungshilfe für die im Formular auswählbaren Tierarten.
 *
 * Fachliche Referenz sind die Artensteckbriefe des Deutschen Meeresmuseums
 * (Trägerinstitution des Portals). Änderungen an Zahlen oder Merkmalen bitte
 * dort gegenprüfen: https://www.deutsches-meeresmuseum.de/wissenschaft/infothek/artensteckbriefe
 */
import { memoizePerLocale } from '#lib/i18n/localeMemo.ts';
import * as m from '#lib/paraglide/messages.js';
import { getLocale, type Locale } from '#lib/paraglide/runtime.js';
import { SpeciesEnum } from './species';

/**
 * Wie gut ein Merkmal in der realen Sichtungssituation beobachtbar ist.
 * Eine Sichtung dauert oft nur Sekunden, auf Entfernung und bei bewegter See —
 * Merkmale ohne diese Einordnung führen zu Fehlbestimmungen.
 */
export type Observability = 'distance' | 'closeup' | 'background';

/**
 * Baut je Locale die Bezeichnungen der Beobachtbarkeits-Stufen aus dem
 * Botschaftskatalog.
 *
 * Modul-intern (kein Export): Kein Verbraucher außerhalb von `formOptions/`
 * indiziert das Record direkt — geprüft vor diesem Umbau (auch über
 * mehrzeilige Importe, `germanBaseline.testutil.ts` ausgenommen). Der externe
 * Verbraucher `SpeciesIdentificationHelp.svelte` ruft seither
 * `getObservabilityLabels()`.
 *
 * NUR diese beiden schmalen Label-Records (Observability/FrequencyLevel)
 * gehören zu Aufgabe 3.3 — die elf Artdatensätze (`speciesIdentification`
 * unten) bleiben unberührt, siehe Docblock der Konstante dort.
 *
 * Bewusst ein Record von BUILDERN, nicht von aufgelösten Strings — siehe
 * Begründung in `species.ts`.
 */
const observabilityLabelBuilders: Record<Observability, (locale: Locale) => string> = {
	distance: (locale) => m.formoptions_speciesidentification_distance({}, { locale }),
	closeup: (locale) => m.formoptions_speciesidentification_closeup({}, { locale }),
	background: (locale) => m.formoptions_speciesidentification_background({}, { locale })
};

/** Baut die Beobachtbarkeits-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const observabilityLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(observabilityLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<Observability, string>
);

/**
 * Gibt die Beobachtbarkeits-Bezeichnungen für eine Locale zurück.
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 */
export function getObservabilityLabels(
	locale: Locale = getLocale()
): Record<Observability, string> {
	return observabilityLabelsFor(locale);
}

/** Wie realistisch eine Sichtung in der deutschen Ostsee ist. */
export type FrequencyLevel = 'resident' | 'regular' | 'rare' | 'vagrant';

/**
 * Baut je Locale die Bezeichnungen der Häufigkeits-Stufen aus dem
 * Botschaftskatalog. Siehe Begründung an `observabilityLabelBuilders` oben.
 */
const frequencyLabelBuilders: Record<FrequencyLevel, (locale: Locale) => string> = {
	resident: (locale) => m.formoptions_speciesidentification_resident({}, { locale }),
	regular: (locale) => m.formoptions_speciesidentification_regular({}, { locale }),
	rare: (locale) => m.formoptions_speciesidentification_rare({}, { locale }),
	vagrant: (locale) => m.formoptions_speciesidentification_vagrant({}, { locale })
};

/** Baut die Häufigkeits-Bezeichnungen für eine Locale genau einmal und hält sie danach vor. */
const frequencyLabelsFor = memoizePerLocale(
	(locale) =>
		Object.fromEntries(
			Object.entries(frequencyLabelBuilders).map(([value, build]) => [value, build(locale)])
		) as Record<FrequencyLevel, string>
);

/**
 * Gibt die Häufigkeits-Bezeichnungen für eine Locale zurück.
 * @param locale - Locale für die Anzeigetexte; Default die aktuelle Locale
 */
export function getFrequencyLabels(locale: Locale = getLocale()): Record<FrequencyLevel, string> {
	return frequencyLabelsFor(locale);
}

export interface IdentificationFeature {
	text: string;
	observability: Observability;
}

export interface SpeciesImage {
	src: string;
	alt: string;
	copyright: string | null;
}

export interface SpeciesIdentificationEntry {
	name: string;
	scientificName: string;
	size: string;
	weight: string;
	/**
	 * `level` fehlt bei den beiden Platzhaltern („Unbekannte Walart",
	 * „Unbekannte Robbenart"): Wer die Art nicht bestimmen konnte, weiß auch
	 * nicht, ob sie hier heimisch ist — das Abzeichen behauptete es trotzdem
	 * (Anmerkung des Meeresmuseums, 2026-08-13). Der `text` bleibt in beiden
	 * Fällen und erklärt, wann der Platzhalter zu wählen ist.
	 */
	frequency: { level?: FrequencyLevel; text: string };
	/** Was bei einer typischen Sichtung tatsächlich zu sehen ist. */
	surfacing: string[];
	distinguishing: IdentificationFeature[];
	behavior: string[];
	/** Womit die Art regelmäßig verwechselt wird. */
	confusion: string[];
	/** Eine einprägsame Merkregel für das Feld. */
	fieldTip?: string;
	images: SpeciesImage[];
}

const CC_BY_SA_4 = 'https://creativecommons.org/licenses/by-sa/4.0';

const credit = (workUrl: string, author: string, licence: string, licenceUrl: string): string =>
	`© <a href="${workUrl}">${author}</a>, <a href="${licenceUrl}">${licence}</a>, via Wikimedia Commons`;

export const speciesIdentification: Record<SpeciesEnum, SpeciesIdentificationEntry> = {
	[SpeciesEnum.HARBOR_PORPOISE]: {
		name: 'Schweinswal',
		scientificName: 'Phocoena phocoena',
		size: 'im Mittel 1,60 m, bis 1,85 m, sehr selten 2 m (Kälber 65–90 cm)',
		weight: '40–90 kg',
		frequency: {
			level: 'resident',
			text: 'Die einzige dauerhaft in der Ostsee lebende Walart. Fast alle Meldungen betreffen ihn.'
		},
		surfacing: [
			'Rollt ruhig durch die Oberfläche — Sie sehen nur Rücken und Finne, nie das ganze Tier',
			'Pro Auftauchen nur etwa 1–2 Sekunden sichtbar',
			'2–4 Atemzüge pro Minute, danach ein längerer Tauchgang',
			'Kein sichtbarer Blas, bei ruhiger See aber ein hörbares Schnaufen',
			'Die Schwanzflosse (Fluke) kommt beim Abtauchen nie aus dem Wasser',
			'Springt praktisch nie und reitet keine Bugwellen'
		],
		distinguishing: [
			{
				text: 'Kleine, dreieckige Finne mit breiter Basis und stumpfer Spitze, mittig auf dem Rücken',
				observability: 'distance'
			},
			{ text: 'Dunkelgrauer bis schwarzer Rücken', observability: 'distance' },
			{
				text: 'Meist einzeln oder als Mutter-Kalb-Paar; Gruppen ab sieben Tieren sind selten',
				observability: 'distance'
			},
			{
				text: 'Runder Kopf ohne abgesetzten Schnabel, flache Stirn, kurze stumpfe Schnauze',
				observability: 'closeup'
			},
			{
				text: 'Heller, oft fast weißer Bauch; dunkler Streifen vom Mundwinkel zur Brustflosse',
				observability: 'closeup'
			},
			{
				text: 'Weibchen werden größer und schwerer als Männchen',
				observability: 'background'
			}
		],
		behavior: [
			'Scheu, hält Abstand zu Booten',
			'Tauchgänge meist unter einer Minute, in Ausnahmen bis 5–6 Minuten',
			'Ganzjährig anwesend; Sichtungen häufen sich im Sommerhalbjahr',
			'Die Förden dienen im Sommer als Kinderstube — kleinere Tiere dicht neben größeren sind Mutter-Kalb-Paare'
		],
		confusion: [
			'Robbe: Der runde Kopf steht senkrecht aus dem Wasser, bleibt liegen und hat keine Finne',
			'Delfin: hohe, spitze, sichelförmig zurückgebogene Finne; springt und reitet Bugwellen',
			'Ab etwa Windstärke 3 werden Wellenkämme regelmäßig für Finnen gehalten'
		],
		fieldTip: 'War es spektakulär, war es kein Schweinswal.',
		images: [
			{
				src: '/species/harbor-porpoise-dorsal-fin.jpg',
				alt: 'So sieht eine echte Sichtung aus: rollender Rücken mit kleiner, breitbasiger Dreiecksfinne',
				copyright:
					'© NOAA Fisheries, Public Domain, via <a href="https://commons.wikimedia.org/wiki/File:Harbor_porpoise_dorsal_fin.jpg">Wikimedia Commons</a>'
			},
			{
				src: '/species/harbor-porpoise.png',
				alt: 'Kopf aus der Nähe — runder Kopf ohne abgesetzten Schnabel (Tier in menschlicher Obhut)',
				copyright:
					'© <a href="https://commons.wikimedia.org/wiki/File:Daan_Close_Up.PNG">AVampireTear</a>, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via Wikimedia Commons'
			}
		]
	},

	[SpeciesEnum.GREY_SEAL]: {
		name: 'Kegelrobbe',
		scientificName: 'Halichoerus grypus',
		size: 'Ostsee: Männchen bis ca. 2,3 m, Weibchen bis ca. 1,9 m',
		weight: 'Männchen über 300 kg, Weibchen durchschnittlich 150 kg',
		frequency: {
			level: 'resident',
			text: 'Häufigste Robbe der deutschen Ostseeküste, Schwerpunkt Greifswalder Bodden und Rügen.'
		},
		surfacing: [
			'Der runde Kopf steht senkrecht aus dem Wasser, das Tier schaut oft zum Beobachter',
			'Bleibt an der Oberfläche liegen, statt vorwärts durchzurollen',
			'Keine Rückenflosse'
		],
		distinguishing: [
			{
				text: 'Langer, kegelförmiger Kopf: Die Schnauze läuft ohne Absatz in die Stirn über ("Pferdekopf")',
				observability: 'distance'
			},
			{
				text: 'Die Augen sitzen etwa mittig zwischen Nasenspitze und Hinterkopf',
				observability: 'distance'
			},
			{
				text: 'Massiger Kopf; Männchen zusätzlich mit faltiger Nackenpartie',
				observability: 'distance'
			},
			{
				text: 'Nasenlöcher verlaufen annähernd parallel und laufen unten nicht zusammen',
				observability: 'closeup'
			},
			{
				text: 'Wenige große, unregelmäßige Flecken — Weibchen hell mit dunklen Flecken, Männchen dunkel mit hellen Flecken',
				observability: 'closeup'
			},
			{ text: 'Männchen deutlich größer als Weibchen', observability: 'background' }
		],
		behavior: [
			'Ruht in Gruppen an festen Liegeplätzen',
			'Auf See nähern sich einzelne Tiere durchaus Booten',
			'An Liegeplätzen sehr störungsempfindlich — bitte weiträumig umfahren',
			'Wurfzeit Februar bis März; Jungtiere tragen zunächst ein weißes Fell'
		],
		confusion: [
			'Junge und weibliche Kegelrobben ähneln Seehunden in Größe und Gestalt sehr — entscheidend ist das Kopfprofil, nicht die Größe',
			'Seehund: kürzere Schnauze mit deutlichem Absatz und rundere Stirn'
		],
		fieldTip: 'Gerade Linie von der Schnauze zur Stirn — dann Kegelrobbe.',
		images: [
			{
				src: '/species/grey-seal-head-profile.jpg',
				alt: 'Kegelrobbe im Profil — die Schnauze läuft in gerader Linie ohne Absatz in die Stirn über',
				copyright: credit(
					'https://commons.wikimedia.org/wiki/File:Hel_Kegelrobbe.jpg',
					'Schlaier',
					'CC BY 3.0',
					'https://creativecommons.org/licenses/by/3.0'
				)
			},
			{
				src: '/species/Two_seals_in_the_water.jpg',
				alt: 'Kegelrobben im Wasser (Måkläppen, Ostsee) — frontale Kopfansicht',
				copyright: credit(
					'https://commons.wikimedia.org/wiki/File:Two_seals_in_the_water.jpg',
					'Lucc77',
					'CC BY-SA 4.0',
					CC_BY_SA_4
				)
			}
		]
	},

	[SpeciesEnum.HARBOR_SEAL]: {
		name: 'Seehund',
		scientificName: 'Phoca vitulina',
		size: 'Weibchen bis 1,6 m, Männchen bis 1,8 m',
		weight: 'Weibchen bis 100 kg, Männchen bis 120 kg',
		frequency: {
			level: 'regular',
			text: 'An der deutschen Ostseeküste deutlich seltener als die Kegelrobbe.'
		},
		surfacing: [
			'Der runde Kopf steht senkrecht aus dem Wasser, Augen und Barthaare sind erkennbar',
			'Keine Rückenflosse'
		],
		distinguishing: [
			{
				text: 'Rundlicher Kopf mit kurzer Schnauze und deutlichem Absatz zwischen Schnauze und Stirn ("Hundekopf")',
				observability: 'distance'
			},
			{
				text: 'Die Augen sitzen weit vorn nahe der Schnauze und wirken am kleinen Kopf groß',
				observability: 'distance'
			},
			{ text: 'Kleiner und schlanker als die Kegelrobbe', observability: 'distance' },
			{
				text: 'Nasenlöcher V-förmig, die Schenkel treffen sich unten',
				observability: 'closeup'
			},
			{
				text: 'Graubraun mit vielen kleinen, gleichmäßig verteilten Punkten',
				observability: 'closeup'
			}
		],
		behavior: [
			'Ruht gern in Gruppen auf Sandbänken',
			'Störungsempfindlich — flieht teilweise schon bei 500 m entfernten Booten',
			'Tauchgänge meist etwa 5 bis 6 Minuten'
		],
		confusion: [
			'Kegelrobbe: längerer Kopf ohne Absatz, größere und unregelmäßigere Flecken',
			'Junge Kegelrobben sind an der Größe allein nicht zu unterscheiden'
		],
		fieldTip: 'Deutlicher Absatz zwischen Schnauze und Stirn — dann Seehund.',
		images: [
			{
				src: '/species/1080px-Common_Seal_Phoca_vitulina.jpg',
				alt: 'Seehund an Land — rundlicher Kopf mit kurzer Schnauze und deutlichem Absatz',
				copyright: credit(
					'https://commons.wikimedia.org/wiki/File:Common_Seal_Phoca_vitulina.jpg',
					'Andreas Trepte',
					'CC BY-SA 2.5',
					'https://creativecommons.org/licenses/by-sa/2.5'
				)
			}
		]
	},

	[SpeciesEnum.RINGED_SEAL]: {
		name: 'Ringelrobbe',
		scientificName: 'Pusa hispida botnica',
		size: 'maximal ca. 1,4 m',
		weight: 'bis 100 kg',
		frequency: {
			level: 'vagrant',
			text: 'In deutschen Gewässern faktisch nicht vorkommend — verbreitet an den Küsten Schwedens, Finnlands und Estlands. Bitte nur mit Foto melden.'
		},
		surfacing: [
			'Der runde Kopf steht senkrecht aus dem Wasser',
			'Keine Rückenflosse',
			'Im Wasser vom Seehund kaum zu unterscheiden — die Ringe sind dann nicht sichtbar'
		],
		distinguishing: [
			{
				text: 'Rundlicher, katzenartiger Kopf mit kurzer Schnauze und im Verhältnis großen Augen',
				observability: 'distance'
			},
			{
				text: 'Kleinste Robbe der Ostsee — der Größenunterschied zum Seehund ist allerdings gering',
				observability: 'distance'
			},
			{
				text: 'Helle Ringe umranden dunkle Flecken auf grauem Grund',
				observability: 'closeup'
			}
		],
		behavior: [
			'Sehr scheu, meist Einzelgänger',
			'An Eis gebunden; hält Atemlöcher mit den Krallen der Vorderflossen offen'
		],
		confusion: [
			'Eine gemeldete Ringelrobbe in der deutschen Ostsee ist mit hoher Wahrscheinlichkeit ein Seehund oder eine junge Kegelrobbe'
		],
		fieldTip: 'Ohne Foto der Ringe bitte "Unbekannte Robbenart" wählen.',
		images: [
			{
				src: '/species/ringed-seal-coat-pattern.jpg',
				alt: 'Ringelrobbe auf Eis — helle Ringe um dunkle Flecken, dazu der rundliche Kopf mit kurzer Schnauze',
				copyright:
					'© NOAA Seal Survey, Public Domain, via <a href="https://commons.wikimedia.org/wiki/File:Pusa_hispida_hispida_NOAA_1.jpg">Wikimedia Commons</a>'
			},
			{
				src: '/species/ringed-seal.jpg',
				alt: 'Dieselbe Art im Wasser — so gesehen sind die Ringe nicht erkennbar und eine Verwechslung mit dem Seehund ist wahrscheinlich',
				copyright: credit(
					'https://commons.wikimedia.org/w/index.php?curid=99756242',
					'Кирилл Уютнов',
					'CC BY-SA 4.0',
					CC_BY_SA_4
				)
			}
		]
	},

	[SpeciesEnum.DOLPHIN]: {
		name: 'Delfin',
		scientificName: 'u. a. Tursiops truncatus, Lagenorhynchus albirostris',
		size: '2–4 m',
		weight: 'ca. 150–650 kg',
		frequency: {
			level: 'vagrant',
			text: 'In der Ostsee Irrgast. Nachweise betreffen überwiegend Große Tümmler, meist Einzeltiere.'
		},
		surfacing: [
			'Zeigt beim Auftauchen deutlich mehr Körper als ein Schweinswal',
			'Springt, spritzt und wechselt das Tempo',
			'Nähert sich Booten und reitet Bugwellen'
		],
		distinguishing: [
			{
				text: 'Hohe, spitze, deutlich sichelförmig zurückgebogene Finne — der beste Unterschied zum Schweinswal',
				observability: 'distance'
			},
			{
				text: 'Stromlinienförmiger Körper, wirkt deutlich größer als ein Schweinswal',
				observability: 'distance'
			},
			{
				text: 'Großer Tümmler: kräftige, abgesetzte Schnauze, überwiegend grau',
				observability: 'closeup'
			},
			{
				text: 'Weißschnauzendelfin: kurze helle Schnauze, dunkler Rücken mit hellen Flankenstreifen und hellem Sattelfleck',
				observability: 'closeup'
			},
			{
				text: 'Artbiologisch in Schulen lebend — in der Ostsee aber fast immer Einzeltiere oder Paare',
				observability: 'background'
			}
		],
		behavior: [
			'Sehr aktive und schnelle Schwimmer',
			'Neugierig gegenüber Booten',
			'Einzelne Tiere halten sich teils monatelang in einer Förde auf'
		],
		confusion: [
			'Schweinswal: kleine dreieckige Finne mit stumpfer Spitze, keine Sprünge',
			'Laien melden Schweinswale häufig als "Delfin", weil das Wort geläufiger ist — bitte gezielt auf die Finnenform achten'
		],
		images: [
			{
				src: '/species/974px-Tursiops_truncatus_01-cropped.jpg',
				alt: 'Großer Tümmler — hohe sichelförmige Finne und deutlich abgesetzte Schnauze',
				copyright:
					'© NASA, Public Domain, via <a href="https://commons.wikimedia.org/w/index.php?curid=37679800">Wikimedia Commons</a>'
			}
		]
	},

	[SpeciesEnum.BELUGA]: {
		name: 'Beluga',
		scientificName: 'Delphinapterus leucas',
		size: '3–5,5 m (Männchen deutlich größer)',
		weight: '400–1500 kg',
		frequency: {
			level: 'vagrant',
			text: 'Extrem seltener Irrgast: nur eine Handvoll Nachweise seit 1900, stets Einzeltiere.'
		},
		surfacing: [
			'Rein weißer Rücken ohne Finne — in der Ostsee unverwechselbar',
			'Langsames, ruhiges Auftauchen'
		],
		distinguishing: [
			{
				text: 'Keine Rückenflosse, stattdessen ein niedriger Rückenkamm',
				observability: 'distance'
			},
			{ text: 'Adulte Tiere rein weiß, Jungtiere grau', observability: 'distance' },
			{
				text: 'Rundlicher, verformbarer Kopf (Melone); kann als einziger Wal den Kopf drehen und nicken',
				observability: 'closeup'
			},
			{ text: 'Breite, paddelförmige Brustflossen', observability: 'closeup' }
		],
		behavior: [
			'Langsamer Schwimmer',
			'Artbiologisch in Familienverbänden — in der Ostsee bisher ausschließlich Einzeltiere'
		],
		confusion: [
			'Ein weißes, finnenloses Tier ist in der Ostsee immer meldenswert — bitte unbedingt fotografieren'
		],
		images: [
			{
				src: '/species/beluga-wild-with-calf.jpg',
				alt: 'Wilder Beluga mit Kalb — weißes Alttier, graues Jungtier, glatter Rücken ohne Finne',
				copyright: credit(
					'https://commons.wikimedia.org/wiki/File:St._Lawrence_beluga_and_calf.jpg',
					'Saucoin',
					'CC BY-SA 4.0',
					CC_BY_SA_4
				)
			},
			{
				src: '/species/mendar-bouchali-djtZXyJkTU4-unsplash.jpg',
				alt: 'Kopf aus der Nähe — runde, verformbare Melone (Tier in menschlicher Obhut)',
				copyright:
					'Foto von <a href="https://unsplash.com/de/@mendarb">Mendar Bouchali</a> auf <a href="https://unsplash.com/de/fotos/weisses-unterwassertier-djtZXyJkTU4">Unsplash</a>'
			}
		]
	},

	[SpeciesEnum.MINKE_WHALE]: {
		name: 'Zwergwal',
		scientificName: 'Balaenoptera acutorostrata',
		size: 'ca. 7–9 m, maximal 9,8 m',
		weight: '5–8 t, maximal ca. 9 t',
		frequency: {
			level: 'vagrant',
			text: 'Seltener Gast; die jüngeren Nachweise in der eigentlichen Ostsee sind überwiegend Totfunde.'
		},
		surfacing: [
			'Blas unter 2 m, diffus und meist kaum zu sehen — bei Wind praktisch unsichtbar',
			'Blas und Finne erscheinen nahezu gleichzeitig',
			'Rollt flach ab und zeigt die Fluke beim Abtauchen nicht'
		],
		distinguishing: [
			{ text: 'Spitzer, schmal-dreieckiger Kopf mit Mittelkiel', observability: 'distance' },
			{
				text: 'Sichelförmige Finne relativ weit vorn — sie erscheint fast gleichzeitig mit dem Blas',
				observability: 'distance'
			},
			{
				text: 'Weiße Binde auf der Oberseite der Brustflossen — das sicherste Merkmal, aber nur bei Nahbegegnung sichtbar',
				observability: 'closeup'
			},
			{
				text: 'Kleinster Furchenwal; der kleinste Bartenwal überhaupt ist der Zwergglattwal der Südhalbkugel',
				observability: 'background'
			}
		],
		behavior: [
			'Schneller Schwimmer, meist einzeln oder paarweise',
			'Nähert sich Booten gelegentlich neugierig',
			'Tauchgänge normalerweise 6–12 Minuten'
		],
		confusion: [
			'Finnwal: deutlich größer, hoher säulenförmiger Blas, Finne erscheint erst lange nach dem Blas'
		],
		images: [
			{
				src: '/species/minke-whale-surfacing.jpg',
				alt: 'Zwergwal beim Auftauchen — sichelförmige Finne auf dem stark gewölbten Rücken',
				copyright: credit(
					'https://commons.wikimedia.org/wiki/File:Minke_whale_near_Tadoussac.jpg',
					'Maksim Sokolov',
					'CC BY-SA 4.0',
					CC_BY_SA_4
				)
			}
		]
	},

	[SpeciesEnum.FIN_WHALE]: {
		name: 'Finnwal',
		scientificName: 'Balaenoptera physalus',
		size: '18–24 m; Gäste der westlichen Ostsee sind oft jüngere Tiere um 13–16 m',
		weight: '40–70 t',
		frequency: {
			level: 'vagrant',
			text: 'Unregelmäßiger Gast der westlichen Ostsee, teils mit mehrjährigen Lücken.'
		},
		surfacing: [
			'Hoher, schmaler, säulenförmiger Blas von 4–6 m — oft kilometerweit sichtbar und das beste Fernmerkmal',
			'Die Finne erscheint erst deutlich nach dem Blas, weil sie weit hinten sitzt',
			'Bei der Nahrungsaufnahme 5–7 Blas in schneller Folge',
			'Taucht oft dreimal kurz hintereinander auf — das wird häufig fälschlich als "Mutter mit Kind" gemeldet',
			'Zeigt die Fluke nicht; vor dem Tieftauchgang wölbt sich der Rücken stark auf'
		],
		distinguishing: [
			{
				text: 'Relativ kleine, flach ansteigende Finne im hinteren Drittel des Rückens',
				observability: 'distance'
			},
			{
				text: 'Sehr langer, schlanker Körper mit ausgeprägtem Rückenkiel hinter der Finne',
				observability: 'distance'
			},
			{
				text: 'Asymmetrische Kopffärbung: rechter Unterkiefer weiß, linker dunkel',
				observability: 'closeup'
			},
			{ text: 'Heller Chevron hinter dem Kopf', observability: 'closeup' },
			{ text: 'Zweitgrößter Wal der Welt nach dem Blauwal', observability: 'background' },
			{ text: 'V-förmiger Kopf — nur aus der Luft erkennbar', observability: 'background' }
		],
		behavior: [
			'Sehr schneller Schwimmer, über 40 km/h',
			'Meist einzeln, gelegentlich paarweise',
			'Hält sich in der Ostsee bevorzugt in Förden und Buchten auf und kehrt zu festen Stellen zurück'
		],
		confusion: [
			'Zwergwal: deutlich kleiner, Blas kaum sichtbar, Finne erscheint gleichzeitig mit dem Blas',
			'Ab etwa 3–4 Beaufort verweht der Blas und ist als Merkmal unbrauchbar'
		],
		images: [
			{
				src: '/species/fin-whale-blow.jpg',
				alt: 'Finnwal — hoher, schmaler, säulenförmiger Blas über dem langen Rücken; die Finne ist noch nicht sichtbar',
				copyright: credit(
					'https://commons.wikimedia.org/wiki/File:Finwhaleblow2.jpg',
					'bwats2',
					'CC BY-SA 2.0',
					'https://creativecommons.org/licenses/by-sa/2.0'
				)
			}
		]
	},

	[SpeciesEnum.HUMPBACK_WHALE]: {
		name: 'Buckelwal',
		scientificName: 'Megaptera novaeangliae',
		size: '12–16 m',
		weight: '25–30 t, maximal ca. 36 t',
		frequency: {
			level: 'rare',
			text: 'Selten, aber wiederkehrend — der am häufigsten nachgewiesene Großwal der Ostsee.'
		},
		surfacing: [
			'Buschiger, ballonförmiger Blas von etwa 3 m — fast so breit wie hoch',
			'Wölbt beim Abtauchen den Rücken stark auf ("Buckel")',
			'Hebt die Fluke regelmäßig hoch aus dem Wasser — das schließt Zwerg- und Finnwal praktisch aus',
			'Springt gelegentlich spektakulär'
		],
		distinguishing: [
			{
				text: 'Sehr lange, weiß gezeichnete Brustflossen von bis zu 5 m — etwa ein Drittel der Körperlänge',
				observability: 'distance'
			},
			{ text: 'Kleine Finne auf einem deutlichen Fleischhöcker', observability: 'distance' },
			{ text: 'Höckerreihe auf dem Schwanzstiel hinter der Finne', observability: 'distance' },
			{ text: 'Warzenartige Tuberkel auf Kopf und Unterkiefer', observability: 'closeup' },
			{
				text: 'Individuelles Schwarz-Weiß-Muster auf der Flukenunterseite — Grundlage der Foto-Identifikation',
				observability: 'closeup'
			},
			{ text: 'Komplexe Gesänge — über Wasser nicht hörbar', observability: 'background' }
		],
		behavior: [
			'Lange Wanderungen zwischen Nahrungs- und Paarungsgebieten',
			'In der Ostsee einzelne Tiere, die teils wochenlang bleiben'
		],
		confusion: [
			'Wird eine Fluke gezeigt, ist der Zwergwal ausgeschlossen und der Finnwal sehr unwahrscheinlich'
		],
		fieldTip:
			'Bitte die Fluke beim Abtauchen fotografieren — daran lassen sich Individuen über Jahre und Ländergrenzen hinweg wiedererkennen.',
		images: [
			{
				src: '/species/1066px-Humpback_whales_in_singing_position.jpg',
				alt: 'Buckelwale — die sehr langen, hellen Brustflossen und die Tuberkel am Kopf sind gut erkennbar',
				copyright:
					'© Dr. Louis M. Herman, <a href="https://www.flickr.com/photos/noaaphotolib/5077889241/">NOAA Photo Library</a>, Public Domain, via <a href="https://commons.wikimedia.org/w/index.php?curid=79946">Wikimedia Commons</a>'
			}
		]
	},

	[SpeciesEnum.UNKNOWN_WHALE]: {
		name: 'Unbekannte Walart',
		scientificName: '—',
		size: 'Vergleichen Sie die Länge mit Ihrem Boot statt in Metern zu schätzen',
		weight: 'Keine Angabe nötig',
		frequency: {
			// Kein `level`: siehe `SpeciesIdentificationEntry.frequency`.
			text: 'Bitte wählen, wenn Sie sich nicht sicher sind. Eine unsichere Meldung mit Foto ist wertvoller als gar keine Meldung — raten Sie nicht.'
		},
		surfacing: [
			'Notieren Sie, ob ein Blas sichtbar war und wie hoch und breit er war',
			'Notieren Sie, ob beim Abtauchen die Fluke gezeigt wurde',
			'Notieren Sie, wie lange das Tier sichtbar war und wie oft es auftauchte'
		],
		distinguishing: [
			{
				text: 'Form der Finne und ihre Position auf dem Rücken (mittig oder weit hinten)',
				observability: 'distance'
			},
			{ text: 'Farbe und auffällige Zeichnungen', observability: 'distance' },
			{ text: 'Größe im Vergleich zu einem Referenzobjekt', observability: 'distance' }
		],
		behavior: [
			'Fotografieren Sie, auch unscharf — jedes Bild hilft bei der nachträglichen Bestimmung',
			'Genaue Position, Uhrzeit und Schwimmrichtung sind besonders wertvoll'
		],
		confusion: [
			'Bei senkrecht aus dem Wasser stehendem Kopf ohne Finne handelt es sich um eine Robbe'
		],
		images: [
			{
				src: '/species/unknown-whale.svg',
				alt: 'Platzhalter für eine nicht bestimmte Walart',
				copyright: null
			}
		]
	},

	[SpeciesEnum.UNKNOWN_SEAL]: {
		name: 'Unbekannte Robbenart',
		scientificName: '—',
		size: 'Größe im Wasser zuverlässig zu schätzen ist kaum möglich',
		weight: 'Keine Angabe nötig',
		frequency: {
			// Kein `level`: siehe `SpeciesIdentificationEntry.frequency`.
			text: 'Bitte wählen, wenn Sie sich nicht sicher sind. Gerade junge Kegelrobben und Seehunde sind im Wasser kaum zu trennen.'
		},
		surfacing: [
			'Notieren Sie, ob nur der Kopf oder auch der Körper zu sehen war',
			'Notieren Sie, ob das Tier an Land lag oder schwamm'
		],
		distinguishing: [
			{
				text: 'Kopfprofil: gerade Linie von der Schnauze zur Stirn oder deutlicher Absatz',
				observability: 'distance'
			},
			{ text: 'Fellmuster: wenige große oder viele kleine Flecken', observability: 'closeup' },
			{ text: 'Form der Nasenlöcher, falls erkennbar', observability: 'closeup' }
		],
		behavior: [
			'Fotografieren Sie, auch unscharf — das Kopfprofil im Profil ist am aussagekräftigsten',
			'Halten Sie Abstand, besonders zu Tieren an Land'
		],
		confusion: [
			'Ein rollender Rücken mit dreieckiger Finne und ohne sichtbaren Kopf ist ein Schweinswal'
		],
		images: [
			{
				src: '/species/unknown-seal.svg',
				alt: 'Platzhalter für eine nicht bestimmte Robbenart',
				copyright: null
			}
		]
	}
};

export { CC_BY_SA_4, credit };
