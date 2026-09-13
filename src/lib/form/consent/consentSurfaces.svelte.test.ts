/**
 * Bindet die Fassungskennungen an die **gelesene Einwilligungsfläche**.
 *
 * Die Kennung ist der zweite Teil des Nachweises nach Art. 7 Abs. 1 DSGVO: Der
 * Zeitstempel sagt **wann**, die Kennung sagt **wozu** eingewilligt wurde. Sie
 * taugt dafür nur, solange sie sich mit dem Text ändert — eine Kennung, die
 * beim Umformulieren stehen bleibt, weist der Einwilligung rückwirkend einen
 * Text zu, den die Meldenden nie gesehen haben.
 *
 * **Was „Fläche" heißt.** Nicht der `meta.helpText` aus `sightingSchema.ts`,
 * sondern alles, was neben dem Ankreuzfeld steht und die Frage beantwortet, wozu
 * hier zugestimmt wird: Überschrift, Einleitung, Verarbeitungs-Kacheln,
 * Widerrufshinweis. Ein Hash allein über den `helpText` ist nachweislich zu eng
 * — in PR #773 änderte sich die Gruppen-Überschrift über `nameConsent` /
 * `shipNameConsent` von „Optionale Veröffentlichung Ihres Namens" auf „… von
 * Namen und Aufnahmen", und `mediaConsent` zog samt Erklärtext von der Dropzone
 * auf Schritt 2 in diese Gruppe zwei Schritte weiter. Der damalige Test blieb
 * grün; die drei Kennungen wurden erst nachträglich durch ein Review gehoben.
 *
 * **Warum das ein Browser-Test ist.** Die umgebenden Texte stehen im Markup, und
 * die einzige belastbare Lesart des Markups ist das, was der Browser daraus
 * rendert. Die beiden Alternativen sind geprüft und verworfen: Das Schema-
 * `.label()` mitzuhashen erfasst die Überschrift nicht, und die `.svelte`-Quelle
 * per Regex abzugreifen schafft eine zweite, brüchige Quelle neben dem Markup.
 *
 * **Preis dieser Entscheidung:** Die Bindung an den Wortlaut ist damit aus
 * `npm run test:quick` heraus — die läuft nur den Server-Teil. Sie greift in CI
 * (`test:unit:client`, `.github/workflows/ci.yml`) und lokal über
 * `npm run test:unit:client`. Wer an einem Einwilligungstext arbeitet, fährt den
 * also zusätzlich, statt sich auf `test:quick` zu verlassen.
 *
 * **Wie die Fläche abgegrenzt wird.** Über `data-consent-surface` im Markup —
 * die Auszeichnung steht dort mit Begründung neben dem Text, den sie umfasst.
 * Flächen dürfen schachteln: `Step4Contact.svelte` markiert die gemeinsame Karte
 * („Datenschutz und Einverständnis") **und** darin die beiden Gruppen. Gehasht
 * wird pro Feld getrennt nach Ebene — äußere Fläche ohne die inneren, eigene
 * Gruppe ohne die Felder, dann der eigene Ankreuztext. Damit bewegt eine
 * Gruppen-Überschrift nur die Kennungen ihrer Gruppe, und der Wortlaut eines
 * einzelnen Ankreuztextes nur die eigene — statt bei jeder Änderung alle vier.
 *
 * Der Ankreuztext ist damit mitgepinnt; der frühere `helpText`-Hash in
 * `consentTextVersions.test.ts` ist deshalb entfallen. Zwei Hashes für eine
 * Textänderung zu pflegen hätte nur die Gewohnheit gefördert, sie nachzutragen,
 * statt die Kennung zu heben.
 *
 * **Geltungsbereich ist das Meldeformular**, nicht die Admin-Maske: Die Kennung
 * bezeugt, was die meldende Person gelesen hat. Die Admin-Maske bindet weder
 * `Step4Contact` noch `RequiredConsent` ein und schreibt die Nachweisspalten
 * ohnehin nicht (`updateSighting`).
 *
 * **Schlägt der Test fehl, wurde eine Einwilligungsfläche geändert. Dann beides tun:**
 *   1. die Fassungskennung in `consentVersions.ts` bzw. `mediaConsentVersion.ts`
 *      auf das Datum der Änderung setzen,
 *   2. den neuen Hash aus der Fehlermeldung hier eintragen.
 *
 * Wer nur (2) macht, hat den Nachweis entwertet: Alle Altbestände tragen dann
 * eine Kennung, hinter der ein anderer Wortlaut steht.
 */
