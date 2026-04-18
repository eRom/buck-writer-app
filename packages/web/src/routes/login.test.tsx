import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginView } from './-login.view';

describe('LoginView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submits the form and shows success state', async () => {
    const onRequest = vi.fn(async () => {});
    render(<LoginView onRequest={onRequest} />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.c' },
    });
    fireEvent.click(screen.getByRole('button', { name: /recevoir le lien/i }));
    await waitFor(() => {
      expect(onRequest).toHaveBeenCalledWith('a@b.c');
    });
    await screen.findByText(/lien envoye a/i);
  });

  it('after submit, cooldown button is disabled', async () => {
    const onRequest = vi.fn(async () => {});
    render(<LoginView onRequest={onRequest} />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.c' },
    });
    fireEvent.click(screen.getByRole('button', { name: /recevoir le lien/i }));
    const resendBtn = await screen.findByRole('button', { name: /renvoyer dans/i });
    expect(resendBtn).toBeDisabled();
  });

  it('shows error when onRequest throws', async () => {
    const onRequest = vi.fn(async () => {
      throw new Error('network down');
    });
    render(<LoginView onRequest={onRequest} />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'a@b.c' },
    });
    fireEvent.click(screen.getByRole('button', { name: /recevoir le lien/i }));
    await screen.findByText(/network down/i);
  });
});
