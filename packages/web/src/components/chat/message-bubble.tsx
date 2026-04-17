import type { AttachmentResponse } from '@buck/shared';
import { MarkdownRenderer } from './markdown-renderer';
import { AttachmentDisplay } from './attachment-display';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  attachments?: AttachmentResponse[];
}

export function MessageBubble({ role, content, model, attachments }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {attachments && attachments.length > 0 && (
          <AttachmentDisplay attachments={attachments} />
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
          <MarkdownRenderer content={content} />
        )}
        {!isUser && model && (
          <p className="mt-1 text-xs text-muted-foreground">{model}</p>
        )}
      </div>
    </div>
  );
}
