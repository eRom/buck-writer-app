import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { fetchMessages } from '@/lib/sessions';
import { readCsrfCookie, CSRF_HEADER } from '@/lib/csrf';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatAreaProps {
  sessionId?: string;
  onSessionCreated?: (id: string) => void;
}

let msgCounter = 0;
function localId() {
  return `local-${++msgCounter}-${Date.now()}`;
}

export function ChatArea({ sessionId, onSessionCreated }: ChatAreaProps) {
  const [model, setModel] = useState('gpt-5.4-mini');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Load existing messages when switching sessions
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
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
      }));
      setMessages(loaded);
    });
  }, [sessionId]);

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
        }),
      });

      // Check for new session
      const newSessionId = res.headers.get('x-session-id');
      if (newSessionId && onSessionCreated) {
        onSessionCreated(newSessionId);
      }

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`API error ${res.status}: ${err}`);
      }

      // Read the text stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const current = accumulated;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: current } : m)),
        );
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
  }, [input, isLoading, messages, model, onSessionCreated]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <>
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

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onStop={handleStop}
        isLoading={isLoading}
        model={model}
        onModelChange={setModel}
      />
    </>
  );
}
