<!--
  /styleguide — Living Styleguide des Ostsee-Tiere Design Systems

  Warum eine SvelteKit-Route und kein Storybook: Diese Seite läuft durch
  exakt dieselbe CSS-Pipeline wie die App (src/app.css als alleinige Quelle,
  siehe .claude/rules/daisyui.md). Was hier richtig aussieht, ist auch in der
  App richtig. Storybook bräuchte eine zweite Build-Pipeline und eine zweite
  Stelle, an der das Theme geladen wird — bei einem Projekt, dessen Regelwerk
  ausdrücklich EINE Quelle festlegt, ist das ein Risiko.

  Zweitzweck: Diese Seite ist die Prüffläche für e2e/design-tokens.spec.ts.
  Die Attribute data-token-surface / data-token-fg / data-token-icon sind
  Test-Verträge — nicht entfernen, nicht umbenennen.

  Drittzweck — und der Grund, warum die Listen unten ausgeschriebene
  Klassennamen tragen statt zusammengesetzter: Tailwind 4 scannt den Quelltext
  nach vollständigen Kandidaten-Strings (daisyui.md, „Klassennamen müssen
  vollständig im Quelltext stehen"). `bg-{token}` erzeugt deshalb nichts.
  Für die neun eigenen Utilities aus PR 1 ist diese Seite zugleich die einzige
  Aufrufstelle im Projekt — sie ist damit die Garantie, dass sie überhaupt im
  ausgelieferten CSS landen. Interpolation wäre hier doppelt falsch: die
  Farbfelder blieben ungestylt, und der Kontrast-Test würde statt Token gegen
  Token zwei identische Flächen messen und trivial bestehen.

  Nur in dev erreichbar (siehe +page.server.ts daneben).
-->
<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import StatusBlock from '$lib/components/StatusBlock.svelte';
	/* Importiert statt abgeschrieben: die Marker-Palette ist Datenkodierung mit
	   genau einer Quelle (design-system.md, „Randbereiche: wo Hex-Werte erlaubt
	   sind"). Eine zweite Liste hier hätte den Absatz darunter — der
	   styleUtils.ts als Quelle benennt — beim ersten Farbwechsel zur Lüge
	   gemacht. Das Emoji kommt aus derselben Struktur und ist der zweite,
	   redundante Kanal der Gruppe (UX-Review M1). */
	import { MARKER_BACKGROUND_COLOR, speciesGroupStyles } from '$lib/map/styleUtils';

	/* Jede Kombination einmal ausgeschrieben — siehe Kommentar oben. */
	const surfaces = [
		{ token: 'primary', bg: 'bg-primary', fg: 'text-primary-content' },
		{ token: 'secondary', bg: 'bg-secondary', fg: 'text-secondary-content' },
		{ token: 'accent', bg: 'bg-accent', fg: 'text-accent-content' },
		{ token: 'neutral', bg: 'bg-neutral', fg: 'text-neutral-content' },
		{ token: 'info', bg: 'bg-info', fg: 'text-info-content' },
		{ token: 'success', bg: 'bg-success', fg: 'text-success-content' },
		{ token: 'warning', bg: 'bg-warning', fg: 'text-warning-content' },
		{ token: 'error', bg: 'bg-error', fg: 'text-error-content' }
	] as const;

	const foregrounds = [
		{ token: 'info-strong', cls: 'text-info-strong' },
		{ token: 'success-strong', cls: 'text-success-strong' },
		{ token: 'warning-strong', cls: 'text-warning-strong' },
		{ token: 'secondary-strong', cls: 'text-secondary-strong' },
		{ token: 'accent-strong', cls: 'text-accent-strong' },
		{ token: 'error', cls: 'text-error' }
	] as const;

	/* base-300 fehlt bewusst: dort liegen alle -strong-Varianten bei ~3,77:1.
	   Das ist in design-system.md ein Verbot, kein Testfall. */
	const foregroundSurfaces = [
		{ token: 'base-100', bg: 'bg-base-100' },
		{ token: 'base-200', bg: 'bg-base-200' }
	] as const;

	const typeRoles = [
		{ token: 'display', cls: 'text-display', sample: 'Meerestier-Sichtung melden', px: '32px' },
		{ token: 'title', cls: 'text-title', sample: 'Position & Zeit', px: '24px' },
		{ token: 'section', cls: 'text-section', sample: 'Positionsangabe', px: '18px' },
		{ token: 'body', cls: 'text-body', sample: 'Wo haben Sie das Tier gesehen?', px: '16px' },
		{ token: 'label', cls: 'text-label', sample: 'Fahrwasser / Seegebiet', px: '14px' },
		{
			token: 'support',
			cls: 'text-support',
			sample: 'Auch ungefähre Angaben sind wertvoll.',
			px: '13px'
		}
	];

	const spacing = [
		{ token: 'space-1', px: 4, use: 'Icon zu Text' },
		{ token: 'space-2', px: 8, use: 'Label zu Feld' },
		{ token: 'space-3', px: 16, use: 'Feld zu Feld, Card-Innenrand mobil' },
		{ token: 'space-4', px: 24, use: 'Card-Innenrand Desktop, Gruppe zu Gruppe' },
		{ token: 'space-5', px: 32, use: 'Abschnitt zu Abschnitt' }
	];

	const layers = [
		{ token: 'layer-raised', value: 10, use: 'Feld-Icons, Karten-FAB' },
		{ token: 'layer-panel', value: 20, use: 'Karten-Panels, Bottom-Sheets' },
		{ token: 'layer-nav', value: 30, use: 'Navbar, Panel-Toggle' },
		{ token: 'layer-overlay', value: 40, use: 'Dropdown, Modal, Toast' },
		{ token: 'layer-skip', value: 50, use: 'Skip-Link' }
	];

	/* Vier Stufen, nicht drei: --motion-emphasis kam mit PR 1 dazu. */
	const motion = [
		{ token: 'motion-instant', ms: 120, ease: 'var(--motion-ease)', use: 'Hover, Fokus' },
		{ token: 'motion-quick', ms: 200, ease: 'var(--motion-ease)', use: 'Aufklappen, Toast' },
		{
			token: 'motion-panel',
			ms: 300,
			ease: 'var(--motion-ease)',
			use: 'Panel, Bottom-Sheet, Overlay'
		},
		{ token: 'motion-emphasis', ms: 400, ease: 'linear', use: 'Überschwung, Federung' }
	];

	let density = $state<'comfortable' | 'field'>('comfortable');

	/* Der Feldmodus hängt am <html>-Element, weil [data-density='field'] in
	   tokens.css dort greift. Die Aufräumfunktion ist deshalb nicht optional:
	   ohne sie bliebe der Modus beim Verlassen der Route in der ganzen App
	   aktiv — jede Schaltfläche 56px, jeder Hilfetext 14px, und kein
	   Bedienelement außerhalb dieser Seite, das ihn zurücknehmen könnte.

	   Geschrieben wird auch im Normalfall („comfortable"), obwohl kein Selektor
	   darauf matcht: das Attribut sagt damit „diese Seite hält die Dichte
	   gerade" statt nur „Feldmodus an". Solange es steht, ist die Seite
	   montiert — daran hängt auch der Hydrations-Check in
	   e2e/design-tokens.spec.ts, der sonst gegen einen noch toten Button
	   klicken würde. */
	$effect(() => {
		const root = document.documentElement;
		root.dataset.density = density;
		return () => {
			delete root.dataset.density;
		};
	});
</script>

<svelte:head>
	<title>Styleguide — Ostsee-Tiere</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="container mx-auto max-w-5xl p-6">
	<header class="mb-8">
		<h1 class="text-display mb-2 font-bold">Design System</h1>
		<p class="text-body text-base-content/70">
			Verbindliche Tokens und Komponenten. Regeln:
			<code class="text-support">.claude/rules/design-system.md</code>, Werte:
			<code class="text-support">docs/DESIGN_SYSTEM.md</code>, Begründung:
			<code class="text-support">docs/DESIGN_GUIDE.md</code>.
		</p>

		<div class="border-base-300 bg-base-200/50 mt-4 flex items-center gap-3 rounded-lg border p-4">
			<span class="text-label font-medium" id="sg-density-label">Dichte</span>
			<div class="join" role="group" aria-labelledby="sg-density-label">
				<button
					type="button"
					class="btn join-item {density === 'comfortable' ? 'btn-primary' : 'btn-outline'}"
					aria-pressed={density === 'comfortable'}
					onclick={() => (density = 'comfortable')}
				>
					Normal (44px)
				</button>
				<button
					type="button"
					class="btn join-item {density === 'field' ? 'btn-primary' : 'btn-outline'}"
					aria-pressed={density === 'field'}
					onclick={() => (density = 'field')}
				>
					Feldmodus (56px)
				</button>
			</div>
			<p class="text-support text-base-content/70">
				Feldmodus = Bedienung an Deck: nasse Finger, Handschuhe, schwankendes Boot.
			</p>
		</div>
	</header>

	<!-- ══ Farben: Flächen ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Farben — Flächen</h2>
		<p class="text-support text-base-content/70 mb-4">
			Vollton mit dem zugehörigen <code>*-content</code>. Nur hier ist
			<code>*-content</code> korrekt — auf einem Tint (<code>bg-…/10</code>) gehört
			<code>text-base-content</code> hin.
		</p>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each surfaces as surface (surface.token)}
				<div
					class="rounded-box flex h-24 flex-col justify-between p-3 {surface.bg} {surface.fg}"
					data-token-surface={surface.token}
				>
					<span class="text-label font-medium">{surface.token}</span>
					<span class="text-support opacity-90">Text auf Fläche</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- ══ Farben: Vordergrund ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Farben — Vordergrund</h2>
		<p class="text-support text-base-content/70 mb-4">
			Für Text, Icons und Zahlen gilt <code>*-strong</code>. Die Flächenfarbe erreicht als
			Vordergrund nur 1,55:1 bis 3,92:1. Keine dieser Farben darf auf
			<code>base-300</code> stehen (dort ~3,77:1) — dieselbe Grenze wie bei
			<code>error</code>.
		</p>
		<div class="grid gap-3 sm:grid-cols-2">
			{#each foregroundSurfaces as surface (surface.token)}
				<div class="rounded-box border-base-300 border p-4 {surface.bg}">
					<p class="text-support text-base-content/70 mb-3">auf <code>{surface.token}</code></p>
					{#each foregrounds as fg (fg.token)}
						<p class="text-label mb-2 flex items-center gap-2">
							<Icon
								icon="lucide:circle-alert"
								width="16"
								class={fg.cls}
								data-token-icon={surface.token === 'base-100' ? fg.token : undefined}
								aria-hidden="true"
							/>
							<span class="{fg.cls} font-medium" data-token-fg="{fg.token}-on-{surface.token}">
								{fg.cls}
							</span>
						</p>
					{/each}
					<p class="text-support text-base-content/60" data-token-fg="fg-subtle-on-{surface.token}">
						base-content/60 — Untergrenze für Text
					</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ══ Typografie ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Typografie</h2>
		<p class="text-support text-base-content/70 mb-4">
			Sechs Rollen. Die Rolle bestimmt die Größe — keine freien
			<code>text-xl</code>/<code>text-2xl</code>-Utilities für Fließtext oder Überschriften.
		</p>
		<div class="border-base-300 rounded-box divide-base-300 divide-y border">
			{#each typeRoles as role (role.token)}
				<div class="flex flex-wrap items-baseline gap-4 p-4">
					<code class="text-support text-base-content/60 w-32 shrink-0"
						>{role.token} · {role.px}</code
					>
					<span class={role.cls}>{role.sample}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- ══ Abstände ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Abstände</h2>
		<p class="text-support text-base-content/70 mb-4">4-px-Raster, fünf Stufen.</p>
		<div class="border-base-300 rounded-box divide-base-300 divide-y border">
			{#each spacing as step (step.token)}
				<div class="flex flex-wrap items-center gap-4 p-3">
					<code class="text-support text-base-content/60 w-32 shrink-0">
						{step.token} · {step.px}px
					</code>
					<span class="bg-primary h-4" style="width: {step.px}px"></span>
					<span class="text-support text-base-content/70">{step.use}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- ══ Elevation & Layer ══ -->
	<section class="mb-10 grid gap-6 md:grid-cols-2">
		<div>
			<h2 class="text-title mb-1 font-bold">Elevation</h2>
			<p class="text-support text-base-content/70 mb-4">
				Drei Stufen. Ersetzt <code>shadow-sm</code> bis <code>shadow-2xl</code>.
			</p>
			<div class="flex gap-3">
				<div class="rounded-box border-base-300 bg-base-100 flex-1 border p-4 text-center">
					<code class="text-support">flat</code>
				</div>
				<div class="rounded-box bg-base-100 shadow-raised flex-1 p-4 text-center">
					<code class="text-support">raised</code>
				</div>
				<div class="rounded-box bg-base-100 shadow-floating flex-1 p-4 text-center">
					<code class="text-support">floating</code>
				</div>
			</div>
		</div>
		<div>
			<h2 class="text-title mb-1 font-bold">Z-Index</h2>
			<p class="text-support text-base-content/70 mb-4">
				Fünf benannte Ebenen. Vorher lagen Navbar und Panel-Toggle beide auf 50.
			</p>
			<div class="border-base-300 rounded-box divide-base-300 divide-y border">
				{#each layers as layer (layer.token)}
					<div class="text-support flex items-center gap-3 p-2">
						<code class="text-base-content/60 w-32 shrink-0">{layer.token}</code>
						<code class="w-8">{layer.value}</code>
						<span class="text-base-content/70">{layer.use}</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ══ Motion ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Motion</h2>
		<p class="text-support text-base-content/70 mb-4">
			Vier Stufen. Die ersten drei beschreiben <strong>Übergänge</strong> und laufen mit
			<code>--motion-ease</code>. <code>--motion-emphasis</code> ist keine vierte Übergangsstufe,
			sondern die Dauer für betonte Bewegungen: die bringen ihre Kurve über die Keyframe-Stops mit (<code
				>bounceIn</code
			>: .3 → 1.05 → .9 → 1) und laufen deshalb <code>linear</code> — eine zweite Easing-Ebene würde
			jedes Segment einzeln biegen. Der
			<code>prefers-reduced-motion</code>-Block in <code>app.css</code> entschärft global; eigene Guards
			sind nicht nötig.
		</p>
		<div class="border-base-300 rounded-box divide-base-300 divide-y border">
			{#each motion as step (step.token)}
				<div class="flex flex-wrap items-center gap-4 p-3">
					<code class="text-support text-base-content/60 w-48 shrink-0">
						{step.token} · {step.ms}ms
					</code>
					<code class="text-support w-48 shrink-0">{step.ease}</code>
					<span class="text-support text-base-content/70">{step.use}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- ══ Buttons ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Button-Hierarchie</h2>
		<p class="text-support text-base-content/70 mb-4">
			Genau <strong>eine</strong> Primäraktion pro Bereich. Höhe kommt aus
			<code>--target-min</code> — <code>btn-sm</code> unterschreitet das nicht mehr.
		</p>
		<div class="flex flex-wrap items-center gap-3">
			<button type="button" class="btn btn-primary">Weiter →</button>
			<button type="button" class="btn btn-outline">← Zurück</button>
			<button type="button" class="btn btn-ghost">Aufklappen</button>
			<button type="button" class="btn btn-outline btn-error btn-sm">Formular zurücksetzen</button>
			<button type="button" class="btn btn-primary" disabled>Deaktiviert</button>
			<button type="button" class="btn btn-primary">
				<span class="loading loading-spinner loading-sm"></span>
				Wird gesendet …
			</button>
		</div>
	</section>

	<!-- ══ Alerts ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Alerts</h2>
		<p class="text-support text-base-content/70 mb-4">
			Soft-Style aus <code>app.css</code>. Der Text steht in <code>base-content</code> — die
			Bedeutung trägt das <strong>Icon</strong>. Ein Alert ohne Icon ist von den anderen Varianten
			nicht unterscheidbar.
		</p>
		<div class="space-y-3">
			<div class="alert alert-info" role="status">
				<Icon icon="lucide:info" class="shrink-0" aria-hidden="true" />
				<span>Die Datei wird direkt beim Auswählen übertragen.</span>
			</div>
			<div class="alert alert-success" role="status">
				<Icon icon="lucide:circle-check" class="shrink-0" aria-hidden="true" />
				<span>GPS-Position aus dem Foto übernommen.</span>
			</div>
			<div class="alert alert-warning" role="alert">
				<Icon icon="lucide:triangle-alert" class="shrink-0" aria-hidden="true" />
				<span>Die Koordinaten liegen außerhalb der Ostsee.</span>
			</div>
			<div class="alert alert-error" role="alert">
				<Icon icon="lucide:circle-alert" class="shrink-0" aria-hidden="true" />
				<span>Bitte beheben Sie die 2 Fehler in „Position &amp; Zeit".</span>
			</div>
		</div>
	</section>

	<!-- ══ StatusBlock ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">StatusBlock</h2>
		<p class="text-support text-base-content/70 mb-4">
			Inline-Statusfläche für jede Oberfläche, die Daten lädt — nie als Overlay, sondern an der
			Stelle, an der die Daten stünden. <code>loading</code> und <code>empty</code> tragen bewusst
			<strong>keine</strong>
			Statusfarbe: Ein Ladevorgang ist keine Warnung, ein Filter ohne Treffer kein Fehler.
			<code>role</code>
			ist <code>alert</code> nur bei <code>failed</code> — der Folge einer Nutzeraktion.
		</p>
		<div class="space-y-3">
			<StatusBlock variant="loading" title="Sichtungen werden geladen …" />
			<StatusBlock
				variant="empty"
				title="Keine Sichtungen in diesem Zeitraum"
				description="Für 2026 liegen zwischen 1. Mai und 3. Mai keine freigegebenen Meldungen vor."
				action={{ label: 'Zeitraum zurücksetzen', onClick: () => {}, icon: 'lucide:rotate-ccw' }}
			/>
			<StatusBlock
				variant="partial"
				title="Wetterdaten aus dem Zwischenspeicher"
				description="Der Wetterdienst antwortet gerade nicht. Angezeigt werden die zuletzt abgerufenen Werte."
			/>
			<StatusBlock
				variant="failed"
				title="Statistiken konnten nicht geladen werden"
				description="Das Formular funktioniert vollständig — nur die Zahlen in diesem Hilfetext fehlen."
			/>
			<StatusBlock
				variant="offline"
				title="Kartenmaterial braucht eine Verbindung"
				description="Bereits geladene Kacheln bleiben sichtbar. Neue Bereiche erscheinen, sobald Sie wieder online sind."
				action={{ label: 'Erneut versuchen', onClick: () => {} }}
			/>
		</div>
	</section>

	<!-- ══ Formularfelder ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Formularfelder</h2>
		<p class="text-support text-base-content/70 mb-4">
			Alle Felder laufen über <code>FormField → FieldRenderer</code>. Label, ARIA,
			Pflicht-Markierung und Fehlerblock entstehen dort — nicht an der Aufrufstelle. Die Zustände
			hier sind nur Darstellung.
		</p>
		<div class="grid gap-4 md:grid-cols-2">
			<div class="fieldset w-full">
				<label class="label w-full pb-1" for="sg-default">
					<span class="text-label font-medium">Ruhezustand</span>
				</label>
				<input id="sg-default" type="text" class="input w-full" placeholder="z. B. Kadetrinne" />
				<div class="mt-1">
					<span class="text-support text-base-content/70">Hilfetext auf /70, 13px.</span>
				</div>
			</div>
			<div class="fieldset w-full">
				<label class="label w-full pb-1" for="sg-required">
					<span class="text-label font-medium">
						Pflichtfeld
						<span class="text-error ml-1" aria-label="Pflichtfeld">*</span>
					</span>
				</label>
				<input id="sg-required" type="text" class="input w-full" required aria-required="true" />
			</div>
			<div class="fieldset w-full">
				<label class="label w-full pb-1" for="sg-valid">
					<span class="text-label font-medium">
						Gültig (berührt)
						<Icon
							icon="lucide:check"
							width="14"
							class="text-success-strong ml-2 inline"
							aria-hidden="true"
						/>
					</span>
				</label>
				<input
					id="sg-valid"
					type="text"
					class="input input-success w-full"
					value="Greifswalder Bodden"
				/>
			</div>
			<div class="fieldset w-full">
				<label class="label w-full pb-1" for="sg-error">
					<span class="text-label font-medium">
						Fehlerhaft
						<Icon icon="lucide:x" width="14" class="text-error ml-2 inline" aria-hidden="true" />
					</span>
				</label>
				<input
					id="sg-error"
					type="text"
					class="input input-error w-full"
					aria-invalid="true"
					aria-describedby="sg-error-msg"
				/>
				<div id="sg-error-msg" class="mt-1" role="alert" aria-live="polite">
					<span class="text-error text-support flex items-center gap-1 font-medium">
						<Icon icon="lucide:triangle-alert" width="14" class="shrink-0" aria-hidden="true" />
						Bitte geben Sie ein Fahrwasser an.
					</span>
				</div>
			</div>
		</div>

		<!-- Das Muster aus PR 1: das Ziel ist das Label, nicht das Control. -->
		<h3 class="text-section mt-6 mb-1 font-semibold">Ankreuzfelder — das Ziel trägt das Label</h3>
		<p class="text-support text-base-content/70 mb-3">
			WCAG 2.5.5 verlangt ein <strong>Ziel</strong> von 44px, kein Bedienelement dieser Größe. Die
			Mindesthöhe sitzt deshalb am umschließenden <code>&lt;label&gt;</code> (Regel
			<code>label:has(&gt; .checkbox)</code> in <code>app.css</code>), das Control bleibt auf
			<code>--control-size</code> = 28px. Im Feldmodus wächst nur das Label auf 56px — oben
			umschalten und nachmessen. <code>min-height</code> auf
			<code>.checkbox</code>/<code>.radio</code>/<code>.toggle</code> wäre der falsche Hebel:
			DaisyUI legt dort <code>width</code> und <code>height</code> fest, eine Mindesthöhe streckt sie
			nur (gemessen: Radio 24×44 als Ellipse).
		</p>
		<!-- gap-3 ist --target-gap (16px): der Mindestabstand zwischen zwei Zielen. -->
		<fieldset class="border-base-300 rounded-box flex flex-col gap-3 border p-4">
			<legend class="text-label px-2 font-medium">Veröffentlichung</legend>
			<label class="label cursor-pointer justify-start gap-3" data-token-target="checkbox">
				<input type="checkbox" class="checkbox" checked />
				<span class="text-label">Meinen Namen veröffentlichen</span>
			</label>
			<label class="label cursor-pointer justify-start gap-3" data-token-target="toggle">
				<input type="checkbox" class="toggle" />
				<span class="text-label">Kontaktdaten dauerhaft speichern</span>
			</label>
			<label class="label cursor-pointer justify-start gap-3" data-token-target="radio">
				<input type="radio" name="sg-radio" class="radio" checked />
				<span class="text-label">Schiffsname veröffentlichen</span>
			</label>
		</fieldset>
	</section>

	<!-- ══ Badges ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Badges</h2>
		<p class="text-support text-base-content/70 mb-4">
			Kein <code>badge-xs</code>: Badges sind Beschriftung, keine Ziele — aber unter 13px sind sie
			im Feld nicht lesbar.
		</p>
		<div class="flex flex-wrap items-center gap-2">
			<span class="badge badge-primary">Schweinswal</span>
			<span class="badge badge-outline badge-primary">Schritt 1 von 4</span>
			<span class="badge badge-success">Ostsee</span>
			<span class="badge badge-warning">Außerhalb</span>
			<span class="badge badge-info">aus Cache</span>
			<span class="badge badge-secondary">Kamera</span>
		</div>
	</section>

	<!-- ══ Abschnitts-Muster ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Abschnitt (SectionCard)</h2>
		<p class="text-support text-base-content/70 mb-4">
			Eine Komponente, zwei Varianten. Vorher lösten <code>SectionCard.svelte</code> und die
			Inline-Boxen in <code>PositionAndTime.svelte</code> dieselbe Aufgabe unterschiedlich.
		</p>
		<div class="grid gap-4 md:grid-cols-2">
			<div class="card bg-base-200 shadow-raised">
				<div class="card-body">
					<h3 class="card-title text-section flex items-center gap-2">
						<Icon icon="lucide:map-pin" width="20" class="text-primary" aria-hidden="true" />
						variant="card"
					</h3>
					<p class="text-support text-base-content/70">Eigenständiger Abschnitt auf Seitenebene.</p>
				</div>
			</div>
			<div class="border-base-300 bg-base-200/50 rounded-box border p-4">
				<h3 class="text-section mb-2 flex items-center gap-2 font-semibold">
					<Icon icon="lucide:calendar" width="20" class="text-primary" aria-hidden="true" />
					variant="inset"
				</h3>
				<p class="text-support text-base-content/70">
					Untergeordneter Block innerhalb eines Schritts.
				</p>
			</div>
		</div>
	</section>

	<!-- ══ Karten-Palette ══ -->
	<section class="mb-10">
		<h2 class="text-title mb-1 font-bold">Karten-Palette</h2>
		<p class="text-support text-base-content/70 mb-4">
			Wong-Palette aus <code>src/lib/map/styleUtils.ts</code> — farbfehlsichtigkeits-sicher. Diese
			Farben sind <strong>Datenkodierung</strong> und bewegen sich bewusst nicht mit dem Theme. Sie
			sind der einzige Ort neben <code>mapTokens.ts</code> und <code>emailTokens.ts</code>, an dem
			Hex-Werte zulässig sind.
		</p>
		<div class="flex flex-wrap gap-3">
			{#each Object.entries(speciesGroupStyles) as [category, group] (category)}
				<div class="border-base-300 rounded-box flex items-center gap-2 border p-3">
					<span
						class="inline-block h-5 w-5 rounded-full border-2"
						style="background: {group.color}; border-color: {MARKER_BACKGROUND_COLOR}"
					></span>
					<span aria-hidden="true">{group.symbol}</span>
					<span class="text-label">{group.label}</span>
					<code class="text-support text-base-content/60">{group.color}</code>
				</div>
			{/each}
		</div>
	</section>
</div>
