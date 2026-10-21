import { createLogger } from '#lib/logger.server.ts';
import { db } from '#lib/server/db/index.ts';
import { auditLogs } from '#lib/server/db/schema.ts';

const logger = createLogger('audit');

export type AuditAction =
	| 'sighting.edit'
	| 'sighting.delete'
	| 'sighting.verify'
	| 'sighting.weather.refresh'
	| 'sighting.spam_rescore'
	| 'file.delete'
	| 'file.cleanup_orphans'
	| 'config.update'
	| 'config.delete'
	| 'auth.login_success'
	| 'auth.login_failure'
	| 'auth.logout'
	| 'auth.session_revoked'
	| 'export.download';

export type ResourceType = 'sighting' | 'file' | 'config' | 'auth' | 'export';

export interface AuditEvent {
	action: AuditAction;
	resourceType: ResourceType;
	resourceId?: string;
	userEmail?: string;
	ipAddress?: string;
	details?: Record<string, unknown>;
	status?: 'success' | 'failure';
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
	try {
		await db.insert(auditLogs).values({
			action: event.action,
			resourceType: event.resourceType,
			resourceId: event.resourceId ?? null,
			userEmail: event.userEmail ?? null,
			ipAddress: event.ipAddress ?? null,
			details: event.details ?? null,
			status: event.status ?? 'success'
		});
	} catch (err) {
		// Audit errors must never propagate to callers — log and continue
		logger.error({ err, event }, 'audit_log_write_failed');
	}
}
