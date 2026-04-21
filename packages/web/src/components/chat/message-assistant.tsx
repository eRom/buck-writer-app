import { type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { MessageFooter } from './message-footer';
import { MessageTtsButton } from './message-tts-button';
import { useFeatures } from '@/hooks/use-features';

interface FooterProps {
  provider?: string;
  model?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

interface Props {
  reasoning?: ReactNode;
  toolCalls?: ReactNode;
  children: ReactNode;
  footer?: FooterProps;
  messageId?: string;
}

export function MessageAssistant({ reasoning, toolCalls, children, footer, messageId }: Props) {
  const features = useFeatures();
  return (
    <div className="group flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Sparkles className="size-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {reasoning}
        {toolCalls}
        <div className="text-sm leading-relaxed">{children}</div>
        <div className="flex items-center justify-between gap-2">
          {features.tts && messageId ? (
            <MessageTtsButton messageId={messageId} />
          ) : (
            <span />
          )}
          {footer && <MessageFooter {...footer} />}
        </div>
      </div>
    </div>
  );
}
