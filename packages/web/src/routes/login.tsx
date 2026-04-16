import { createFileRoute } from '@tanstack/react-router';
import { LoginView } from './-login.view';
import { apiFetch } from '@/lib/api';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  return (
    <LoginView
      onRequest={async (email) => {
        await apiFetch<{ sent: boolean }>('/api/auth/request', {
          method: 'POST',
          body: { email },
        });
      }}
    />
  );
}
