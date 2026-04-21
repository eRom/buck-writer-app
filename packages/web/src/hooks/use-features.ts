import { useQuery } from '@tanstack/react-query';
import { fetchMe, type MeResponse } from '@/lib/session';

export function useFeatures(): { tts: boolean; isReady: boolean } {
  const query = useQuery<MeResponse | null>({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
  });
  return {
    tts: Boolean(query.data?.features?.tts),
    isReady: !query.isLoading,
  };
}
