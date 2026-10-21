# `src/lib/report` — Sighting Report Form

This directory contains the **production** multi-step sighting form, plus the entry page in
front of it. [`src/routes/+page.svelte`](../../routes/+page.svelte) renders either
`ReportKindChoice` (no branch chosen yet) or `ModernReportForm` (branch resolved) — there is
no second or "legacy" form implementation.

## Entry page: which branch, before the form mounts

[`ReportKindChoice.svelte`](components/ReportKindChoice.svelte) asks "Was möchten Sie
melden?" (living animal vs. dead find) before any form step renders.
[`reportKind.ts`](reportKind.ts) is the pure state machine behind it —
`resolveReportKind(param, stored, savedIsDead)` decides whether the choice page is skipped
(`?meldung=` link, a stored branch, or legacy data with `isDead` already set) or shown
(`null`). `+page.svelte` owns the `reportKind` state and calls this on mount, in the
`popstate` handler, and after "Ändern".

The binding rules for working on this code are in
[`.claude/rules/forms.md`](../../../.claude/rules/forms.md); UX rationale is in
[`docs/DESIGN_GUIDE.md`](../../../docs/DESIGN_GUIDE.md). This file is an orientation map
only — where things live and how the pieces connect.

## Core idea: the schema drives the form

[`src/lib/form/validation/sightingSchema.ts`](../form/validation/sightingSchema.ts) is the
single source of truth. Besides validation it carries the field presentation via `.label()`
and `.meta({ type, options, helpText, icon, … })`. `formConfig.ts` reads it with
`sightingSchema.describe()` and derives `initialFormState` and `sightingSchemaFields`.

Consequence: **a field is defined in the schema, not in a component.** Components only say
which field to render.

## Structure

```
src/lib/report/
├── formConfig.ts                    # formStepsConfig, getFormSteps, initialFormState, USER_CONTACT_FIELDS
├── formContext.ts                   # set/getFormContext (Symbol key)
├── reportKind.ts                    # ReportKind state machine (entry page, before the form)
├── types.ts                         # @deprecated re-export shim → import from #lib/types
├── formOptions/                     # Enum + option helpers (16 files)
└── components/
    ├── ReportKindChoice.svelte      # Entry page: "Was möchten Sie melden?"
    ├── ModernReportForm.svelte      # Form entry point; owns currentStep + persistence
    ├── steps/
    │   ├── Step1LocationTime.svelte
    │   ├── Step2SightingDetails.svelte
    │   ├── Step3Observations.svelte
    │   └── Step4Contact.svelte
    ├── sections/                    # Reusable blocks composed by the steps
    └── form/
        ├── Form.svelte              # The only createForm call; sets context + honeypot
        ├── FormSteps.svelte         # Progress indicator
        ├── StepNavigation.svelte    # Back / Next / Submit
        ├── LocationInput.svelte     # Lat/Lon inputs (use id, not name)
        └── fields/
            ├── FormField.svelte     # Context → value + error for one field
            ├── FieldRenderer.svelte # Builds label, ARIA, error output; picks the control
            └── Base*.svelte         # Input, Select, Textarea, Radio, Checkbox, Toggle
```

## Data flow

```
Form.svelte  →  createForm(...)  →  setFormContext(...)
                                         ↓
                     FormField (getFormContext → value, error, handleChange)
                                         ↓
                     FieldRenderer (label + ARIA + control selection)
                                         ↓
                     BaseInput / BaseSelect / BaseTextarea / …
```

State comes from [`createForm`](../form/createForm.ts) — Svelte **stores**
(`writable`/`derived`), subscribed with `$`. Runes (`$state`) are used for local UI state
such as `currentStep`, not for the form values. `FormField` throws if used outside `<Form>`.

## Form steps

Titles, descriptions and the per-step validated fields live in `formStepsConfig`
(`formConfig.ts`) — change them there, not in the step components.

