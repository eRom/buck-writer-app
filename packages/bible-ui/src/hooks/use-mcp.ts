import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callTool } from '@/api/mcp-client';

export function useMcpQuery<T = unknown>(
  toolName: string,
  params?: Record<string, unknown>,
  options?: { enabled?: boolean }
) {
  return useQuery<T>({
    queryKey: [toolName, params],
    queryFn: () => callTool(toolName, params) as Promise<T>,
    ...options,
  });
}

export function useMcpMutation(toolName: string, invalidateKeys?: string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: Record<string, unknown>) => callTool(toolName, params),
    onSuccess: () => {
      invalidateKeys?.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
}
