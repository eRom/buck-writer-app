import { useEffect, useRef } from 'react';

interface Props {
  analyser: AnalyserNode | null;
  state: 'connecting' | 'listening' | 'speaking' | 'idle' | 'error';
}

const COLORS: Record<Props['state'], string> = {
  connecting: '#f59e0b',
  listening: '#f59e0b',
  speaking: '#84cc16',
  idle: '#44403c',
  error: '#ef4444',
};

export function Waveform({ analyser, state }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let raf = 0;
    let stopped = false;

    function draw() {
      if (stopped || !ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = COLORS[state];
      const bars = 32;
      const totalSlot = canvas.width / bars;
      const barW = totalSlot * 0.5;
      const gap = totalSlot * 0.5;
      if (analyser && data) analyser.getByteTimeDomainData(data);
      for (let i = 0; i < bars; i++) {
        const v = data ? Math.abs(data[Math.floor((i / bars) * data.length)]! - 128) / 128 : 0.1;
        const h = Math.max(4 * dpr, v * canvas.height);
        const x = i * (barW + gap);
        const y = (canvas.height - h) / 2;
        ctx.fillRect(x, y, barW, h);
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [analyser, state]);

  return <canvas ref={ref} className="h-6 w-full" aria-hidden="true" />;
}
