/**
 * Frontend sighting interface
 */

import type { AnimalBehavior } from '#lib/report/formOptions/animalBehavior.ts';
import type { BoatDrive } from '#lib/report/formOptions/boatDrive.ts';
import type { Distance } from '#lib/report/formOptions/distance.ts';
import type { Distribution } from '#lib/report/formOptions/distribution.ts';
import type { SeaState } from '#lib/report/formOptions/seaState.ts';
import type { SightingFrom } from '#lib/report/formOptions/sightingFrom.ts';
import type { Species } from '#lib/report/formOptions/species.ts';
import type { Visibility } from '#lib/report/formOptions/visibility.ts';
import type { SightingModel } from './sighting.js';
import type { UploadedFileInfo } from './UploadedFile.js';

/**
 * Frontend-Repräsentation einer Sichtung.
 * Erweitert die Datenbank-Sichtung um typsichere Konstanten und gruppiert die Felder logisch.
 */
export interface FrontendSighting extends Omit<SightingModel, 'location'> {
	// Hier können zusätzliche Frontend-spezifische Eigenschaften definiert werden

	// Typisierte Versionen der numerischen DB-Felder
	species: Species;
	distribution: Distribution;
	distance: Distance;
	sightingFrom: SightingFrom;
	boatDrive: BoatDrive;
	seaState: SeaState;
	visibility?: Visibility;
	behavior?: AnimalBehavior;

	// Datei-Referenzen für Admin-Bearbeitung
	uploadedFiles?: UploadedFileInfo[];
}
