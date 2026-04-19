import { describe, it, expect, beforeEach } from 'vitest';
import { useRealtimeStore } from './realtime-store';

describe('realtime-store', () => {
  beforeEach(() => {
    useRealtimeStore.getState().reset();
  });

  it('default state = idle', () => {
    expect(useRealtimeStore.getState().state).toBe('idle');
    expect(useRealtimeStore.getState().error).toBeNull();
  });

  it('setState transition + clear error si non-error', () => {
    useRealtimeStore.setState({ error: 'x' });
    useRealtimeStore.getState().setState('listening');
    expect(useRealtimeStore.getState().state).toBe('listening');
    expect(useRealtimeStore.getState().error).toBeNull();
  });

  it('setError passe en error + stocke message', () => {
    useRealtimeStore.getState().setError('mic refusé');
    expect(useRealtimeStore.getState().state).toBe('error');
    expect(useRealtimeStore.getState().error).toBe('mic refusé');
  });

  it('reset revient au défaut', () => {
    useRealtimeStore.getState().setError('x');
    useRealtimeStore.getState().setMuted(true);
    useRealtimeStore.getState().reset();
    expect(useRealtimeStore.getState().state).toBe('idle');
    expect(useRealtimeStore.getState().error).toBeNull();
    expect(useRealtimeStore.getState().muted).toBe(false);
  });

  it('attach stocke les ids et analyser', () => {
    const fakeAnalyser = {} as AnalyserNode;
    useRealtimeStore.getState().attach('s1', 'rts1', fakeAnalyser);
    expect(useRealtimeStore.getState().chatSessionId).toBe('s1');
    expect(useRealtimeStore.getState().realtimeSessionId).toBe('rts1');
    expect(useRealtimeStore.getState().analyser).toBe(fakeAnalyser);
  });
});
