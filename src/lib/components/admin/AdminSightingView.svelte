<script lang="ts">
	import DataTableRow from '$lib/components/admin/DataTableRow.svelte';
	import OLMap from '$lib/components/map/OLMap.svelte';
	import MediaGallery from '$lib/components/media/MediaGallery.svelte';
	import WeatherDataDisplay from '$lib/components/admin/weather/WeatherDataDisplay.svelte';
	import type { StoredWeatherData } from '$lib/services/weatherService';
	import { getAnimalBehaviorLabel } from '$lib/report/formOptions/animalBehavior';
	import { getAnimalConditionLabel } from '$lib/report/formOptions/animalCondition';
	import { getBoatDriveLabel } from '$lib/report/formOptions/boatDrive';
	import { getDistanceLabel } from '$lib/report/formOptions/distance';
	import { getDistributionLabel } from '$lib/report/formOptions/distribution';
	import { getEntryChannelLabel } from '$lib/report/formOptions/entryChannel';
	import { getSeaStateLabel } from '$lib/report/formOptions/seaState';
	import { getSexLabel } from '$lib/report/formOptions/sex';
	import { getSightingFromLabel } from '$lib/report/formOptions/sightingFrom';
	import { getSpeciesLabel } from '$lib/report/formOptions/species';
	import { getVisibilityLabel } from '$lib/report/formOptions/visibility';
	import { getWindDirectionLabel } from '$lib/report/formOptions/windDirection';
	import { getWindStrengthLabel } from '$lib/report/formOptions/windStrength';
	import type { FrontendSighting } from '$lib/types';
	import { formatLocalDateTime } from '$lib/utils/format/dateTime';
	import { formatLocation } from '$lib/utils/format/formatLocation';
	import { toCoordinate } from '$lib/report/components/form/coordinateValue';
	import {
		BALTIC_SEA_STATUS_PRESENTATION,
		getBalticSeaStatus,
		type BalticSeaStatus
	} from '$lib/utils/geo/balticSeaStatus';
	import {
		isPhotoAnnouncementPending,
		PHOTO_ANNOUNCEMENT_LABEL,
		PHOTO_ANNOUNCEMENT_TITLE
	} from '$lib/utils/media/photoAnnouncement';
	import Icon from '$lib/components/Icon.svelte';
	import { DEAD_FINDING_PRESENTATION, isDeadFinding } from './deadFinding';
	import { untrack } from 'svelte';
	import { getSightingStatus, SIGHTING_STATUS_PRESENTATION } from './sightingStatus';
	import type { SightingVerdict } from './sightingVerdict';
	import SightingStatusControl from './SightingStatusControl.svelte';
	import SightingStatusTimeline from './SightingStatusTimeline.svelte';
	import type { SightingStatusLogEntry } from './sightingStatusLog';
	import type { ReporterHistory } from '$lib/types/reporterHistory';
	import ReporterHistoryBadge from './ReporterHistoryBadge.svelte';
	import { getReporterLevel } from './reporterHistoryPresentation';

	// Definiere die Struktur einer Datenzeile
	interface DataRowType {
		label: string;
		value: string;
		isBoolean?: boolean;
		booleanValue?: boolean;
		badgeClass?: string;
		title?: string;
	}

	let {
		sighting,
		loading = false,
		onStatusChange,
		statusBusy = false,
		statusLog = [],
		statusLogFailed = false,
		reporterHistory = null,
		reporterHistoryFailed = false
	}: {
		sighting: FrontendSighting;
		loading?: boolean;
		onStatusChange?: ((verdict: SightingVerdict) => void) | undefined;
		statusBusy?: boolean;
		/** Status-Historie (Spec B3) — leer für den Altbestand, siehe Zeitleiste. */
		statusLog?: SightingStatusLogEntry[];
		/** Die Historie konnte nicht geladen werden — von „leer" zu unterscheiden. */
		statusLogFailed?: boolean;
		/** Was über den Melder bekannt ist — `null` heißt „nicht ermittelt". */
		reporterHistory?: ReporterHistory | null;
		/** Die Abfrage ist fehlgeschlagen — von „keine Vorgeschichte" zu unterscheiden. */
		reporterHistoryFailed?: boolean;
	} = $props();

	// State für die aktuellen Sichtungsdaten mit reaktiver Wetterdaten-Aktualisierung
	// eslint-disable-next-line svelte/prefer-writable-derived
	let currentSighting = $state(untrack(() => sighting));

	// `gps_breite`/`gps_laenge` sind `numeric` — Drizzle liefert sie als String.
	const latitude = $derived(toCoordinate(currentSighting.latitude));
	const longitude = $derived(toCoordinate(currentSighting.longitude));

	// Sync currentSighting when sighting prop changes
	$effect(() => {
		currentSighting = sighting;
	});

	// Callback zum Aktualisieren der Wetterdaten
	function handleWeatherRefresh(weatherData: StoredWeatherData) {
		currentSighting = {
			...currentSighting,
			weatherData
		};
	}

	/**
	 * Hilfsfunktion, um zu prüfen, ob ein Wert existiert
	 * @param value - Der zu prüfende Wert
	 * @returns true, wenn der Wert existiert und nicht leer ist
	 */
	function hasValue(value: unknown): boolean {
		return value !== null && value !== undefined && value !== '';
	}

	/**
	 * Rendert eine Zeile mit Beschriftung und Wert
	 * @param label - Die Beschriftung
	 * @param value - Der anzuzeigende Wert
	 * @param condition - Optionale Bedingung, ob die Zeile angezeigt werden soll
	 * @returns Ein DataRowType Objekt oder undefined, wenn die Zeile nicht angezeigt werden soll
	 */
	function DataRow(
		label: string,
		value: string | number | null | undefined,
		condition: boolean = true
	): DataRowType | undefined {
		if (!condition || !hasValue(value)) return undefined;

		return {
			label,
			value: String(value)
		};
	}

	/**
	 * Rendert eine Zeile mit dem Ostsee-Status als Badge.
	 *
	 * Label, Farbe und Tooltip kommen unverändert aus
	 * `BALTIC_SEA_STATUS_PRESENTATION` — derselben Quelle, aus der die
	 * Admin-Übersicht und die Benachrichtigungs-Mail sie beziehen. Damit können
	 * die drei Anzeigestellen nicht auseinanderlaufen.
	 *
	 * @param label - Die Beschriftung
	 * @param status - Der Zustand aus `getBalticSeaStatus()`
	 */
	function BadgeDataRow(label: string, status: BalticSeaStatus): DataRowType {
		const { label: value, badgeClass, title } = BALTIC_SEA_STATUS_PRESENTATION[status];

		return { label, value, badgeClass, title };
	}

	/**
	 * Rendert die „Upload"-Zeile der Legacy-Medien-Karte.
	 *
	 * Diese Karte wird nur gezeigt, wenn keine Datei angehängt ist (siehe die
	 * `{#if currentSighting.uploadedFiles?.length}`-Weiche im Markup) — „keine
	 * Datei" ist an dieser Stelle also bereits sichergestellt. Ist zusätzlich
	 * `mediaUpload` gesetzt, kommt das Foto laut App per E-Mail nach
	 * (`$lib/utils/media/photoAnnouncement.ts`); die reine Ja/Nein-Anzeige wäre
	 * hier nicht von einem defekten Datensatz zu unterscheiden.
	 *
	 * Zeigt wie zuvor gar keine Zeile, wenn `mediaUpload` keinen Wert trägt
	 * (`hasValue`) — dieselbe Bedingung, die vorher direkt an `BooleanDataRow`
	 * übergeben wurde.
	 * @returns Ein DataRowType Objekt oder undefined, wenn kein Wert vorliegt
	 */
	function MediaUploadRow(): DataRowType | undefined {
		if (!hasValue(currentSighting.mediaUpload)) return undefined;

		// Zählt die tatsächlich geladenen Dateien, statt sich allein auf die
		// Template-Weiche zu verlassen — bleibt so auch dann richtig, wenn diese
		// Funktion einmal außerhalb des aktuellen Kontexts wiederverwendet wird.
		const attachedFileCount = currentSighting.uploadedFiles?.length ?? 0;

		if (
			isPhotoAnnouncementPending({
				mediaUpload: currentSighting.mediaUpload,
				attachedFileCount,
				createdAt: currentSighting.created,
				entryChannel: currentSighting.entryChannel
			})
		) {
			return {
				label: 'Upload',
				value: PHOTO_ANNOUNCEMENT_LABEL,
				badgeClass: 'badge-info',
				title: PHOTO_ANNOUNCEMENT_TITLE
			};
		}

		return {
			label: 'Upload',
			value: '',
			isBoolean: true,
			booleanValue: Boolean(currentSighting.mediaUpload)
		};
	}

	/**
	 * Rendert eine Zeile für Boolean-Werte mit Status-Badge
	 * @param label - Die Beschriftung
	 * @param value - Der Boolean-Wert
	 * @param condition - Optionale Bedingung, ob die Zeile angezeigt werden soll
	 * @returns Ein DataRowType Objekt oder undefined, wenn die Zeile nicht angezeigt werden soll
	 */
	function BooleanDataRow(
		label: string,
		// Die Einwilligungs-Spalten sind `smallint`/`integer` (0/1) — `Boolean()` unten
		// wertet beides gleich aus.
		value: boolean | number | null | undefined,
		condition: boolean = true
	): DataRowType | undefined {
		if (!condition) return undefined;

		return {
			label,
			value: '', // Wird nicht verwendet, da wir eine Status-Komponente rendern
			isBoolean: true,
			booleanValue: Boolean(value)
		};
	}

	// Datum & Zeit
	const dateTimeRows = $derived(
		[
			DataRow('Sichtung', formatLocalDateTime(currentSighting.sightingDate, 'datetime')),
			DataRow('Gemeldet', formatLocalDateTime(currentSighting.created, 'datetime'))
		].filter((row): row is DataRowType => row !== undefined)
	);

	// Tierinformationen
	const animalRows = $derived(
		[
			DataRow('Tierart', getSpeciesLabel(currentSighting.species)),
			DataRow('Anzahl Gesamt', currentSighting.totalCount),
			DataRow(
				'Anzahl Jungtiere',
				currentSighting.juvenileCount,
				hasValue(currentSighting.juvenileCount)
			),
			DataRow(
				'Verteilung',
				getDistributionLabel(currentSighting.distribution),
				hasValue(currentSighting.distribution)
			),
			DataRow(
				'Verteilung (Details)',
				currentSighting.distributionText,
				hasValue(currentSighting.distributionText) && hasValue(currentSighting.distribution)
			)
		].filter((row): row is DataRowType => row !== undefined)
	);

	const isDead = $derived(isDeadFinding(currentSighting.isDead));

	// Totfund — die Zeilen der Karte, ohne eine eigene Zeile „Totfund: Ja".
	// Die trüge nichts bei: Gezeigt wird die Karte ausschließlich bei einem
	// Totfund, und ihre Überschrift sagt es bereits. Vorher stand die Zeile
	// hier unbedingt und zog damit die ganze Karte auch über jede
	// Lebendsichtung — mit dem Inhalt „Totfund: Nein".
	const deadAnimalRows = $derived(
		isDead
			? [
					DataRow(
						'Zustand',
						getAnimalConditionLabel(currentSighting.deadCondition),
						hasValue(currentSighting.deadCondition)
					),
					DataRow(
						'Geschlecht',
						getSexLabel(currentSighting.deadSex),
						hasValue(currentSighting.deadSex)
					),
					DataRow('Größe', `${currentSighting.deadSize} cm`, hasValue(currentSighting.deadSize)),
					BooleanDataRow('Telefonischer Kontakt', currentSighting.deadPhoneContact)
				].filter((row): row is DataRowType => row !== undefined)
			: []
	);

	// Sichtungsdetails
	const sightingDetailRows = $derived(
		[
			DataRow(
				'Sichtung von',
				getSightingFromLabel(currentSighting.sightingFrom),
				hasValue(currentSighting.sightingFrom)
			),
			// Freitext immer zeigen, wenn vorhanden. Er gehört fachlich zu
			// "Sonstiges" (0), nicht zu 4 (Fähre) — die frühere Bedingung
			// versteckte ihn in 742 von 743 Fällen, darunter alle 713
			// "Sonstiges"-Zeilen mit Angaben wie Kajak, SUP oder Seebrücke.
			DataRow(
				'Sichtung von (Details)',
				currentSighting.sightingFromText,
				hasValue(currentSighting.sightingFromText)
			),
			DataRow(
				'Entfernung',
				getDistanceLabel(currentSighting.distance),
				hasValue(currentSighting.distance)
			),
			DataRow(
				'Verhalten',
				getAnimalBehaviorLabel(currentSighting.behavior),
				hasValue(currentSighting.behavior)
			),
			DataRow(
				'Verhalten (Details)',
				currentSighting.behaviorText,
				// Freitext immer zeigen, wenn vorhanden. Er gehört fachlich zu
				// "Sonstiges Verhalten" (0), nicht zu 3 (Langsames Schwimmen) —
				// bei `verhalten = 3` hat keine einzige Zeile einen Text, der
				// Freitext war also in allen 919 Fällen unsichtbar.
				hasValue(currentSighting.behaviorText)
			),
			DataRow('Reaktion auf Boot', currentSighting.reaction, hasValue(currentSighting.reaction))
		].filter((row): row is DataRowType => row !== undefined)
	);

	// Umweltbedingungen
	const environmentRows = $derived(
		[
			DataRow(
				'Seegang',
				getSeaStateLabel(currentSighting.seaState),
				hasValue(currentSighting.seaState)
			),
			DataRow(
				'Sichtweite',
				getVisibilityLabel(currentSighting.visibility),
				hasValue(currentSighting.visibility)
			),
			DataRow(
				'Windrichtung',
				getWindDirectionLabel(currentSighting.windDirection),
				hasValue(currentSighting.windDirection)
			),
			DataRow(
				'Windstärke',
				getWindStrengthLabel(currentSighting.windForce),
				hasValue(currentSighting.windForce)
			)
		].filter((row): row is DataRowType => row !== undefined)
	);

	// Schiffs-/Bootsangaben
	const shipRows = $derived(
		[
			DataRow('Schiffsname', currentSighting.shipName, hasValue(currentSighting.shipName)),
			DataRow('Heimathafen', currentSighting.homePort, hasValue(currentSighting.homePort)),
			DataRow('Bootstyp', currentSighting.boatType, hasValue(currentSighting.boatType)),
			DataRow(
				'Bootsantrieb',
				getBoatDriveLabel(currentSighting.boatDrive),
				hasValue(currentSighting.boatDrive)
			),
			// Freitext immer zeigen, wenn vorhanden: Er ist laut Schema "auch bei
			// Sonstiges" erlaubt und nicht an einen bestimmten Antrieb gebunden.
			// Die frühere Bedingung `boatDrive === 4` (Vor Anker) versteckte den
			// Text in 290 von 294 Fällen — u.a. bei allen 71 Land-Sichtungen,
			// deren Melder dort "kein Boot" o.ä. eingetragen hatten.
			DataRow(
				'Bootsantrieb (Details)',
				currentSighting.boatDriveText,
				hasValue(currentSighting.boatDriveText)
			),
			DataRow('Anzahl Schiffe', currentSighting.shipCount, hasValue(currentSighting.shipCount))
		].filter((row): row is DataRowType => row !== undefined)
	);

	// Kontakt
	let contactName = $derived(
		currentSighting.firstName || currentSighting.lastName
			? `${currentSighting.firstName ?? ''} ${currentSighting.lastName ?? ''}`.trim()
			: 'Nicht angegeben'
	);

	let addressParts = $derived(
		[
			currentSighting.street,
			hasValue(currentSighting.zipCode) || hasValue(currentSighting.city)
				? `${currentSighting.zipCode || ''} ${currentSighting.city || ''}`.trim()
				: null
		]
			.filter(Boolean)
			.join(', ')
	);

	const contactRows = $derived(
		[
			DataRow('Email', currentSighting.email, hasValue(currentSighting.email)),
			DataRow('Name', contactName),
			DataRow('Telefon', currentSighting.phone, hasValue(currentSighting.phone)),
			DataRow('Fax', currentSighting.fax, hasValue(currentSighting.fax)),
			DataRow('Adresse', addressParts || 'Nicht angegeben', Boolean(addressParts))
		].filter((row): row is DataRowType => row !== undefined)
	);

	/* „Melder seit" ohne Tag: Der Monat trägt die Aussage (langjährig oder
	   neu), ein Tagesdatum suggerierte eine Genauigkeit, die für diese Frage
	   niemand braucht.

	   **Nicht bei einer Erstmeldung.** `since` enthält bewusst die aktuelle
	   Meldung — bei einem Melder ohne Vorgeschichte stünde dort das heutige
	   Datum, und „Melder seit 08/2026" liest sich als Aussage über eine
	   Vorgeschichte, die es nicht gibt. Ab `pending` ebenfalls nicht: Auch dort
	   ist noch nichts bearbeitet worden. */
	/**
	 * „Melder seit" als `MM/JJJJ`, aus den UTC-Feldern zusammengesetzt.
	 *
	 * **Nicht `toLocaleDateString('de-DE', …)`.** Das Trennzeichen kommt dort aus
	 * den ICU-Daten der Laufzeit und ist keine Zusage: Je nach Browser- und
	 * ICU-Version steht dort `03/2019` oder `03.2019`. Die Oberfläche kündigt
	 * aber `MM/JJJJ` an, und der Test prüft genau darauf — die Formatierung
	 * gehört deshalb hierher und nicht in eine Bibliotheksentscheidung, die sich
	 * unter uns ändern kann (Befund aus dem Review zu PR #852).
	 *
	 * `getUTC*` statt der lokalen Getter, weil `since` UTC ist (`to_char(… "Z")`
	 * in `reporterHistory.ts`): `2019-03-31T23:00:00Z` ergäbe in Berliner
	 * Ortszeit sonst „04/2019".
	 */
	function formatiereMelderSeit(since: string | null | undefined): string | null {
		if (!since) return null;
		const zeitpunkt = new Date(since);
		/* Ein unbrauchbares Datum wird verschwiegen statt als „NaN/NaN" gezeigt.
		   Die Gestaltprüfung im Loader lässt jede Zeichenkette durch — sie prüft
		   den Typ, nicht das Format. */
		if (Number.isNaN(zeitpunkt.getTime())) return null;
		const monat = String(zeitpunkt.getUTCMonth() + 1).padStart(2, '0');
		return `${monat}/${zeitpunkt.getUTCFullYear()}`;
	}

	const reporterLevel = $derived(getReporterLevel(reporterHistory));
	const reporterSince = $derived(
		reporterLevel && reporterLevel !== 'first' && reporterLevel !== 'pending'
			? formatiereMelderSeit(reporterHistory?.since)
			: null
	);

	/* Der Link trifft eine andere Menge als das Badge zählt: Die Tabellensuche
	   dahinter (`/admin/sichtungen?q=…`) arbeitet mit `ILIKE '%…%'` über mehrere
	   Spalten, das Badge dagegen mit exakter, normalisierter Adressgleichheit
	   (`normalizeReporterKey` in reporterHistory.ts). `a@b.de` listet dort z. B.
	   auch `xa@b.de` mit. Kein Fehler, aber eine Ungenauigkeit — nicht mit einem
	   Zählfehler des Badges verwechseln. */
	const reporterSearchHref = $derived(
		currentSighting.email
			? `/admin/sichtungen?q=${encodeURIComponent(currentSighting.email.trim().toLowerCase())}`
			: null
	);

	// Status — Freigabe/Ablehnung stehen seit Task 7 als eigene Leiste im
	// Kopfbereich (siehe `{@const status = …}` im Markup unten), nicht mehr
	// als Zeile hier.
	const statusRows = $derived(
		[
			BooleanDataRow('Namensnennung', currentSighting.nameConsent),
			BooleanDataRow('Schiffsnennung', currentSighting.shipNameConsent),
			DataRow('Eingangskanal', getEntryChannelLabel(currentSighting.entryChannel)),
			DataRow('Client', currentSighting.entryClient)
		].filter((row): row is DataRowType => row !== undefined)
	);

	// Medien
	const mediaRows = $derived(
		[
			DataRow('Aufnahme', currentSighting.mediaFile, hasValue(currentSighting.mediaFile)),
			MediaUploadRow(),
			// Ohne diese Einwilligung dürfen die Aufnahmen ausschließlich zur
			// Prüfung der Meldung angesehen werden — nicht veröffentlicht.
			BooleanDataRow(
				'Veröffentlichung erlaubt',
				currentSighting.mediaConsent,
				hasValue(currentSighting.mediaConsent)
			)
		].filter((row): row is DataRowType => row !== undefined)
	);

	// Bemerkungen
	const noteRows = $derived(
		[
			DataRow('Bemerkungen', currentSighting.notes, hasValue(currentSighting.notes)),
			DataRow(
				'Sonstige Auffälligkeiten',
				currentSighting.otherObservations,
				hasValue(currentSighting.otherObservations)
			)
		].filter((row): row is DataRowType => row !== undefined)
	);

	// Ortsangaben
	const locationRows = $derived(
		[
			DataRow('Position', formatLocation(longitude, latitude)),
			DataRow('Fahrwasser', currentSighting.waterway, hasValue(currentSighting.waterway)),
			DataRow('Seezeichen', currentSighting.seaMark, hasValue(currentSighting.seaMark)),
			// Die fachliche Aussage — derselbe Wert und dasselbe Label wie in der
			// Übersicht und in der Benachrichtigungs-Mail. Vorher standen hier zwei
			// Häkchen „In der Ostsee" und „In der Ostsee (geo)"; wer nur auf das
			// zweite sah, las die Bounding Box als Ostsee-Zugehörigkeit.
			BadgeDataRow('Ostsee-Status', getBalticSeaStatus(currentSighting)),
			// Die Rohwerte bleiben für die Prüfarbeit sichtbar, aber ausdrücklich als
			// Rohwerte: sie zeigen als Zahl auch den Altsystem-Wert 2 in `ostsee_geo`,
			// den ein Häkchen verschluckt hätte. Namen und Bedeutung sind vertauscht,
			// deshalb stehen sie in der Beschriftung (siehe docs/OSTSEE_FLAGS.md).
			//
			// `DataRow` blendet `null` aus (nicht `0` — das wird gezeigt). `ostsee`
			// ist nullable, führt seit der Bereinigung am 2026-07-30 aber keine
			// NULL-Werte mehr; die Zeile fehlt dann, statt eine 0 zu behaupten, die
			// nicht in der Spalte steht. Verhalten wie beim vorherigen
			// `BooleanDataRow` — dort wäre aus NULL ein „Nein" geworden.
			DataRow('Rohwert ostsee (Polygon)', currentSighting.inBalticSea),
			DataRow('Rohwert ostsee_geo (Kartenbereich)', currentSighting.inBalticSeaGeo)
		].filter((row): row is DataRowType => row !== undefined)
	);

	// Technische Informationen
	const techRows = $derived(
		[DataRow('Datensatz ID', currentSighting.id)].filter(
			(row): row is DataRowType => row !== undefined
		)
	);

	// Prüfen, ob Koordinaten für die Karte vorhanden sind
	let hasCoordinates = $derived(
		hasValue(currentSighting.latitude) && hasValue(currentSighting.longitude)
	);
