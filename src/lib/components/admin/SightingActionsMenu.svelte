<!--
	Overflow-Menü der seltenen Zeilen-Aktionen: Spam-Check, Test-Mail (nur
	Superadmin), Löschen. Sichtbar an der Zeile bleiben nur Ansehen und der
	Statuswechsel — die täglichen Aktionen (Entscheidung Jan, 2026-08-10, nach
	dem UX-Review). Vorher trug jede der 50 Zeilen einen rot umrandeten
	Löschen-Button; die kanonische destruktive Variante machte damit die
	seltenste und gefährlichste Aktion zum auffälligsten Element der Tabelle
	und lag direkt neben dem täglich benutzten Status-Control.

	Eine Komponente für Tabelle UND Kartenansicht: gleiche Aktion = gleiche
	Variante = gleiches Icon (Button-Hierarchie), und der Wortlaut der
	Einträge existiert nur einmal.

	Popover-API statt `details.dropdown` (DaisyUI-5-Methode 2): Das Menü
	rendert im Top-Layer. In der Tabelle sitzt der Auslöser in der fixierten
	Aktionsspalte innerhalb des `overflow-x-auto`-Containers — ein
	`dropdown-content` mit `position: absolute` würde dort vom Scroll-Container
	geklippt bzw. zöge Scrollbalken in die Tabelle. Der Top-Layer braucht
	zudem kein `z-*`-Token. Browser ohne CSS-Anchor-Positioning zeigen das
	Menü zentriert statt am Auslöser — bedienbar bleibt es auch dort.

	`menuId` muss dokumentweit eindeutig sein: Tabelle und Kartenansicht
	stehen BEIDE im DOM (die Umschaltung in `layoutSwitch.ts` ist reines CSS),
	die Aufrufstellen prefixen deshalb pro Ansicht.
-->
<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { TEST_EMAIL_HINT } from '#lib/components/admin/sightingActions.ts';

	interface Props {
		/** Dokumentweit eindeutige id des Popover-Elements (siehe Kopfkommentar). */
		menuId: string;
		/** Zugänglicher Name des Auslösers — benennt die Sichtung, nicht nur „Menü". */
		label: string;
		/** Steuert nur das Bedienelement — das Gate steht zusätzlich am Endpunkt. */
		isSuperAdmin: boolean;
		size?: 'xs' | 'sm';
		onspamcheck: () => void;
		ontestemail: () => void;
		ondelete: () => void;
	}

	let {
		menuId,
		label,
		isSuperAdmin,
		size = 'sm',
		onspamcheck,
		ontestemail,
		ondelete
	}: Props = $props();
</script>

<button
	type="button"
	class="btn btn-ghost {size === 'xs' ? 'btn-xs' : 'btn-sm'}"
	popovertarget={menuId}
	style="anchor-name:--{menuId}"
	title="Weitere Aktionen"
	aria-label={label}
>
	<Icon icon="lucide:ellipsis-vertical" class="h-4 w-4" aria-hidden="true" />
</button>
<!-- `dropdown` an einem `[popover]` ist DaisyUIs Popover-Positionierung, kein
     Klick-Verhalten; auf/zu übernimmt der Browser über `popovertarget`.
     `whitespace-normal`: In der Tabelle steht der Auslöser in einer Zelle mit
     `whitespace-nowrap` — das Menü erbt das und schnitt den Mail-Eintrag ab,
     statt ihn umzubrechen. -->
<ul
	class="dropdown dropdown-end menu bg-base-100 rounded-box border-base-300 shadow-floating w-64 border p-2 whitespace-normal"
	popover="auto"
	id={menuId}
	style="position-anchor:--{menuId}"
>
	<!-- `popovertargetaction="hide"` an jedem Eintrag: schließt das Menü
	     deklarativ nach der Auswahl — ohne eigenes Open-State-Management. -->
	<li>
		<button type="button" popovertarget={menuId} popovertargetaction="hide" onclick={onspamcheck}>
			<Icon icon="lucide:shield-alert" class="h-4 w-4" aria-hidden="true" />
			Spam-Check durchführen
		</button>
	</li>
	{#if isSuperAdmin}
		<!-- Nur Superadmins: Der Klick erzeugt im Team-Postfach eine Mail, die von
		     einer echten Neu-Meldung nicht zu unterscheiden ist. -->
		<li>
			<button
				type="button"
				popovertarget={menuId}
				popovertargetaction="hide"
				onclick={ontestemail}
				title={TEST_EMAIL_HINT}
			>
				<Icon icon="lucide:mail" class="h-4 w-4" aria-hidden="true" />
				Benachrichtigung ans Team senden
			</button>
		</li>
	{/if}
	<!-- Kanonische destruktive Variante statt `text-error` am Menüeintrag —
	     gleiche Konstruktion und Begründung wie im Ansichten-Menü der
	     Tabellenseite: DaisyUI färbt Menüeinträge beim Hovern dunkler als
	     `base-300`, dort läge `text-error` unter AA; die Menü-Hover-Regel
	     greift nicht auf `.btn`. -->
	<li>
		<button
			type="button"
			class="btn btn-outline btn-error btn-sm w-full justify-start"
			popovertarget={menuId}
			popovertargetaction="hide"
			onclick={ondelete}
		>
			<Icon icon="lucide:trash-2" class="h-4 w-4" aria-hidden="true" />
			Eintrag löschen
		</button>
	</li>
</ul>
