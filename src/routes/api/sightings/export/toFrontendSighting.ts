/**
 * @fileoverview Adapter DB-Zeile → `FrontendSighting` für die Export-Routen.
 *
 * Die Exporter in `#lib/server/export/*` arbeiten auf `FrontendSighting`. Eine
 * Select-Zeile aus `sichtungen` ist feldgleich; nur die numerischen Codes sind
 * dort als Enum typisiert und die PostGIS-Geometrie gehört nicht zum Export.
 */

import type { AnimalBehavior } from '#lib/report/formOptions/animalBehavior.ts';
import type { BoatDrive } from '#lib/report/formOptions/boatDrive.ts';
import type { Distance } from '#lib/report/formOptions/distance.ts';
import type { Distribution } from '#lib/report/formOptions/distribution.ts';
import type { SeaState } from '#lib/report/formOptions/seaState.ts';
import type { SightingFrom } from '#lib/report/formOptions/sightingFrom.ts';
import type { Species } from '#lib/report/formOptions/species.ts';
import type { Visibility } from '#lib/report/formOptions/visibility.ts';
import type { sightings } from '#lib/server/db/schema.ts';
import type { FrontendSighting } from '#lib/types/index.ts';
import type { InferSelectModel } from 'drizzle-orm';

type SightingRow = InferSelectModel<typeof sightings>;

export function toFrontendSighting(row: SightingRow): FrontendSighting {
	const { location: _location, ...rest } = row;

	return {
		...rest,
		species: rest.species as Species,
		distribution: rest.distribution as Distribution,
		distance: rest.distance as Distance,
		sightingFrom: rest.sightingFrom as SightingFrom,
		boatDrive: rest.boatDrive as BoatDrive,
		seaState: rest.seaState as SeaState,
		visibility: rest.visibility as Visibility,
		behavior: rest.behavior as AnimalBehavior
	};
}
