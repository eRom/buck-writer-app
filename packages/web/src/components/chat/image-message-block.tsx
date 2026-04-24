import { useState } from 'react';
import { Download, Save, Maximize2, AlertTriangle, Loader2 } from 'lucide-react';

export type ImageBlockStatus = 'partial' | 'done' | 'failed';

export interface ImageBlockData {
  callId: string;
  status: ImageBlockStatus;
  b64?: string;
  size?: string;
  revisedPrompt?: string;
  savedToWorkspace?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface ImageMessageBlockProps {
  data: ImageBlockData;
  onSave?: (callId: string, b64: string) => void;
  onDownload?: (callId: string, b64: string) => void;
  onZoom?: (callId: string, b64: string) => void;
}

function defaultDownload(callId: string, b64: string): void {
  const a = document.createElement('a');
  a.href = `data:image/png;base64,${b64}`;
  a.download = `${callId}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function ImageMessageBlock({
  data,
  onSave,
  onDownload,
  onZoom,
}: ImageMessageBlockProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  if (data.status === 'failed') {
    return (
      <div className="my-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <strong>Génération échouée</strong>
        </div>
        <p className="mt-1 text-xs">
          {data.errorCode === 'moderation_blocked'
            ? 'Le modèle a refusé ce prompt pour raisons de modération.'
            : (data.errorMessage ?? 'Erreur inconnue.')}
        </p>
      </div>
    );
  }

  if (!data.b64) {
    return (
      <div className="my-3 inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Buck peint une image…
      </div>
    );
  }

  const src = `data:image/png;base64,${data.b64}`;
  const isPartial = data.status === 'partial';
  const canAct = data.status === 'done';

  function handleDownload() {
    if (!data.b64) return;
    if (onDownload) onDownload(data.callId, data.b64);
    else defaultDownload(data.callId, data.b64);
  }

  return (
    <figure className="my-3 overflow-hidden rounded-lg border border-border bg-background">
      <div className="relative">
        <img
          src={src}
          alt={data.revisedPrompt ?? 'Image générée par Buck'}
          className={`block w-full ${isPartial ? 'opacity-80' : ''}`}
        />
        {isPartial ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
            <Loader2 className="size-3 animate-spin" /> Aperçu…
          </span>
        ) : null}
        {canAct ? (
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            {onSave ? (
              <button
                type="button"
                onClick={() => data.b64 && onSave(data.callId, data.b64)}
                title={
                  data.savedToWorkspace
                    ? `Sauvegardé : ${data.savedToWorkspace}`
                    : 'Sauver dans Dossier de travail'
                }
                disabled={Boolean(data.savedToWorkspace)}
                className="inline-flex size-8 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 disabled:opacity-60"
              >
                <Save className="size-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDownload}
              title="Télécharger"
              className="inline-flex size-8 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80"
            >
              <Download className="size-3.5" />
            </button>
            {onZoom ? (
              <button
                type="button"
                onClick={() => data.b64 && onZoom(data.callId, data.b64)}
                title="Agrandir"
                className="inline-flex size-8 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80"
              >
                <Maximize2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {canAct && data.revisedPrompt ? (
        <figcaption className="border-t border-border px-3 py-2 text-xs">
          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            {showPrompt ? '− Masquer le prompt révisé' : '+ Voir le prompt révisé'}
          </button>
          {showPrompt ? (
            <p className="mt-1 italic text-muted-foreground">{data.revisedPrompt}</p>
          ) : null}
        </figcaption>
      ) : null}
      {data.savedToWorkspace ? (
        <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          Sauvegardé · <code>{data.savedToWorkspace}</code>
        </div>
      ) : null}
    </figure>
  );
}
