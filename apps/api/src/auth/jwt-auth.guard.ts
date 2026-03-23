import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { loadApiEnv } from '@quizmind/config';
import { parseBearerToken, verifyAccessToken } from '@quizmind/auth';

import { type AuthenticatedRequest } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly env = loadApiEnv();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { headers?: Record<string, string | undefined> }>();
    const token = parseBearerToken(request.headers?.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    try {
      request.currentUser = await verifyAccessToken(token, this.env.jwtSecret, {
        issuer: this.env.jwtIssuer,
        audience: this.env.jwtAudience,
      });
      return true;
    } catch {
      throw new UnauthorizedException('Invalid access token.');
    }
  }
}
