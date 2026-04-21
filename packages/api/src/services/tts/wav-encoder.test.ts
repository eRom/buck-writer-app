import { describe, it, expect } from 'vitest';
import { wrapPcmToWav, pcmDurationSec } from './wav-encoder.js';

describe('wrapPcmToWav', () => {
  it('produces a 44-byte header + PCM data', () => {
    const pcm = Buffer.alloc(100);
    const wav = wrapPcmToWav(pcm, { sampleRate: 24000, bitsPerSample: 16, channels: 1 });
    expect(wav.length).toBe(144);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.subarray(12, 16).toString()).toBe('fmt ');
    expect(wav.subarray(36, 40).toString()).toBe('data');
  });

  it('encodes RIFF chunk size as 36 + data size', () => {
    const pcm = Buffer.alloc(1000);
    const wav = wrapPcmToWav(pcm, { sampleRate: 24000, bitsPerSample: 16, channels: 1 });
    expect(wav.readUInt32LE(4)).toBe(36 + 1000);
  });

  it('encodes fmt chunk fields correctly for 24kHz/16-bit/mono', () => {
    const pcm = Buffer.alloc(10);
    const wav = wrapPcmToWav(pcm, { sampleRate: 24000, bitsPerSample: 16, channels: 1 });
    expect(wav.readUInt32LE(16)).toBe(16); // fmt chunk length
    expect(wav.readUInt16LE(20)).toBe(1); // PCM format tag
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt32LE(24)).toBe(24000); // sample rate
    expect(wav.readUInt32LE(28)).toBe(48000); // byte rate = 24000 * 1 * 2
    expect(wav.readUInt16LE(32)).toBe(2); // block align = 1 * 16/8
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    expect(wav.readUInt32LE(40)).toBe(10); // data chunk size
  });

  it('preserves PCM payload bytes after the header', () => {
    const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04, 0xff, 0xfe]);
    const wav = wrapPcmToWav(pcm, { sampleRate: 24000, bitsPerSample: 16, channels: 1 });
    expect(wav.subarray(44).equals(pcm)).toBe(true);
  });

  it('handles stereo / different formats', () => {
    const pcm = Buffer.alloc(200);
    const wav = wrapPcmToWav(pcm, { sampleRate: 48000, bitsPerSample: 24, channels: 2 });
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.readUInt32LE(28)).toBe(288000); // 48000 * 2 * 3
    expect(wav.readUInt16LE(32)).toBe(6); // 2 * 24/8
    expect(wav.readUInt16LE(34)).toBe(24);
  });
});

describe('pcmDurationSec', () => {
  it('computes duration for 1 second of 24kHz mono 16-bit', () => {
    const pcm = Buffer.alloc(24000 * 2); // 24000 frames × 2 bytes
    expect(pcmDurationSec(pcm, { sampleRate: 24000, bitsPerSample: 16, channels: 1 })).toBe(1);
  });

  it('computes half-second', () => {
    const pcm = Buffer.alloc(12000 * 2);
    expect(pcmDurationSec(pcm, { sampleRate: 24000, bitsPerSample: 16, channels: 1 })).toBe(0.5);
  });
});
