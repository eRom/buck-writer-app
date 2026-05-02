import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const startMock = vi.fn();
const stopMock = vi.fn();

vi.mock('@/hooks/use-realtime-voice', () => ({
  useRealtimeVoice: () => ({
    start: startMock,
    stop: stopMock,
    toggleMute: vi.fn(),
    state: 'idle',
    muted: false,
    error: null,
  }),
}));

import { useRealtimeHotkey } from './use-realtime-hotkey';
import { useRealtimeStore } from '@/stores/realtime-store';

const DEFAULT_OPTS = {
  voice: 'coral' as const,
  turnDetection: {
    mode: 'server_vad' as const,
    threshold: 0.5,
    prefix_padding_ms: 500,
    silence_duration_ms: 500,
    interrupt_response: true,
  },
  tools: { bible: true, webSearch: true },
};

beforeEach(() => {
  startMock.mockClear();
  stopMock.mockClear();
  useRealtimeStore.getState().reset();
});

describe('useRealtimeHotkey', () => {
  it('Cmd+Shift+L en state idle appelle start', () => {
    renderHook(() => useRealtimeHotkey({ chatSessionId: 's1', startOpts: DEFAULT_OPTS }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', metaKey: true, shiftKey: true }));
    expect(startMock).toHaveBeenCalledWith(DEFAULT_OPTS, undefined);
  });

  it('Ctrl+Shift+L fonctionne (non-Mac)', () => {
    renderHook(() => useRealtimeHotkey({ chatSessionId: 's1', startOpts: DEFAULT_OPTS }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, shiftKey: true }));
    expect(startMock).toHaveBeenCalled();
  });

  it('hors idle appelle stop', () => {
    useRealtimeStore.getState().setState('listening');
    renderHook(() => useRealtimeHotkey({ chatSessionId: 's1', startOpts: DEFAULT_OPTS }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', metaKey: true, shiftKey: true }));
    expect(stopMock).toHaveBeenCalled();
  });

  it('sans chatSessionId : ne fait rien', () => {
    renderHook(() => useRealtimeHotkey({ chatSessionId: null, startOpts: DEFAULT_OPTS }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', metaKey: true, shiftKey: true }));
    expect(startMock).not.toHaveBeenCalled();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it('autre combo ignoré (sans Shift)', () => {
    renderHook(() => useRealtimeHotkey({ chatSessionId: 's1', startOpts: DEFAULT_OPTS }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', metaKey: true }));
    expect(startMock).not.toHaveBeenCalled();
  });

  it('cleanup au unmount : plus de listener', () => {
    const { unmount } = renderHook(() =>
      useRealtimeHotkey({ chatSessionId: 's1', startOpts: DEFAULT_OPTS }),
    );
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', metaKey: true, shiftKey: true }));
    expect(startMock).not.toHaveBeenCalled();
  });
});
