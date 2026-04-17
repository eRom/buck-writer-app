import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

export function WebDavWizard() {
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const isMac = navigator.userAgent.includes('Mac');
  const webdavUrl = `${window.location.origin}/webdav`;

  const generateToken = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/webdav-token', { method: 'POST' });
      setToken(res.token);
      toast.success('Token WebDAV genere');
    } catch {
      toast.error('Erreur lors de la generation du token');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Acces WebDAV</h3>
      <p className="text-xs text-muted-foreground">
        Connecte ton explorateur de fichiers pour acceder au workspace depuis ton bureau.
      </p>

      <div className="rounded-md border border-border p-3 text-xs space-y-2">
        <p className="font-medium">URL WebDAV :</p>
        <code className="block rounded bg-muted px-2 py-1">{webdavUrl}</code>
      </div>

      {!token ? (
        <button onClick={generateToken} disabled={generating}
          className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {generating ? 'Generation...' : 'Generer un token'}
        </button>
      ) : (
        <div className="rounded-md border border-primary bg-primary/5 p-3 text-xs space-y-2">
          <p className="font-medium text-primary">Token (copie-le maintenant, il ne sera plus affiche) :</p>
          <code className="block rounded bg-muted px-2 py-1 break-all select-all">{token}</code>
        </div>
      )}

      <div className="rounded-md border border-border p-3 text-xs space-y-2">
        <p className="font-medium">{isMac ? 'macOS -- Finder' : 'Windows -- Explorateur'}</p>
        {isMac ? (
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Ouvre le Finder</li>
            <li>Menu Aller &rarr; Se connecter au serveur (ou Cmd+K)</li>
            <li>Colle l&apos;URL : <code className="rounded bg-muted px-1">{webdavUrl}</code></li>
            <li>Nom d&apos;utilisateur : <code className="rounded bg-muted px-1">buck</code> (n&apos;importe quoi)</li>
            <li>Mot de passe : colle le token genere ci-dessus</li>
          </ol>
        ) : (
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Ouvre l&apos;Explorateur de fichiers</li>
            <li>Clic droit sur &quot;Ce PC&quot; &rarr; Connecter un lecteur reseau</li>
            <li>Dans &quot;Dossier&quot;, colle : <code className="rounded bg-muted px-1">{webdavUrl}</code></li>
            <li>Coche &quot;Se connecter avec d&apos;autres informations&quot;</li>
            <li>Nom d&apos;utilisateur : <code className="rounded bg-muted px-1">buck</code></li>
            <li>Mot de passe : colle le token genere ci-dessus</li>
          </ol>
        )}
      </div>
    </div>
  );
}
