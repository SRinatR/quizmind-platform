import {
  GoneException,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { parseBearerToken } from '@quizmind/auth';
import { type AiHistoryListFilters, type AiRequestStatus, type AiRequestType, type ApiSuccess } from '@quizmind/contracts';

import { AuthService } from '../auth/auth.service';
import { AiHistoryService } from './ai-history.service';

const MAX_FILENAME_LENGTH = 120;
const fallbackExtensionByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

function parseOptionalString(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  return value.trim();
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function extensionForMimeType(mimeType: string): string {
  return fallbackExtensionByMimeType[mimeType] ?? 'bin';
}

export function sanitizeAttachmentFilename(originalName: string, mimeType: string): string {
  const clean = originalName
    .replace(/[\r\n]/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\\/"<>|:*?]/g, '_')
    .trim()
    .replace(/\s+/g, ' ');
  const fallbackBase = 'attachment';
  const ext = extensionForMimeType(mimeType);
  const normalized = clean.length > 0 ? clean : `${fallbackBase}.${ext}`;
  const splitIndex = normalized.lastIndexOf('.');
  const base = splitIndex > 0 ? normalized.slice(0, splitIndex) : normalized;
  const providedExt = splitIndex > 0 ? normalized.slice(splitIndex + 1).toLowerCase() : '';
  const requiredExt = ext.toLowerCase();
  const safeBase = base.slice(0, MAX_FILENAME_LENGTH).trim() || fallbackBase;
  if (providedExt === requiredExt) {
    return `${safeBase}.${providedExt}`;
  }
  return `${safeBase}.${requiredExt}`;
}

@Controller()
export class AiHistoryController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(AiHistoryService)
    private readonly aiHistoryService: AiHistoryService,
  ) {}

  /**
   * GET /history
   * Returns a paginated list of the current user's AI request history.
   */
  @Get('history')
  async listHistory(
    @Headers('authorization') authorization?: string,
    @Query('limit') limitQ?: string,
    @Query('offset') offsetQ?: string,
    @Query('requestType') requestTypeQ?: string,
    @Query('status') statusQ?: string,
    @Query('model') modelQ?: string,
    @Query('provider') providerQ?: string,
    @Query('from') fromQ?: string,
    @Query('to') toQ?: string,
  ) {
    const session = await this.requireSession(authorization);
    const filters: Partial<AiHistoryListFilters> = {
      limit: parsePositiveInt(limitQ, 25),
      offset: parsePositiveInt(offsetQ, 0) - 1 < 0 ? 0 : parsePositiveInt(offsetQ, 0),
      requestType: parseOptionalString(requestTypeQ) as AiRequestType | undefined,
      status: parseOptionalString(statusQ) as AiRequestStatus | undefined,
      model: parseOptionalString(modelQ),
      provider: parseOptionalString(providerQ),
      from: parseOptionalString(fromQ),
      to: parseOptionalString(toQ),
    };

    const result = await this.aiHistoryService.listHistory(session.user.id, filters);
    return ok(result);
  }

  /**
   * GET /history/:id
   * Returns full detail for a single AI request, including prompt/response content.
   */
  @Get('history/:id')
  async getHistoryDetail(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const session = await this.requireSession(authorization);
    const detail = await this.aiHistoryService.getDetail(id, session.user.id);

    if (!detail) {
      throw new NotFoundException(`History item "${id}" not found.`);
    }

    return ok(detail);
  }

  @Get('history/:id/attachments/:attachmentId/view')
  async viewAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ) {
    const session = await this.requireSession(authorization);
    const attachment = await this.aiHistoryService.getAttachmentForUser({
      userId: session.user.id,
      aiRequestEventId: id,
      attachmentId,
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found.');
    }
    if (attachment.expired) {
      throw new GoneException('Image expired after retention window.');
    }

    const safeFilename = sanitizeAttachmentFilename(attachment.originalName, attachment.mimeType);
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.send(attachment.bytes);
  }

  @Get('history/:id/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() response: Response,
  ) {
    const session = await this.requireSession(authorization);
    const attachment = await this.aiHistoryService.getAttachmentForUser({
      userId: session.user.id,
      aiRequestEventId: id,
      attachmentId,
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found.');
    }
    if (attachment.expired) {
      throw new GoneException('Image expired after retention window.');
    }

    const safeFilename = sanitizeAttachmentFilename(attachment.originalName, attachment.mimeType);
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.send(attachment.bytes);
  }

  /**
   * GET /analytics/ai
   * Returns aggregated AI usage analytics for the current user.
   */
  @Get('analytics/ai')
  async getAnalytics(
    @Headers('authorization') authorization?: string,
    @Query('from') fromQ?: string,
    @Query('to') toQ?: string,
  ) {
    const session = await this.requireSession(authorization);
    const to = toQ ? new Date(toQ) : new Date();
    const from = fromQ ? new Date(fromQ) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const analytics = await this.aiHistoryService.getAnalytics(session.user.id, from, to);
    return ok(analytics);
  }

  private async requireSession(authorization?: string) {
    const accessToken = parseBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing bearer token.');
    return this.authService.getCurrentSession(accessToken);
  }
}
