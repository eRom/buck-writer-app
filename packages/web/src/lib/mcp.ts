import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

export interface McpServerSummary {
  id: string;
  name: string;
  core: boolean;
  enabled: boolean;
  transport: string;
  url: string;
  description: string | null;
  createdAt: number;
}

export async function fetchMcpServers(): Promise<McpServerSummary[]> {
  const res = await apiFetch<{ servers: McpServerSummary[] }>('/api/mcp');
  return res.servers;
}

export async function setMcpEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  await apiFetch(`/api/mcp/${id}`, {
    method: 'PATCH',
    body: { enabled },
  });
}

export interface BibleStatus {
  healthy: boolean;
  toolCount: number;
}

/**
 * Derives a "healthy" bool from whether the bible MCP server row is enabled.
 * Real-time health is no longer probed from Buck — OpenAI's MCP connector
 * owns the roundtrip. toolCount is unknown from our side so we return 0.
 */
export function useBibleStatus() {
  return useQuery<BibleStatus>({
    queryKey: ['mcp', 'bible', 'status'],
    queryFn: async () => {
      const servers = await fetchMcpServers();
      const bible = servers.find((s) => s.name === 'bible');
      return { healthy: bible?.enabled ?? false, toolCount: 0 };
    },
    refetchInterval: 30_000,
  });
}
