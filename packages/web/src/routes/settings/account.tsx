import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { fetchMe } from '@/lib/session';

export const Route = createFileRoute('/settings/account')({
  component: SettingsAccount,
});

function SettingsAccount() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMe().then((me) => {
      if (me) setEmail(me.email);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-muted-foreground">Chargement...</div>;

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold">Compte</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Email</div>
            <div className="text-xs text-muted-foreground">Adresse utilisée pour la connexion</div>
          </div>
          <div className="text-sm text-muted-foreground">{email}</div>
        </div>
      </div>
    </>
  );
}
