import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseBearerToken } from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import {
  type ApiSuccess,
  type AiProviderPolicyResetRequest,
  type AiProviderPolicyUpdateRequest,
  type ProviderCredentialCreateRequest,
  type ProviderCredentialRevokeRequest,
  type ProviderCredentialRotateRequest,
  type UserApiKeyCreateRequest,
} from '@quizmind/contracts';

import { AuthService } from '../auth/auth.service';
import { type CurrentSessionSnapshot } from '../auth/auth.types';
import { AiProviderPolicyService } from './ai-provider-policy.service';
import { ProviderCredentialService } from './provider-credential.service';

function ok<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
  };
}

@Controller()
export class ProviderCredentialController {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(AiProviderPolicyService)
    private readonly aiProviderPolicyService: AiProviderPolicyService,
    @Inject(ProviderCredentialService)
    private readonly providerCredentialService: ProviderCredentialService,
  ) {}

  @Get('providers/catalog')
  getCatalog() {
    return ok(this.providerCredentialService.getCatalog());
  }

  @Get('admin/providers')
  async getAdminGovernance(
    @Query('workspaceId') workspaceId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.providerCredentialService.listAdminProviderGovernanceForCurrentSession(
        await this.requireConnectedSession(authorization),
        workspaceId,
      ),
    );
  }

  @Post('admin/providers/policy')
  async updateAdminPolicy(
    @Body() request?: Partial<AiProviderPolicyUpdateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.aiProviderPolicyService.updatePolicyForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Post('admin/providers/policy/reset')
  async resetAdminPolicy(
    @Body() request?: Partial<AiProviderPolicyResetRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.aiProviderPolicyService.resetPolicyForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Get('providers/credentials')
  async listCredentials(
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.providerCredentialService.listCredentialInventoryForCurrentSession(
        await this.requireConnectedSession(authorization),
      ),
    );
  }

  @Post('providers/credentials')
  async createCredential(
    @Body() request?: Partial<ProviderCredentialCreateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.providerCredentialService.createCredentialForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Post('providers/credentials/rotate')
  async rotateCredential(
    @Body() request?: Partial<ProviderCredentialRotateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.providerCredentialService.rotateCredentialForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Post('providers/credentials/revoke')
  async revokeCredential(
    @Body() request?: Partial<ProviderCredentialRevokeRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.providerCredentialService.revokeCredentialForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Get('user/api-keys')
  async listUserApiKeys(
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.providerCredentialService.listUserApiKeysForCurrentSession(
        await this.requireConnectedSession(authorization),
      ),
    );
  }

  @Post('user/api-keys')
  async createUserApiKey(
    @Body() request?: Partial<UserApiKeyCreateRequest>,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.providerCredentialService.createUserApiKeyForCurrentSession(
        await this.requireConnectedSession(authorization),
        request,
      ),
    );
  }

  @Delete('user/api-keys/:id')
  async deleteUserApiKey(
    @Param('id') apiKeyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.providerCredentialService.deleteUserApiKeyForCurrentSession(
        await this.requireConnectedSession(authorization),
        apiKeyId,
      ),
    );
  }

  @Post('user/api-keys/:id/test')
  async testUserApiKey(
    @Param('id') apiKeyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await this.providerCredentialService.testUserApiKeyForCurrentSession(
        await this.requireConnectedSession(authorization),
        apiKeyId,
      ),
    );
  }

  private async requireConnectedSession(authorization?: string): Promise<CurrentSessionSnapshot> {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Provider credential endpoints require QUIZMIND_RUNTIME_MODE=connected.');
    }

    const accessToken = parseBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return this.authService.getCurrentSession(accessToken);
  }
}
