import { useRef, type KeyboardEvent } from 'react';
import { ModelSelector } from './model-selector';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading: boolean;
  model: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
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
}: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && value.trim()) onSubmit();
    }
  }

  return (
    <div className={`border-t border-border p-3${disabled ? ' opacity-50' : ''}`}>
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <ModelSelector value={model} onChange={onModelChange} disabled={isLoading || disabled} />
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
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
            disabled={disabled || !value.trim()}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            Envoyer
          </button>
        )}
      </div>
    </div>
  );
}
