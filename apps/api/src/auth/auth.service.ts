import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ACCESS_TOKEN_LIFETIME_MINUTES,
  EMAIL_VERIFICATION_LIFETIME_HOURS,
  REFRESH_TOKEN_LIFETIME_DAYS,
  assertPasswordPolicy,
  createOpaqueToken,
  getPrincipalPermissions,
  hashOpaqueToken,
  hashPassword,
  issueAccessToken,
  verifyAccessToken,
  verifyPassword,
  type SessionPrincipal,
} from '@quizmind/auth';
import { loadApiEnv } from '@quizmind/config';
import {
  type AuthExchangePayload,
  type AuthLoginRequest,
  type AuthLogoutResult,
  type AuthRefreshRequest,
  type AuthRegisterRequest,
  type AuthSessionPayload,
  type WorkspaceSummary,
} from '@quizmind/contracts';
import { createSecurityLogEvent } from '@quizmind/logger';
import { createNoopEmailAdapter, sendTemplatedEmail, verifyEmailTemplate } from '@quizmind/email';

import { type AuthSessionRecord, SessionRepository } from './repositories/session.repository';
import { type AuthUserRecord, UserRepository } from './repositories/user.repository';
import { EmailVerificationRepository } from './repositories/email-verification.repository';
import { type CurrentSessionSnapshot, type RequestSessionMetadata, type VerifyEmailResult } from './auth.types';

interface SessionIssueResult {
  payload: AuthSessionPayload;
  session: AuthSessionRecord;
}

@Injectable()
export class AuthService {
  private readonly env = loadApiEnv();

  constructor(
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    @Inject(SessionRepository)
    private readonly sessionRepository: SessionRepository,
    @Inject(EmailVerificationRepository)
    private readonly emailVerificationRepository: EmailVerificationRepository,
  ) {}

