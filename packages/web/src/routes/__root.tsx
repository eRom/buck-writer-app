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
    try {
      const me = await fetchMe();
      if (!me) {
        throw redirect({ to: '/login' });
      }
    } catch (err) {
      // Re-throw redirects as-is; network/server errors → redirect to login
      // instead of showing a blank page (error boundary would be empty).
      if (err instanceof Error && 'to' in err) throw err;
      throw redirect({ to: '/login' });
    }
  },
  component: () => <Outlet />,
});