</script>

{#if loading}
	<!-- Loading Animation -->
	<div class="flex min-h-[50vh] items-center justify-center">
		<div class="text-center">
			<Icon
				icon="lucide:loader-pinwheel"
				width="48"
				class="text-primary mx-auto mb-4 animate-spin"
			/>
			<p class="text-base-content/70 text-lg">Daten werden geladen...</p>
			<p class="text-base-content/70 text-sm">Bitte warten Sie einen Moment</p>
		</div>
	</div>
{:else}
	{@const status = getSightingStatus(currentSighting)}
	<div
		class="border-base-300 bg-base-100 rounded-box mb-4 flex flex-wrap items-center gap-3 border p-3"
	>
		{#if onStatusChange}
			<!-- Kein `{#key}`-Remount mehr nötig. `status` wird hier über ein
			     `{@const}` berechnet, das Svelte 5 zu einem `$derived` kompiliert:
			     Ein `$derived` benachrichtigt Konsumenten nur, wenn sein NEUER
			     Wert vom vorherigen abweicht. Beim Sprung von einer offenen auf
			     eine andere offene Sichtung im Warteschlangen-Modus bleibt der
			     Wert aber `'open'` → `'open'` — die Write-Version wird nicht
			     erhöht, also erreicht die Änderung weder den `status`-Prop der
			     Kindkomponente noch einen davon abhängigen `$effect` (per E2E
			     nachgewiesen: `name`-Attribut/`sightingId` kommen bereits korrekt
			     an, nur der wertgleiche `status` nicht — `currentSighting` und der
			     `{#await data.sighting}` in `+layout.svelte` sind beide
			     unbeteiligt). Ein `{#key}` bräche diesen Stillstand nur durch
			     kompletten Neu-Mount — teuer, und er wirft den Fokus auf `<body>`,
			     was den Fokus-Fix aus demselben Branch wieder aufhöbe.
			     Der eigentliche Fix sitzt deshalb dort, wo der Wert verbraucht
			     wird: `SightingStatusControl` synchronisiert seinen lokalen
			     `selected`-Spiegel über `sightingId` (ändert sich bei jedem
			     Sprung garantiert) statt über `status` selbst — siehe Docblock
			     dort. Abgesichert durch `e2e/admin-queue.spec.ts` → „springt
			     nach einer Freigabe zur nächsten und nimmt sie zurück". -->
			<SightingStatusControl
				{status}
				sightingId={currentSighting.id}
				size="md"
				busy={statusBusy}
				onchange={onStatusChange}
			/>
		{:else}
			<span class="badge {SIGHTING_STATUS_PRESENTATION[status].badgeClass}">
				{SIGHTING_STATUS_PRESENTATION[status].label}
			</span>
		{/if}
		{#if status === 'approved'}
			<span class="text-base-content/70 text-sm">
				<!-- „durch …" nur, wenn eine Person bekannt ist: Der Altbestand aus dem
				     Altsystem trägt kein `freigegeben_von`, ein „durch null" wäre die
				     sichtbare Folge eines bedingungslosen Templates. -->
				Freigegeben am {formatLocalDateTime(
					currentSighting.approvedAt,
					'datetime'
				)}{currentSighting.approvedBy ? ` durch ${currentSighting.approvedBy}` : ''}
			</span>
		{:else if status === 'rejected'}
			<span class="text-base-content/70 text-sm">
				Abgelehnt am {formatLocalDateTime(
					currentSighting.rejectedAt,
					'datetime'
				)}{currentSighting.rejectedBy ? ` durch ${currentSighting.rejectedBy}` : ''}
			</span>
		{/if}
	</div>

	<!-- Zugeklappt und direkt unter der Statusleiste: Die Historie gehört fachlich
	     zum Status, wird aber selten gebraucht — aufgeklappt schöbe sie alle
	     Sichtungsdaten nach unten. `summary` als eigenes Bedienelement, damit der
	     Zustand per Tastatur erreichbar bleibt. -->
	{@const historyLabel = `Bearbeitungs-Historie${statusLog.length > 0 ? ` (${statusLog.length})` : ''}`}
	<!-- `aria-label` am `details`: Ein `summary` mit `collapse-title` wird als
	     namenloses `group` exponiert, die Zusammenfassung selbst als `generic` —
	     ein Screenreader meldete den Bereich damit gar nicht. Der Text ist
	     derselbe wie der sichtbare, sonst bräche WCAG 2.5.3 (Label in Name). -->
	<details class="collapse-arrow bg-base-200 rounded-box collapse mb-4" aria-label={historyLabel}>
		<summary class="collapse-title text-base font-medium">
			{historyLabel}
		</summary>
		<div class="collapse-content">
			<SightingStatusTimeline entries={statusLog} failed={statusLogFailed} />
		</div>
	</details>

	{#if isDead}
		<!-- Steht über allen Angaben und nicht zwischen den Karten: Die Art der
		     Meldung entscheidet, wie der Datensatz gelesen wird, und muss deshalb
		     vor dem ersten Detail feststehen. `role="note"` statt `role="alert"` —
		     es ist eine dauerhafte Einordnung des Datensatzes, kein Ereignis, das
		     einen Screenreader unterbrechen sollte. -->
		<div class="alert alert-warning mb-4" role="note">
			<Icon icon={DEAD_FINDING_PRESENTATION.icon} class="shrink-0" aria-hidden="true" />
			<span>{DEAD_FINDING_PRESENTATION.description}</span>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div class="space-y-4">
			<!-- Datum & Zeit -->
			<div class="card bg-base-200 shadow-raised">
				<div class="card-body">
					<h3 class="card-title flex items-center gap-2 text-lg">
						<Icon icon="lucide:calendar" width="20" class="text-primary" />
						Datum & Zeit
					</h3>
					<div class="overflow-x-auto">
						<table class="table-zebra table-sm table w-full">
							<tbody>
								{#each dateTimeRows as row (row.label)}
									<DataTableRow {...row} />
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			<!-- Tierinformationen -->
			<div class="card bg-base-200 shadow-raised">
				<div class="card-body">
					<h3 class="card-title flex items-center gap-2 text-lg">
						<Icon icon="lucide:eye" width="20" class="text-primary" />
						Tierinformationen
					</h3>
					<div class="overflow-x-auto">
						<table class="table-zebra table-sm table w-full">
							<tbody>
								{#each animalRows as row (row.label)}
									<DataTableRow {...row} />
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			<!-- Totfund-Details -->
			{#if isDead}
				<!-- Linke Kante und Icon in der Fehlerfarbe: Alle anderen Karten
				     tragen `text-primary` am Icon, diese hob sich damit in nichts
				     ab. Die Kante trägt die Farbe, das Icon zusätzlich die Form —
				     Farbe allein wäre kein Merkmal (WCAG 1.4.1). -->
				<div class="card bg-base-200 border-error shadow-raised border-l-4">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon
								icon={DEAD_FINDING_PRESENTATION.icon}
								width="20"
								class="text-error"
								aria-hidden="true"
							/>
							{DEAD_FINDING_PRESENTATION.label}
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									{#each deadAnimalRows as row (row.label)}
										<DataTableRow {...row} />
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			<!-- Sichtungsdetails -->
			{#if sightingDetailRows.length > 0}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:activity" width="20" class="text-primary" />
							Sichtungsdetails
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									{#each sightingDetailRows as row (row.label)}
										<DataTableRow {...row} />
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			<!-- Umweltbedingungen -->
			{#if environmentRows.length > 0 || currentSighting.weatherData}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:waves" width="20" class="text-primary" />
							Umweltbedingungen
						</h3>
						{#if environmentRows.length > 0}
							<div class="overflow-x-auto">
								<table class="table-zebra table-sm table w-full">
									<tbody>
										{#each environmentRows as row (row.label)}
											<DataTableRow {...row} />
										{/each}
									</tbody>
								</table>
							</div>
						{/if}

						<!-- Weather API Data Display -->
						<WeatherDataDisplay
							weatherData={currentSighting.weatherData as StoredWeatherData}
							sightingId={currentSighting.id}
							sightingDate={currentSighting.sightingDate}
							latitude={latitude ?? null}
							longitude={longitude ?? null}
							canRefresh={true}
							onWeatherRefresh={handleWeatherRefresh}
						/>
					</div>
				</div>
			{/if}

			<!-- Kontakt -->
			{#if contactRows.length > 0}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:user" width="20" class="text-primary" />
							Kontakt
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									{#each contactRows as row (row.label)}
										<DataTableRow {...row} />
									{/each}
								</tbody>
							</table>
						</div>

						<!-- Melder-Historie: was über diese Adresse sonst bekannt ist.
							     Reine Anzeige — sie ändert weder Spam-Score noch Sichtbarkeit,
							     und die Adresse ist nicht verifiziert (docs/SPAM_DETECTION.md).

							     Die Bedingung am Wrapper ist nicht kosmetisch: Ohne sie rendert
							     eine Sichtung ohne E-Mail-Adresse (im Altbestand möglich) eine
							     leere Trennlinie samt Abstand — ein Rahmen um nichts. Der
							     Fehlschlag-Zweig ist deshalb bewusst Teil derselben Bedingung. -->
						{#if reporterHistoryFailed || reporterLevel || reporterSearchHref}
							<div
								class="border-base-300 mt-2 flex flex-wrap items-center gap-2 border-t pt-3"
								data-testid="reporter-history-block"
							>
								{#if reporterHistoryFailed}
									<span class="text-base-content/70 text-sm">
										Melder-Historie konnte nicht geladen werden
									</span>
								{:else}
									<ReporterHistoryBadge history={reporterHistory} />
									{#if reporterSince}
										<span class="text-base-content/70 text-sm">Melder seit {reporterSince}</span>
									{/if}
									{#if reporterSearchHref}
										<a href={reporterSearchHref} class="link link-hover text-sm">
											Alle Meldungen dieses Melders
										</a>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<div class="space-y-4">
			<!-- Karte, falls Koordinaten vorhanden -->
			{#if hasCoordinates}
				<div class="card bg-base-200 shadow-raised overflow-hidden">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:map-pin" width="20" class="text-primary" />
							Karte
						</h3>
						<div class="relative mt-2 h-[400px] w-full">
							<div class="absolute inset-0">
								<OLMap {latitude} {longitude} readonly={true} />
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Ortsangaben -->
			{#if locationRows.length > 0}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:map-pin" width="20" class="text-primary" />
							Ortsangaben
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									{#each locationRows as row (row.label)}
										<DataTableRow {...row} />
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			<!-- Schiffs-/Bootsangaben -->
			{#if shipRows.length > 0}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:anchor" width="20" class="text-primary" />
							Schiffs-/Bootsangaben
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									{#each shipRows as row (row.label)}
										<DataTableRow {...row} />
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			<!-- Status -->
			{#if statusRows.length > 0}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:settings" width="20" class="text-primary" />
							Status
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									{#each statusRows as row (row.label)}
										<DataTableRow {...row} />
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			<!-- Medien-Gallerie -->
			{#if currentSighting.uploadedFiles && currentSighting.uploadedFiles.length > 0}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:camera" width="20" class="text-primary" />
							Medien-Gallerie
						</h3>

						<MediaGallery files={currentSighting.uploadedFiles} showTitle={false} />
					</div>
				</div>
			{:else if mediaRows.length > 0}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:camera" width="20" class="text-primary" />
							Medien (Legacy)
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									{#each mediaRows as row (row.label)}
										<DataTableRow {...row} />
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			<!-- Bemerkungen, falls vorhanden -->
			{#if noteRows.length > 0}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:message-square" width="20" class="text-primary" />
							Bemerkungen
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									{#each noteRows as row (row.label)}
										<DataTableRow {...row} isPreformatted={true} />
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			<!-- Interner Kommentar, falls vorhanden -->
			{#if hasValue(currentSighting.internalComment)}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:settings" width="20" class="text-primary" />
							Interner Kommentar
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									<DataTableRow
										label="Kommentar"
										value={currentSighting.internalComment ?? undefined}
										isPreformatted={true}
									/>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			<!-- Technische Informationen -->
			{#if techRows.length > 0}
				<div class="card bg-base-200 shadow-raised">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:file-text" width="20" class="text-primary" />
							Technische Informationen
						</h3>
						<div class="overflow-x-auto">
							<table class="table-zebra table-sm table w-full">
								<tbody>
									{#each techRows as row (row.label)}
										<DataTableRow {...row} />
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Nur das Anheben. Schatten und Übergang der Karten-Hover kommen aus dem
	   `.card`/`.card:hover`-Block in app.css (--elevation-floating,
	   --motion-quick) — hier standen sie als handgeschriebener box-shadow und
	   `transition: all 0.2s ease` daneben und schlugen ihn, weil ein scoped
	   Block ungelayert ist. Dieselbe Doppelung wurde in SectionCard.svelte
	   schon entfernt.

	   Der Übergang steht seither in der Basisregel `.card` und läuft in beide
	   Richtungen — das `transform` hier wird davon mitgetragen und braucht
	   keine eigene `transition`. Bis dahin waren diese Karten die einzigen
	   der App mit symmetrischem Hover; jetzt sind es alle. */
	.card:hover {
		transform: translateY(-1px);
	}
</style>
