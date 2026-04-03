import { type SessionPrincipal, type VerifiedAccessToken } from '@quizmind/auth';

export interface RequestSessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticatedRequestUser extends VerifiedAccessToken {}

export interface AuthenticatedRequest {
  currentUser?: AuthenticatedRequestUser;
}

export interface CurrentSessionSnapshot {
  personaKey: string;
  personaLabel: string;
  notes: string[];
  user: {
    id: string;
    email: string;
    displayName?: string | null;
    emailVerifiedAt?: string | null;
  };
  principal: SessionPrincipal;
  permissions: string[];
}

export interface VerifyEmailResult {
  verified: boolean;
  emailVerifiedAt: string;
}
