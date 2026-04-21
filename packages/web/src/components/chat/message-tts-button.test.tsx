import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockToggle = vi.fn();
let mockState: 'idle' | 'loading' | 'playing' | 'error' = 'idle';

vi.mock('@/hooks/use-tts', () => ({
  useTts: () => ({ state: mockState, toggle: mockToggle }),
}));

import { MessageTtsButton } from './message-tts-button';

describe('MessageTtsButton', () => {
  beforeEach(() => {
    mockToggle.mockReset();
    mockState = 'idle';
  });

  it('renders Play icon in idle state with aria-label "Lire a voix haute"', () => {
    render(<MessageTtsButton messageId="m1" />);
    expect(
      screen.getByRole('button', { name: /lire à voix haute/i }),
    ).toBeInTheDocument();
  });

  it('renders Pause icon and new aria-label in playing state', () => {
    mockState = 'playing';
    render(<MessageTtsButton messageId="m1" />);
    expect(
      screen.getByRole('button', { name: /arrêter la lecture/i }),
    ).toBeInTheDocument();
  });

  it('disables button during loading', () => {
    mockState = 'loading';
    render(<MessageTtsButton messageId="m1" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls toggle on click', async () => {
    render(<MessageTtsButton messageId="m1" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mockToggle).toHaveBeenCalledOnce());
  });
});
