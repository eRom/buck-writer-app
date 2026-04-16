import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { apiFetch } from '@/lib/api';
import { fetchMe, type MeResponse } from '@/lib/session';

export const Route = createFileRoute('/')({
  loader: async (): Promise<MeResponse> => {
    const me = await fetchMe();
    if (!me) throw new Error('unauthenticated');
    return me;
  },
  component: Home,
});

function Home() {
  const me = useLoaderData({ from: '/' });

  async function handleLogout(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-8">
      <h1 className="mb-4 text-2xl font-semibold">buck writer — M0 shell</h1>
      <p className="text-muted-foreground">Connecté en tant que {me.email}.</p>
      <form onSubmit={handleLogout}>
        <button
          type="submit"
          className="mt-6 rounded-md border border-border px-3 py-2"
        >
          Se déconnecter
        </button>
      </form>
    </main>
  );
}