import { describe, expect, it } from 'vitest';
import { renderWithFormContext } from '$lib/report/components/testing/renderWithFormContext.testutil';
import { formStepsConfig } from '$lib/report/formConfig';
import { SightingFromEnum } from '$lib/report/formOptions/sightingFrom';
import RequiredConsent from '$lib/report/components/form/RequiredConsent.svelte';
import Step4Contact from '$lib/report/components/steps/Step4Contact.svelte';
import type { UploadedFileInfo } from '$lib/types';
import { MEDIA_CONSENT_VERSION } from './mediaConsentVersion';
import {
	NAME_CONSENT_VERSION,
	PRIVACY_CONSENT_VERSION,
	SHIP_NAME_CONSENT_VERSION
} from './consentVersions';

/**
 * Attribute, die Text tragen, den jemand liest oder vorgelesen bekommt.
 * `data-tip` ist die DaisyUI-Tooltip-Blase — dort steht der `meta.valueText`,
 * und der ist Teil der Fläche, obwohl er nie im `textContent` auftaucht.
 */
const TEXT_ATTRIBUTES = ['data-tip', 'title', 'placeholder', 'alt', 'aria-label'] as const;

/**
 * Sammelt den lesbaren Text eines Teilbaums in Dokumentreihenfolge und
 * normalisiert die Whitespace-Formatierung weg — sonst hinge der Hash daran, wie
 * Prettier das Markup umbricht.
 *
 * `stopAt` schneidet Teilbäume ab, die zu einer eigenen Ebene gehören
 * (geschachtelte Flächen, Feld-Wrapper). Der Knoten selbst wird dabei komplett
 * übersprungen, nicht nur sein Inhalt.
 */
