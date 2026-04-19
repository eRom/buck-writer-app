import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Waveform } from './waveform';

describe('Waveform', () => {
  it('rend un canvas aria-hidden', () => {
    const { container } = render(<Waveform analyser={null} state="listening" />);
    const c = container.querySelector('canvas');
    expect(c).not.toBeNull();
    expect(c?.getAttribute('aria-hidden')).toBe('true');
  });

  it('ne crash pas avec un analyser stubbé', () => {
    const stub = {
      fftSize: 256,
      frequencyBinCount: 128,
      getByteTimeDomainData: (arr: Uint8Array) => {
        arr.fill(128);
      },
    } as unknown as AnalyserNode;
    const { container } = render(<Waveform analyser={stub} state="speaking" />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('rend sans crash pour chaque state', () => {
    const states: Array<'connecting' | 'listening' | 'speaking' | 'idle' | 'error'> = [
      'connecting',
      'listening',
      'speaking',
      'idle',
      'error',
    ];
    for (const state of states) {
      const { container } = render(<Waveform analyser={null} state={state} />);
      expect(container.querySelector('canvas')).not.toBeNull();
    }
  });
});
