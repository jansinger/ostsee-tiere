import { render } from 'vitest-browser-svelte';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { page } from 'vitest/browser';
import UnifiedDropzone from './UnifiedDropzone.svelte';
import type { ValidationPreset } from '#lib/types/index.ts';

vi.mock('#lib/stores/toastState.svelte.ts', () => ({
	createToast: vi.fn()
}));

vi.mock('#lib/utils/index.ts', () => ({
	validateFiles: vi.fn()
}));

import { createToast } from '#lib/stores/toastState.svelte.ts';
import { validateFiles } from '#lib/utils/index.ts';

const mockConfig: ValidationPreset = {
	allowedTypes: ['image/jpeg', 'image/png'],
	maxFileSize: 10 * 1024 * 1024,
	maxVideoFileSize: 10 * 1024 * 1024,
	maxFiles: 5,
	accept: 'image/jpeg,image/png'
};

function makeFile(name = 'test.jpg', type = 'image/jpeg', size = 1024): File {
	return new File(['x'.repeat(size)], name, { type });
}

beforeEach(async () => {
	vi.clearAllMocks();
	vi.mocked(validateFiles).mockImplementation((files) => ({
		isValid: true,
		validFiles: files,
		errors: []
	}));
});

describe('UnifiedDropzone', () => {
	describe('rendering', () => {
		it('zeigt Titel und Hinweistexte an', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Fotos hochladen',
				emptyText: 'Klicken oder ziehen'
			});

			await expect.element(page.getByText('Fotos hochladen')).toBeVisible();
			await expect.element(page.getByText('Klicken oder ziehen')).toBeVisible();
		});

		it('zeigt aria-label mit Titel an', async () => {
			await render(UnifiedDropzone, { config: mockConfig, title: 'Bilder' });

			await expect
				.element(page.getByRole('button', { name: /Bilder per Drag & Drop oder Klick/i }))
				.toBeVisible();
		});

		it('zeigt additionalText mit Bindestrich an', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				subtitle: 'JPEG, PNG',
				additionalText: 'Max 10MB'
			});

			await expect.element(page.getByText(/JPEG, PNG - Max 10MB/)).toBeVisible();
		});

		it('zeigt nur subtitle ohne Bindestrich wenn additionalText leer', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				subtitle: 'JPEG only',
				additionalText: ''
			});

			await expect.element(page.getByText('JPEG only')).toBeVisible();
		});
	});

	describe('Ladezustand', () => {
		it('zeigt loadingText wenn isAnalyzing=true', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				isAnalyzing: true,
				loadingText: 'Lade hoch...'
			});

			await expect.element(page.getByText('Lade hoch...')).toBeVisible();
		});

		it('versteckt Titel wenn isAnalyzing=true', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'NurDieserTitel',
				isAnalyzing: true
			});

			await expect.element(page.getByText('NurDieserTitel')).not.toBeInTheDocument();
		});

		it('zeigt Titel wenn isAnalyzing=false', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Dateien hochladen',
				isAnalyzing: false
			});

			await expect.element(page.getByText('Dateien hochladen')).toBeVisible();
		});
	});

	describe('Dateiauswahl', () => {
		it('ruft onFilesAdded mit validen Dateien auf', async () => {
			const onFilesAdded = vi.fn();
			const file = makeFile('foto.jpg');
			vi.mocked(validateFiles).mockReturnValueOnce({
				isValid: true,
				validFiles: [file],
				errors: []
			});

			await render(UnifiedDropzone, { config: mockConfig, onFilesAdded });

			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			expect(fileInput).not.toBeNull();

			Object.defineProperty(fileInput, 'files', { value: [file], writable: false });
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));

			await vi.waitFor(() => {
				expect(onFilesAdded).toHaveBeenCalledWith([file]);
			});
		});

		it('zeigt Toast bei Validierungsfehlern', async () => {
			const badFile = makeFile('bad.exe', 'application/x-msdownload');
			vi.mocked(validateFiles).mockReturnValueOnce({
				isValid: false,
				validFiles: [],
				errors: ['Ungültiger Dateityp: bad.exe']
			});

			await render(UnifiedDropzone, { config: mockConfig });

			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			Object.defineProperty(fileInput, 'files', { value: [badFile], writable: false });
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));

			await vi.waitFor(() => {
				expect(createToast).toHaveBeenCalledWith('error', 'Ungültiger Dateityp: bad.exe');
			});
		});

		it('ruft onFilesAdded nicht auf wenn alle Dateien ungültig sind', async () => {
			const onFilesAdded = vi.fn();
			vi.mocked(validateFiles).mockReturnValueOnce({
				isValid: false,
				validFiles: [],
				errors: ['Fehler']
			});

			await render(UnifiedDropzone, { config: mockConfig, onFilesAdded });

			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			Object.defineProperty(fileInput, 'files', { value: [makeFile()], writable: false });
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));

			await vi.waitFor(() => {
				expect(onFilesAdded).not.toHaveBeenCalled();
			});
		});
	});

	describe('multiple=false', () => {
		it('hat kein multiple-Attribut am Input', async () => {
			await render(UnifiedDropzone, { config: mockConfig, multiple: false });
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			expect(fileInput.multiple).toBe(false);
		});

		it('hat multiple-Attribut am Input bei multiple=true', async () => {
			await render(UnifiedDropzone, { config: mockConfig, multiple: true });
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			expect(fileInput.multiple).toBe(true);
		});
	});

	describe('accept-Attribut (Befund I3)', () => {
		it('übernimmt config.accept statt es aus allowedTypes neu zu berechnen', async () => {
			// config.accept kommt vom Server (gruppiert zu image/*,video/*) und ist
			// bewusst NICHT identisch mit allowedTypes.join(',') — nur so zeigt der
			// Test, dass die Komponente das Feld tatsächlich liest statt es zu
			// ignorieren und selbst aus allowedTypes zu bauen.
			const configWithGroupedAccept: ValidationPreset = {
				allowedTypes: ['image/jpeg', 'image/png', 'video/mp4'],
				maxFileSize: 10 * 1024 * 1024,
				maxVideoFileSize: 100 * 1024 * 1024,
				maxFiles: 5,
				accept: 'image/*,video/*'
			};

			await render(UnifiedDropzone, { config: configWithGroupedAccept });

			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			expect(fileInput.accept).toBe('image/*,video/*');
		});
	});

	describe('Datei-Vorschau', () => {
		it('zeigt Vorschau-Bereich wenn Dateien vorhanden', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('bild.jpg')],
				showPreview: true
			});

			await expect.element(page.getByText('1 Datei hochgeladen')).toBeVisible();
		});

		it('zeigt Plural bei mehreren Dateien', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('a.jpg'), makeFile('b.jpg')],
				showPreview: true
			});

			await expect.element(page.getByText('2 Dateien hochgeladen')).toBeVisible();
		});

		/**
		 * Muster B (i18n Etappe 2, Aufgabe 2.4): der Plural war vorher deutsche
		 * Grammatik im Markup ({files.length !== 1 ? 'en' : ''}) — bei 1 Datei
		 * zufällig richtig, in jeder anderen Sprache falsch, weil "one"/"other"
		 * nicht an der deutschen Endung "-en" hängt. Ersetzt durch eine
		 * ICU-Plural-Botschaft (`Intl.PluralRules` über `registry.plural`).
		 * Diese Suite belegt beide Zahlen (1 und 2) UND beide Sprachen positiv —
		 * nicht nur, dass sich der Text von 1 zu 2 ändert, sondern welcher Text
		 * jeweils in welcher Sprache steht.
		 */
		describe('Plural folgt der Locale (Muster B)', () => {
			afterEach(async () => {
				const { overwriteGetLocale, baseLocale } = await import('#lib/paraglide/runtime.js');
				overwriteGetLocale(() => baseLocale);
			});

			it('zeigt den deutschen Singular bei 1 Datei', async () => {
				const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
				overwriteGetLocale(() => 'de');

				await render(UnifiedDropzone, {
					config: mockConfig,
					files: [makeFile('a.jpg')],
					showPreview: true
				});

				await expect.element(page.getByText('1 Datei hochgeladen')).toBeVisible();
			});

			it('zeigt den deutschen Plural bei 2 Dateien', async () => {
				const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
				overwriteGetLocale(() => 'de');

				await render(UnifiedDropzone, {
					config: mockConfig,
					files: [makeFile('a.jpg'), makeFile('b.jpg')],
					showPreview: true
				});

				await expect.element(page.getByText('2 Dateien hochgeladen')).toBeVisible();
			});

			it('zeigt den englischen Singular bei 1 Datei', async () => {
				const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
				overwriteGetLocale(() => 'en');

				await render(UnifiedDropzone, {
					config: mockConfig,
					files: [makeFile('a.jpg')],
					showPreview: true
				});

				await expect.element(page.getByText('1 file uploaded')).toBeVisible();
			});

			it('zeigt den englischen Plural bei 2 Dateien', async () => {
				const { overwriteGetLocale } = await import('#lib/paraglide/runtime.js');
				overwriteGetLocale(() => 'en');

				await render(UnifiedDropzone, {
					config: mockConfig,
					files: [makeFile('a.jpg'), makeFile('b.jpg')],
					showPreview: true
				});

				await expect.element(page.getByText('2 files uploaded')).toBeVisible();
			});
		});

		it('versteckt Vorschau wenn showPreview=false', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('a.jpg')],
				showPreview: false
			});

			await expect.element(page.getByText('1 Datei hochgeladen')).not.toBeInTheDocument();
		});

		it('zeigt Dateinamen in der Vorschau', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('meinbild.jpg')],
				showPreview: true
			});

			await expect.element(page.getByText('meinbild.jpg')).toBeVisible();
		});
	});

	describe('Datei entfernen', () => {
		it('ruft onFileRemoved mit Dateinamen auf', async () => {
			const onFileRemoved = vi.fn();
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('foto.jpg')],
				showPreview: true,
				onFileRemoved
			});

			await page.getByRole('button', { name: 'Datei entfernen' }).click();

			await vi.waitFor(() => {
				expect(onFileRemoved).toHaveBeenCalledWith('foto.jpg');
			});
		});
	});

	describe('Alle löschen', () => {
		it('zeigt "Alle löschen"-Button bei multiple=true', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('a.jpg'), makeFile('b.jpg')],
				showPreview: true,
				multiple: true
			});

			await expect.element(page.getByRole('button', { name: 'Alle löschen' })).toBeVisible();
		});

		it('versteckt "Alle löschen"-Button bei multiple=false', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('a.jpg')],
				showPreview: true,
				multiple: false
			});

			await expect
				.element(page.getByRole('button', { name: 'Alle löschen' }))
				.not.toBeInTheDocument();
		});

		it('ruft onClear auf', async () => {
			const onClear = vi.fn();
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('a.jpg'), makeFile('b.jpg')],
				showPreview: true,
				multiple: true,
				onClear
			});

			await page.getByRole('button', { name: 'Alle löschen' }).click();

			await vi.waitFor(() => {
				expect(onClear).toHaveBeenCalledOnce();
			});
		});
	});

	describe('Tastaturzugänglichkeit', () => {
		it('öffnet Dateidialog bei Enter-Taste', async () => {
			await render(UnifiedDropzone, { config: mockConfig });

			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			const clickSpy = vi.spyOn(fileInput, 'click');

			const el = document.querySelector('[role="button"][tabindex="0"]') as HTMLElement;
			el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

			await vi.waitFor(() => {
				expect(clickSpy).toHaveBeenCalled();
			});
		});

		it('öffnet Dateidialog bei Leertaste', async () => {
			await render(UnifiedDropzone, { config: mockConfig });

			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			const clickSpy = vi.spyOn(fileInput, 'click');

			const el = document.querySelector('[role="button"][tabindex="0"]') as HTMLElement;
			el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

			await vi.waitFor(() => {
				expect(clickSpy).toHaveBeenCalled();
			});
		});

		it('hat tabindex=0 für Keyboard-Navigation', async () => {
			await render(UnifiedDropzone, { config: mockConfig });
			const el = document.querySelector('[role="button"][tabindex="0"]');
			expect(el).not.toBeNull();
		});
	});

	describe('Drag & Drop', () => {
		it('akzeptiert Dateien per Drop', async () => {
			const onFilesAdded = vi.fn();
			const file = makeFile('dropped.jpg');
			vi.mocked(validateFiles).mockReturnValueOnce({
				isValid: true,
				validFiles: [file],
				errors: []
			});

			await render(UnifiedDropzone, { config: mockConfig, onFilesAdded });

			const dropzone = document.querySelector('[role="button"][tabindex="0"]') as HTMLElement;
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);

			dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));

			await vi.waitFor(() => {
				expect(onFilesAdded).toHaveBeenCalledWith([file]);
			});
		});

		/**
		 * `dragleave` feuert auch dann, wenn der Zeiger die Fläche gar nicht
		 * verlässt, sondern nur auf eines ihrer Kinder wechselt — und die Kinder
		 * sind hier die Textzeilen im unteren Teil der Fläche. Mit einem bloßen
		 * `isDragOver = false` schaltete die Rückmeldung deshalb bei jeder Bewegung
		 * über diesen Zeilen an und aus; wer eine Datei von unten heranzog, sah ein
		 * Flackern und traf den unteren Bereich praktisch nicht.
		 */
		it('bleibt bereit, wenn der Zeiger von der Fläche auf eine ihrer Textzeilen wechselt', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Foto hochladen',
				multiple: false
			});

			const zone = document.querySelector<HTMLElement>('.border-dashed');
			if (!zone) throw new Error('Dropzone-Fläche nicht im DOM');
			zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true }));
			await expect.element(page.getByText('Datei hier ablegen!')).toBeVisible();

			// Zeiger wandert auf ein Kind: dessen `dragenter` bubbelt zur Fläche, und
			// die Fläche bekommt zusätzlich ihr eigenes `dragleave`.
			const line = zone.querySelector('p');
			if (!line) throw new Error('Textzeile nicht im DOM');
			line.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true }));
			zone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: line }));

			await expect.element(page.getByText('Datei hier ablegen!')).toBeVisible();
		});

		it('gibt die Fläche wieder frei, wenn der Zeiger sie wirklich verlässt', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Foto hochladen',
				multiple: false
			});

			const zone = document.querySelector<HTMLElement>('.border-dashed');
			if (!zone) throw new Error('Dropzone-Fläche nicht im DOM');
			zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true }));
			await expect.element(page.getByText('Datei hier ablegen!')).toBeVisible();

			zone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: null }));

			await expect.element(page.getByText('Datei hier ablegen!')).not.toBeInTheDocument();
		});

		/**
		 * Die Fläche darf unter dem Zeiger nicht wachsen. Sie tat es zweifach: In
		 * der dichten Variante kam die Zeile „Datei hier ablegen!" beim Ziehen als
		 * ZUSÄTZLICHE Zeile dazu, und `scale-[1.02]` verschob zusätzlich beide
		 * Kanten. Wer von unten heranzog, verlor das Ziel dadurch wieder unter dem
		 * Zeiger, sobald es einmal ansprang.
		 */
		it('meldet die Ablage-Bereitschaft, ohne die Fläche zu vergrößern', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Foto hochladen',
				actionLabel: 'Foto auswählen',
				multiple: false,
				compact: true
			});
			await expect.element(page.getByRole('button', { name: 'Foto auswählen' })).toBeVisible();

			const zone = document.querySelector<HTMLElement>('.border-dashed');
			if (!zone) throw new Error('Dropzone-Fläche nicht im DOM');
			const heightBefore = zone.getBoundingClientRect().height;

			zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true }));
			await expect.element(page.getByText('Datei hier ablegen!')).toBeVisible();

			expect(zone.getBoundingClientRect().height).toBe(heightBefore);
			// Der Transform ist im Test-DOM nicht messbar (kein app.css, siehe
			// „Vorschau-Buttons"), die Klasse ist aber der Mechanismus dahinter.
			expect(zone.className).not.toMatch(/\bscale-/);
		});
	});

	/**
	 * Die Vorschau ist in der App derzeit nicht erreichbar: einziger Consumer ist
	 * `DropzoneEnhanced.svelte`, und der setzt `showPreview={false}`. Der Default
	 * der Prop ist aber `true` — der nächste Consumer, der sie weglässt, bekäme
	 * die Buttons sofort zu sehen. Deshalb gelten hier dieselben Regeln wie
	 * nebenan in `DropzoneEnhanced`: 44 px Touch-Target
	 * (`design-system.md`) und ausschließlich Theme-Tokens, kein `text-white`
	 * (`daisyui.md`).
	 */
	describe('Vorschau-Buttons — A11y und Theme-Tokens', () => {
		/**
		 * Geprüft werden die Klassen, nicht die gerenderte Pixelhöhe: Das
		 * Browser-Test-Setup lädt `src/app.css` nicht, es gibt im Test-DOM also
		 * weder Tailwind- noch DaisyUI-Regeln — ein `getBoundingClientRect()`
		 * misst hier die ungestylte Button-Höhe (21 px) und wäre aussagelos.
		 * Die tatsächliche Pixelgröße im gebauten CSS deckt der E2E-Test
		 * „Accessibility — Touch-Targets der Hinweis-Buttons" ab.
		 */
		it('Entfernen- und "Alle löschen"-Button tragen die 44-px-Klassen', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('a.jpg'), makeFile('b.jpg')],
				showPreview: true,
				multiple: true
			});

			const buttons = [
				page.getByRole('button', { name: 'Alle löschen' }),
				page.getByRole('button', { name: 'Datei entfernen' }).first()
			];

			for (const button of buttons) {
				await expect.element(button).toBeVisible();
				const className = (button.element() as HTMLElement).className;
				expect(className, `unerwartete Größenklasse: ${className}`).toContain('min-h-11');
				expect(className, `btn-xs unterschreitet 44 px: ${className}`).not.toContain('btn-xs');
			}
		});

		it('verwendet keine rohen Farbklassen ausserhalb des Themes', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				files: [makeFile('a.jpg')],
				showPreview: true,
				multiple: true
			});

			await expect.element(page.getByRole('button', { name: 'Alle löschen' })).toBeVisible();

			const rawColorClasses = Array.from(document.querySelectorAll<HTMLElement>('button'))
				.map((button) => button.className)
				.filter((className) => /(^|:)text-white\b|(^|:)bg-white\b|-gray-\d/.test(className));

			expect(rawColorClasses).toEqual([]);
		});
	});

	/**
	 * `compact` ist die Variante für eine Dropzone, die bereits eine Überschrift
	 * über sich hat — im Sichtungsformular die Hero-Karte „Foto mit GPS
	 * hochladen" auf Schritt 1. Dort standen drei Beschriftungen derselben
	 * Handlung übereinander (Karten-Überschrift, Dropzone-Titel, Button), und die
	 * Fläche kostete 212 px, bevor die Karte überhaupt begann.
	 *
	 * Weggelassen werden darf der Titel deshalb nur, wenn ein `actionLabel` den
	 * zugänglichen Namen trägt. Ohne Button IST der Titel der Name der Fläche
	 * (`zoneTriggerAttributes`) — ihn dort zu entfernen ließe ein Bedienelement
	 * ohne Beschriftung zurück.
	 */
	describe('compact', () => {
		it('lässt Titelzeile und dekoratives Icon weg, wenn ein Button die Beschriftung trägt', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Foto hochladen',
				actionLabel: 'Foto auswählen',
				compact: true
			});

			await expect.element(page.getByRole('button', { name: 'Foto auswählen' })).toBeVisible();
			expect(document.body.textContent).not.toContain('Foto hochladen');
		});

		it('behält die Titelzeile ohne actionLabel — sie ist dann der Name der Fläche', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Foto hochladen',
				compact: true
			});

			await expect
				.element(page.getByRole('button', { name: /Foto hochladen per Drag & Drop oder Klick/i }))
				.toBeVisible();
			expect(document.body.textContent).toContain('Foto hochladen');
		});

		it('zeigt die Titelzeile in der Standardvariante weiterhin an', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Foto hochladen',
				actionLabel: 'Foto auswählen'
			});

			await expect.element(page.getByText('Foto hochladen')).toBeVisible();
		});

		it('meldet die Ablage-Bereitschaft trotz fehlender Titelzeile', async () => {
			// Der Rahmenwechsel allein sagt nicht, dass jetzt losgelassen werden darf.
			// Die Zeile ist im Ruhezustand weg, beim Ziehen aber wieder da.
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Foto hochladen',
				actionLabel: 'Foto auswählen',
				multiple: false,
				compact: true
			});

			await expect.element(page.getByRole('button', { name: 'Foto auswählen' })).toBeVisible();

			const zone = document.querySelector<HTMLElement>('.border-dashed');
			if (!zone) throw new Error('Dropzone-Fläche nicht im DOM');
			zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));

			await expect.element(page.getByText('Datei hier ablegen!')).toBeVisible();
		});

		it('nimmt der Fläche Innenabstand', async () => {
			await render(UnifiedDropzone, {
				config: mockConfig,
				title: 'Foto hochladen',
				actionLabel: 'Foto auswählen',
				compact: true
			});

			await expect.element(page.getByRole('button', { name: 'Foto auswählen' })).toBeVisible();

			const zone = document.querySelector<HTMLElement>('.border-dashed');
			if (!zone) throw new Error('Dropzone-Fläche nicht im DOM');
			expect(zone.className).toContain('p-4');
			expect(zone.className).not.toContain('p-6');
		});
	});
});
