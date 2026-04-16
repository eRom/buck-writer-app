import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport, type UIMessage } from 'ai';
import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { fetchMessages } from '@/lib/sessions';
import { readCsrfCookie, CSRF_HEADER } from '@/lib/csrf';

interface ChatAreaProps {
  sessionId?: string;
  onSessionCreated?: (id: string) => void;
}

export function ChatArea({ sessionId, onSessionCreated }: ChatAreaProps) {
  const [model, setModel] = useState('gpt-5.4-mini');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const onSessionCreatedRef = useRef(onSessionCreated);
  onSessionCreatedRef.current = onSessionCreated;

  const { messages, sendMessage, stop, setMessages, status } = useChat({
    transport: new TextStreamChatTransport({
      api: '/api/chat',
      body: { sessionId, model },
      headers: {
        [CSRF_HEADER]: readCsrfCookie(),
      },
      fetch: async (url, init) => {
        const response = await fetch(url, init);
        const newSessionId = response.headers.get('x-session-id');
        if (newSessionId && onSessionCreatedRef.current) {
          onSessionCreatedRef.current(newSessionId);
        }
        return response;
      },
    }),
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Load existing messages when switching sessions
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    fetchMessages(sessionId).then((res) => {
      const loaded: UIMessage[] = res.messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        parts: [
          {
            type: 'text' as const,
            text: (() => {
              try {
                const parsed = JSON.parse(m.contentJson);
                return typeof parsed === 'string' ? parsed : (parsed.text ?? '');
              } catch {
                return m.contentJson;
              }
            })(),
          },
        ],
      }));
      setMessages(loaded);
    });
  }, [sessionId, setMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const handleSubmit = useCallback(() => {
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  }, [input, sendMessage]);

  function getTextFromMessage(m: UIMessage): string {
    return m.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join('');
  }

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
              role={m.role as 'user' | 'assistant'}
              content={getTextFromMessage(m)}
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
        onStop={stop}
        isLoading={isLoading}
        model={model}
        onModelChange={setModel}
      />
    </>
  );
}
