import { useState, useEffect } from 'react';

export interface LoginViewProps {
  onRequest: (email: string) => Promise<void>;
}

export function LoginView({ onRequest }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onRequest(email);
      setSent(true);
      setCooldown(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erreur');
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-8 text-3xl font-semibold">buck writer</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="text-sm" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-border bg-input px-3 py-2 text-foreground"
        />
        <button
          type="submit"
          disabled={cooldown > 0}
          className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
        >
          {cooldown > 0
            ? `Renvoyer dans ${cooldown}s`
            : 'Envoyer le lien magique'}
        </button>
        {sent && (
          <p className="text-sm text-muted-foreground">
            Email envoyé. Clique sur le lien reçu (expire dans 15 min).
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </div>
  );
}
