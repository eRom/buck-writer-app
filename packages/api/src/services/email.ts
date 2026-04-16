export interface ResendLike {
  emails: {
    send: (payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }) => Promise<{
      data: { id: string } | null;
      error: { name: string; message: string } | null;
    }>;
  };
}

export interface EmailServiceOptions {
  resendClient: ResendLike;
  fromAddress: string;
}

export interface MagicLinkParams {
  to: string;
  magicUrl: string;
}

export function createEmailService(opts: EmailServiceOptions) {
  return {
    async sendMagicLink(params: MagicLinkParams): Promise<void> {
      const { data, error } = await opts.resendClient.emails.send({
        from: opts.fromAddress,
        to: params.to,
        subject: 'Buck Writer — connexion',
        html: `
          <p>Bonjour,</p>
          <p>Clique sur ce lien pour te connecter à Buck Writer&nbsp;:</p>
          <p><a href="${params.magicUrl}">${params.magicUrl}</a></p>
          <p>Ce lien expire dans 15 minutes et n'est utilisable qu'une seule fois.</p>
          <p>Si tu n'as pas demandé cette connexion, ignore ce message.</p>
        `,
        text: `Connexion Buck Writer : ${params.magicUrl} (expire dans 15 min, usage unique)`,
      });
      if (error) {
        throw new Error(`resend error: ${error.name} — ${error.message}`);
      }
      if (!data?.id) {
        throw new Error('resend returned no id');
      }
    },
  };
}

export type EmailService = ReturnType<typeof createEmailService>;

/**
 * E2E-only stub: writes the raw magic-link token to a JSON file instead of
 * hitting Resend. Used when E2E=1 so Playwright can read the token back.
 * Never use in production.
 */
export function createE2EEmailService(tokenFilePath: string): EmailService {
  return {
    async sendMagicLink(params: MagicLinkParams): Promise<void> {
      const fs = await import('node:fs/promises');
      const url = new URL(params.magicUrl);
      const rawToken = url.searchParams.get('token') ?? '';
      await fs.writeFile(
        tokenFilePath,
        JSON.stringify({ email: params.to, rawToken }, null, 2),
        'utf8',
      );
    },
  };
}
