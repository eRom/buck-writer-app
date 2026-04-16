import { createFileRoute, redirect } from '@tanstack/react-router';

// Safety net: the magic-link points to /api/auth/callback (Hono route) which
// sets the session cookie and 302-redirects to /. This SPA route is only hit
// if the user manually pastes /auth/callback into the browser — in which case
// we redirect to / and let __root.tsx handle the auth guard.
export const Route = createFileRoute('/auth/callback')({
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
  component: () => null,
});
