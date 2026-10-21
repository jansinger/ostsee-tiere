/**
 * Type definitions for sighting files
 */

import type { sightingFiles } from '#lib/server/db/schema.ts';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { ExifData } from './ExifData';

export type SightingFile = InferSelectModel<typeof sightingFiles> & { exifData?: ExifData | null };

export type SightingFileInsert = InferInsertModel<typeof sightingFiles>;
