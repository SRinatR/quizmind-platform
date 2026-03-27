import { type QuotaResetJobPayload } from '@quizmind/contracts';

import { resetQuotaCounter, type QuotaResetResult } from './reset-quota-counter';

export interface QuotaResetJobResult extends QuotaResetResult {
  processed: boolean;
  requestedAt: string;
}

export function processQuotaResetJob(payload: QuotaResetJobPayload): QuotaResetJobResult {
  const result = resetQuotaCounter(
    {
      workspaceId: payload.workspaceId,
      key: payload.key,
      consumed: payload.consumed,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
    },
    payload.nextPeriodStart,
    payload.nextPeriodEnd,
  );

  return {
    processed: true,
    requestedAt: payload.requestedAt,
    ...result,
  };
}
