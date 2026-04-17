import { createFileRoute, Outlet, Link, useMatchRoute, redirect } from '@tanstack/react-router';
import { fetchMe } from '@/lib/session';
import { ArrowLeft, Settings, Wallet, User } from 'lucide-react';

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    const me = await fetchMe();
    if (!me) throw redirect({ to: '/login' });
    return { me };
  },
  component: SettingsLayout,
});

const navItems = [
  { to: '/settings/general' as const, label: 'Général', icon: Settings },
  { to: '/settings/budget' as const, label: 'Budget', icon: Wallet },
  { to: '/settings/account' as const, label: 'Compte', icon: User },
];

function SettingsLayout() {
  const matchRoute = useMatchRoute();

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="border-b border-border p-3">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Retour au chat
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = matchRoute({ to });
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
