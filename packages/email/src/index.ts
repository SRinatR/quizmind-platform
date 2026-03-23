export const emailTemplateKeys = ['auth.verify-email', 'auth.password-reset', 'workspace.invitation'] as const;
export type EmailTemplateKey = (typeof emailTemplateKeys)[number];

export interface EmailTemplateDefinition {
  key: EmailTemplateKey;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTemplate<TVariables extends object = Record<string, unknown>> {
  key: EmailTemplateKey;
  render(vars: TVariables): EmailTemplateDefinition;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface EmailDeliveryReceipt {
  provider: string;
  messageId: string;
  acceptedAt: string;
}

export interface EmailAdapter {
  send(template: EmailTemplateDefinition, to: string, vars?: Record<string, unknown>): Promise<EmailDeliveryReceipt>;
}

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key: string) => {
    const value = vars[key];
    return typeof value === 'undefined' ? '' : String(value);
  });
}

function defineTemplate<TVariables extends object>(
  key: EmailTemplateKey,
  content: {
    subject: string;
    html: string;
    text: string;
  },
): EmailTemplate<TVariables> {
  return {
    key,
    render(vars) {
      return {
        key,
        subject: interpolate(content.subject, vars as Record<string, unknown>),
        html: interpolate(content.html, vars as Record<string, unknown>),
        text: interpolate(content.text, vars as Record<string, unknown>),
      };
    },
  };
}

export interface VerifyEmailVars {
  productName: string;
  displayName?: string;
  verifyUrl: string;
  supportEmail: string;
}

export interface PasswordResetVars {
  productName: string;
  displayName?: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface WorkspaceInvitationVars {
  inviterName: string;
  workspaceName: string;
  acceptUrl: string;
}

export const verifyEmailTemplate = defineTemplate<VerifyEmailVars>('auth.verify-email', {
  subject: 'Verify your {{productName}} email',
  html:
    '<p>Hello {{displayName}},</p><p>Verify your email for {{productName}} by opening <a href="{{verifyUrl}}">this secure link</a>.</p><p>If you did not request this, contact {{supportEmail}}.</p>',
  text:
    'Hello {{displayName}},\n\nVerify your email for {{productName}}: {{verifyUrl}}\n\nIf you did not request this, contact {{supportEmail}}.',
});

export const passwordResetTemplate = defineTemplate<PasswordResetVars>('auth.password-reset', {
  subject: 'Reset your {{productName}} password',
  html:
    '<p>Hello {{displayName}},</p><p>Reset your password using <a href="{{resetUrl}}">this secure link</a>.</p><p>This link expires in {{expiresInMinutes}} minutes.</p>',
  text:
    'Hello {{displayName}},\n\nReset your password: {{resetUrl}}\n\nThis link expires in {{expiresInMinutes}} minutes.',
});

export const workspaceInvitationTemplate = defineTemplate<WorkspaceInvitationVars>('workspace.invitation', {
  subject: 'You were invited to {{workspaceName}}',
  html:
    '<p>{{inviterName}} invited you to join {{workspaceName}}.</p><p>Accept the invitation here: <a href="{{acceptUrl}}">{{acceptUrl}}</a></p>',
  text: '{{inviterName}} invited you to join {{workspaceName}}.\n\nAccept the invitation: {{acceptUrl}}',
});

export const builtInEmailTemplates = {
  verifyEmail: verifyEmailTemplate,
  passwordReset: passwordResetTemplate,
  workspaceInvitation: workspaceInvitationTemplate,
} as const;

export function createNoopEmailAdapter(provider = 'noop'): EmailAdapter {
  return {
    async send(template, to) {
      return {
        provider,
        messageId: `${provider}:${template.key}:${to}`,
        acceptedAt: new Date().toISOString(),
      };
    },
  };
}

export async function sendTemplatedEmail<TVariables extends object>(
  adapter: EmailAdapter,
  template: EmailTemplate<TVariables>,
  to: string,
  vars: TVariables,
): Promise<EmailDeliveryReceipt> {
  return adapter.send(template.render(vars), to, vars as Record<string, unknown>);
}