  async register(request: AuthRegisterRequest, metadata: RequestSessionMetadata = {}): Promise<AuthExchangePayload> {
    this.assertConnectedMode();

    const email = this.normalizeEmail(request.email);
    const displayName = request.displayName?.trim() || undefined;

    this.assertEmailAddress(email);
    assertPasswordPolicy(request.password);

    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    const passwordHash = await hashPassword(request.password);
    const user = await this.userRepository.create({
      email,
      passwordHash,
      displayName,
    });

    const sessionResult = await this.issueSession(user, metadata);
    const emailStatus = await this.issueVerificationEmail(user);

    this.logSecurityEvent('auth.register_success', user.id, {
      email,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return {
      session: sessionResult.payload,
      emailVerification: emailStatus,
    };
  }

  async login(request: AuthLoginRequest, metadata: RequestSessionMetadata = {}): Promise<AuthExchangePayload> {
    this.assertConnectedMode();

    const email = this.normalizeEmail(request.email);
    const user = await this.userRepository.findByEmail(email);

    if (!user?.passwordHash) {
      this.logSecurityEvent('auth.login_failed', 'anonymous', {
        email,
        reason: 'user_not_found',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.suspendedAt) {
      this.logSecurityEvent('auth.login_failed', user.id, {
        email,
        reason: 'user_suspended',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      throw new UnauthorizedException('This account is currently suspended.');
    }

    const isPasswordValid = await verifyPassword(request.password, user.passwordHash);

    if (!isPasswordValid) {
      this.logSecurityEvent('auth.login_failed', user.id, {
        email,
        reason: 'invalid_password',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    const userWithLastLogin = await this.userRepository.touchLastLogin(user.id);
    const sessionResult = await this.issueSession(userWithLastLogin, metadata);
    const emailStatus = userWithLastLogin.emailVerifiedAt
      ? {
          required: false,
          emailVerifiedAt: userWithLastLogin.emailVerifiedAt.toISOString(),
        }
      : await this.issueVerificationEmail(userWithLastLogin);

    this.logSecurityEvent('auth.login_success', userWithLastLogin.id, {
      email,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      sessionId: sessionResult.session.id,
    });

    return {
      session: sessionResult.payload,
      emailVerification: emailStatus,
    };
  }

  async refresh(request: AuthRefreshRequest, metadata: RequestSessionMetadata = {}): Promise<AuthSessionPayload> {
    this.assertConnectedMode();

    const currentSession = await this.sessionRepository.findActiveByTokenHash(
      hashOpaqueToken(request.refreshToken, this.env.jwtRefreshSecret),
    );

    if (!currentSession) {
      this.logSecurityEvent('auth.refresh_failed', 'anonymous', {
        reason: 'session_not_found',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      throw new UnauthorizedException('Invalid refresh token.');
    }

    await this.sessionRepository.revoke(currentSession.id);
    const sessionResult = await this.issueSession(currentSession.user, metadata);

    this.logSecurityEvent('auth.refresh_success', currentSession.user.id, {
      sessionId: sessionResult.session.id,
      previousSessionId: currentSession.id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return sessionResult.payload;
  }

  async logout(input: { accessToken?: string | null; refreshToken?: string }): Promise<AuthLogoutResult> {
    this.assertConnectedMode();

    if (input.refreshToken) {
      const currentSession = await this.sessionRepository.findActiveByTokenHash(
        hashOpaqueToken(input.refreshToken, this.env.jwtRefreshSecret),
      );

      if (!currentSession) {
        throw new UnauthorizedException('Invalid refresh token.');
      }

      await this.sessionRepository.revoke(currentSession.id);
      this.logSecurityEvent('auth.logout', currentSession.user.id, {
        sessionId: currentSession.id,
        method: 'refresh-token',
      });

      return {
        revoked: true,
        revokedSessionId: currentSession.id,
      };
    }

    if (!input.accessToken) {
      throw new BadRequestException('Provide either a refresh token or a bearer access token.');
    }

    const claims = await this.verifyBearerToken(input.accessToken);
    await this.sessionRepository.revoke(claims.sessionId);
    this.logSecurityEvent('auth.logout', claims.userId, {
      sessionId: claims.sessionId,
      method: 'access-token',
    });

    return {
      revoked: true,
      revokedSessionId: claims.sessionId,
    };
  }

  async logoutAll(userId: string): Promise<{ revoked: true; revokedCount: number }> {
    this.assertConnectedMode();

    const revokedCount = await this.sessionRepository.revokeAllForUser(userId);
    this.logSecurityEvent('auth.logout_all', userId, {
      revokedCount,
    });

    return {
      revoked: true,
      revokedCount,
    };
  }

  async verifyEmail(token: string): Promise<VerifyEmailResult> {
    this.assertConnectedMode();

    if (!token.trim()) {
      throw new BadRequestException('Email verification token is required.');
    }

    const verification = await this.emailVerificationRepository.findActiveByTokenHash(
      hashOpaqueToken(token, this.env.jwtRefreshSecret),
    );

    if (!verification) {
      throw new UnauthorizedException('Invalid or expired email verification token.');
    }

    const verifiedAt = new Date();

    await this.emailVerificationRepository.markVerified(verification.id, verifiedAt);
    await this.userRepository.markEmailVerified(verification.userId, verifiedAt);

    this.logSecurityEvent('auth.email_verified', verification.userId, {
      verificationId: verification.id,
    });

    return {
      verified: true,
      emailVerifiedAt: verifiedAt.toISOString(),
    };
  }

  async getCurrentSession(accessToken: string): Promise<CurrentSessionSnapshot> {
    this.assertConnectedMode();

    const claims = await this.verifyBearerToken(accessToken);
    const session = await this.sessionRepository.findById(claims.sessionId);

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is no longer active.');
    }

    return this.buildCurrentSessionSnapshot(session.user);
  }

  private async issueSession(user: AuthUserRecord, metadata: RequestSessionMetadata): Promise<SessionIssueResult> {
    const refreshToken = createOpaqueToken();
    const refreshTokenHash = hashOpaqueToken(refreshToken, this.env.jwtRefreshSecret);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

    const session = await this.sessionRepository.create({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: refreshExpiresAt,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      browser: this.inferBrowser(metadata.userAgent),
      deviceName: metadata.userAgent?.slice(0, 120),
    });

    const accessToken = await issueAccessToken({
      secret: this.env.jwtSecret,
      sessionId: session.id,
      userId: user.id,
      email: user.email,
      roles: this.userRepository.getSystemRoles(user),
      expiresInMinutes: ACCESS_TOKEN_LIFETIME_MINUTES,
    });

    return {
      session,
      payload: {
        accessToken: accessToken.token,
        refreshToken,
        expiresAt: accessToken.expiresAt,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName ?? undefined,
          systemRoles: this.userRepository.getSystemRoles(user),
          emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        },
      },
    };
  }

  private async issueVerificationEmail(user: AuthUserRecord) {
    const verificationToken = createOpaqueToken();
    const verificationHash = hashOpaqueToken(verificationToken, this.env.jwtRefreshSecret);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_LIFETIME_HOURS * 60 * 60 * 1000);

    await this.emailVerificationRepository.create({
      userId: user.id,
      tokenHash: verificationHash,
      expiresAt,
    });

    const delivery = await sendTemplatedEmail(
      createNoopEmailAdapter(),
      verifyEmailTemplate,
      user.email,
      {
        productName: 'QuizMind',
        displayName: user.displayName ?? undefined,
        verifyUrl: `${this.env.appUrl}/auth/verify?token=${verificationToken}`,
        supportEmail: 'support@quizmind.dev',
      },
    );

    return {
      required: true,
      delivery,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  }

  private async verifyBearerToken(accessToken: string) {
    try {
      return await verifyAccessToken(accessToken, this.env.jwtSecret);
    } catch {
      throw new UnauthorizedException('Invalid access token.');
    }
  }

  private buildCurrentSessionSnapshot(user: AuthUserRecord): CurrentSessionSnapshot {
    const principal: SessionPrincipal = {
      userId: user.id,
      email: user.email,
      systemRoles: this.userRepository.getSystemRoles(user),
      workspaceMemberships: user.memberships.map((membership) => ({
        workspaceId: membership.workspaceId,
        role: membership.role,
      })),
      entitlements: [],
      featureFlags: [],
    };
    const workspaces: WorkspaceSummary[] = this.userRepository.getWorkspaceMemberships(user).map((membership) => ({
      id: membership.workspaceId,
      slug: membership.workspaceSlug,
      name: membership.workspaceName,
      role: membership.role,
    }));
    const preferredWorkspaceId = workspaces[0]?.id;

    return {
      personaKey: 'connected-user',
      personaLabel: 'Connected User',
      notes: ['Resolved from a Prisma-backed session in connected runtime mode.'],
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      },
      principal,
      workspaces,
      permissions: getPrincipalPermissions(principal, preferredWorkspaceId),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private assertEmailAddress(email: string): void {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email address is required.');
    }
  }

  private inferBrowser(userAgent?: string): string | undefined {
    if (!userAgent) {
      return undefined;
    }

    const normalized = userAgent.toLowerCase();

    if (normalized.includes('edg/')) {
      return 'edge';
    }

    if (normalized.includes('chrome/')) {
      return 'chrome';
    }

    if (normalized.includes('firefox/')) {
      return 'firefox';
    }

    if (normalized.includes('safari/')) {
      return 'safari';
    }

    return 'other';
  }

  private assertConnectedMode(): void {
    if (this.env.runtimeMode !== 'connected') {
      throw new ServiceUnavailableException('Real auth requires QUIZMIND_RUNTIME_MODE=connected.');
    }
  }

  private logSecurityEvent(eventType: string, actorId: string, metadata: Record<string, unknown>): void {
    console.log(
      JSON.stringify(
        createSecurityLogEvent({
          eventId: `${eventType}:${Date.now()}:${actorId}`,
          eventType,
          actorId,
          actorType: 'user',
          targetType: 'auth_session',
          targetId: actorId,
          occurredAt: new Date().toISOString(),
          severity: eventType.includes('failed') ? 'warn' : 'info',
          status: eventType.includes('failed') ? 'failure' : 'success',
          metadata,
        }),
      ),
    );
  }
}
