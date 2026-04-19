import { vi } from 'vitest';

export function installRtcStubs() {
  class StubRTCPeerConnection {
    onicecandidate: ((e: unknown) => void) | null = null;
    oniceconnectionstatechange: (() => void) | null = null;
    ontrack: ((e: { streams: MediaStream[] }) => void) | null = null;
    iceConnectionState = 'new';
    localDescription: { type: string; sdp: string } | null = null;
    async createOffer() { return { type: 'offer', sdp: 'stub-offer' }; }
    async setLocalDescription(desc: { type: string; sdp: string }) { this.localDescription = desc; }
    async setRemoteDescription() {}
    addTrack() { return { id: 'track' } as unknown as RTCRtpSender; }
    createDataChannel(label: string) {
      const dc: Record<string, unknown> = {
        label,
        readyState: 'open',
        onopen: null,
        onmessage: null,
        onclose: null,
        send: vi.fn(),
        close: vi.fn(),
      };
      queueMicrotask(() => {
        const open = dc.onopen as (() => void) | null;
        open?.();
      });
      return dc as unknown as RTCDataChannel;
    }
    close() {}
  }
  (globalThis as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = StubRTCPeerConnection;

  const fakeAudioTrack = { stop: vi.fn(), enabled: true };
  const fakeTracks = [fakeAudioTrack];
  const fakeStream = {
    getTracks: () => fakeTracks,
    getAudioTracks: () => fakeTracks,
  };
  (navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
    getUserMedia: vi.fn(async () => fakeStream),
  };

  class StubAudioContext {
    createMediaStreamSource() { return { connect: vi.fn() }; }
    createAnalyser() {
      return { fftSize: 0, frequencyBinCount: 0, getByteTimeDomainData: vi.fn() };
    }
    async close() {}
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = StubAudioContext;
}
