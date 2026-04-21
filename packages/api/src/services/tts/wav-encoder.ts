export interface WavFormat {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}

export function wrapPcmToWav(pcm: Buffer, opts: WavFormat): Buffer {
  const { sampleRate, bitsPerSample, channels } = opts;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

export function pcmDurationSec(pcm: Buffer, opts: WavFormat): number {
  const bytesPerSample = opts.bitsPerSample / 8;
  const frames = pcm.length / (bytesPerSample * opts.channels);
  return frames / opts.sampleRate;
}
