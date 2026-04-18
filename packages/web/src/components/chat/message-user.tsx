import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  content: string;
}

export function MessageUser({ content }: Props) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="group flex flex-col items-end gap-1">
      <div className="max-w-[70%] whitespace-pre-wrap rounded-2xl border border-border bg-secondary px-3.5 py-2 text-sm text-secondary-foreground">
        {content}
      </div>
      <button
        onClick={onCopy}
        aria-label="Copier"
        className={cn(
          'hover-elevate rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
        )}
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </div>
  );
}
