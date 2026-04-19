import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { REALTIME_VOICES } from '@buck/shared';
import type { SettingsResponse } from '@buck/shared';
import { fetchSettings, updateSettings } from '@/lib/settings';
import { Switch } from '@/components/ui/switch';

type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export function AudioLiveSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => queryClient.setQueryData(['settings'], data),
  });

  const [permission, setPermission] = useState<PermissionState>('unknown');

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((res) => {
        setPermission(res.state as PermissionState);
        res.onchange = () => setPermission(res.state as PermissionState);
      })
      .catch(() => setPermission('unknown'));
  }, []);

  async function recheckPermission() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setPermission('granted');
    } catch {
      setPermission('denied');
    }
  }

  if (!settings) return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="font-semibold">Audio Live</h2>
      <p className="text-sm text-muted-foreground">Chargement…</p>
    </section>
  );

  const s: SettingsResponse = settings;

  function patch(input: Parameters<typeof mutation.mutate>[0]) {
    mutation.mutate(input);
  }

  return (
    <section className="rounded-lg border border-border p-4 space-y-6">
      <header className="flex items-center gap-3">
        <h2 className="text-base font-semibold">Audio Live</h2>
        <PermissionBadge state={permission} onRecheck={recheckPermission} />
      </header>

      <div className="space-y-2">
        <label htmlFor="voice" className="block text-sm font-medium">Voix</label>
        <select
          id="voice"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={s.realtimeDefaultVoice}
          onChange={(e) => patch({ realtimeDefaultVoice: e.target.value as (typeof REALTIME_VOICES)[number] })}
        >
          {REALTIME_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="silence" className="block text-sm font-medium">
          Timeout silence : {s.realtimeSilenceTimeoutSec}s
        </label>
        <input
          id="silence"
          type="range"
          min={10}
          max={60}
          step={1}
          value={s.realtimeSilenceTimeoutSec}
          onChange={(e) => patch({ realtimeSilenceTimeoutSec: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Détection de voix</legend>
        <div>
          <label className="block text-xs text-muted-foreground">Sensibilité : {s.realtimeTurnDetection.threshold.toFixed(2)}</label>
          <input type="range" min={0} max={1} step={0.05}
            value={s.realtimeTurnDetection.threshold}
            onChange={(e) => patch({ realtimeTurnDetection: { ...s.realtimeTurnDetection, threshold: Number(e.target.value) } })}
            className="w-full" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Padding début (ms) : {s.realtimeTurnDetection.prefix_padding_ms}</label>
          <input type="range" min={0} max={1000} step={50}
            value={s.realtimeTurnDetection.prefix_padding_ms}
            onChange={(e) => patch({ realtimeTurnDetection: { ...s.realtimeTurnDetection, prefix_padding_ms: Number(e.target.value) } })}
            className="w-full" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Durée silence (ms) : {s.realtimeTurnDetection.silence_duration_ms}</label>
          <input type="range" min={100} max={2000} step={50}
            value={s.realtimeTurnDetection.silence_duration_ms}
            onChange={(e) => patch({ realtimeTurnDetection: { ...s.realtimeTurnDetection, silence_duration_ms: Number(e.target.value) } })}
            className="w-full" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Autoriser à couper la parole</span>
          <Switch
            checked={s.realtimeTurnDetection.interrupt_response}
            onCheckedChange={(v) => patch({ realtimeTurnDetection: { ...s.realtimeTurnDetection, interrupt_response: v } })}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Outils</legend>
        <ToolToggle label="Bible MCP" value={s.realtimeTools.bible} onChange={(v) => patch({ realtimeTools: { ...s.realtimeTools, bible: v } })} />
        <ToolToggle label="Writing Tools MCP" value={s.realtimeTools.writingTools} onChange={(v) => patch({ realtimeTools: { ...s.realtimeTools, writingTools: v } })} />
        <ToolToggle label="Web Search" value={s.realtimeTools.webSearch} onChange={(v) => patch({ realtimeTools: { ...s.realtimeTools, webSearch: v } })} />
      </fieldset>
    </section>
  );
}

function PermissionBadge({ state, onRecheck }: { state: PermissionState; onRecheck: () => void }) {
  if (state === 'granted') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-lime-500/20 text-lime-300 border border-lime-500/30">disponible</span>;
  }
  return (
    <button onClick={onRecheck} className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30" type="button">
      rechecker
    </button>
  );
}

function ToolToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
