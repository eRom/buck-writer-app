import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AttachmentResponse } from '@buck/shared';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import type { PendingAttachment } from './attachment-preview';
import { ApprovalBlock } from './approval-block';
import { BudgetBanner } from './budget-banner';
import { BibleStatusBanner } from '@/components/bible-status-banner';
import { fetchMessages } from '@/lib/sessions';
import { fetchUsageCurrent } from '@/lib/settings';
import { fetchWorkspaceTree } from '@/lib/workspace';
import { uploadAttachments } from '@/lib/attachments';
import { readCsrfCookie, CSRF_HEADER } from '@/lib/csrf';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolMetas?: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    status: 'approved' | 'denied' | 'auto' | 'blocked';
    result?: Record<string, unknown>;
  }>;
}

interface PendingApproval {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  messageHistory: Array<{ role: string; content: string }>;
}

interface ChatAreaProps {
  sessionId?: string;
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

/**
 * Parse a buffer of SSE bytes into complete (event, data) frames.
 * Returns the parsed frames plus the remaining (incomplete) buffer.
 */
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

export function ChatArea({ sessionId, onSessionCreated }: ChatAreaProps) {
  const [model, setModel] = useState('gpt-5.4-mini');
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [references, setReferences] = useState<Array<{ path: string; content: string }>>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [budgetExceeded, setBudgetExceeded] = useState<{
    totalUsd: number;
    limitUsd: number;
    resetDate: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const alert80ShownRef = useRef(false);
  // Track sessions created in this component to skip reload
  const createdSessionRef = useRef<string | null>(null);

  // Workspace tree for @reference autocomplete
  const { data: wsTree } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
    refetchInterval: 30_000,
  });

