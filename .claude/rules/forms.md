---
paths:
  - 'src/lib/form/**'
  - 'src/lib/report/**'
  - 'src/lib/components/form/**'
  - 'src/routes/+page.svelte'
---

# Multi-Step Forms

Regeln für Formular-Entwicklung mit der projekteigenen `createForm`-Implementierung und Yup.

---

## Tech Stack

| Bibliothek                                  | Zweck                                      |
| ------------------------------------------- | ------------------------------------------ |
| `createForm` (`src/lib/form/createForm.ts`) | Form State Management (svelte/store + Yup) |
| Yup                                         | Schema Validation                          |
| DaisyUI                                     | Form Components                            |

---

## Multi-Step Architektur

Vor dem Formular steht eine **Einstiegsseite**: `ReportKindChoice.svelte` fragt „Was
möchten Sie melden?" (lebendes Tier oder Totfund) und legt den Zweig (`ReportKind`,
`src/lib/report/reportKind.ts`) fest, bevor `ModernReportForm` überhaupt mountet.
`+page.svelte` rendert je nach `resolveReportKind(...)` entweder die Auswahlseite oder das
Formular — `?meldung=lebend`/`?meldung=totfund`, ein gespeicherter Zweig und
Altbestands-`isDead` überspringen sie.

Das Hauptformular selbst (`ModernReportForm`, gemountet nach der Zweigwahl) nutzt 4 Schritte:

1. **Position & Zeitpunkt** - Ort, Datum, Uhrzeit
2. **Angaben zum Tier** - Tierart, Anzahl, Entfernung
3. **Weitere Informationen** - Optionale Details, Boot-/Schiffsangaben
4. **Kontaktdaten** - Beobachter-Information

### Struktur

```
src/
├── routes/+page.svelte                          # Einstiegsseite ↔ Multi-Step Container
└── lib/
    ├── form/validation/
    │   └── sightingSchema.ts                    # Yup Validation Schema
    ├── report/
    │   ├── reportKind.ts                        # ReportKind-Zustandsmaschine (Einstiegsseite)
    │   ├── formConfig.ts                        # formStepsConfig, getFormSteps (nur Validierung!)
    │   ├── components/
    │   │   ├── ReportKindChoice.svelte           # Einstiegsseite: „Was möchten Sie melden?"
    │   │   ├── ModernReportForm.svelte           # Haupt-Formular
    │   │   ├── steps/                            # Step Components
    │   │   │   ├── Step1LocationTime.svelte      # Position & Zeit
    │   │   │   ├── Step2SightingDetails.svelte   # Details
    │   │   │   ├── Step3Observations.svelte      # Verhalten
    │   │   │   └── Step4Contact.svelte           # Kontakt
    │   │   ├── sections/                         # Wiederverwendbare Sections
    │   │   └── form/                             # Form Field Components
    │   └── formOptions/                          # Enum/Option Definitionen (16 Dateien)
    └── storage/
        └── localStorage.ts                       # GDPR-aware Browser Storage
```

---

## Validation mit Yup

**Single Source of Truth: `src/lib/form/validation/sightingSchema.ts`.** Das Schema ist
nicht nur Validierung — es trägt über `.label()` und `.meta({ type, options, helpText,
icon, … })` auch die komplette Feld-Darstellung. `formConfig.ts` liest es per
`sightingSchema.describe()` aus und leitet daraus `initialFormState` und
`sightingSchemaFields` ab.

Konsequenz: **Ein neues Feld entsteht im Schema, nicht in einer Komponente.** Label,
Typ, Options und Hilfetext gehören in `.meta()`, nicht ins Markup. Ein Typ ist nicht zu
pflegen — `SightingFormData` ist `yup.InferType<typeof sightingSchema>` (`#lib/types/Form.ts`).

### Feldnamen — keine Abkürzungen

Die Schema-Feldnamen sind ausgeschrieben und wandern unverändert durch
`formStepsConfig`, `FormField name={…}` und `data-testid="field-<name>"`. Verwechslungen
sind die häufigste Fehlerquelle:

| Richtig                         | Falsch (existiert nicht) |
| ------------------------------- | ------------------------ |
| `latitude` / `longitude`        | `lat` / `lng`            |
| `sightingDate` / `sightingTime` | `date` / `time`          |
| `totalCount`                    | `count`                  |

`species` ist eine **Zahl** (Artcode, `.default(0)`), kein String — siehe
`isValidSpecies` und `getSpeciesOptions` in `src/lib/report/formOptions/`.

