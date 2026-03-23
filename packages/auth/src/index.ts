import { createHmac, randomBytes } from 'node:crypto';

import { compare, hash } from 'bcryptjs';
import { type JWTPayload, jwtVerify, SignJWT } from 'jose';

import { type AccessContext, type SystemRole, type WorkspaceMembership } from '@quizmind/contracts';
import { resolvePermissions, type Permission } from '@quizmind/permissions';

export interface SessionPrincipal {
  userId: string;
  email: string;
  systemRoles: SystemRole[];
  workspaceMemberships: WorkspaceMembership[];
  entitlements: string[];
  featureFlags: string[];
}

export interface AccessTokenClaims {
  userId: string;
  email: string;
  roles: SystemRole[];
  sessionId: string;
  type: 'access';
}

export interface VerifiedAccessToken extends AccessTokenClaims {
  exp?: number;
  iat?: number;
  iss?: string;
  aud?: string | string[];
  sub: string;
}

export interface IssueAccessTokenInput {
  secret: string;
  sessionId: string;
  userId: string;
  email: string;
  roles: SystemRole[];
  expiresInMinutes?: number;
  issuer?: string;
  audience?: string;
}

export interface AccessTokenIssueResult {
  token: string;
  expiresAt: string;
  claims: AccessTokenClaims;
}

export const ACCESS_TOKEN_LIFETIME_MINUTES = 15;
export const REFRESH_TOKEN_LIFETIME_DAYS = 30;
export const EMAIL_VERIFICATION_LIFETIME_HOURS = 24;
export const PASSWORD_RESET_LIFETIME_HOURS = 1;
export const MIN_PASSWORD_LENGTH = 8;

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function buildAccessContext(principal: SessionPrincipal): AccessContext {
  return {
    userId: principal.userId,
    systemRoles: principal.systemRoles,
    workspaceMemberships: principal.workspaceMemberships,
    entitlements: principal.entitlements,
    featureFlags: principal.featureFlags,
  };
}

export function getPrincipalPermissions(principal: SessionPrincipal, workspaceId?: string): Permission[] {
  const workspaceRoles = workspaceId
    ? principal.workspaceMemberships.filter((membership) => membership.workspaceId === workspaceId).map((membership) => membership.role)
    : [];

  return resolvePermissions({
    systemRoles: principal.systemRoles,
    workspaceRoles,
  });
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export function createOpaqueToken(size = 32): string {
  return randomBytes(size).toString('base64url');
}

export function hashOpaqueToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function parseBearerToken(authorizationHeader?: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

export async function issueAccessToken(input: IssueAccessTokenInput): Promise<AccessTokenIssueResult> {
  const expiresInMinutes = input.expiresInMinutes ?? ACCESS_TOKEN_LIFETIME_MINUTES;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + expiresInMinutes * 60 * 1000);
  const claims: AccessTokenClaims = {
    userId: input.userId,
    email: input.email,
    roles: input.roles,
    sessionId: input.sessionId,
    type: 'access',
  };

  let builder = new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.userId)
    .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000));

  if (input.issuer) {
    builder = builder.setIssuer(input.issuer);
  }

  if (input.audience) {
    builder = builder.setAudience(input.audience);
  }

  const token = await builder.sign(encodeSecret(input.secret));

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    claims,
  };
}

export async function verifyAccessToken(
  token: string,
  secret: string,
  options?: {
    issuer?: string;
    audience?: string;
  },
): Promise<VerifiedAccessToken> {
  const { payload } = await jwtVerify(token, encodeSecret(secret), {
    issuer: options?.issuer,
    audience: options?.audience,
  });

  const email = payload.email;
  const roles = payload.roles;
  const sessionId = payload.sessionId;
  const userId = payload.userId ?? payload.sub;
  const type = payload.type;

  if (
    typeof payload.sub !== 'string' ||
    typeof email !== 'string' ||
    typeof sessionId !== 'string' ||
    typeof userId !== 'string' ||
    type !== 'access' ||
    !isStringArray(roles)
  ) {
    throw new Error('Invalid access token payload.');
  }

  return {
    sub: payload.sub,
    userId,
    email,
    roles: roles as SystemRole[],
    sessionId,
    type: 'access',
    exp: payload.exp,
    iat: payload.iat,
    iss: payload.iss,
    aud: payload.aud,
  };
}
