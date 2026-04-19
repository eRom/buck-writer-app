import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { MODELS } from '@buck/shared';
import { fetchSettings, updateSettings } from '@/lib/settings';
import { WebDavWizard } from './webdav-wizard';

const REASONING_EFFORTS = ['low', 'medium', 'high'] as const;

export function GeneralSection() {
  const [model, setModel] = useState('gpt-5.4-mini');
  const [effort, setEffort] = useState('low');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings().then((s) => {
      setModel(s.defaultModel);
      setEffort(s.defaultReasoningEffort);
      setLoading(false);
    });
  }, []);

  async function handleModelChange(value: string) {
    setModel(value);
    try {
      await updateSettings({ defaultModel: value as 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.4-pro' | 'gpt-5.4-nano' });
      toast.success('Modele par defaut mis a jour');
    } catch {
      toast.error('Erreur lors de la mise a jour');
      const s = await fetchSettings();
      setModel(s.defaultModel);
    }
  }

  async function handleEffortChange(value: string) {
    setEffort(value);
    try {
      await updateSettings({ defaultReasoningEffort: value as 'low' | 'medium' | 'high' });
      toast.success('Effort de raisonnement mis a jour');
    } catch {
      toast.error('Erreur lors de la mise a jour');
      const s = await fetchSettings();
      setEffort(s.defaultReasoningEffort);
    }
  }

  return (
    <section className="rounded-xl border border-card-border bg-card p-6">
      <h2 className="text-lg font-semibold">General</h2>
      <p className="mt-1 text-sm text-muted-foreground">Preferences par defaut.</p>
      {loading ? (
        <div className="mt-4 text-sm text-muted-foreground">Chargement...</div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">Modele par defaut</div>
              <div className="text-xs text-muted-foreground">Utilise pour les nouvelles conversations</div>
            </div>
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">Effort de raisonnement</div>
              <div className="text-xs text-muted-foreground">Niveau de reflexion par defaut</div>
            </div>
            <select
              value={effort}
              onChange={(e) => handleEffortChange(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              {REASONING_EFFORTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="mt-6 border-t border-border pt-6">
        <WebDavWizard />
      </div>
    </section>
  );
}
