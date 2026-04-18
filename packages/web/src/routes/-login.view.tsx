import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface LoginViewProps {
  onRequest: (email: string) => Promise<void>;
  isDev?: boolean;
}

export function LoginView({ onRequest, isDev }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onRequest(email);
      setSent(true);
      setCooldown(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-card-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg border border-primary-border bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Buck Writer</h1>
            <p className="text-[11px] text-muted-foreground">Connexion par lien magique</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-3">
            <p className="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              Lien envoye a <span className="font-mono text-foreground">{email}</span>. Verifiez votre boite
              (expire dans 15 min).
            </p>
            <button
              onClick={() => setSent(false)}
              disabled={cooldown > 0}
              className="hover-elevate w-full rounded-md border border-border py-2 text-xs text-muted-foreground disabled:opacity-50"
            >
              {cooldown > 0 ? `Renvoyer dans ${cooldown}s` : 'Renvoyer'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Email
              </span>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="romain@example.com"
              />
            </label>
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="hover-elevate active-elevate-2 w-full rounded-md border border-primary-border bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {loading ? 'Envoi...' : 'Recevoir le lien magique'}
            </button>
            {isDev && (
              <a
                href="/api/__e2e__/dev-login?email=romain.ecarnot@gmail.com"
                className="hover-elevate block rounded-md border border-border py-2 text-center text-xs text-muted-foreground"
              >
                Dev login
              </a>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
