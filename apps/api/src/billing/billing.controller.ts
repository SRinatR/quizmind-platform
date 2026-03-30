import {
  Controller,
  Inject,
  Post,
  Req,
} from '@nestjs/common';

import { BillingService } from './billing.service';

interface WebhookRequest {
  rawBody?: Buffer;
}

function ok<T>(data: T) {
  return { ok: true as const, data };
}

@Controller()
export class BillingController {
  constructor(
    @Inject(BillingService)
    private readonly billingService: BillingService,
  ) {}

  @Post('billing/webhooks/yookassa')
  async ingestYookassaWebhook(@Req() request: WebhookRequest) {
    return ok(await this.billingService.ingestYookassaWebhook(request.rawBody));
  }
}
