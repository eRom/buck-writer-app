import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { fetchSettings, updateSettings } from '@/lib/settings';
import { MODELS } from '@buck/shared';
import { toast } from 'sonner';

export const Route = createFileRoute('/settings/general')({
  component: SettingsGeneral,
});

const REASONING_EFFORTS = ['low', 'medium', 'high'] as const;

function SettingsGeneral() {
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
      await updateSettings({ defaultModel: value });
      toast.success('Modèle par défaut mis à jour');
    } catch {
      toast.error('Erreur lors de la mise à jour');
      const s = await fetchSettings();
      setModel(s.defaultModel);
    }
  }

  async function handleEffortChange(value: string) {
    setEffort(value);
    try {
      await updateSettings({ defaultReasoningEffort: value });
      toast.success('Effort de raisonnement mis à jour');
    } catch {
      toast.error('Erreur lors de la mise à jour');
      const s = await fetchSettings();
      setEffort(s.defaultReasoningEffort);
    }
  }

  if (loading) return <div className="text-muted-foreground">Chargement...</div>;

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold">Général</h2>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Modèle par défaut</div>
            <div className="text-xs text-muted-foreground">Utilisé pour les nouvelles conversations</div>
          </div>
          <select value={model} onChange={(e) => handleModelChange(e.target.value)}
            className="rounded-md border border-border bg-input px-3 py-1.5 text-sm">
            {MODELS.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Effort de raisonnement</div>
            <div className="text-xs text-muted-foreground">Niveau de réflexion par défaut</div>
          </div>
          <select value={effort} onChange={(e) => handleEffortChange(e.target.value)}
            className="rounded-md border border-border bg-input px-3 py-1.5 text-sm">
            {REASONING_EFFORTS.map((e) => (<option key={e} value={e}>{e}</option>))}
          </select>
        </div>
      </div>
    </>
  );
}
