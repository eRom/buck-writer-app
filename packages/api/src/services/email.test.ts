import { describe, it, expect, vi } from 'vitest';
import { createEmailService } from './email.js';

describe('email service', () => {
  it('sendMagicLink calls resend with expected payload', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const mockResend = {
      emails: {
        send: vi.fn(async (p: Record<string, unknown>) => {
          sent.push(p);
          return { data: { id: 'mock-id' }, error: null };
        }),
      },
    };
    const svc = createEmailService({
      resendClient: mockResend,
      fromAddress: 'noreply@romain-ecarnot.com',
    });
    await svc.sendMagicLink({
      to: 'writer@example.com',
      magicUrl: 'https://buck.example.com/api/auth/callback?token=xxx',
    });
    expect(mockResend.emails.send).toHaveBeenCalledTimes(1);
    expect(sent[0]!['to']).toBe('writer@example.com');
    expect(String(sent[0]!['html'])).toContain('token=xxx');
    expect(String(sent[0]!['subject'])).toMatch(/connect|login|buck/i);
  });

  it('throws if resend returns error', async () => {
    const mockResend = {
      emails: {
        send: vi.fn(async () => ({
          data: null,
          error: { name: 'rate', message: 'limit' },
        })),
      },
    };
    const svc = createEmailService({
      resendClient: mockResend,
      fromAddress: 'noreply@example.com',
    });
    await expect(
      svc.sendMagicLink({ to: 'x@example.com', magicUrl: 'https://x/' }),
    ).rejects.toThrow(/resend/);
  });
});
