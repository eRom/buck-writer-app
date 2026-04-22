import { Check, X, Minus, Loader2 } from 'lucide-react';
import { useAttachmentMeta } from '@/hooks/use-attachment-meta';

export interface AttachmentDisplayItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

interface AttachmentDisplayProps {
  attachments: AttachmentDisplayItem[];
  showExtractionBadge?: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  plain: 'texte brut',
  markitdown: 'MarkItDown',
};

function ExtractionBadge({ attachmentId }: { attachmentId: string }) {
  const { data, isLoading, isError } = useAttachmentMeta(attachmentId);

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
        <Loader2 className="size-2.5 animate-spin" />
        extraction…
      </span>
    );
  }
  if (isError || !data) return null;

  if (data.extractionStatus === 'ok') {
    const source = data.extractionSource ? SOURCE_LABEL[data.extractionSource] ?? data.extractionSource : '';
    const chars = data.extractedChars ?? 0;
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
        <Check className="size-2.5" />
        extrait
        {chars > 0 && <span className="text-muted-foreground/70">• {chars.toLocaleString('fr-FR')} car.</span>}
        {source && <span className="text-muted-foreground/70">• {source}</span>}
      </span>
    );
  }

  if (data.extractionStatus === 'skipped') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70"
        title="Type de fichier non supporté pour l'extraction"
      >
        <Minus className="size-2.5" />
        non extrait
      </span>
    );
  }

  if (data.extractionStatus === 'failed') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-destructive"
        title={data.extractionError ?? 'Extraction échouée'}
      >
        <X className="size-2.5" />
        extraction échouée
      </span>
    );
  }

  return null;
}

export function AttachmentDisplay({
  attachments,
  showExtractionBadge = true,
}: AttachmentDisplayProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((att) => {
        const isImage = att.mimeType.startsWith('image/');
        return (
          <div key={att.id} className="flex flex-col items-start gap-0.5">
            {isImage ? (
              <a
                href={`/api/attachments/${att.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={`/api/attachments/${att.id}`}
                  alt={att.filename}
                  className="h-16 w-16 rounded-lg border border-border object-cover"
                />
              </a>
            ) : (
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2 py-1.5 text-xs">
                <span className="font-medium text-primary">
                  {att.filename.split('.').pop()?.toUpperCase()}
                </span>
                <span className="text-muted-foreground">{att.filename}</span>
                <span className="text-muted-foreground/50">
                  {(att.sizeBytes / 1024).toFixed(0)} KB
                </span>
              </div>
            )}
            {showExtractionBadge && <ExtractionBadge attachmentId={att.id} />}
          </div>
        );
      })}
    </div>
  );
}