function readableText(root: Element, stopAt: (element: Element) => boolean): string {
	const parts: string[] = [];

	function walk(element: Element): void {
		for (const attribute of TEXT_ATTRIBUTES) {
			const value = element.getAttribute(attribute);
			if (value) parts.push(value);
		}
		for (const node of element.childNodes) {
			if (node.nodeType === Node.TEXT_NODE) {
				parts.push(node.nodeValue ?? '');
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const child = node as Element;
				if (!stopAt(child)) walk(child);
			}
		}
	}

	walk(root);
	return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function fieldWrapper(field: string): Element {
	const wrapper = document.querySelector(`[data-field="${field}"]`);
	if (!wrapper) {
		throw new Error(
			`Feld ${field} wird in der gerenderten Komponente nicht angezeigt — ` +
				`entweder ist es umgezogen (dann gehört es dort in eine ausgezeichnete ` +
				`Fläche und die Kennung gehoben) oder der Render-Zustand unten blendet es aus.`
		);
	}
	return wrapper;
}

/**
 * Grenze zwischen zwei Ebenen: eine eigene Fläche, ein anderes Feld — oder ein
 * Block, der ausdrücklich Nutzerdaten statt Einwilligungstext trägt.
 *
 * `data-consent-surface-exclude` gibt es seit dem 2026-08-06 für genau einen
 * Fall: Über `mediaConsent` stehen die hochgeladenen Aufnahmen namentlich
 * („Ihre 2 hochgeladenen Aufnahmen: foto.jpg", `Step4Contact.svelte`, UX-Review
 * Punkt 2). Das ist die Bestandsaufnahme der eigenen Dateien, kein Wortlaut,
 * dem jemand zustimmt — und beides, die Anzahl und die Dateinamen, kommt aus
 * dem Formularzustand. Im Hash stünde damit die Fixture dieser Testdatei: Ein
 * umbenanntes `foto.jpg` ließe den Test rot werden und verleitete dazu, eine
 * Fassungskennung zu heben, obwohl sich kein gelesener Satz geändert hat.
 *
 * Die Auszeichnung ist deshalb ausdrücklich KEIN Freibrief für „Text, den ich
 * nicht pinnen will". Sie gilt für Blöcke, deren Inhalt vollständig aus
 * Nutzerdaten besteht. Alles, was den Melder darüber belehrt, wozu er
 * zustimmt, gehört in die Fläche — auch wenn es unbequem ist.
 */
function isOwnLevel(element: Element): boolean {
	return (
		element.hasAttribute('data-consent-surface') ||
		element.hasAttribute('data-consent-surface-exclude') ||
		element.hasAttribute('data-field')
	);
}

/**
 * Der Text, den die Fassungskennung eines Feldes bezeugt: jede umgebende
 * ausgezeichnete Fläche von außen nach innen (jeweils ohne die tiefer liegenden
 * Ebenen), zuletzt der eigene Ankreuztext samt Hilfetext und Tooltip.
 */
function consentSurfaceText(field: string): string {
	const wrapper = fieldWrapper(field);

	const surfaces: Element[] = [];
	for (let element = wrapper.parentElement; element; element = element.parentElement) {
		if (element.hasAttribute('data-consent-surface')) surfaces.unshift(element);
	}
	if (surfaces.length === 0) {
		throw new Error(
			`Feld ${field} steht in keiner mit \`data-consent-surface\` ausgezeichneten Fläche — ` +
				`ohne sie ist nicht festgelegt, welchen Text seine Fassungskennung bezeugt.`
		);
	}

	return [
		...surfaces.map((surface) => readableText(surface, isOwnLevel)),
		readableText(wrapper, () => false)
	].join(' | ');
}

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Ein abgeschlossen hochgeladenes File, wie es `$form.uploadedFiles` nach einem
 * erfolgreichen Upload enthält — `mediaConsent` erscheint sonst gar nicht
 * (`hasUploadedMedia`, Step4Contact.svelte).
 */
const UPLOADED_FILE = {
	uid: 'uid-1',
	filePath: 'ref-1/uid-1.jpg',
	originalName: 'foto.jpg',
	fileName: 'uid-1.jpg',
	mimeType: 'image/jpeg',
	size: 1234
} as UploadedFileInfo;

/**
 * Kanonischer Render-Zustand für Schritt 4: von einem Boot gemeldet und mit
 * vorliegender Aufnahme, damit `shipNameConsent` und `mediaConsent` sichtbar
 * sind. Auf den Flächen-Text der Gruppen wirkt das nicht — die Feld-Wrapper
 * werden aus den Flächen herausgerechnet.
 */
function mountStep4(): void {
	renderWithFormContext(Step4Contact, {
		overrides: { sightingFrom: SightingFromEnum.SAILBOAT, uploadedFiles: [UPLOADED_FILE] }
	});
}

function mountRequiredConsent(): void {
	renderWithFormContext(RequiredConsent, {
		props: { currentStep: formStepsConfig.length - 1 }
	});
}

const PINNED_CONSENT_SURFACES = [
	{
		field: 'nameConsent',
		version: NAME_CONSENT_VERSION,
		mount: mountStep4,
		hash: '52c78ef9327e827938f9086789b77fce9dfa0906215c4969024c315ba006a9cb'
	},
	{
		field: 'shipNameConsent',
		version: SHIP_NAME_CONSENT_VERSION,
		mount: mountStep4,
		hash: '1b457c0558173a31510f776bbcddca7f3ff2dc2cfcb270d7dc85ac18abe309dc'
	},
	{
		field: 'mediaConsent',
		version: MEDIA_CONSENT_VERSION,
		mount: mountStep4,
		hash: 'd2c96dda7071fa5417e92b7e7ba851b01cebd1b98c488c1657b3da942d04f672'
	},
	{
		// Einzige Einwilligung ohne Fassungskennung: Sie erlaubt das Speichern der
		// Kontaktdaten im Browser des Melders und wird nirgends serverseitig
		// nachgewiesen — es gibt also keine Spalte, die eine Fassung tragen könnte
		// (anders als bei den vier `…_am`/`…_version`-Paaren in `schema.ts`).
		// Gepinnt ist der Text trotzdem: Eine Änderung daran soll eine bewusste
		// Entscheidung sein und nicht beiläufig passieren.
		field: 'persistentDataConsent',
		version: null,
		mount: mountStep4,
		// Gehoben 2026-09-13: Überschrift, Einleitung, Ankreuztext UND Hilfetext auf
		// UX-Review hin umformuliert ("Dauerhafte Speicherung"/"dauerhaft" klang
		// nach unumkehrbarer Aufbewahrung, obwohl direkt daneben ein Lösch-Button
		// steht) — jetzt nutzenorientiert und mit explizitem Lösch-Hinweis, auch im
		// Hilfetext selbst. Die Einleitung nochmals nachgeschärft: "nicht bei uns"
		// behauptete fälschlich etwas über die Kontaktdaten insgesamt (die gehen mit
		// jeder Meldung an den Server) statt nur über diese Autofill-Speicherung;
		// "vormerken" ersetzt durch das natürlichere "merken" (Echo der Überschrift).
		hash: '7508422be0e28e4d8c0ef15789956f945d80b1eee0c98c2a3824c2de44d51781'
	},
	{
		field: 'privacyConsent',
		version: PRIVACY_CONSENT_VERSION,
		mount: mountRequiredConsent,
		hash: '0f10fb576c8de53edc6e5c771d97c02b4e6d16a876e58cd99e26f99c0ffe2061'
	}
] as const;

describe('Fassungskennungen der Einwilligungsflächen', () => {
	it.each(PINNED_CONSENT_SURFACES)(
		'$field entspricht dem gepinnten Hash der gelesenen Fläche',
		async ({ field, version, mount, hash }) => {
			mount();

			const text = consentSurfaceText(field);
			const actual = await sha256(text);

			// Text und aktuelle Kennung stehen in der Meldung, weil ein Hash allein
			// weder sagt, WAS sich geändert hat, noch woran Schritt (1) der
			// Anleitung oben hängt — und die Entscheidung „Kennung heben oder
			// nicht" genau daran hängt.
			expect(
				actual,
				`Gelesene Fläche von ${field} (Kennung: ${version ?? 'keine, siehe Liste'}):\n${text}\n`
			).toBe(hash);
		}
	);
});

/**
 * Gegenprobe zur Vollständigkeit: Der Hash oben schützt nur Felder, die in der
 * Liste stehen. Eine neue Einwilligung, die jemand in eine dieser beiden
 * Komponenten stellt, wäre ohne diese Feststellung ungeschützt — und eine, die
 * aus der ausgezeichneten Fläche herausrutscht, ebenfalls.
 *
 * **Zwei Grenzen, damit der Titel nicht mehr verspricht, als geprüft wird:**
 * Gemountet werden nur `Step4Contact` und `RequiredConsent` — heute rendern alle
 * fünf `*Consent`-Felder des Schemas dort und nur dort, eine künftige
 * Einwilligung in einer anderen Komponente bliebe aber unsichtbar. Und die
 * Erkennung hängt an der Namenskonvention `…Consent`. Beides fällt spätestens
 * auf, wenn ein neues Feld ohne Nachweis in die DB geht; ein Wächter, der jede
 * Komponente des Formulars mountet, wäre dafür zu teuer.
 */
describe('Die Einwilligungen dieser beiden Komponenten sind vollständig gepinnt', () => {
	function renderedConsentFields(): string[] {
		return Array.from(document.querySelectorAll('[data-field]'))
			.map((element) => element.getAttribute('data-field') ?? '')
			.filter((name) => name.endsWith('Consent'))
			.sort();
	}

	const pinnedFields = PINNED_CONSENT_SURFACES.map(({ field }) => field);

	it('Schritt 4 zeigt genau die gepinnten Einwilligungen', () => {
		mountStep4();

		expect(renderedConsentFields()).toEqual(
			pinnedFields.filter((field) => field !== 'privacyConsent').sort()
		);
	});

	it('die Pflicht-Einwilligung vor dem Absenden ist gepinnt', () => {
		mountRequiredConsent();

		expect(renderedConsentFields()).toEqual(['privacyConsent']);
	});
});
