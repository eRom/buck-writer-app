import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Notch } from './notch';
import { useRealtimeStore } from '@/stores/realtime-store';

vi.mock('@/hooks/use-realtime-voice', () => ({
  useRealtimeVoice: () => ({
    start: vi.fn(),
    stop: vi.fn(async () => {
      useRealtimeStore.getState().reset();
    }),
    toggleMute: vi.fn(() => {
      useRealtimeStore.getState().setMuted(!useRealtimeStore.getState().muted);
    }),
    state: useRealtimeStore.getState().state,
    muted: useRealtimeStore.getState().muted,
    error: null,
  }),
}));

describe('Notch', () => {
  beforeEach(() => {
    useRealtimeStore.getState().reset();
  });

  it('caché si state idle', () => {
    const { queryByRole } = render(<Notch />);
    expect(queryByRole('status')).toBeNull();
  });

  it('affiche aria-live polite quand listening', () => {
    useRealtimeStore.getState().setState('listening');
    const { getByRole } = render(<Notch />);
    const notch = getByRole('status');
    expect(notch.getAttribute('aria-live')).toBe('polite');
    expect(notch.getAttribute('aria-label')).toContain('écoute');
  });

  it('label parole en speaking', () => {
    useRealtimeStore.getState().setState('speaking');
    const { getByRole } = render(<Notch />);
    expect(getByRole('status').getAttribute('aria-label')).toContain('parole');
  });

  it('label muet si muted', () => {
    useRealtimeStore.getState().setState('listening');
    useRealtimeStore.getState().setMuted(true);
    const { getByRole } = render(<Notch />);
    expect(getByRole('status').getAttribute('aria-label')).toContain('muet');
  });

  it('label connexion en connecting', () => {
    useRealtimeStore.getState().setState('connecting');
    const { getByRole } = render(<Notch />);
    expect(getByRole('status').getAttribute('aria-label')).toContain('connexion');
  });

  it('click close reset le store via stop()', async () => {
    useRealtimeStore.getState().setState('listening');
    render(<Notch />);
    const closeBtn = screen.getByLabelText('Fermer session Live');
    fireEvent.click(closeBtn);
    await Promise.resolve();
    expect(useRealtimeStore.getState().state).toBe('idle');
  });
});
