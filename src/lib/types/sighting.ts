import { sightings } from '#lib/server/db/schema.ts';
import { type InferInsertModel, type SQL } from 'drizzle-orm';

/**
 * Typ für eine neue Sichtung, die in die Datenbank eingefügt wird
 */
export type NewSighting = Omit<InferInsertModel<typeof sightings>, 'location'> & {
	location: SQL | null;
};

/**
 * Typ für eine bestehende Sichtung aus der Datenbank
 */
export type SightingModel = InferInsertModel<typeof sightings> & {
	id: number;
};

export type UpdateSighting = Omit<
	InferInsertModel<typeof sightings>,
	'id' | 'created' | 'approvedAt' | 'location'
> & {
	location?: SQL | null;
};
