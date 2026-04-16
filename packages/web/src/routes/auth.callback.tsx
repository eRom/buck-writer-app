import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/callback')({
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
  component: () => null,
});
