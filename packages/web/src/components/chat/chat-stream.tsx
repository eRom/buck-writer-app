import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AttachmentResponse } from '@buck/shared';
import { ChatInput, type PendingAttachment } from './chat-input';
import { MessageUser } from './message-user';
import { MessageAssistant } from './message-assistant';
import { MarkdownRenderer } from './markdown-renderer';
import { ToolCallsCollapsible } from './tool-calls-collapsible';
import { ToolCallItem, type ToolCallState } from './tool-call-item';
import { ChatEmptyState } from './chat-empty-state';
import { fetchMessages } from '@/lib/sessions';
import { fetchUsageCurrent } from '@/lib/settings';
import { fetchWorkspaceTree } from '@/lib/workspace';
import { uploadAttachments } from '@/lib/attachments';
import { readCsrfCookie, CSRF_HEADER } from '@/lib/csrf';
import { useMemoryStatus } from '@/stores/memory-status';

interface ToolMeta {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: 'approved' | 'denied' | 'auto' | 'blocked';
  result?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    content?: string;
    error?: string;
    ok?: boolean;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolMetas?: ToolMeta[];
}

interface PendingApproval {
  kind: 'local' | 'mcp';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  messageHistory: Array<{ role: string; content: string }>;
}

interface ChatStreamProps {
  sessionId: string | null;
  onSessionCreated?: (id: string) => void;
}

let msgCounter = 0;
function localId() {
  return `local-${++msgCounter}-${Date.now()}`;
}

interface SSEFrame {
  event: string;
  data: string;
}

function parseSSEBuffer(buffer: string): { frames: SSEFrame[]; rest: string } {
  const frames: SSEFrame[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const block of parts) {
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data += (data ? '\n' : '') + line.slice(6);
    }
    if (data) frames.push({ event, data });
  }
  return { frames, rest };
}

function toolMetaState(meta: ToolMeta): ToolCallState {
  if (meta.status === 'denied' || meta.status === 'blocked') return 'denied';
  if (meta.result?.error) return 'error';
  return 'success';
}

function toolOutputText(meta: ToolMeta): string | undefined {
  if (!meta.result) return undefined;
  if (meta.result.error) return meta.result.error;
  if (meta.result.content) return meta.result.content;
  if (meta.result.stdout || meta.result.stderr) {
    return [meta.result.stdout, meta.result.stderr].filter(Boolean).join('\n');
  }
  return undefined;
}

