import type { AttachmentResponse } from '@buck/shared';
import { MarkdownRenderer } from './markdown-renderer';
import { AttachmentDisplay } from './attachment-display';
import { TerminalBlock } from './terminal-block';
import { ApprovalBlock } from './approval-block';

interface ToolMetaDisplay {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'approved' | 'denied' | 'auto' | 'blocked';
  result?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    killed?: boolean;
    truncated?: boolean;
    error?: string;
  };
}

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  attachments?: AttachmentResponse[];
  toolMetas?: ToolMetaDisplay[];
}

export function MessageBubble({ role, content, model, attachments, toolMetas }: MessageBubbleProps) {
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

        {/* Tool results from history */}
        {toolMetas?.map((tm) => {
          if (tm.toolName === 'shell_execute' && tm.status === 'approved' && tm.result) {
            return (
              <TerminalBlock
                key={tm.toolCallId}
                command={String(tm.args.command ?? '')}
                stdout={tm.result.stdout ?? ''}
                stderr={tm.result.stderr ?? ''}
                exitCode={tm.result.exitCode ?? 1}
                killed={tm.result.killed}
                truncated={tm.result.truncated}
              />
            );
          }
          if (tm.status === 'approved' || tm.status === 'denied') {
            return (
              <ApprovalBlock
                key={tm.toolCallId}
                toolName={tm.toolName}
                args={tm.args}
                onApprove={() => {}}
                onDeny={() => {}}
                status={tm.status}
              />
            );
          }
          if (tm.status === 'blocked') {
            return (
              <div key={tm.toolCallId} className="my-2 rounded border border-red-500/30 bg-red-900/10 px-3 py-2 text-xs text-red-400">
                Commande bloquée : {String(tm.args.command ?? tm.args.path ?? '')}
              </div>
            );
          }
          return null;
        })}

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