  // Handle @reference selection — fetch file content
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
      // Ignore fetch errors
    }
  }, []);

  // Load existing messages when switching sessions
  useEffect(() => {
    alert80ShownRef.current = false;
    if (!sessionId) {
      setMessages([]);
      return;
    }
    // Skip fetch if we just created this session (messages are already in local state)
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
        toolMetas: m.toolMeta ? JSON.parse(m.toolMeta) : undefined,
      }));
      setMessages(loaded);
    });
  }, [sessionId]);

  // Clear budget banner when window regains focus (e.g. user updated limit in settings)
  useEffect(() => {
    if (!budgetExceeded) return;
    function onFocus() {
      fetchUsageCurrent().then((u) => {
        if (u.percent < 100) setBudgetExceeded(null);
      }).catch(() => {});
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [budgetExceeded]);

  // Auto-scroll on new messages
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

    // Add user message locally
    const userMsg: ChatMessage = { id: localId(), role: 'user', content: userText };
    setMessages((prev) => [...prev, userMsg]);

    // Build messages array for API (all history + new message)
    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setIsLoading(true);
    const assistantId = localId();
    // Add empty assistant message for streaming
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    // Upload pending attachments
    let uploadedAttachments: AttachmentResponse[] = [];
    if (pendingAttachments.length > 0) {
      try {
        uploadedAttachments = await uploadAttachments(pendingAttachments.map((a) => a.file));
      } catch (err) {
        console.error('[chat] attachment upload failed:', err);
      }
      setPendingAttachments([]);
    }

    // Snapshot and clear references
    const currentReferences = references.length > 0 ? [...references] : [];
    setReferences([]);

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

      // Check for new session
      const newSessionId = res.headers.get('x-session-id');
      if (newSessionId && onSessionCreated) {
        createdSessionRef.current = newSessionId;
        sessionIdRef.current = newSessionId;
        onSessionCreated(newSessionId);
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: {} })) as {
          error: { code?: string; message?: string; usage?: { totalUsd: number; limitUsd: number; resetDate: string }; link?: string };
        };

        if (res.status === 429 && errBody.error.code === 'budget_exceeded' && errBody.error.usage) {
          setBudgetExceeded(errBody.error.usage);
          // Remove the empty assistant message and the user message we just added
          setMessages((prev) => prev.slice(0, -2));
          return;
        }

        if (res.status === 502 && errBody.error.code === 'provider_rate_limit') {
          toast.error('Limite OpenAI atteinte', {
            action: errBody.error.link
              ? { label: 'Voir les limites', onClick: () => window.open(errBody.error.link, '_blank') }
              : undefined,
          });
          // Remove empty assistant message
          setMessages((prev) => prev.slice(0, -1));
          return;
        }

        throw new Error(`API error ${res.status}: ${errBody.error.message ?? ''}`);
      }

      // Read the SSE stream (structured events)
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
          } else if (event === 'tool_approval') {
            setPendingApproval({
              toolCallId: String(parsed.toolCallId ?? `call_${Date.now()}`),
              toolName: String(parsed.toolName ?? ''),
              args: (parsed.args as Record<string, unknown>) ?? {},
              messageHistory: allMessages,
            });
          } else if (event === 'error') {
            const err = parsed as { code?: string; message?: string; link?: string };
            if (err.code === 'provider_rate_limit') {
              toast.error('Limite OpenAI atteinte', {
                action: err.link
                  ? { label: 'Voir les limites', onClick: () => window.open(err.link!, '_blank') }
                  : undefined,
              });
            } else if (err.message) {
              toast.error(err.message);
            }
          }
          // 'tool_result' and 'done' — no UI side-effect for now
        }
      }

      // Check usage after message completes
      try {
        const usageData = await fetchUsageCurrent();
        if (usageData.percent >= 80 && usageData.percent < 100) {
          const alert80 = usageData.alerts.find((a) => a.percent === 80);
          if (alert80?.triggeredAt && !alert80ShownRef.current) {
            alert80ShownRef.current = true;
            toast.warning(`80% du budget mensuel consommé ($${usageData.totalUsd.toFixed(2)} / $${usageData.limitUsd.toFixed(2)})`);
          }
        }
        if (budgetExceeded && usageData.percent < 100) {
          setBudgetExceeded(null);
        }
      } catch {
        // Usage fetch failure is non-critical
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // Remove empty assistant message on error
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.id === assistantId && !last.content) {
          return prev.slice(0, -1);
        }
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

  const handleApproval = useCallback(async (approved: boolean) => {
    if (!pendingApproval) return;
    const { toolName, args, messageHistory } = pendingApproval;
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
          toolApproval: {
            toolCallId: pendingApproval.toolCallId,
            toolName,
            args,
            approved,
          },
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
          } else if (event === 'tool_approval') {
            setPendingApproval({
              toolCallId: String(parsed.toolCallId ?? `call_${Date.now()}`),
              toolName: String(parsed.toolName ?? ''),
              args: (parsed.args as Record<string, unknown>) ?? {},
              messageHistory: messageHistory,
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
  }, [pendingApproval, model]);

  return (
    <>
      <BibleStatusBanner />
      {budgetExceeded && (
        <BudgetBanner
          totalUsd={budgetExceeded.totalUsd}
          limitUsd={budgetExceeded.limitUsd}
          resetDate={budgetExceeded.resetDate}
        />
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground">
              Commence la conversation...
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              content={m.content}
              toolMetas={m.toolMetas}
            />
          ))}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">
                ...
              </div>
            </div>
          )}
        </div>
      </div>

      {pendingApproval && (
        <div className="mx-auto max-w-3xl px-4 pb-2">
          <ApprovalBlock
            toolName={pendingApproval.toolName}
            args={pendingApproval.args}
            onApprove={() => handleApproval(true)}
            onDeny={() => handleApproval(false)}
            status="pending"
          />
        </div>
      )}

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onStop={handleStop}
        isLoading={isLoading}
        model={model}
        onModelChange={setModel}
        disabled={!!budgetExceeded}
        pendingAttachments={pendingAttachments}
        onAttachmentsChange={setPendingAttachments}
        workspaceEntries={wsTree?.tree}
        onReferenceSelect={handleReferenceSelect}
      />
    </>
  );
}
