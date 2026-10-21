# Tools Directory

This directory contains maintenance and utility scripts for the Ostsee-Tiere application.

## Available Scripts

### 1. License Management

#### `generate-license-notices.js`

Generates third-party license notices and attribution files.

**Usage:**

```bash
npm run generate:licenses
```

**Output Files:**

- `THIRD-PARTY-NOTICES.md` - Detailed license information with compatibility analysis
- `THIRD-PARTY-NOTICES.txt` - Summary text file
- `third-party-licenses.csv` - Machine-readable CSV format

### 2. Database Maintenance

#### `fix-media-upload-flags.js`

Corrects the `aufnahmeHochladen` (media upload) flags in the `sichtungen` table based on actual file existence in `sichtungen_dateien`.

**Purpose:**

- Ensures data consistency between sighting records and their associated media files
- Sets flag to `1` when files exist, `0` when no files are present
- Useful after data migrations or file cleanup operations

**Usage:**

```bash
# Live update (makes actual changes)
npm run db:fix-media-flags

# Dry run (shows what would be changed without making changes)
npm run db:fix-media-flags:dry-run

# Verbose output (detailed logging)
npm run db:fix-media-flags:verbose

# Combine flags
node src/tools/fix-media-upload-flags.js --dry-run --verbose
```

**Parameters:**

- `--dry-run`: Simulates changes without writing to database
- `--verbose`: Provides detailed output for each processed record

**Output:**

- Summary of total sightings checked
- Count of correct vs incorrect flags
- List of records that need/have been updated
- Validation results (for live updates)

**Safety Features:**

- Dry run mode for safe testing
- Detailed logging of all changes
- Post-update validation
- Graceful error handling
- Database connection cleanup

#### `cleanup-orphaned-uploads.ts`

Removes orphaned media uploads: `sichtungen_dateien` rows that never got linked to a sighting, and files on disk that have no database row.

**Purpose:**

- Uploads create a `sichtungen_dateien` row with `sichtung_id = NULL` before the sighting exists; abandoned forms leave that row — and the file — behind forever
- Those rows carry `exif_daten` including GPS coordinates for reports that were never submitted
- Files without a row accumulate because deleting a sighting cascades the rows but leaves the files on disk

**Same logic is reachable over HTTP** via `POST /api/admin/cleanup-orphans` —
from the admin UI or an external web cron using `CLEANUP_TOKEN`. Both share the
core in `#lib/server/media/orphanCleanup.js`. This CLI stays for runs without a
running application and for unbounded batches (the endpoint caps each call at
500 findings to stay under proxy timeouts).

**Usage:**

```bash
# Dry run first (this is the default — no flag needed)
npm run media:cleanup-orphans:dry-run

# Delete for real, after taking a backup
npm run media:cleanup-orphans -- --execute
```

**Parameters:**

- `--older-than=<n>h|<n>d`: Retention period, default `24h`. Only entries strictly older are removed.
- `--execute`: Actually delete. Without it the tool only reports.
- `--verbose`: List every finding individually
- `--uploads-dir=<path>`: Override the upload directory (defaults to `uploads` relative to the working directory, matching the application)

**Safety Features:**

- Dry run is the default; deletion requires `--execute`
- Refuses to run without `DATABASE_POSTGRES_URL` or `DATABASE_URL` — never guesses a target database
- Refuses to run when `STORAGE_PROVIDER` is set to anything other than `local`
- Age filter protects uploads still in progress (the file is written before the row)
- Paths are compared as Unicode NFC — macOS reports filenames decomposed, PostgreSQL composed. Without this every file with an umlaut would look orphaned.
- A file is also spared when its directory matches a `sichtungen.referenz_id`, even with no row pointing at it — in that case it is the only remaining copy
- Every deletion path is validated against the resolved upload directory
- `uploads/_old_uploads/` and dotfiles (`.DS_Store`, `.gitkeep`) are excluded

