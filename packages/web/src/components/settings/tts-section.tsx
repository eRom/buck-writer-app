import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TTS_VOICES, DEFAULT_TTS_VOICE } from '@buck/shared';
import type { SettingsResponse } from '@buck/shared';
import { fetchSettings, updateSettings } from '@/lib/settings';
import { useFeatures } from '@/hooks/use-features';
import { Loader2, Play } from 'lucide-react';

type TtsVoiceName = (typeof TTS_VOICES)[number]['name'];

export function TtsSection() {
  const features = useFeatures();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => queryClient.setQueryData(['settings'], data),
  });

  const [testing, setTesting] = useState(false);

  if (!features.tts) {
    return (
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-base font-semibold">Synthèse vocale (TTS)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Désactivée côté serveur. Active <code>TTS_ENABLED=1</code> et renseigne
          <code> GEMINI_API_KEY</code> dans <code>.env</code>.
        </p>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="rounded-lg border border-border p-4">
        <h2 className="text-base font-semibold">Synthèse vocale (TTS)</h2>
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </section>
    );
  }

  const s: SettingsResponse = settings;
  const currentVoice = (s.ttsDefaultVoice ?? DEFAULT_TTS_VOICE) as TtsVoiceName;

  async function testVoice(voice: TtsVoiceName) {
    setTesting(true);
    try {
      // Save first so the /api/tts route resolves the user default correctly
      if (voice !== currentVoice) {
        await mutation.mutateAsync({ ttsDefaultVoice: voice });
      }
      // Re-use /api/tts on a throwaway sample is not trivial without a message.
      // Instead, call the sample endpoint on a real assistant message if one
      // exists; otherwise just inform the user.
      toast.info(`Voix ${voice} sélectionnée. Teste-la sur un message du chat.`);
    } catch (err) {
      toast.error(`Erreur : ${(err as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-lg border border-border p-4 space-y-4">
      <header>
        <h2 className="text-base font-semibold">Synthèse vocale (TTS)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Gemini 3.1 Flash TTS Preview — 30 voix disponibles. L'audio est mis en
          cache par message et par voix.
        </p>
      </header>

      <div className="space-y-2">
        <label htmlFor="tts-voice" className="block text-sm font-medium">
          Voix par défaut
        </label>
        <div className="flex gap-2">
          <select
            id="tts-voice"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={currentVoice}
            onChange={(e) =>
              mutation.mutate({ ttsDefaultVoice: e.target.value as TtsVoiceName })
            }
          >
            {TTS_VOICES.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} — {v.character}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void testVoice(currentVoice)}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm hover-elevate disabled:opacity-60"
          >
            {testing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Tester
          </button>
        </div>
      </div>
    </section>
  );
}
