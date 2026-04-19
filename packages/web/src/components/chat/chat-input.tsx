import { useEffect, useRef, useState, type KeyboardEvent, type DragEvent, type ClipboardEvent } from 'react';
import { Paperclip, ArrowUp, Square, X, Mic } from 'lucide-react';
import { ALLOWED_MIME_TYPES } from '@buck/shared';
import type { FileEntry } from '@buck/shared';
import { AtReference } from './at-reference';
import { cn } from '@/lib/utils';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice';

export interface PendingAttachment {
  file: File;
  preview?: string;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading: boolean;
  disabled?: boolean;
  pendingAttachments: PendingAttachment[];
  onAttachmentsChange: (attachments: PendingAttachment[]) => void;
  workspaceEntries?: FileEntry[];
  onReferenceSelect?: (path: string) => void;
  chatSessionId?: string | null;
}

const ACCEPT = ALLOWED_MIME_TYPES.join(',');

function filesToPending(files: ArrayLike<File>): PendingAttachment[] {
  return Array.from(files).map((file) => ({
    file,
    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  }));
}

function kindOf(mime: string): string {
  if (mime.startsWith('image/')) return 'IMG';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('text/')) return 'TXT';
  if (mime.includes('wordprocessingml')) return 'DOC';
  return 'FILE';
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  disabled,
  pendingAttachments,
  onAttachmentsChange,
  workspaceEntries,
  onReferenceSelect,
  chatSessionId = null,
}: ChatInputProps) {
  const realtimeState = useRealtimeStore((s) => s.state);
  const { start, stop } = useRealtimeVoice(chatSessionId ?? null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = Math.floor(window.innerHeight / 3);
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [value]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (atQuery !== null && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && (value.trim() || pendingAttachments.length > 0)) onSubmit();
    }
  }

  function addFiles(files: ArrayLike<File>) {
    const pending = filesToPending(files);
    if (pending.length > 0) {
      onAttachmentsChange([...pendingAttachments, ...pending]);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
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

  function removeAttachment(index: number) {
    onAttachmentsChange(pendingAttachments.filter((_, i) => i !== index));
  }

  function handleChange(newValue: string) {
    onChange(newValue);
    const cursorPos = textareaRef.current?.selectionStart ?? newValue.length;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
    setAtQuery(atMatch ? atMatch[1]! : null);
  }

  function handleReferenceSelect(filePath: string) {
    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s]*)$/);
    if (atMatch) {
      const before = textBeforeCursor.slice(0, atMatch.index!);
      const after = value.slice(cursorPos);
      onChange(`${before}@${filePath} ${after}`);
    }
    setAtQuery(null);
    onReferenceSelect?.(filePath);
  }

  const canSend = value.trim() || pendingAttachments.length > 0;

  return (
    <div className={cn('px-4 pb-4', disabled && 'opacity-50')} onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            'relative rounded-xl border bg-card transition-colors',
            focused ? 'border-ring' : 'border-card-border',
          )}
        >
          {atQuery !== null && workspaceEntries && (
            <AtReference
              query={atQuery}
              entries={workspaceEntries}
              onSelect={handleReferenceSelect}
              onClose={() => setAtQuery(null)}
            />
          )}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-border px-2 pt-2">
              {pendingAttachments.map((a, i) => (
                <span
                  key={`${a.file.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[11px]"
                >
                  <span className="font-mono text-muted-foreground">{kindOf(a.file.type)}</span>
                  <span className="max-w-32 truncate">{a.file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    aria-label={`Retirer ${a.file.name}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Envoyer un message..."
            rows={1}
            disabled={disabled}
            className="block w-full resize-none overflow-y-auto bg-transparent px-3 pt-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                aria-label="Joindre un fichier"
                className="hover-elevate rounded-md p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Paperclip className="size-4" />
              </button>
              {chatSessionId && (
                <button
                  type="button"
                  aria-label={realtimeState === 'idle' ? 'Démarrer Live' : 'Arrêter Live'}
                  onClick={() => {
                    if (realtimeState === 'idle') {
                      void start({ voice: 'coral', turnDetection: { mode: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, interrupt_response: true }, tools: { bible: true, writingTools: true, webSearch: true } });
                    } else {
                      void stop();
                    }
                  }}
                  className={cn(
                    'hover-elevate rounded-md p-1.5 disabled:opacity-50',
                    realtimeState !== 'idle'
                      ? 'text-amber-500 hover:text-amber-600'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Mic className="size-4" />
                </button>
              )}
            </div>
            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop"
                className="hover-elevate flex size-7 items-center justify-center rounded-full border border-destructive-border bg-destructive text-destructive-foreground"
              >
                <Square className="size-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={disabled || !canSend}
                aria-label="Envoyer"
                className="hover-elevate active-elevate-2 flex size-7 items-center justify-center rounded-full border border-primary-border bg-primary text-primary-foreground disabled:opacity-50"
              >
                <ArrowUp className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
