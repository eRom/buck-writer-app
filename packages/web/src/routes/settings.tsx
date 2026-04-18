import { createFileRoute, redirect, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { fetchMe } from '@/lib/session';
import { AccountSection } from '@/components/settings/account-section';
import { GeneralSection } from '@/components/settings/general-section';
import { BudgetSection } from '@/components/settings/budget-section';

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    const me = await fetchMe();
    if (!me) throw redirect({ to: '/login' });
    return { me };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { me } = Route.useRouteContext();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Retour au chat
          </Link>
          <h1 className="text-sm font-semibold">Parametres</h1>
          <span className="w-24" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <AccountSection email={me.email} />
        <GeneralSection />
        <BudgetSection />
      </main>
    </div>
  );
}
