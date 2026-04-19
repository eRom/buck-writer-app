import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

describe('ChatInput', () => {
  it('affiche le bouton mic si chatSessionId présent', () => {
    render(<ChatInput {...baseProps} chatSessionId="sess_123" />);
    expect(screen.getByRole('button', { name: /démarrer live/i })).toBeInTheDocument();
  });

  it('masque le bouton mic si chatSessionId absent', () => {
    render(<ChatInput {...baseProps} />);
    expect(screen.queryByRole('button', { name: /live/i })).toBeNull();
  });

  it('click mic en idle appelle start', () => {
    render(<ChatInput {...baseProps} chatSessionId="sess_123" />);
    fireEvent.click(screen.getByRole('button', { name: /démarrer live/i }));
    expect(mockStart).toHaveBeenCalledOnce();
  });
});