Bedingte Pflichtfelder über `yup.when(...)` — Beispiel `deadCondition` abhängig von
`isDead` im Schema. **Achtung:** `FieldRenderer` liest `required` aus der statischen
Schema-Beschreibung, in der ein `when()` nicht sichtbar ist — siehe den
`required`-Override im Accessibility-Abschnitt.

---

## createForm Pattern (projekteigene Implementierung)

**Hinweis:** Das Projekt nutzt KEINE externe Form-Library. `src/lib/form/createForm.ts` ist eine eigene, schlanke Implementierung auf Basis von Svelte-Stores (`writable`/`derived`) + Yup. `$form`, `$errors`, `$touched`, `$isSubmitting`, `$isValid` sind Svelte-Stores und werden mit `$` abonniert.

- **`touched`** (`Record<string, boolean>`) wird von `handleChange`/`updateField` gesetzt und von `updateInitialValues` zurückgesetzt. Es steuert ausschließlich die Anzeige (grünes Häkchen nur an Feldern, die der Nutzer wirklich berührt hat) — nicht die Validierung.
- **Kein `validateField`**: Validiert wird beim Submit (`abortEarly: false`, sammelt alle Fehler) sowie schrittweise über `validateStep` (`src/lib/form/validation/stepValidation.ts`, nutzt `sightingSchema.pick(...)`). `updateField` löscht den Fehler des geänderten Feldes.
- **`validationSchema` darf eine Funktion sein** (`(values) => Schema`, Typ `ValidationSchemaOption`). Sie wird bei JEDEM Submit mit den aktuellen Werten aufgelöst — nötig, weil `createForm` nur einmal beim Mount läuft, das Formular Felder aber zur Laufzeit ausblendet. Das Meldeformular übergibt `reachableSchema` (= `sightingSchema.omit(hiddenFormFields(values))`), die Admin-Maske ein festes Schema.
- **Fehler-Timing**: Fehler erscheinen erst nach einem gescheiterten „Weiter"-Versuch, nie beim Betreten eines Schritts (siehe `stepNavigationState.ts`).

API — vollständig, das ist alles was `createForm` zurückgibt:

`{ form, errors, touched, isSubmitting, isValid, handleSubmit, handleChange, updateField, updateInitialValues }`

Nicht vorhanden: `validateField` (siehe oben) und `reset` — Zurücksetzen läuft über
`updateInitialValues(...)`, das auch `touched` leert.

`handleChange` fällt auf `target.id` zurück, wenn kein `name` gesetzt ist (nötig für die
Lat/Lon-Inputs in `LocationInput`).

`isValid` ist `Object.keys($errors).length === 0` — also **„keine Fehler bekannt"**, nicht
„Schema erfüllt". Direkt nach dem Laden ist `$errors` leer und `$isValid` damit `true`,
obwohl noch nichts ausgefüllt wurde. Für Navigations-Gates deshalb `validateStep` /
`isStepValid` verwenden, nie `$isValid`.

### Nicht direkt aufrufen — der Context-Weg

Im Sichtungsformular ruft **keine** Komponente `createForm` selbst auf. Das macht genau
eine Stelle:

`Form.svelte` → `createForm(...)` + `mediaStore` → `setFormContext(...)`
→ `FormField` liest per `getFormContext()`

