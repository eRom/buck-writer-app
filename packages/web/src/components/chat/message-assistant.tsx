import { type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { MessageFooter } from './message-footer';

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
}

export function MessageAssistant({ reasoning, toolCalls, children, footer }: Props) {
  return (
    <div className="flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Sparkles className="size-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {reasoning}
        {toolCalls}
        <div className="text-sm leading-relaxed">{children}</div>
        {footer && <MessageFooter {...footer} />}
      </div>
    </div>
  );
}
