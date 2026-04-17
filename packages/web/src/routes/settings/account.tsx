import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/account')({
  component: SettingsAccount,
});

function SettingsAccount() {
  const { me } = Route.useRouteContext();

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold">Compte</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Email</div>
            <div className="text-xs text-muted-foreground">Adresse utilisée pour la connexion</div>
          </div>
          <div className="text-sm text-muted-foreground">{me.email}</div>
        </div>
      </div>
    </>
  );
}
