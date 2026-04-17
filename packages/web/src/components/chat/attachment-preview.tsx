export interface PendingAttachment {
  file: File;
  preview?: string; // data URL for images
}

interface AttachmentPreviewProps {
  attachments: PendingAttachment[];
  onRemove: (index: number) => void;
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {attachments.map((att, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs"
        >
          {att.preview ? (
            <img src={att.preview} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <span className="font-medium text-primary">
              {att.file.name.split('.').pop()?.toUpperCase()}
            </span>
          )}
          <span className="max-w-[120px] truncate text-muted-foreground">{att.file.name}</span>
          <button
            onClick={() => onRemove(i)}
            className="ml-1 text-muted-foreground hover:text-foreground"
            aria-label={`Retirer ${att.file.name}`}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
