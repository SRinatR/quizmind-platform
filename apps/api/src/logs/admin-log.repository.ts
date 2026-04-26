import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type EventSeverity } from '@quizmind/database';
import { type AdminLogSeverityFilter, type AdminLogStream } from '@quizmind/contracts';

import { PrismaService } from '../database/prisma.service';

const userSelect = {
  id: true,
  email: true,
  displayName: true,
} satisfies Prisma.UserSelect;

const auditLogDetailSelect = {
  id: true,
  actorId: true,
  action: true,
  targetType: true,
  targetId: true,
  metadataJson: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

const activityLogDetailSelect = {
  id: true,
  actorId: true,
  eventType: true,
  metadataJson: true,
  createdAt: true,
} satisfies Prisma.ActivityLogSelect;

const securityEventDetailSelect = {
  id: true,
  actorId: true,
  eventType: true,
  severity: true,
  metadataJson: true,
  createdAt: true,
} satisfies Prisma.SecurityEventSelect;

const domainEventDetailSelect = {
  id: true,
  eventType: true,
  payloadJson: true,
  createdAt: true,
} satisfies Prisma.DomainEventSelect;

export interface AdminLogListRecord {
  id: string;
  stream: AdminLogStream;
  sourceRecordId: string;
  eventType: string;
  summary: string;
  occurredAt: Date;
  severity: EventSeverity | null;
  status: 'success' | 'failure' | null;
  actorId: string | null;
  actorEmail: string | null;
  actorDisplayName: string | null;
  targetType: string | null;
  targetId: string | null;
  category: 'auth' | 'extension' | 'ai' | 'admin' | 'system' | null;
  source: 'web' | 'extension' | 'api' | 'worker' | 'webhook' | null;
  installationId: string | null;
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  costUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  errorSummary: string | null;
}

interface ListAdminLogsInput {
  stream?: AdminLogStream | 'all';
  severity?: AdminLogSeverityFilter;
  search?: string;
  category?: 'auth' | 'extension' | 'ai' | 'admin' | 'system';
  source?: 'web' | 'extension' | 'api' | 'worker' | 'webhook';
  status?: 'success' | 'failure';
  eventType?: string;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
}

interface ListAdminLogsResult {
  items: AdminLogListRecord[];
  hasNext: boolean;
  nextCursor: string | null;
}

interface ParsedCursor {
  occurredAt: Date;
  sourceRecordId: string;
  stream: AdminLogStream;
}

const VALID_STREAMS: ReadonlySet<AdminLogStream> = new Set(['audit', 'activity', 'security', 'domain']);

@Injectable()
export class AdminLogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private parseCursor(cursor?: string): ParsedCursor | null {
    if (!cursor) return null;

    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        occurredAt?: string;
        sourceRecordId?: string;
        stream?: string;
      };
      if (!decoded.occurredAt || !decoded.sourceRecordId || !decoded.stream) return null;
      if (!VALID_STREAMS.has(decoded.stream as AdminLogStream)) return null;
      const occurredAt = new Date(decoded.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) return null;
      return {
        occurredAt,
        sourceRecordId: decoded.sourceRecordId,
        stream: decoded.stream as AdminLogStream,
      };
    } catch {
      return null;
    }
  }

  private encodeCursor(item: AdminLogListRecord): string {
    return Buffer.from(
      JSON.stringify({
        occurredAt: item.occurredAt.toISOString(),
        sourceRecordId: item.sourceRecordId,
        stream: item.stream,
      }),
      'utf8',
    ).toString('base64url');
  }

  async listPage(input: ListAdminLogsInput): Promise<ListAdminLogsResult> {
    const fromDate = input.from ? new Date(input.from) : undefined;
    const toDate = input.to ? new Date(input.to) : undefined;
    const cursor = this.parseCursor(input.cursor);
    const take = Math.min(100, Math.max(1, input.limit));

    const conditions: Prisma.Sql[] = [];
    if (input.stream && input.stream !== 'all') conditions.push(Prisma.sql`stream = ${input.stream}`);
    if (input.severity && input.severity !== 'all') conditions.push(Prisma.sql`severity = ${input.severity}`);
    if (input.category) conditions.push(Prisma.sql`category = ${input.category}`);
    if (input.source) conditions.push(Prisma.sql`source = ${input.source}`);
    if (input.status) conditions.push(Prisma.sql`status = ${input.status}`);
    if (input.eventType) conditions.push(Prisma.sql`event_type ILIKE ${`%${input.eventType}%`}`);
    if (input.search?.trim()) conditions.push(Prisma.sql`search_text ILIKE ${`%${input.search.trim()}%`}`);
    if (fromDate && !Number.isNaN(fromDate.getTime())) conditions.push(Prisma.sql`occurred_at >= ${fromDate}`);
    if (toDate && !Number.isNaN(toDate.getTime())) conditions.push(Prisma.sql`occurred_at <= ${toDate}`);
    if (cursor) {
      conditions.push(
        Prisma.sql`(occurred_at, source_record_id, stream) < (${cursor.occurredAt}, ${cursor.sourceRecordId}, ${cursor.stream})`,
      );
    }

    const whereSql = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<AdminLogListRecord[]>(Prisma.sql`
      WITH all_logs AS (
        SELECT
          'audit'::text AS stream,
          a.id AS source_record_id,
          a.action AS event_type,
          COALESCE(a."metadataJson"->>'summary', CONCAT('Audit event ', a.action, ' on ', a."targetType", ' ', a."targetId", '.')) AS summary,
          a."createdAt" AS occurred_at,
          CASE
            WHEN a."metadataJson"->>'severity' IN ('debug', 'info', 'warn', 'error') THEN (a."metadataJson"->>'severity')::"EventSeverity"
            ELSE NULL
          END AS severity,
          CASE
            WHEN a."metadataJson"->>'status' IN ('success', 'failure') THEN a."metadataJson"->>'status'
            ELSE NULL
          END AS status,
          a."actorId" AS actor_id,
          u.email AS actor_email,
          u."displayName" AS actor_display_name,
          a."targetType" AS target_type,
          a."targetId" AS target_id,
          CASE
            WHEN LOWER(a.action) LIKE 'auth.%' OR LOWER(a.action) LIKE '%.login%' OR LOWER(a.action) LIKE '%login_failed%' OR LOWER(a.action) LIKE '%login_success%' OR LOWER(a.action) LIKE '%password_reset%' OR LOWER(a.action) LIKE '%session_expired%' OR LOWER(a.action) LIKE '%session_revoked%' OR LOWER(a.action) LIKE '%.otp%' OR LOWER(a.action) LIKE '%.mfa%' THEN 'auth'
            WHEN LOWER(a.action) LIKE 'extension.%' OR LOWER(a.action) LIKE '%installation%' OR LOWER(a.action) LIKE '%bootstrap%' THEN 'extension'
            WHEN LOWER(a.action) LIKE 'ai.%' OR LOWER(a.action) LIKE '%quiz_answer%' OR LOWER(a.action) LIKE '%ai_request%' OR LOWER(a.action) LIKE '%proxy_request%' OR COALESCE(a."metadataJson"->>'provider', '') <> '' OR COALESCE(a."metadataJson"->>'model', '') <> '' THEN 'ai'
            ELSE 'admin'
          END AS category,
          CASE
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) IN ('web', 'web_app', 'dashboard') THEN 'web'
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) IN ('extension', 'content_script', 'extension_popup') THEN 'extension'
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) = 'api' THEN 'api'
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) IN ('worker', 'queue') THEN 'worker'
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) = 'webhook' THEN 'webhook'
            WHEN LOWER(a.action) LIKE 'webhook.%' OR LOWER(a.action) LIKE '%webhook_%' THEN 'webhook'
            ELSE NULL
          END AS source,
          a."metadataJson"->>'installationId' AS installation_id,
          a."metadataJson"->>'provider' AS provider,
          a."metadataJson"->>'model' AS model,
          NULLIF(a."metadataJson"->>'durationMs', '')::int AS duration_ms,
          NULLIF(a."metadataJson"->>'costUsd', '')::double precision AS cost_usd,
          NULLIF(a."metadataJson"->>'promptTokens', '')::int AS prompt_tokens,
          NULLIF(a."metadataJson"->>'completionTokens', '')::int AS completion_tokens,
          NULLIF(a."metadataJson"->>'totalTokens', '')::int AS total_tokens,
          LEFT(COALESCE(a."metadataJson"->>'errorMessage', a."metadataJson"->>'error', a."metadataJson"->>'errorSummary', ''), 200) AS error_summary,
          LOWER(CONCAT_WS(' ', 'audit', a.action, a."targetType", a."targetId", COALESCE(a."metadataJson"->>'summary', ''), COALESCE(u.email, ''), COALESCE(u."displayName", ''), COALESCE(a."metadataJson"::text, ''))) AS search_text
        FROM "AuditLog" a
        LEFT JOIN "User" u ON u.id = a."actorId"

        UNION ALL

        SELECT
          'activity'::text AS stream,
          a.id AS source_record_id,
          a."eventType" AS event_type,
          COALESCE(a."metadataJson"->>'summary', a."eventType") AS summary,
          a."createdAt" AS occurred_at,
          CASE
            WHEN a."metadataJson"->>'severity' IN ('debug', 'info', 'warn', 'error') THEN (a."metadataJson"->>'severity')::"EventSeverity"
            ELSE NULL
          END AS severity,
          CASE
            WHEN a."metadataJson"->>'status' IN ('success', 'failure') THEN a."metadataJson"->>'status'
            ELSE NULL
          END AS status,
          a."actorId" AS actor_id,
          u.email AS actor_email,
          u."displayName" AS actor_display_name,
          NULL::text AS target_type,
          NULL::text AS target_id,
          CASE
            WHEN LOWER(a."eventType") LIKE 'auth.%' OR LOWER(a."eventType") LIKE '%.login%' OR LOWER(a."eventType") LIKE '%login_failed%' OR LOWER(a."eventType") LIKE '%login_success%' OR LOWER(a."eventType") LIKE '%password_reset%' OR LOWER(a."eventType") LIKE '%session_expired%' OR LOWER(a."eventType") LIKE '%session_revoked%' OR LOWER(a."eventType") LIKE '%.otp%' OR LOWER(a."eventType") LIKE '%.mfa%' THEN 'auth'
            WHEN LOWER(a."eventType") LIKE 'extension.%' OR LOWER(a."eventType") LIKE '%installation%' OR LOWER(a."eventType") LIKE '%bootstrap%' THEN 'extension'
            WHEN LOWER(a."eventType") LIKE 'ai.%' OR LOWER(a."eventType") LIKE '%quiz_answer%' OR LOWER(a."eventType") LIKE '%ai_request%' OR LOWER(a."eventType") LIKE '%proxy_request%' OR COALESCE(a."metadataJson"->>'provider', '') <> '' OR COALESCE(a."metadataJson"->>'model', '') <> '' THEN 'ai'
            WHEN LOWER(a."eventType") LIKE 'admin.%' OR LOWER(a."eventType") LIKE '%user.%' OR LOWER(a."eventType") LIKE '%ai_provider%' OR LOWER(a."eventType") LIKE '%feature_flag%' OR LOWER(a."eventType") LIKE '%remote_config%' OR LOWER(a."eventType") LIKE '%compatibility_rule%' OR LOWER(a."eventType") LIKE '%support.%' OR LOWER(a."eventType") LIKE '%impersonation%' THEN 'admin'
            ELSE 'system'
          END AS category,
          CASE
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) IN ('web', 'web_app', 'dashboard') THEN 'web'
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) IN ('extension', 'content_script', 'extension_popup') THEN 'extension'
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) = 'api' THEN 'api'
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) IN ('worker', 'queue') THEN 'worker'
            WHEN LOWER(COALESCE(a."metadataJson"->>'source', a."metadataJson"->>'origin', a."metadataJson"->>'platform', a."metadataJson"->>'client', a."metadataJson"->>'requestSource', '')) = 'webhook' THEN 'webhook'
            WHEN LOWER(a."eventType") LIKE 'webhook.%' OR LOWER(a."eventType") LIKE '%webhook_%' THEN 'webhook'
            ELSE NULL
          END AS source,
          a."metadataJson"->>'installationId' AS installation_id,
          a."metadataJson"->>'provider' AS provider,
          a."metadataJson"->>'model' AS model,
          NULLIF(a."metadataJson"->>'durationMs', '')::int AS duration_ms,
          NULLIF(a."metadataJson"->>'costUsd', '')::double precision AS cost_usd,
          NULLIF(a."metadataJson"->>'promptTokens', '')::int AS prompt_tokens,
          NULLIF(a."metadataJson"->>'completionTokens', '')::int AS completion_tokens,
          NULLIF(a."metadataJson"->>'totalTokens', '')::int AS total_tokens,
          LEFT(COALESCE(a."metadataJson"->>'errorMessage', a."metadataJson"->>'error', a."metadataJson"->>'errorSummary', ''), 200) AS error_summary,
          LOWER(CONCAT_WS(' ', 'activity', a."eventType", COALESCE(a."metadataJson"->>'summary', ''), COALESCE(u.email, ''), COALESCE(u."displayName", ''), COALESCE(a."metadataJson"::text, ''))) AS search_text
        FROM "ActivityLog" a
        LEFT JOIN "User" u ON u.id = a."actorId"

        UNION ALL

        SELECT
          'security'::text AS stream,
          s.id AS source_record_id,
          s."eventType" AS event_type,
          COALESCE(s."metadataJson"->>'summary', s."eventType") AS summary,
          s."createdAt" AS occurred_at,
          s.severity AS severity,
          CASE
            WHEN s."metadataJson"->>'status' IN ('success', 'failure') THEN s."metadataJson"->>'status'
            ELSE NULL
          END AS status,
          s."actorId" AS actor_id,
          u.email AS actor_email,
          u."displayName" AS actor_display_name,
          NULL::text AS target_type,
          NULL::text AS target_id,
          CASE
            WHEN LOWER(s."eventType") LIKE 'auth.%' OR LOWER(s."eventType") LIKE '%.login%' OR LOWER(s."eventType") LIKE '%login_failed%' OR LOWER(s."eventType") LIKE '%login_success%' OR LOWER(s."eventType") LIKE '%password_reset%' OR LOWER(s."eventType") LIKE '%session_expired%' OR LOWER(s."eventType") LIKE '%session_revoked%' OR LOWER(s."eventType") LIKE '%.otp%' OR LOWER(s."eventType") LIKE '%.mfa%' THEN 'auth'
            WHEN LOWER(s."eventType") LIKE 'extension.%' OR LOWER(s."eventType") LIKE '%installation%' OR LOWER(s."eventType") LIKE '%bootstrap%' THEN 'extension'
            WHEN LOWER(s."eventType") LIKE 'ai.%' OR LOWER(s."eventType") LIKE '%quiz_answer%' OR LOWER(s."eventType") LIKE '%ai_request%' OR LOWER(s."eventType") LIKE '%proxy_request%' OR COALESCE(s."metadataJson"->>'provider', '') <> '' OR COALESCE(s."metadataJson"->>'model', '') <> '' THEN 'ai'
            WHEN LOWER(s."eventType") LIKE 'admin.%' OR LOWER(s."eventType") LIKE '%user.%' OR LOWER(s."eventType") LIKE '%ai_provider%' OR LOWER(s."eventType") LIKE '%feature_flag%' OR LOWER(s."eventType") LIKE '%remote_config%' OR LOWER(s."eventType") LIKE '%compatibility_rule%' OR LOWER(s."eventType") LIKE '%support.%' OR LOWER(s."eventType") LIKE '%impersonation%' THEN 'admin'
            ELSE 'system'
          END AS category,
          CASE
            WHEN LOWER(COALESCE(s."metadataJson"->>'source', s."metadataJson"->>'origin', s."metadataJson"->>'platform', s."metadataJson"->>'client', s."metadataJson"->>'requestSource', '')) IN ('web', 'web_app', 'dashboard') THEN 'web'
            WHEN LOWER(COALESCE(s."metadataJson"->>'source', s."metadataJson"->>'origin', s."metadataJson"->>'platform', s."metadataJson"->>'client', s."metadataJson"->>'requestSource', '')) IN ('extension', 'content_script', 'extension_popup') THEN 'extension'
            WHEN LOWER(COALESCE(s."metadataJson"->>'source', s."metadataJson"->>'origin', s."metadataJson"->>'platform', s."metadataJson"->>'client', s."metadataJson"->>'requestSource', '')) = 'api' THEN 'api'
            WHEN LOWER(COALESCE(s."metadataJson"->>'source', s."metadataJson"->>'origin', s."metadataJson"->>'platform', s."metadataJson"->>'client', s."metadataJson"->>'requestSource', '')) IN ('worker', 'queue') THEN 'worker'
            WHEN LOWER(COALESCE(s."metadataJson"->>'source', s."metadataJson"->>'origin', s."metadataJson"->>'platform', s."metadataJson"->>'client', s."metadataJson"->>'requestSource', '')) = 'webhook' THEN 'webhook'
            WHEN LOWER(s."eventType") LIKE 'webhook.%' OR LOWER(s."eventType") LIKE '%webhook_%' THEN 'webhook'
            ELSE NULL
          END AS source,
          s."metadataJson"->>'installationId' AS installation_id,
          s."metadataJson"->>'provider' AS provider,
          s."metadataJson"->>'model' AS model,
          NULLIF(s."metadataJson"->>'durationMs', '')::int AS duration_ms,
          NULLIF(s."metadataJson"->>'costUsd', '')::double precision AS cost_usd,
          NULLIF(s."metadataJson"->>'promptTokens', '')::int AS prompt_tokens,
          NULLIF(s."metadataJson"->>'completionTokens', '')::int AS completion_tokens,
          NULLIF(s."metadataJson"->>'totalTokens', '')::int AS total_tokens,
          LEFT(COALESCE(s."metadataJson"->>'errorMessage', s."metadataJson"->>'error', s."metadataJson"->>'errorSummary', ''), 200) AS error_summary,
          LOWER(CONCAT_WS(' ', 'security', s."eventType", COALESCE(s."metadataJson"->>'summary', ''), COALESCE(u.email, ''), COALESCE(u."displayName", ''), COALESCE(s."metadataJson"::text, ''))) AS search_text
        FROM "SecurityEvent" s
        LEFT JOIN "User" u ON u.id = s."actorId"

        UNION ALL

        SELECT
          'domain'::text AS stream,
          d.id AS source_record_id,
          d."eventType" AS event_type,
          COALESCE(d."payloadJson"->>'summary', d."eventType") AS summary,
          d."createdAt" AS occurred_at,
          CASE
            WHEN d."payloadJson"->>'severity' IN ('debug', 'info', 'warn', 'error') THEN (d."payloadJson"->>'severity')::"EventSeverity"
            ELSE NULL
          END AS severity,
          CASE
            WHEN d."payloadJson"->>'status' IN ('success', 'failure') THEN d."payloadJson"->>'status'
            ELSE NULL
          END AS status,
          NULL::text AS actor_id,
          NULL::text AS actor_email,
          NULL::text AS actor_display_name,
          NULL::text AS target_type,
          NULL::text AS target_id,
          CASE
            WHEN LOWER(d."eventType") LIKE 'auth.%' OR LOWER(d."eventType") LIKE '%.login%' OR LOWER(d."eventType") LIKE '%login_failed%' OR LOWER(d."eventType") LIKE '%login_success%' OR LOWER(d."eventType") LIKE '%password_reset%' OR LOWER(d."eventType") LIKE '%session_expired%' OR LOWER(d."eventType") LIKE '%session_revoked%' OR LOWER(d."eventType") LIKE '%.otp%' OR LOWER(d."eventType") LIKE '%.mfa%' THEN 'auth'
            WHEN LOWER(d."eventType") LIKE 'extension.%' OR LOWER(d."eventType") LIKE '%installation%' OR LOWER(d."eventType") LIKE '%bootstrap%' THEN 'extension'
            WHEN LOWER(d."eventType") LIKE 'ai.%' OR LOWER(d."eventType") LIKE '%quiz_answer%' OR LOWER(d."eventType") LIKE '%ai_request%' OR LOWER(d."eventType") LIKE '%proxy_request%' OR COALESCE(d."payloadJson"->>'provider', '') <> '' OR COALESCE(d."payloadJson"->>'model', '') <> '' THEN 'ai'
            WHEN LOWER(d."eventType") LIKE 'admin.%' OR LOWER(d."eventType") LIKE '%user.%' OR LOWER(d."eventType") LIKE '%ai_provider%' OR LOWER(d."eventType") LIKE '%feature_flag%' OR LOWER(d."eventType") LIKE '%remote_config%' OR LOWER(d."eventType") LIKE '%compatibility_rule%' OR LOWER(d."eventType") LIKE '%support.%' OR LOWER(d."eventType") LIKE '%impersonation%' THEN 'admin'
            ELSE 'system'
          END AS category,
          CASE
            WHEN LOWER(COALESCE(d."payloadJson"->>'source', d."payloadJson"->>'origin', d."payloadJson"->>'platform', d."payloadJson"->>'client', d."payloadJson"->>'requestSource', '')) IN ('web', 'web_app', 'dashboard') THEN 'web'
            WHEN LOWER(COALESCE(d."payloadJson"->>'source', d."payloadJson"->>'origin', d."payloadJson"->>'platform', d."payloadJson"->>'client', d."payloadJson"->>'requestSource', '')) IN ('extension', 'content_script', 'extension_popup') THEN 'extension'
            WHEN LOWER(COALESCE(d."payloadJson"->>'source', d."payloadJson"->>'origin', d."payloadJson"->>'platform', d."payloadJson"->>'client', d."payloadJson"->>'requestSource', '')) = 'api' THEN 'api'
            WHEN LOWER(COALESCE(d."payloadJson"->>'source', d."payloadJson"->>'origin', d."payloadJson"->>'platform', d."payloadJson"->>'client', d."payloadJson"->>'requestSource', '')) IN ('worker', 'queue') THEN 'worker'
            WHEN LOWER(COALESCE(d."payloadJson"->>'source', d."payloadJson"->>'origin', d."payloadJson"->>'platform', d."payloadJson"->>'client', d."payloadJson"->>'requestSource', '')) = 'webhook' THEN 'webhook'
            WHEN LOWER(d."eventType") LIKE 'webhook.%' OR LOWER(d."eventType") LIKE '%webhook_%' THEN 'webhook'
            ELSE NULL
          END AS source,
          d."payloadJson"->>'installationId' AS installation_id,
          d."payloadJson"->>'provider' AS provider,
          d."payloadJson"->>'model' AS model,
          NULLIF(d."payloadJson"->>'durationMs', '')::int AS duration_ms,
          NULLIF(d."payloadJson"->>'costUsd', '')::double precision AS cost_usd,
          NULLIF(d."payloadJson"->>'promptTokens', '')::int AS prompt_tokens,
          NULLIF(d."payloadJson"->>'completionTokens', '')::int AS completion_tokens,
          NULLIF(d."payloadJson"->>'totalTokens', '')::int AS total_tokens,
          LEFT(COALESCE(d."payloadJson"->>'errorMessage', d."payloadJson"->>'error', d."payloadJson"->>'errorSummary', ''), 200) AS error_summary,
          LOWER(CONCAT_WS(' ', 'domain', d."eventType", COALESCE(d."payloadJson"->>'summary', ''), COALESCE(d."payloadJson"::text, ''))) AS search_text
        FROM "DomainEvent" d
      )
      SELECT
        CONCAT(stream, ':', source_record_id) AS id,
        stream,
        source_record_id AS "sourceRecordId",
        event_type AS "eventType",
        summary,
        occurred_at AS "occurredAt",
        severity,
        status,
        actor_id AS "actorId",
        actor_email AS "actorEmail",
        actor_display_name AS "actorDisplayName",
        target_type AS "targetType",
        target_id AS "targetId",
        category,
        source,
        installation_id AS "installationId",
        provider,
        model,
        duration_ms AS "durationMs",
        cost_usd AS "costUsd",
        prompt_tokens AS "promptTokens",
        completion_tokens AS "completionTokens",
        total_tokens AS "totalTokens",
        error_summary AS "errorSummary"
      FROM all_logs
      ${whereSql}
      ORDER BY occurred_at DESC, source_record_id DESC, stream DESC
      LIMIT ${take + 1}
    `);

    const hasNext = rows.length > take;
    const items = hasNext ? rows.slice(0, take) : rows;
    const nextCursor = hasNext && items.length > 0 ? this.encodeCursor(items[items.length - 1]!) : null;

    return { items, hasNext, nextCursor };
  }

  async findOne(compositeId: string): Promise<
    | {
        item: AdminLogListRecord;
        metadata: Record<string, unknown> | undefined;
      }
    | null
  > {
    const [stream, recordId] = compositeId.split(':');
    if (!stream || !recordId || !VALID_STREAMS.has(stream as AdminLogStream)) return null;

    if (stream === 'audit') {
      const row = await this.prisma.auditLog.findUnique({ where: { id: recordId }, select: auditLogDetailSelect });
      if (!row) return null;
      const actor = row.actorId
        ? await this.prisma.user.findUnique({ where: { id: row.actorId }, select: userSelect })
        : null;
      return {
        item: {
          id: compositeId,
          stream: 'audit',
          sourceRecordId: row.id,
          eventType: row.action,
          summary: (typeof (row.metadataJson as any)?.summary === 'string' ? (row.metadataJson as any).summary : null) ??
            `Audit event ${row.action} on ${row.targetType} ${row.targetId}.`,
          occurredAt: row.createdAt,
          severity: null,
          status: null,
          actorId: row.actorId,
          actorEmail: actor?.email ?? null,
          actorDisplayName: actor?.displayName ?? null,
          targetType: row.targetType,
          targetId: row.targetId,
          category: null,
          source: null,
          installationId: null,
          provider: null,
          model: null,
          durationMs: null,
          costUsd: null,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          errorSummary: null,
        },
        metadata: this.toObject(row.metadataJson),
      };
    }

    if (stream === 'activity') {
      const row = await this.prisma.activityLog.findUnique({ where: { id: recordId }, select: activityLogDetailSelect });
      if (!row) return null;
      const actor = row.actorId
        ? await this.prisma.user.findUnique({ where: { id: row.actorId }, select: userSelect })
        : null;
      return {
        item: {
          id: compositeId,
          stream: 'activity',
          sourceRecordId: row.id,
          eventType: row.eventType,
          summary: (typeof (row.metadataJson as any)?.summary === 'string' ? (row.metadataJson as any).summary : row.eventType),
          occurredAt: row.createdAt,
          severity: null,
          status: null,
          actorId: row.actorId,
          actorEmail: actor?.email ?? null,
          actorDisplayName: actor?.displayName ?? null,
          targetType: null,
          targetId: null,
          category: null,
          source: null,
          installationId: null,
          provider: null,
          model: null,
          durationMs: null,
          costUsd: null,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          errorSummary: null,
        },
        metadata: this.toObject(row.metadataJson),
      };
    }

    if (stream === 'security') {
      const row = await this.prisma.securityEvent.findUnique({ where: { id: recordId }, select: securityEventDetailSelect });
      if (!row) return null;
      const actor = row.actorId
        ? await this.prisma.user.findUnique({ where: { id: row.actorId }, select: userSelect })
        : null;
      return {
        item: {
          id: compositeId,
          stream: 'security',
          sourceRecordId: row.id,
          eventType: row.eventType,
          summary: (typeof (row.metadataJson as any)?.summary === 'string' ? (row.metadataJson as any).summary : row.eventType),
          occurredAt: row.createdAt,
          severity: row.severity,
          status: null,
          actorId: row.actorId,
          actorEmail: actor?.email ?? null,
          actorDisplayName: actor?.displayName ?? null,
          targetType: null,
          targetId: null,
          category: null,
          source: null,
          installationId: null,
          provider: null,
          model: null,
          durationMs: null,
          costUsd: null,
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          errorSummary: null,
        },
        metadata: this.toObject(row.metadataJson),
      };
    }

    const row = await this.prisma.domainEvent.findUnique({ where: { id: recordId }, select: domainEventDetailSelect });
    if (!row) return null;
    return {
      item: {
        id: compositeId,
        stream: 'domain',
        sourceRecordId: row.id,
        eventType: row.eventType,
        summary: (typeof (row.payloadJson as any)?.summary === 'string' ? (row.payloadJson as any).summary : row.eventType),
        occurredAt: row.createdAt,
        severity: null,
        status: null,
        actorId: null,
        actorEmail: null,
        actorDisplayName: null,
        targetType: null,
        targetId: null,
        category: null,
        source: null,
        installationId: null,
        provider: null,
        model: null,
        durationMs: null,
        costUsd: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        errorSummary: null,
      },
      metadata: this.toObject(row.payloadJson),
    };
  }

  private toObject(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  }

  async pruneExpiredLogs(now = new Date()): Promise<{ activity: number; domain: number; security: number; audit: number }> {
    const activityCutoff = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 90);
    const domainCutoff = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 90);
    const securityCutoff = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 365);
    const auditCutoff = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 365 * 2);

    const [activity, domain, security, audit] = await this.prisma.$transaction([
      this.prisma.activityLog.deleteMany({ where: { createdAt: { lt: activityCutoff } } }),
      this.prisma.domainEvent.deleteMany({ where: { createdAt: { lt: domainCutoff } } }),
      this.prisma.securityEvent.deleteMany({ where: { createdAt: { lt: securityCutoff } } }),
      this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
    ]);

    return { activity: activity.count, domain: domain.count, security: security.count, audit: audit.count };
  }
}
