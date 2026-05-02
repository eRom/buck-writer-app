import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock hooks to avoid realtime/store dependencies
vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: (sel: (s: { state: string }) => unknown) => sel({ state: 'idle' }),
}));

const mockStart = vi.fn();
const mockStop = vi.fn();
vi.mock('@/hooks/use-realtime-voice', () => ({
  useRealtimeVoice: () => ({ start: mockStart, stop: mockStop, state: 'idle', muted: false, error: null }),
}));

import { ChatInput } from './chat-input';

const baseProps = {
  value: '',
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  isLoading: false,
  pendingAttachments: [],
  onAttachmentsChange: vi.fn(),
};

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ChatInput', () => {
  it('affiche le bouton mic si chatSessionId présent', () => {
    renderWithQuery(<ChatInput {...baseProps} chatSessionId="sess_123" />);
    expect(screen.getByRole('button', { name: /démarrer live/i })).toBeInTheDocument();
  });

  it('masque le bouton mic si chatSessionId absent', () => {
    renderWithQuery(<ChatInput {...baseProps} />);
    expect(screen.queryByRole('button', { name: /live/i })).toBeNull();
  });

  it('click mic en idle appelle start', () => {
    renderWithQuery(<ChatInput {...baseProps} chatSessionId="sess_123" />);
    fireEvent.click(screen.getByRole('button', { name: /démarrer live/i }));
    expect(mockStart).toHaveBeenCalledOnce();
  });
});
