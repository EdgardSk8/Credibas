import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiClientError } from '../lib/api';
import type { MeResponse, MembershipSummary } from '@shared/types';

interface AuthContextValue {
  me: MeResponse | null;
  loading: boolean;
  activeMembership: MembershipSummary | null;
  hasPermission: (permission: string) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await api.get<MeResponse>('/api/auth/me');
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const me = data ?? null;

  const activeMembership = useMemo(() => {
    if (!me?.activeOrgId) return null;
    return me.memberships.find((membership) => membership.orgId === me.activeOrgId) ?? null;
  }, [me]);

  const hasPermission = useCallback(
    (permission: string) => activeMembership?.permissions?.includes(permission as never) ?? false,
    [activeMembership],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    queryClient.clear();
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }, [queryClient]);

  const switchOrganization = useCallback(
    async (orgId: string) => {
      await api.post('/api/auth/switch-org', { orgId });
      queryClient.clear();
      await queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ me, loading: isLoading, activeMembership, hasPermission, refresh, logout, switchOrganization }),
    [me, isLoading, activeMembership, hasPermission, refresh, logout, switchOrganization],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
