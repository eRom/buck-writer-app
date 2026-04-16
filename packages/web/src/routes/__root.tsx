import {
  createRootRouteWithContext,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { fetchMe } from '@/lib/session';

export interface RouterCtx {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterCtx>()({
  beforeLoad: async ({ location }) => {
    if (
      location.pathname === '/login' ||
      location.pathname === '/auth/callback'
    ) {
      return;
    }
    const me = await fetchMe();
    if (!me) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => <Outlet />,
});
