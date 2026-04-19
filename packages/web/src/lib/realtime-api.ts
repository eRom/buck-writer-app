import { apiFetch } from './api';

export interface CreateSessionInput {
  sessionId: string;
  voice: string;
  turnDetection: {
    mode: 'server_vad' | 'semantic_vad';
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
    interrupt_response: boolean;
  };
  tools: { bible: boolean; writingTools: boolean; webSearch: boolean };
}

export interface CreateSessionResult {
  clientSecret: string;
  expiresAt: number;
  realtimeModel: string;
  sessionConfig: unknown;
}

export interface UsagePayload {
  audioInputTokens: number;
  audioOutputTokens: number;
  textInputTokens: number;
  textOutputTokens: number;
  cachedInputTokens: number;
  audioInputSeconds: number;
  audioOutputSeconds: number;
}

export interface TranscriptItem {
  role: 'user' | 'assistant';
  text: string;
  startedAt: number;
  endedAt: number;
}

export const realtimeApi = {
  createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    return apiFetch<CreateSessionResult>('/api/realtime/session', {
      method: 'POST',
      body: input,
    });
  },
  postUsage(
    sessionId: string,
    realtimeSessionId: string,
    usage: UsagePayload,
  ): Promise<{ costUsd: number; budgetRemaining: number }> {
    return apiFetch('/api/realtime/usage', {
      method: 'POST',
      body: { sessionId, realtimeSessionId, ...usage },
    });
  },
  postTranscript(
    sessionId: string,
    items: TranscriptItem[],
  ): Promise<{ inserted: number }> {
    return apiFetch('/api/realtime/transcript', {
      method: 'POST',
      body: { sessionId, items },
    });
  },
  closeSession(
    realtimeSessionId: string,
    sessionId: string,
  ): Promise<{ closed: boolean; costUsd: number }> {
    const qs = new URLSearchParams({ sessionId }).toString();
    return apiFetch(`/api/realtime/session/${realtimeSessionId}?${qs}`, {
      method: 'DELETE',
    });
  },
  writeToChat(sessionId: string, content: string): Promise<{ id: string; createdAt: number }> {
    return apiFetch('/api/realtime/write-to-chat', {
      method: 'POST',
      body: { sessionId, content },
    });
  },
};