export function ChatStream({ sessionId, onSessionCreated }: ChatStreamProps) {
  const [model] = useState('gpt-5.4-mini');
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [references, setReferences] = useState<Array<{ path: string; content: string }>>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [budgetExceeded, setBudgetExceeded] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(sessionId);
  sessionIdRef.current = sessionId;
  const alert80ShownRef = useRef(false);
  const createdSessionRef = useRef<string | null>(null);

  const { data: wsTree } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
    refetchInterval: 30_000,
  });

  const handleReferenceSelect = useCallback(async (filePath: string) => {
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const content = await res.text();
        setReferences((prev) => [...prev, { path: filePath, content }]);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    alert80ShownRef.current = false;
    if (!sessionId) {
      setMessages([]);
      return;
    }
    if (createdSessionRef.current === sessionId) {
      createdSessionRef.current = null;
      return;
    }
    fetchMessages(sessionId).then((res) => {
      const loaded: ChatMessage[] = res.messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: (() => {
          try {
            const parsed = JSON.parse(m.contentJson);
            return typeof parsed === 'string' ? parsed : (parsed.text ?? '');
          } catch {
            return m.contentJson;
          }
        })(),
        toolMetas: m.toolMeta ? (JSON.parse(m.toolMeta) as ToolMeta[]) : undefined,
      }));
      setMessages(loaded);
    });
  }, [sessionId]);

  useEffect(() => {
    if (!budgetExceeded) return;
    function onFocus() {
      fetchUsageCurrent().then((u) => {
        if (u.percent < 100) setBudgetExceeded(false);
      }).catch(() => {});
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [budgetExceeded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userText = input;
    setInput('');

    const userMsg: ChatMessage = { id: localId(), role: 'user', content: userText };
    setMessages((prev) => [...prev, userMsg]);

    const allMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    setIsLoading(true);
    const assistantId = localId();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    let uploadedAttachments: AttachmentResponse[] = [];
    if (pendingAttachments.length > 0) {
      try {
        uploadedAttachments = await uploadAttachments(pendingAttachments.map((a) => a.file));
      } catch (err) {
        console.error('[chat] attachment upload failed:', err);
      }
      setPendingAttachments([]);
    }

    const currentReferences = references.length > 0 ? [...references] : [];
    setReferences([]);

    // Reset memory degraded badge at stream start — it will be re-set by
    // the SSE `memory_status` event if memory is still degraded.
    useMemoryStatus.getState().setDegraded(false);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [CSRF_HEADER]: readCsrfCookie(),
        },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          model,
          messages: allMessages,
          ...(uploadedAttachments.length > 0
            ? { attachmentIds: uploadedAttachments.map((a) => a.id) }
            : {}),
          ...(currentReferences.length > 0 ? { references: currentReferences } : {}),
        }),
      });

      const newSessionId = res.headers.get('x-session-id');
      if (newSessionId && onSessionCreated) {
        createdSessionRef.current = newSessionId;
        sessionIdRef.current = newSessionId;
        onSessionCreated(newSessionId);
      }

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({ error: {} }))) as {
          error: { code?: string; message?: string; link?: string };
        };
        if (res.status === 429 && errBody.error.code === 'budget_exceeded') {
          setBudgetExceeded(true);
          toast.error('Budget mensuel depasse');
          setMessages((prev) => prev.slice(0, -2));
          return;
        }
        if (res.status === 502 && errBody.error.code === 'provider_rate_limit') {
          toast.error('Limite OpenAI atteinte', {
            action: errBody.error.link
              ? { label: 'Voir', onClick: () => window.open(errBody.error.link, '_blank') }
              : undefined,
          });
          setMessages((prev) => prev.slice(0, -1));
          return;
        }
        throw new Error(`API error ${res.status}: ${errBody.error.message ?? ''}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = parseSSEBuffer(buffer);
        buffer = rest;

        for (const { event, data } of frames) {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }
          if (event === 'content' && typeof parsed.text === 'string') {
            accumulated += parsed.text;
            const current = accumulated;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: current } : m)),
            );
          } else if (event === 'memory_status') {
            useMemoryStatus.getState().setDegraded(Boolean(parsed.degraded));
          } else if (event === 'tool_approval') {
            setPendingApproval({
              kind: 'local',
              toolCallId: String(parsed.toolCallId ?? `call_${Date.now()}`),
              toolName: String(parsed.toolName ?? ''),
              args: (parsed.args as Record<string, unknown>) ?? {},
              messageHistory: allMessages,
            });
          } else if (event === 'mcp_approval') {
            setPendingApproval({
              kind: 'mcp',
              toolCallId: String(parsed.approvalRequestId ?? `mcp_${Date.now()}`),
              toolName: `${String(parsed.serverLabel ?? 'mcp')}:${String(parsed.toolName ?? '')}`,
              args: (() => {
                try {
                  return typeof parsed.arguments === 'string'
                    ? (JSON.parse(parsed.arguments) as Record<string, unknown>)
                    : ((parsed.arguments as Record<string, unknown>) ?? {});
                } catch {
                  return { raw: String(parsed.arguments ?? '') };
                }
              })(),
              messageHistory: allMessages,
            });
          } else if (event === 'error') {
            const err = parsed as { code?: string; message?: string; link?: string };
            if (err.code === 'provider_rate_limit') {
              toast.error('Limite OpenAI atteinte', {
                action: err.link
                  ? { label: 'Voir', onClick: () => window.open(err.link!, '_blank') }
                  : undefined,
              });
            } else if (err.message) {
              toast.error(err.message);
            }
          }
        }
      }

      try {
        const usageData = await fetchUsageCurrent();
        if (usageData.percent >= 80 && usageData.percent < 100) {
          const alert80 = usageData.alerts.find((a) => a.percent === 80);
          if (alert80?.triggeredAt && !alert80ShownRef.current) {
            alert80ShownRef.current = true;
            toast.warning(
              `80% du budget mensuel consomme ($${usageData.totalUsd.toFixed(2)} / $${usageData.limitUsd.toFixed(2)})`,
            );
          }
        }
        if (budgetExceeded && usageData.percent < 100) setBudgetExceeded(false);
      } catch {
        // ignore
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.id === assistantId && !last.content) return prev.slice(0, -1);
        return prev;
      });
      console.error('[chat] streaming error:', err);
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [input, isLoading, messages, model, onSessionCreated, budgetExceeded, pendingAttachments, references]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleApproval = useCallback(
    async (approved: boolean) => {
      if (!pendingApproval) return;
      const { kind, toolName, args, messageHistory, toolCallId } = pendingApproval;
      setPendingApproval(null);
      setIsLoading(true);

      const assistantId = localId();
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [CSRF_HEADER]: readCsrfCookie(),
          },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            model,
            messages: messageHistory,
            ...(kind === 'mcp'
              ? { mcpApproval: { approvalRequestId: toolCallId, approved } }
              : { toolApproval: { toolCallId, toolName, args, approved } }),
          }),
        });

        if (!res.ok) throw new Error(`API error ${res.status}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = parseSSEBuffer(buffer);
          buffer = rest;

          for (const { event, data } of frames) {
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            if (event === 'content' && typeof parsed.text === 'string') {
              accumulated += parsed.text;
              const current = accumulated;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: current } : m)),
              );
            } else if (event === 'memory_status') {
              useMemoryStatus.getState().setDegraded(Boolean(parsed.degraded));
            } else if (event === 'tool_approval') {
              setPendingApproval({
                kind: 'local',
                toolCallId: String(parsed.toolCallId ?? `call_${Date.now()}`),
                toolName: String(parsed.toolName ?? ''),
                args: (parsed.args as Record<string, unknown>) ?? {},
                messageHistory,
              });
            } else if (event === 'mcp_approval') {
              setPendingApproval({
                kind: 'mcp',
                toolCallId: String(parsed.approvalRequestId ?? `mcp_${Date.now()}`),
                toolName: `${String(parsed.serverLabel ?? 'mcp')}:${String(parsed.toolName ?? '')}`,
                args: (() => {
                  try {
                    return typeof parsed.arguments === 'string'
                      ? (JSON.parse(parsed.arguments) as Record<string, unknown>)
                      : ((parsed.arguments as Record<string, unknown>) ?? {});
                  } catch {
                    return { raw: String(parsed.arguments ?? '') };
                  }
                })(),
                messageHistory,
              });
            } else if (event === 'error' && parsed.message) {
              toast.error(String(parsed.message));
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[chat] approval resume error:', err);
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [pendingApproval, model],
  );

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]!.role === 'assistant') return i;
    }
    return -1;
  })();

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full">
            <ChatEmptyState />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
            {messages.map((m, idx) => {
              if (m.role === 'user') return <MessageUser key={m.id} content={m.content} />;
              const isLastAssistant = idx === lastAssistantIdx;
              const showPending = isLastAssistant && pendingApproval != null;
              const metas = m.toolMetas ?? [];
              const toolCallNodes: React.ReactNode[] = metas.map((meta) => (
                <ToolCallItem
                  key={meta.toolCallId}
                  name={meta.toolName}
                  args={Object.keys(meta.args).length > 0 ? JSON.stringify(meta.args) : undefined}
                  output={toolOutputText(meta)}
                  state={toolMetaState(meta)}
                />
              ));
              if (showPending) {
                toolCallNodes.push(
                  <ToolCallItem
                    key={pendingApproval!.toolCallId}
                    name={pendingApproval!.toolName}
                    args={JSON.stringify(pendingApproval!.args, null, 2)}
                    state="pending-approval"
                    onApprove={() => handleApproval(true)}
                    onDeny={() => handleApproval(false)}
                  />,
                );
              }
              const toolCalls = toolCallNodes.length > 0 ? (
                <ToolCallsCollapsible
                  count={toolCallNodes.length}
                  hasPendingApproval={showPending}
                  defaultOpen={showPending}
                >
                  {toolCallNodes}
                </ToolCallsCollapsible>
              ) : null;
              return (
                <MessageAssistant key={m.id} toolCalls={toolCalls}>
                  <MarkdownRenderer content={m.content || (isLoading && isLastAssistant ? '...' : '')} />
                </MessageAssistant>
              );
            })}
          </div>
        )}
      </div>
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onStop={handleStop}
        isLoading={isLoading}
        disabled={budgetExceeded}
        pendingAttachments={pendingAttachments}
        onAttachmentsChange={setPendingAttachments}
        workspaceEntries={wsTree?.tree}
        onReferenceSelect={handleReferenceSelect}
      />
    </>
  );
}