| Datei                                                    | Rolle                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/report/components/form/Form.svelte`             | Einziger `createForm`-Aufruf; setzt Context, rendert `<form>` + Honeypot |
| `src/lib/report/formContext.ts`                          | `setFormContext` / `getFormContext` (Symbol-Key)                         |
| `src/lib/report/components/form/fields/FormField.svelte` | Holt `form`, `errors`, `touched`, `handleChange` aus dem Context         |

Eine Feld-Komponente braucht deshalb nur `<FormField name="species" />` — Wert, Fehler,
`touched` und `onchange` kommen aus dem Context. `FormField` **wirft**, wenn es außerhalb
von `<Form>` verwendet wird.

---

## Progressive Disclosure

Zeige Felder nur wenn relevant — die Bedingung kommt aus einem benannten Prädikat in
`formConfig.ts` (`isDeadFinding`, `isFromLand`, `hasUploadedMedia`), nicht aus einem
Rohwert wie `$form.isDead` direkt:

```svelte
{#if isDeadFinding($form.isDead)}
	<div class="space-y-4">
		<FormField name="deadCondition" label="Zustand des Tieres" />
		<FormField name="deadPhoneContact" label="Telefonisch erreichbar?" />
	</div>
{/if}

{#if $form.species === 'Schweinswal'}
	<FormField name="dorsal" label="Rückenflosse sichtbar?" type="checkbox" />
{/if}
```

### Die Zwei-Hälften-Regel — der teuerste Fehler in diesem Formular

`getFormSteps` (`formConfig.ts`) steuert **Validierung und Fehler-Navigation** — gerendert
wird daraus **nichts**. Ein Feld dort aus den `fields` eines Schritts zu entfernen macht es
unvalidiert, aber nicht unsichtbar.

Gelesen wird es von `stepValidation.ts` (Schritt-Gate), von `StepNavigation.svelte`
(Feldreihenfolge für `scrollToFirstError`), von `ModernReportForm.svelte`
(`resolveServerFieldErrors`, `findStepForErrors`, Vorab-Prüfung über `hiddenFormFields`)
und von `RequiredConsent.svelte` (letzter Schritt). Alle rechnen über Schritte, keiner
rendert daraus — wer eine dieser Stellen auf `formStepsConfig` zurückdreht, führt zu einem
Feld, das im aktuellen Zweig kein DOM-Element hat, und der Sprung fällt still aus.

Jede Ausblendung eines Feldes braucht deshalb **beide Hälften**, über **dasselbe** benannte
Prädikat:

1. den Eintrag in `getFormSteps` (`formConfig.ts`), und
2. eine `{#if}`-Bedingung an der Markup-Aufrufstelle der Section-Komponente.

Nur eine Hälfte ist schlimmer als keine:

- **Nur Markup ausgeblendet, `getFormSteps` unverändert:** Das Feld bleibt validiert — der
  Melder sitzt vor einem gesperrten „Weiter" wegen eines Feldes, das er nicht mehr sehen
  und nicht mehr korrigieren kann. Keine Fehlermeldung erklärt, warum.
- **Nur `getFormSteps` geändert, Markup unverändert:** Das Feld bleibt sichtbar und
  ausfüllbar, aber ungeprüft — sein Wert geht unvalidiert mit ans Backend.

Beispiel für ein korrekt ausgeblendetes Feld: `mediaConsent` entfällt in
`getFormSteps`, sobald `hasUploadedMedia(data.uploadedFiles)` falsch ist, und dieselbe
Funktion steht als `{#if hasMedia}`-Bedingung in `Step4Contact.svelte` — beide Seiten rufen
dieselbe Funktion auf demselben Wert auf, statt zwei getrennt gepflegte Bedingungen zu
riskieren.

### Ausgeblendet heißt: nicht Teil dieser Meldung

Die beiden Hälften oben regeln Sichtbarkeit und Schritt-Validierung. Beim **Absenden**
gilt dieselbe Aussage, und zwar für beides zugleich (entschieden am 2026-08-07):

- **Validiert** wird `sightingSchema.omit(hiddenFormFields(values))` — in der Vorab-Prüfung
  (`handleFinalSubmit`) UND in der maßgeblichen Prüfung (`createForm`, über den Resolver
  oben). Zwei Ebenen mit verschiedenen Regeln ergaben eine stille Sackgasse: Die eine ließ
  durch, was die andere aufhielt, und `handleSubmit` meldet einen Validierungs-Abbruch nicht
  an seinen Aufrufer — kein Toast, kein Sprung, keine Markierung an einem Feld ohne DOM.
- **Gesendet** wird ebenfalls ohne `hiddenFormFields(values)` (`onSubmit` in
  `ModernReportForm`). Sonst ginge ein Wert raus, den Yups `omit` ungeprüft und ungecastet
  hat durchlaufen lassen.

Ein neu ausgeblendetes Feld braucht deshalb **keine** dritte Stelle mehr — es genügt der
Eintrag in `hiddenFormFields`. Feldlisten am Absende-Rand (früher `OWN_VESSEL_FIELDS`,
`MEDIA_CONSENT_FIELDS`) nicht wieder einführen.

Was dabei **nicht** angetastet werden darf: `$form` selbst und das an `onSubmit` übergebene
`values`. Aus Letzterem werden die dauerhaft gespeicherten Kontaktdaten gebaut, und
`saveUserContactDataWithConsent` überschreibt ohne Merge — ein wiederkehrender Melder verlöre
bei einer Land-Meldung sonst seine Bootsdaten. Dass `values` vollständig bleibt, hängt daran,
dass Yups `omit` den Schlüssel im Ergebnis stehen lässt; ein `stripUnknown`/`noUnknown` an
dieser Validierung bricht es.

---

## Step Navigation

**`currentStep` ist 0-basiert.** Schritt 1 der UI ist Index `0`; `formStepsConfig` wird
direkt damit indiziert. Die Navigation ist fertig implementiert in
`src/lib/report/components/form/StepNavigation.svelte` — nicht nachbauen:

| Ausdruck                                     | Bedeutung                                  |
| -------------------------------------------- | ------------------------------------------ |
| `currentStep = $bindable(0)`                 | Startwert, per `bind:` vom Parent gehalten |
| `isFirstStep = currentStep <= 0`             | „Zurück" deaktiviert                       |
| `isLastStep = currentStep >= totalSteps - 1` | „Weiter" wird zu „Absenden"                |
| `formStepsConfig[currentStep]`               | Direkter Index — **kein** `- 1`            |
| `Schritt ${currentStep + 1}`                 | Nur für die **Anzeige** wird +1 gerechnet  |

`ModernReportForm.svelte` hält den State (`$state(loadFromStorage(STORAGE_KEYS.CURRENT_STEP, 0))`),
persistiert ihn per `$effect` und setzt bei Reset auf `0` zurück.

`validateStep(currentStep, formData)` und `isStepValid(currentStep, formData)` nehmen
**zwei** Argumente — nicht `$errors` als drittes.

---

## Accessibility

### Labels und ARIA kommen aus der Feld-Pipeline

**Kein handgeschriebenes ARIA in Formular-Sections.** Felder laufen über `FormField` → `FieldRenderer`
(`src/lib/report/components/form/fields/`). Diese Pipeline erzeugt zentral: Label, Pflicht-Sternchen,
`aria-required`, `aria-describedby` (Hilfetext/Beschreibung/Fehler), `aria-invalid`, `role="alert"` an der
Fehlermeldung und `data-testid="field-<name>"` für E2E-Tests.

```svelte
<!-- Richtig: Label, Hilfetext, Fehler und ARIA kommen aus dem Schema-`meta` -->
<FormField name="species" />
```

Beschriftung, Hilfetext, Platzhalter, Icon und Feldtyp werden im Yup-Schema unter `.meta({...})` gepflegt,
nicht in der Komponente.

**Konditionale Pflichtfelder:** `FieldRenderer` leitet `required` aus der statischen Schema-Beschreibung ab —
ein Yup-`when()` ist dort nicht sichtbar. Für Felder, die nur unter Bedingungen Pflicht sind, den
`required`-Override setzen, damit Sternchen und `aria-required` mit der Validierung übereinstimmen:

```svelte
<FormField name="waterway" required={$form.hasPosition !== true} />
```

### Keyboard Navigation

- Tab durch alle Felder
- Enter für Absenden
- Escape für Abbrechen

---

## Mobile-First

### Touch Targets & Schriftgröße

Größen kommen aus den DaisyUI-Komponentenklassen (`input`, `select`, `textarea`) und dem
Theme in `src/app.css` — **es gibt keine projekteigene Feld-Wrapper-Klasse.**

> **Achtung:** Eine Klasse `.form-field` existiert im Projekt nicht. Ältere Anleitungen mit
> `.form-field input { min-height: 48px }` beschreiben Code, den es nie gab — solche Regeln
> nicht „wiederherstellen". Der Wrapper, den `FieldRenderer` rendert, heißt `fieldset`
> (DaisyUI), das Feld selbst trägt `data-field="<name>"` über `FormField`.

Das einzige feldbezogene Größen-Override in `app.css` betrifft den iframe-Modus
(`.iframe-mode .input/.select/.textarea { font-size: 1rem }`) und hält dort die 16px-Grenze
gegen iOS-Auto-Zoom. Details und die übrigen bewussten Overrides:
`.claude/rules/daisyui.md`.

### Input Types

```svelte
<input type="date" name="date" />
<input type="time" name="time" />
<input type="tel" name="phone" />
<input type="email" name="email" />
<input type="number" name="count" inputmode="numeric" />
```

---

## Auto-Save

```typescript
import { saveToStorage, loadFromStorage, STORAGE_KEYS } from '#lib/storage/localStorage.ts';

// Auto-Save via $effect (reaktiv)
$effect(() => {
	saveToStorage(STORAGE_KEYS.FORM_DATA, $form);
});

// Beim Laden wiederherstellen
const savedData = loadFromStorage(STORAGE_KEYS.FORM_DATA, null);
if (savedData) {
	Object.assign($form, savedData);
}
```

**Hinweis:** Nutze immer `saveToStorage`/`loadFromStorage` aus `#lib/storage/localStorage` statt direktem `localStorage`-Zugriff. Siehe `.claude/rules/browser-storage.md` für GDPR-Details.

---

## Best Practices

### Do's

- Pflichtfelder mit \* markieren
- Inline-Validierung erst nach Blur
- Hilfreiche Fehlermeldungen auf Deutsch
- Progress-Indicator für Steps

### Don'ts

- Keine Validierung bei Focus
- Keine technischen Fehlermeldungen
- Keine zu langen Formulare pro Step (max 5-6 Felder)
