import type { AttachmentResponse } from '@buck/shared';

interface AttachmentDisplayProps {
  attachments: AttachmentResponse[];
}

export function AttachmentDisplay({ attachments }: AttachmentDisplayProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {attachments.map((att) => {
        const isImage = att.mimeType.startsWith('image/');
        return isImage ? (
          <a
            key={att.id}
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
          <div
            key={att.id}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2 py-1.5 text-xs"
          >
            <span className="font-medium text-primary">
              {att.filename.split('.').pop()?.toUpperCase()}
            </span>
            <span className="text-muted-foreground">{att.filename}</span>
            <span className="text-muted-foreground/50">
              {(att.sizeBytes / 1024).toFixed(0)} KB
            </span>
          </div>
        );
      })}
    </div>
  );
}