**Before the first `--execute` run:** back up both the database and the upload directory. Deleted files are not recoverable. `DATABASE_POSTGRES_URL` usually lives only in `.env`, so run `set -a && . ./.env && set +a` before `pg_dump` — otherwise it silently connects elsewhere.

#### `refresh-email-template.ts`

Pulls the seeded notification email template in `app_config` up to the current code default.

**Purpose:**

- The template is seeded once (`initializeDefaultConfigurations()` → `insertManyIfAbsent`) and read from the database afterwards: `ConfigRepository.getString('notification.email.template', NOTIFICATION_EMAIL_DEFAULT_TEMPLATE)`
- The database value **wins** over the code default, so editing `src/lib/server/templates/notificationEmailDefault.ts` has no effect on any existing installation
- Without this tool the only way to update a seeded template would be `resetToDefaultConfigurations()`, which overwrites **every** key — including recipients and SMTP credentials

**Usage:**

```bash
# Show what would happen
npm run config:refresh-email-template:dry-run

# Pull the seed forward
npm run config:refresh-email-template
```

**Parameters:**

- `--dry-run`: Report only, change nothing
- `--force`: Overwrite even a customised template (discards it!)

**Safety Features:**

- Overwrites only when the stored value's SHA-256 matches a known shipped default (`PREVIOUS_SHIPPED_TEMPLATE_HASHES`). A customised customer template is never silently replaced.
- Exits with code 1 on a customised template and prints the Handlebars placeholders that need to be inserted by hand
- Idempotent: a value that already equals the current default is left untouched, so `updated_at` does not churn
- Touches exactly one key — never the recipient or SMTP settings
- Refuses to run without `DATABASE_POSTGRES_URL` or `DATABASE_URL` — never guesses a target database. Shares `resolveConnectionString()` with `cleanup-orphaned-uploads.ts` (`dbConnection.ts`); a git worktree regularly has no `.env`, and that is exactly where a guessed default would have written to the wrong database.
- The connection is opened inside `main()`, so importing the module for tests neither reads `.env` nor opens a pool

**When changing the template:** add the _old_ hash to `PREVIOUS_SHIPPED_TEMPLATE_HASHES` in `src/lib/server/templates/notificationEmailDefault.ts`. `notificationEmailDefault.test.ts` pins the current hash and fails on every change to force this. Skipping it cuts off the upgrade path for every existing installation.

**Note:** a running instance caches configuration for 5 minutes — the new template takes effect after that, or after a restart.

**Which database:** the tool uses `DATABASE_POSTGRES_URL` (or `DATABASE_URL`) and aborts with exit code 2 if neither is set. In practice that is the local Postgres, currently the only live dataset — the new production database will be seeded from it, and the old Supabase production has had its records deleted for data-protection reasons. A run against the local database is therefore complete; there is no separate production step to schedule.

### 3. Data Migration

#### `generate-reference-ids.ts`

Generates CUID2 `referenceId` values for all sightings that don't have one yet — needed for the reference-ID-based URL structure and upload paths.

**Purpose:**

- Reuses an existing `referenceId` from associated `sichtungen_dateien` rows if present
- Otherwise generates a new CUID2 and writes it to `sichtungen.referenz_id`
- Never overwrites a `referenceId` that is already set

**Usage:**

```bash
npx tsx --env-file=.env src/tools/generate-reference-ids.ts
```

#### `migrate-old-uploads.ts`

Migrates files from the legacy `sichtungen.aufnahme` column into the `sichtungen_dateien` table and the new `uploads/{referenz_id}/` file layout.

**Purpose:**

- Sets `aufnahmeHochladen = 1` for sightings with a legacy upload
- Creates `sichtungen_dateien` entries with full metadata, extracting EXIF data (GPS, camera info) from images
- Copies files from `uploads/_old_uploads/` to `uploads/{referenz_id}/`, preserving the originals

**Usage:**