| Index | Title                 | Content                  |
| ----- | --------------------- | ------------------------ |
| `0`   | Position & Zeitpunkt  | Location, date, time     |
| `1`   | Angaben zum Tier      | Species, count, distance |
| `2`   | Weitere Informationen | Optional details         |
| `3`   | Kontaktdaten          | Observer information     |

**`currentStep` is 0-based** and indexes `formStepsConfig` directly. Only the display adds
`+ 1`.

## Validation

Three distinct layers — see `.claude/rules/forms.md` for the full table:

| Layer          | Where                                  | Effect                                                 |
| -------------- | -------------------------------------- | ------------------------------------------------------ |
| **Per step**   | `../form/validation/stepValidation.ts` | Gates "Next"; blocks navigation                        |
| **Pre-submit** | `ModernReportForm.handleFinalSubmit`   | Blocks; sets `$errors`, jumps to the earliest bad step |
| **Submit**     | `createForm.handleSubmit`              | Authoritative; sets `$errors`, calls `onSubmit`        |

`isStepValid(currentStep, formData)` and `validateStep(currentStep, formData)` take **two**
arguments and validate `sightingSchema.pick(getFormSteps(formData)[currentStep].fields)`.

**Both submit layers validate the same thing:** `reachableSchema(values)` in
`ModernReportForm` — `sightingSchema.omit(hiddenFormFields(values))`, the full schema minus
what the current branch hides. The pre-submit layer additionally covers all steps at once (a
field can go invalid after its step was left) and jumps to the earliest affected step.

The authoritative layer gets there via a **schema resolver**: `validationSchema` accepts
`(values) => AnyObjectSchema` as well as a schema (`ValidationSchemaOption` in
`createForm.ts`), resolved on every submit. It has to be a function — `createForm` runs once
at mount, while the reporting location changes at runtime. Until 2026-08-07 it validated the
full schema, so a leftover value in a hidden field stopped the submit **silently**:
`handleSubmit` catches the `ValidationError`, writes it to `$errors` and returns, so
`StepNavigation` sees no failure and logs "Form submitted successfully" — no toast, no jump,
no marking, because the field has no DOM element. Reproducible by typing more than 1000
characters into `reaction` on a boat report and then switching `sightingFrom` to land.

**Hidden means: not part of this report** — for validation and for what goes out. The
submit edge drops `hiddenFormFields(values)` from the submitted object (`onSubmit` in
`ModernReportForm`), so nothing that slipped past the schema unvalidated ever reaches the
server. Yup's `omit` does **not** strip the key from its result — hidden fields pass through
uncast, which is what keeps `values` complete enough to build the persisted contact data
(`shipName`, `homePort`, …) on a land report. Switching that validate call to
`stripUnknown`/`noUnknown` would wipe a returning reporter's saved boat details; pinned by
`createForm.test.ts` → "lässt den Wert des ausgenommenen Feldes trotzdem an onSubmit durch".

There is no debouncing. `createForm` exposes
`{ form, errors, touched, isSubmitting, isValid, handleSubmit, handleChange, updateField, updateInitialValues }`
and nothing else — no `validateField`, no `reset`.

`touched` (`Record<string, boolean>`) is set by `handleChange` / `updateField` and cleared by
`updateInitialValues`. It drives **display only**, never validation. Errors appear only after
a failed "Next"/"Submit" attempt — never on entering a step (see `stepNavigationState.ts`) —
and clear when the field changes.

## Conditional fields

Progressive disclosure is done inline in the section components with `{#if}` against
`$form` plus `transition:slide`. There is no config object and no `CombinedField`
component.

