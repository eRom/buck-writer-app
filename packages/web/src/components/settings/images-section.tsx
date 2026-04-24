import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  IMAGE_SIZES,
  imageCost,
  type ImageSizeOption,
  type SettingsResponse,
} from '@buck/shared';
import { fetchSettings, updateSettings } from '@/lib/settings';
import { ImagePlus } from 'lucide-react';

type Quality = 'low' | 'medium' | 'high';

const QUALITIES: Quality[] = ['low', 'medium', 'high'];
const QUALITY_LABEL: Record<Quality, string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
};

const SIZE_LABEL: Record<ImageSizeOption, string> = {
  '1024x1024': 'Carré (1024 × 1024)',
  '1536x1024': 'Paysage (1536 × 1024)',
  '1024x1536': 'Portrait (1024 × 1536)',
  auto: 'Auto — le modèle choisit',
};

function formatCost(usd: number): string {
  if (usd < 0.01) return `≈ $${usd.toFixed(3)}`;
  return `≈ $${usd.toFixed(2)}`;
}

export function ImagesSection() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => queryClient.setQueryData(['settings'], data),
    onError: (err) => toast.error(`Erreur : ${(err as Error).message}`),
  });

  if (isLoading || !settings) {
    return (
      <section className="rounded-xl border border-card-border bg-card p-6">
        <h2 className="text-lg font-semibold">Images</h2>
        <p className="mt-1 text-sm text-muted-foreground">Chargement…</p>
      </section>
    );
  }

  const s: SettingsResponse = settings;
  const enabled = Boolean(s.chatTools.imageGen);
  const quality = s.imageQuality;
  const size = s.imageSize;
  const currentCost =
    size === 'auto' ? imageCost(quality, '1024x1024') : imageCost(quality, size);

  function setEnabled(next: boolean) {
    mutation.mutate({
      chatTools: {
        webSearch: Boolean(s.chatTools.webSearch),
        fileSearch: s.chatTools.fileSearch,
        imageGen: next,
      },
    });
  }

  function setQuality(next: Quality) {
    mutation.mutate({ imageQuality: next });
  }

  function setSize(next: ImageSizeOption) {
    mutation.mutate({ imageSize: next });
  }

  return (
    <section className="rounded-xl border border-card-border bg-card p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ImagePlus className="size-4" /> Images
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Génère covers, moodboards et portraits depuis tes prompts via{' '}
            <code>gpt-image-2</code>.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            aria-label="Activer la génération d'images"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4"
          />
          <span>{enabled ? 'Activé' : 'Désactivé'}</span>
        </label>
      </header>

      {enabled ? (
        <div className="mt-5 space-y-4">
          <div>
            <div className="mb-2 text-sm font-medium">Qualité</div>
            <div className="flex gap-4">
              {QUALITIES.map((q) => (
                <label key={q} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="image-quality"
                    value={q}
                    checked={quality === q}
                    onChange={() => setQuality(q)}
                    className="size-4"
                  />
                  <span>
                    {QUALITY_LABEL[q]}{' '}
                    <span className="text-xs text-muted-foreground">
                      ≈ ${imageCost(q, '1024x1024').toFixed(3)} / image (carré)
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm">Taille par défaut</div>
              <div className="text-xs text-muted-foreground">
                {formatCost(currentCost)} / image à la config actuelle
              </div>
            </div>
            <select
              aria-label="Taille d'image par défaut"
              value={size}
              onChange={(e) => setSize(e.target.value as ImageSizeOption)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              {IMAGE_SIZES.map((sz) => (
                <option key={sz} value={sz}>
                  {SIZE_LABEL[sz]}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Active la génération pour configurer qualité et taille.
        </p>
      )}
    </section>
  );
}