```bash
npx tsx --env-file=.env src/tools/migrate-old-uploads.ts
```

#### `migrate-timestamps-to-utc.js`

One-time migration converting naive legacy timestamps (`sichtungsdatum`, `created`, `freigegeben_am`, `hochgeladen_am`, `erstellt_am`) from German local time (Europe/Berlin wall-clock) to real UTC. Required after importing any pre-migration data — see `docs/DATABASE_MIGRATION.md` and `docs/ENVIRONMENT.md#tz`.

**Purpose:**

- Converts all rows created before a given `--cutover` timestamp from Europe/Berlin wall-clock to UTC
- Refuses to run twice (marker in `app_config`) and refuses to touch rows that already look like app-written UTC data, unless explicitly excluded
- Reports timestamps affected by the DST spring-forward gap or autumn repeated hour

**Usage:**

```bash
# Dry run first (required before any live run) — take a DB backup beforehand
npm run db:migrate-timestamps-utc:dry-run -- --cutover=<ISO>

# Live run
npm run db:migrate-timestamps-utc -- --cutover=<ISO>
```

## Development Guidelines

### Creating New Tools

1. **Location**: Place scripts in `src/tools/`
2. **Naming**: Use kebab-case with descriptive names
3. **Documentation**: Include JSDoc headers with usage examples
4. **Safety**: Always include dry-run functionality for destructive operations
5. **Logging**: Provide clear, informative output
6. **npm Scripts**: Add corresponding entries in `package.json`

### Script Template

```javascript
#!/usr/bin/env node

/**
 * @fileoverview Brief description of what the script does
 *
 * Detailed explanation of the script's purpose and functionality.
 *
 * Usage:
 *   node src/tools/script-name.js [--options]
 *
 * @author Ostsee-Tiere Team
 * @since version
 */

// Import statements
// Configuration parsing
// Main functionality
// Error handling
// Cleanup
```

### Database Scripts

For scripts that interact with the database:

1. **Use environment variables** for connection strings
2. **Include proper error handling** and connection cleanup
3. **Implement dry-run mode** for any destructive operations
4. **Provide detailed logging** of all database operations
5. **Validate results** after making changes

### Best Practices

- **Test thoroughly** with dry-run before live execution
- **Document all parameters** and expected behavior
- **Handle edge cases** gracefully
- **Provide meaningful error messages**
- **Use consistent coding style** with the rest of the project
- **Include proper TypeScript/JSDoc** for maintainability

## Running Tools

### Prerequisites

1. **Database Connection**: Ensure PostgreSQL is running

   ```bash
   npm run db:start
   ```

2. **Environment Variables**: Set `DATABASE_POSTGRES_URL` if using non-default connection

   ```bash
   export DATABASE_POSTGRES_URL="postgresql://user:password@host:port/database"
   ```

3. **Dependencies**: Install all project dependencies
   ```bash
   npm install
   ```

### Execution

Most tools are integrated with npm scripts for convenience:

```bash
# List all available scripts
npm run

# Execute specific tools
npm run db:fix-media-flags:dry-run
npm run generate:licenses
```

### Monitoring

Tools provide structured output suitable for:

- **Manual review** during development
- **CI/CD integration** for automated maintenance
- **Logging systems** for production monitoring

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify PostgreSQL is running: `npm run db:start`
   - Check connection string format
   - Ensure database exists and is accessible

2. **Permission Errors**
   - Verify script has execute permissions: `chmod +x src/tools/script.js`
   - Check file system permissions for output files

3. **Dependency Issues**
   - Run `npm install` to ensure all dependencies are available
   - Check Node.js version compatibility

### Getting Help

- **Review script output** for specific error messages
- **Check logs** in verbose mode for detailed information
- **Use dry-run mode** to test without making changes
- **Consult project documentation** for database schema details

---

For questions or issues with tools, please consult the project documentation or open an issue in the repository.
