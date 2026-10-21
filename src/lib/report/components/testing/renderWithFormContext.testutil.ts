import { render } from 'vitest-browser-svelte';
import type { ComponentOptions } from 'vitest-browser-svelte/pure';
import type { Component } from 'svelte';
import { createForm } from '#lib/form/createForm.ts';
import { initialFormState } from '#lib/report/formConfig.ts';
import { key as formContextKey } from '#lib/report/formContext.ts';
import type { MediaStore } from '#lib/utils/media/MediaFile.svelte.ts';
import type { FormContext, SightingFormData } from '#lib/types/index.ts';

export interface FormContextRenderOptions<P extends Record<string, unknown>> {
	/** Startwerte, die `initialFormState` überschreiben. */
	overrides?: Partial<SightingFormData>;
	/**
	 * Props der Komponente. Sobald ein Context mitgegeben wird, verlangt die
	 * Render-API sie unter dem `props`-Schlüssel — sonst gelten sie als
	 * unbekannte Svelte-Optionen.
	 */
	props?: NoInfer<P>;
	/**
	 * Vorbefüllter Medien-Store. Default ist ein leerer — wer den Store nach dem
	 * Rendern prüft, gibt ihn hier mit und behält so die Referenz darauf.
	 */
	mediaStore?: MediaStore;
}

/**
 * Rendert eine Formular-Komponente mit dem Context, den sonst `Form.svelte`
 * aufbaut (`createForm` + `mediaStore`, siehe `.claude/rules/forms.md`).
 *
 * Jede Komponente unterhalb von `Form.svelte` braucht ihn: `FormField` wirft
 * ohne Context beim ersten Feld, auch wenn der Test etwas ganz anderes prüft.
 * Vorher stand dieser Aufbau in elf Testdateien wörtlich gleich.
 *
 * **Der Context selbst wird ohne Cast gebaut.** `FormContext` ist
 * `FormApi<SightingFormData>` plus `mediaStore`, und `MediaStore` ist
 * `{ mediaFiles: MediaFile[] }` — ein leerer Store erfüllt den Typ wirklich und
 * wird nicht per `as unknown as` dazu erklärt. Fehlte dem Objekt hier etwas,
 * fiele das jetzt auf, statt vom Cast verdeckt zu werden.
 *
 * **Props werden geprüft, anders als bei `render` selbst.** Dessen
 * Komponenten-Parameter ist ein bedingter Typ (`ComponentImport<C>`), aus dem
 * `C` nicht inferiert werden kann — der Generic fällt auf seine Schranke und
 * damit auf `any`. Hier bindet `component: Component<P>` das `P` direkt an die
 * Komponente; ein Tippfehler im Prop-Namen fällt deshalb auf. Das `NoInfer` an
 * `props` ist dafür nachweislich nicht nötig (ohne es meldet `svelte-check`
 * denselben Fehler an derselben Stelle) und steht nur als Absicherung da, damit
 * das übergebene Objekt `P` nie mitbestimmen kann.
 *
 * Zurück kommt der gebaute Context, damit ein Test nach dem Rendern an `form`
 * oder `mediaStore` kommt. Die meisten Aufrufstellen ignorieren ihn.
 */
export function renderWithFormContext<P extends Record<string, unknown>>(
	component: Component<P>,
	{ overrides = {}, props, mediaStore = { mediaFiles: [] } }: FormContextRenderOptions<P> = {}
): FormContext {
	const formContext: FormContext = {
		...createForm<SightingFormData>({
			// Der Spread mit `Partial<…>` weitet jedes überschriebene Feld um
			// `undefined`; der Cast betrifft nur die Startwerte, nicht den Context.
			initialValues: { ...initialFormState, ...overrides } as SightingFormData,
			onSubmit: () => undefined
		}),
		mediaStore
	};

	const context = new Map([[formContextKey, formContext]]);
	const options = props === undefined ? { context } : { props, context };

	// Der eine verbliebene Cast. `ComponentOptions<Component<P>>` löst sich mit
	// generischem `P` nicht auf (es steckt ein `Parameters<typeof mount<…>>`
	// darin), TypeScript kann das Optionen-Objekt deshalb gegen nichts prüfen.
	// Betroffen ist nur die Render-API — Context und Props sind oben typisiert.
	render(component, options as ComponentOptions<Component<P>>);

	return formContext;
}