**`getFormSteps` (`formConfig.ts`) controls validation only — it renders nothing.** It
derives per-step `fields` from `formStepsConfig` by removing entries for the current branch
(`isDeadFinding`), reporting location (`isFromLand`), or missing media (`hasUploadedMedia`),
and `stepValidation.ts` reads the result. Hiding a field there does **not** hide it in the
DOM. Every hidden field needs **both halves**: the entry removed from `getFormSteps` _and_ a
matching `{#if}` at the markup call site, both driven by the same named predicate
(`isDeadFinding`, `isFromLand`, `hasUploadedMedia` — all exported from `formConfig.ts`).
Doing only one half is worse than doing neither: a visible-but-unvalidated field submits an
unchecked value to the backend; a hidden-but-still-validated field blocks "Weiter" on a field
the user can no longer see or fix, with no way out.

The "OTHER selected → reveal a free-text field" pattern compares against the option enum
and shows a `<field>Text` companion — see
[`sections/SightingDetails.svelte`](components/sections/SightingDetails.svelte)
(`sightingFrom` / `boatDrive`). Dead-animal fields work the same way in
[`sections/AnimalInfo.svelte`](components/sections/AnimalInfo.svelte).

Datalist suggestions are provided by `BaseInput.svelte` when a text field has options.

## Persistence

Handled in `ModernReportForm.svelte` by two separate `$effect`s — the split is deliberate,
a shared effect would fire twice per step change. Always go through
[`#lib/storage/localStorage`](../storage/localStorage.ts), never `localStorage` directly;
GDPR details in [`.claude/rules/browser-storage.md`](../../../.claude/rules/browser-storage.md).

| Data               | Key                 | Backend          | Notes                                |
| ------------------ | ------------------- | ---------------- | ------------------------------------ |
| Sighting form data | `FORM_DATA`         | `sessionStorage` | Consent-free session data; no expiry |
| Current step       | `CURRENT_STEP`      | `sessionStorage` | Restored via `loadFromStorage(…, 0)` |
| Observer contact   | `USER_CONTACT_DATA` | `localStorage`   | Opt-in, survives sessions            |

`USER_CONTACT_FIELDS` (`formConfig.ts`) lets `clearFormDataOnly()` reset the sighting
without discarding saved observer details.

## Accessibility

`FieldRenderer.svelte` is the only place that builds label and ARIA markup — do not
hand-roll it in step or section components. It generates the label from `.label()`, the
required marker and `aria-required` from `fieldConfig.optional === false`, `aria-invalid`,
a composed `aria-describedby` (help / description / error, only for IDs that exist), the
error output with `role="alert"` + `aria-live="polite"`, and `data-testid="field-<name>"`.

It picks one of three markup shapes so no `label[for]` dangles: `<fieldset>`/`<legend>` for
radio groups, control-owned labels for checkbox/toggle, and `<label for>` otherwise.

The green status checkmark is gated on `touched && hasValue && !hasError`, so it only appears
on fields the user actually interacted with. `FormField` reads `$touched[name]` from the
context and passes it down. The indicator is `aria-hidden` — the accessible signal is
`aria-invalid` plus the error text.

`FieldRenderer` derives `required` from the **static** schema description, where a Yup
`when()` is invisible. For conditionally-required fields, pass the `required` override so the
asterisk and `aria-required` match the actual validation:

```svelte
<FormField name="waterway" required={$form.hasPosition !== true} />
```

Step changes move focus to the step heading (`scrollAndFocusStep` in
`StepNavigation.svelte`) so screen readers announce the new step.

## Adding a field

1. Define it in `sightingSchema.ts` — validation plus `.label()` and `.meta({ type, … })`.
   Options belong in `formOptions/`.
2. Add the field name to the right step's `fields` array in `formConfig.ts` so it is
   validated and reachable by error navigation.
3. Render it with `<FormField name="…" />` in the appropriate section component.

**No type to update:** `SightingFormData` is `yup.InferType<typeof sightingSchema>`
([`#lib/types/Form.ts`](../types/Form.ts)), so the type follows from step 1 automatically.
Import types from `#lib/types`, not from the deprecated `report/types.ts` shim.

New field _types_ go into `FieldRenderer` plus a `Base*` component — never into a step or
section file.
