import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface PublicConfig {
  turnstileSiteKey: string | null;
}

export function usePublicConfig() {
  const query = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api.get<PublicConfig>('/api/public/config'),
    staleTime: 30 * 60_000,
  });

  return { turnstileSiteKey: query.data?.turnstileSiteKey ?? null };
}
