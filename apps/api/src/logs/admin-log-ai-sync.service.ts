import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { type AiHistoryAdminSyncRecord } from '../history/ai-history.repository';
import { syncAdminAiLogEventsFromAiRequestEvent } from './admin-log-ai-sync';

@Injectable()
export class AdminLogAiSyncService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async syncFromAiRequestEvent(aiRequest: AiHistoryAdminSyncRecord): Promise<number> {
    return syncAdminAiLogEventsFromAiRequestEvent(this.prisma, aiRequest);
  }
}
