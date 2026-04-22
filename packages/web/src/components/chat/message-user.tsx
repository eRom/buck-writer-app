import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageTtsButton } from './message-tts-button';
import { AttachmentDisplay, type AttachmentDisplayItem } from './attachment-display';
import { useFeatures } from '@/hooks/use-features';

interface Props {
  content: string;
  messageId?: string;
  attachments?: AttachmentDisplayItem[];
}

export function MessageUser({ content, messageId, attachments }: Props) {
  const [copied, setCopied] = useState(false);
  const features = useFeatures();
  async function onCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="group flex flex-col items-end gap-1">
      {attachments && attachments.length > 0 && (
        <div className="max-w-[70%]">
          <AttachmentDisplay attachments={attachments} />
        </div>
      )}
      <div className="max-w-[70%] whitespace-pre-wrap rounded-2xl border border-border bg-secondary px-3.5 py-2 text-sm text-secondary-foreground">
        {content}
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={onCopy}
          aria-label="Copier"
          className={cn(
            'hover-elevate rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
        {features.tts && messageId && <MessageTtsButton messageId={messageId} />}
      </div>
    </div>
  );
}
