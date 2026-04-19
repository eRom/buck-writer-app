import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/realtime-client', () => {
  class FakeClient extends EventTarget {
    public static instances: FakeClient[] = [];
    start = vi.fn(async () => {});
    stop = vi.fn(async () => {});
    setMuted = vi.fn();
    constructor() {
      super();
      FakeClient.instances.push(this);
    }
  }
  return { RealtimeClient: FakeClient };
});

import { useRealtimeVoice } from './use-realtime-voice';
import { useRealtimeStore } from '@/stores/realtime-store';
import { RealtimeClient } from '@/lib/realtime-client';

const FakeClient = RealtimeClient as unknown as {
  instances: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; setMuted: ReturnType<typeof vi.fn> }[];
};

const DEFAULT_OPTS = {
  voice: 'coral' as const,
  turnDetection: {
    mode: 'server_vad' as const,
    threshold: 0.5,
    prefix_padding_ms: 500,
    silence_duration_ms: 500,
    interrupt_response: true,
  },
  tools: { bible: true, writingTools: true, webSearch: true },
};

beforeEach(() => {
  useRealtimeStore.getState().reset();
  FakeClient.instances.length = 0;
});

describe('useRealtimeVoice', () => {
  it('start() instancie le client si chatSessionId fourni', async () => {
    const { result } = renderHook(() => useRealtimeVoice('s1'));
    await act(async () => {
      await result.current.start(DEFAULT_OPTS);
    });
    expect(FakeClient.instances).toHaveLength(1);
    expect(FakeClient.instances[0]!.start).toHaveBeenCalledWith(DEFAULT_OPTS);
  });

  it('start() ne crée pas de client si chatSessionId null', async () => {
    const { result } = renderHook(() => useRealtimeVoice(null));
    await act(async () => {
      await result.current.start(DEFAULT_OPTS);
    });
    expect(FakeClient.instances).toHaveLength(0);
  });

  it('start() ne crée pas un second client si déjà actif', async () => {
    const { result } = renderHook(() => useRealtimeVoice('s1'));
    await act(async () => {
      await result.current.start(DEFAULT_OPTS);
      await result.current.start(DEFAULT_OPTS);
    });
    expect(FakeClient.instances).toHaveLength(1);
  });

  it('toggleMute flip muted dans le store', async () => {
    const { result } = renderHook(() => useRealtimeVoice('s1'));
    await act(async () => {
      await result.current.start(DEFAULT_OPTS);
    });
    act(() => {
      result.current.toggleMute();
    });
    expect(useRealtimeStore.getState().muted).toBe(true);
    expect(FakeClient.instances[0]!.setMuted).toHaveBeenCalledWith(true);
  });

  it('stop() reset store', async () => {
    const { result } = renderHook(() => useRealtimeVoice('s1'));
    useRealtimeStore.getState().setError('x');
    await act(async () => {
      await result.current.stop();
    });
    expect(useRealtimeStore.getState().state).toBe('idle');
    expect(useRealtimeStore.getState().error).toBeNull();
  });

  it('unmount appelle stop() du client', async () => {
    const { result, unmount } = renderHook(() => useRealtimeVoice('s1'));
    await act(async () => {
      await result.current.start(DEFAULT_OPTS);
    });
    const client = FakeClient.instances[0]!;
    unmount();
    expect(client.stop).toHaveBeenCalled();
  });
});
