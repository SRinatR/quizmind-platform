import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import {
  type ApiSuccess,
  type BillingAdminPlanUpdateRequest,
  type BillingCheckoutRequest,
  type BillingSubscriptionMutationRequest,
} from '@quizmind/contracts';

import { AuthService } from '../auth/auth.service';
import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { BillingService } from './billing.service';

interface StripeWebhookRequest {
  rawBody?: Buffer;
}

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

@Controller()
export class BillingController {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(BillingService)
    private readonly billingService: BillingService,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Get('billing/plans')
  async listPlans() {
    return ok(await this.billingService.listPlans());
  }

  @Get('admin/plans')
  async listAdminPlans(@Headers('authorization') authorization?: string) {
    return ok(await this.billingService.listAdminPlans(await this.requireConnectedSession(authorization)));
  }

  @Post('admin/plans/update')
  async updatePlanCatalogEntry(
    @Body() request?: Partial<BillingAdminPlanUpdateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.billingService.updatePlanCatalogEntry(await this.requireConnectedSession(authorization), request),
    );
  }

  @Post('billing/checkout')
  async createCheckoutSession(
    @Body() request?: Partial<BillingCheckoutRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.billingService.createCheckoutSession(await this.requireConnectedSession(authorization), request));
  }

  @Get('billing/invoices')
  async listInvoices(
    @Query('workspaceId') workspaceId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.billingService.listInvoices(await this.requireConnectedSession(authorization), workspaceId));
  }

  @Get('billing/invoices/:invoiceId/pdf')
  async getInvoicePdf(
    @Param('invoiceId') invoiceId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.billingService.getInvoicePdf(await this.requireConnectedSession(authorization), invoiceId));
  }

  @Get('billing/portal')
  async createPortalSession(
    @Query('workspaceId') workspaceId?: string,
    @Query('returnPath') returnPath?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.billingService.createPortalSession(await this.requireConnectedSession(authorization), {
        workspaceId,
        returnPath,
      }),
    );
  }

  @Post('billing/cancel')
  async cancelSubscription(
    @Body() request?: Partial<BillingSubscriptionMutationRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.billingService.cancelSubscription(await this.requireConnectedSession(authorization), request));
  }

  @Post('billing/resume')
  async resumeSubscription(
    @Body() request?: Partial<BillingSubscriptionMutationRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await this.billingService.resumeSubscription(await this.requireConnectedSession(authorization), request));
  }

  @Post('billing/webhooks/stripe')
  async ingestStripeWebhook(
    @Req() request: StripeWebhookRequest,
    @Headers('stripe-signature') signatureHeader?: string,
  ) {
    return ok(await this.billingService.ingestStripeWebhook(signatureHeader, request.rawBody));
  }

  @Post('billing/webhooks/yookassa')
  async ingestYookassaWebhook(@Req() request: StripeWebhookRequest) {
    return ok(await this.billingService.ingestYookassaWebhook(request.rawBody));
  }

  private async requireConnectedSession(authorization?: string): Promise<CurrentSessionSnapshot> {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Billing endpoints require QUIZMIND_RUNTIME_MODE=connected.');
    }

    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return this.authService.getCurrentSession(accessToken);
  }
}
