import { Body, Controller, Get, Headers, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import {
  type ApiSuccess,
  type ExtensionAiRuntimeRequest,
  type ExtensionAiRuntimeResponse,
  type ProviderCatalogPayload,
} from '@quizmind/contracts';

import { ExtensionControlService } from './extension-control.service';
import { ExtensionAiRuntimeService } from './extension-ai-runtime.service';
import { ProviderCredentialService } from '../providers/provider-credential.service';

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

@Controller()
export class ExtensionAiRuntimeController {
  constructor(
    @Inject(ExtensionControlService)
    private readonly extensionControlService: ExtensionControlService,
    @Inject(ExtensionAiRuntimeService)
    private readonly extensionAiRuntimeService: ExtensionAiRuntimeService,
    @Inject(ProviderCredentialService)
    private readonly providerCredentialService: ProviderCredentialService,
  ) {}

  @Get('extension/ai/models')
  getModels(): ApiSuccess<ProviderCatalogPayload> {
    return ok(this.providerCredentialService.getCatalog());
  }

  @Post('extension/ai/chat')
  async chat(
    @Body() request?: Partial<ExtensionAiRuntimeRequest>,
    @Headers('authorization') authorization?: string,
  ): Promise<ApiSuccess<ExtensionAiRuntimeResponse>> {
    return ok(await this.execute('chat', request, authorization));
  }

  @Post('extension/ai/answer')
  async answer(
    @Body() request?: Partial<ExtensionAiRuntimeRequest>,
    @Headers('authorization') authorization?: string,
  ): Promise<ApiSuccess<ExtensionAiRuntimeResponse>> {
    return ok(await this.execute('answer', request, authorization));
  }

  @Post('extension/ai/screenshot')
  async screenshot(
    @Body() request?: Partial<ExtensionAiRuntimeRequest>,
    @Headers('authorization') authorization?: string,
  ): Promise<ApiSuccess<ExtensionAiRuntimeResponse>> {
    return ok(await this.execute('screenshot', request, authorization));
  }

  @Post('extension/ai/multicheck')
  async multicheck(
    @Body() request?: Partial<ExtensionAiRuntimeRequest>,
    @Headers('authorization') authorization?: string,
  ): Promise<ApiSuccess<ExtensionAiRuntimeResponse>> {
    return ok(await this.execute('multicheck', request, authorization));
  }

  private async execute(
    operation: 'chat' | 'answer' | 'screenshot' | 'multicheck',
    request: Partial<ExtensionAiRuntimeRequest> | undefined,
    authorization?: string,
  ): Promise<ExtensionAiRuntimeResponse> {
    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing installation bearer token.');
    }

    const installationSession = await this.extensionControlService.resolveInstallationSession(accessToken);

    return this.extensionAiRuntimeService.executeForInstallationSession(installationSession, request, operation);
  }
}
