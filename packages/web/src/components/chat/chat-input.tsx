import { useRef, type KeyboardEvent, type DragEvent, type ClipboardEvent } from 'react';
import { ALLOWED_MIME_TYPES } from '@buck/shared';
import { ModelSelector } from './model-selector';
import { AttachmentPreview, type PendingAttachment } from './attachment-preview';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading: boolean;
  model: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  pendingAttachments: PendingAttachment[];
  onAttachmentsChange: (attachments: PendingAttachment[]) => void;
}

const ACCEPT = ALLOWED_MIME_TYPES.join(',');

function filesToPending(files: FileList | File[]): PendingAttachment[] {
  return Array.from(files).map((file) => ({
    file,
    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  }));
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  model,
  onModelChange,
  disabled,
  pendingAttachments,
  onAttachmentsChange,
}: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && (value.trim() || pendingAttachments.length > 0)) onSubmit();
    }
  }

  function addFiles(files: FileList | File[]) {
    const pending = filesToPending(files);
    if (pending.length > 0) {
      onAttachmentsChange([...pendingAttachments, ...pending]);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData.files;
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  }

  function handleRemove(index: number) {
    const updated = pendingAttachments.filter((_, i) => i !== index);
    onAttachmentsChange(updated);
  }

  return (
    <div className={`border-t border-border p-3${disabled ? ' opacity-50' : ''}`}>
      <div className="mx-auto max-w-3xl">
        <AttachmentPreview attachments={pendingAttachments} onRemove={handleRemove} />
        <div className="flex items-end gap-2" onDrop={handleDrop} onDragOver={handleDragOver}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="rounded-md border border-border px-2 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Joindre des fichiers"
          >
            +
          </button>
          <ModelSelector value={model} onChange={onModelChange} disabled={isLoading || disabled} />
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Ecris ton message..."
            rows={1}
            disabled={disabled}
            className="flex-1 resize-none rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            style={{ maxHeight: '200px' }}
          />
          {isLoading ? (
            <button
              onClick={onStop}
              className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={disabled || (!value.trim() && pendingAttachments.length === 0)}
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              Envoyer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
