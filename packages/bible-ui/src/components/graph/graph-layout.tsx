import { useEffect, useRef } from 'react';
import { useWorkerLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2';

export function GraphLayout() {
  const { start, stop } = useWorkerLayoutForceAtlas2({
    settings: {
      gravity: 5,
      scalingRatio: 10,
      barnesHutOptimize: true,
      barnesHutTheta: 0.5,
      slowDown: 3,
      adjustSizes: true,
      strongGravityMode: false,
      outboundAttractionDistribution: false,
      linLogMode: false,
      edgeWeightInfluence: 1,
    },
  });

  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
    const timer = setTimeout(() => stop(), 3000);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [start, stop]);

  return null;
}
