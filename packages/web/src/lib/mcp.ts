import { useQuery } from '@tanstack/react-query';

export interface BibleStatus {
  healthy: boolean;
  toolCount: number;
}

async function fetchBibleStatus(): Promise<BibleStatus> {
  const res = await fetch('/api/mcp/bible/status', { credentials: 'include' });
  if (!res.ok) return { healthy: false, toolCount: 0 };
  return res.json() as Promise<BibleStatus>;
}

export function useBibleStatus() {
  return useQuery({
    queryKey: ['mcp', 'bible', 'status'],
    queryFn: fetchBibleStatus,
    refetchInterval: 30_000,
  });
}
