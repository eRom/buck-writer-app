import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type * as ApiModule from '@/lib/api';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('@/lib/api');
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

import { useTts, __resetTtsSingleton } from './use-tts';

class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string;
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

beforeEach(() => {
  mockApiFetch.mockReset();
  FakeAudio.instances = [];
  __resetTtsSingleton();
  (globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio;
});

afterEach(() => {
  __resetTtsSingleton();
});

describe('useTts', () => {
  it('transitions idle → loading → playing on successful POST', async () => {
    mockApiFetch.mockResolvedValue({
      url: '/api/tts/m1/audio?voice=Kore',
      cached: false,
      voice: 'Kore',
      durationSec: 1,
      costUsd: 0.001,
    });
    const { result } = renderHook(() => useTts('m1'));
    expect(result.current.state).toBe('idle');
    await act(async () => {
      await result.current.toggle();
    });
    await waitFor(() => expect(result.current.state).toBe('playing'));
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]?.src).toContain('/api/tts/m1/audio');
  });

  it('stops current playback when toggled while playing', async () => {
    mockApiFetch.mockResolvedValue({
      url: '/api/tts/m1/audio?voice=Kore',
      cached: false,
      voice: 'Kore',
      durationSec: 1,
      costUsd: 0,
    });
    const { result } = renderHook(() => useTts('m1'));
    await act(async () => {
      await result.current.toggle();
    });
    await waitFor(() => expect(result.current.state).toBe('playing'));
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.state).toBe('idle');
    expect(FakeAudio.instances[0]?.paused).toBe(true);
  });

  it('playing a different message stops the first (singleton)', async () => {
    mockApiFetch.mockResolvedValue({
      url: '/api/tts/m1/audio?voice=Kore',
      cached: false,
      voice: 'Kore',
      durationSec: 1,
      costUsd: 0,
    });
    const hookA = renderHook(() => useTts('m1'));
    const hookB = renderHook(() => useTts('m2'));

    await act(async () => {
      await hookA.result.current.toggle();
    });
    await waitFor(() => expect(hookA.result.current.state).toBe('playing'));

    mockApiFetch.mockResolvedValue({
      url: '/api/tts/m2/audio?voice=Kore',
      cached: false,
      voice: 'Kore',
      durationSec: 1,
      costUsd: 0,
    });

    await act(async () => {
      await hookB.result.current.toggle();
    });
    await waitFor(() => expect(hookB.result.current.state).toBe('playing'));
    // The first audio must have been paused (stopCurrent)
    expect(FakeAudio.instances[0]?.paused).toBe(true);
    // hookA notified via listener → back to idle
    await waitFor(() => expect(hookA.result.current.state).toBe('idle'));
  });

  it('shows error state on 413 message_too_long', async () => {
    const { ApiError } = await import('@/lib/api');
    mockApiFetch.mockRejectedValueOnce(
      new ApiError(413, 'message_too_long', 'too long'),
    );
    const { result } = renderHook(() => useTts('m1'));
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.state).toBe('error');
  });
});
