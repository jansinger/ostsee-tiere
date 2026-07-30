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
	import { untrack } from 'svelte';

	// Definiere die Struktur einer Datenzeile
	interface DataRowType {
		label: string;
		value: string;
		isBoolean?: boolean;
		booleanValue?: boolean;
		badgeClass?: string;
		title?: string;
	}

	let { sighting, loading = false } = $props<{
		sighting: FrontendSighting;
		loading?: boolean;
	}>();

	// State für die aktuellen Sichtungsdaten mit reaktiver Wetterdaten-Aktualisierung
	// eslint-disable-next-line svelte/prefer-writable-derived
	let currentSighting = $state(untrack(() => sighting));

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
			isPhotoAnnouncementPending(
				currentSighting.mediaUpload,
				attachedFileCount,
				currentSighting.created
			)
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
		value: boolean | null | undefined,
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
			DataRow('Gemeldet', formatLocalDateTime(currentSighting.created, 'datetime')),
			DataRow(
				'Freigegeben am',
				formatLocalDateTime(currentSighting.approvedAt, 'datetime'),
				hasValue(currentSighting.approvedAt)
			)
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

	// Totfund
	const deadAnimalRows = $derived(
		[
			BooleanDataRow('Totfund', currentSighting.isDead),
			...(currentSighting.isDead
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
					]
				: [])
		].filter((row): row is DataRowType => row !== undefined)
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

	// Status
	const statusRows = $derived(
		[
			BooleanDataRow('Namensnennung', currentSighting.nameConsent),
			BooleanDataRow('Schiffsnennung', currentSighting.shipNameConsent),
			BooleanDataRow('Verifiziert', currentSighting.verified),
			DataRow('Eingangskanal', getEntryChannelLabel(currentSighting.entryChannel))
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
			DataRow('Position', formatLocation(currentSighting.longitude, currentSighting.latitude)),
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
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div class="space-y-4">
			<!-- Datum & Zeit -->
			<div class="card bg-base-200 shadow-sm">
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
			<div class="card bg-base-200 shadow-sm">
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
			{#if deadAnimalRows.length > 0}
				<div class="card bg-base-200 shadow-sm">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:triangle-alert" width="20" class="text-primary" />
							Totfund
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
				<div class="card bg-base-200 shadow-sm">
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
				<div class="card bg-base-200 shadow-sm">
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
							latitude={currentSighting.latitude}
							longitude={currentSighting.longitude}
							canRefresh={true}
							onWeatherRefresh={handleWeatherRefresh}
						/>
					</div>
				</div>
			{/if}

			<!-- Kontakt -->
			{#if contactRows.length > 0}
				<div class="card bg-base-200 shadow-sm">
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
					</div>
				</div>
			{/if}
		</div>

		<div class="space-y-4">
			<!-- Karte, falls Koordinaten vorhanden -->
			{#if hasCoordinates}
				<div class="card bg-base-200 overflow-hidden shadow-sm">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:map-pin" width="20" class="text-primary" />
							Karte
						</h3>
						<div class="relative mt-2 h-[400px] w-full">
							<div class="absolute inset-0">
								<OLMap
									latitude={currentSighting.latitude}
									longitude={currentSighting.longitude}
									readonly={true}
								/>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Ortsangaben -->
			{#if locationRows.length > 0}
				<div class="card bg-base-200 shadow-sm">
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
				<div class="card bg-base-200 shadow-sm">
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
				<div class="card bg-base-200 shadow-sm">
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
				<div class="card bg-base-200 shadow-sm">
					<div class="card-body">
						<h3 class="card-title flex items-center gap-2 text-lg">
							<Icon icon="lucide:camera" width="20" class="text-primary" />
							Medien-Gallerie
						</h3>

						<MediaGallery files={currentSighting.uploadedFiles} showTitle={false} />
					</div>
				</div>
			{:else if mediaRows.length > 0}
				<div class="card bg-base-200 shadow-sm">
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
				<div class="card bg-base-200 shadow-sm">
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
				<div class="card bg-base-200 shadow-sm">
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
										value={currentSighting.internalComment}
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
				<div class="card bg-base-200 shadow-sm">
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
	/* Card hover effects */
	.card {
		transition: all 0.2s ease;
	}

	.card:hover {
		transform: translateY(-1px);
		box-shadow: 0 8px 25px -8px var(--color-base-300);
	}
</style>
