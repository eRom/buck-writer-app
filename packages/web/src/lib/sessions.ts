import { apiFetch } from './api';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface Session {
  id: string;
  title: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  isFavorite: number;
  archived: number;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number | null;
}

export interface SessionsResponse {
  sessions: Session[];
  nextCursor?: string;
}

export async function fetchSessions(q?: string): Promise<SessionsResponse> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  return apiFetch<SessionsResponse>(`/api/sessions?${params}`);
}

export async function createSession(title?: string): Promise<Session> {
  return apiFetch<Session>('/api/sessions', {
    method: 'POST',
    body: { title },
  });
}

export async function updateSession(
  id: string,
  data: {
    title?: string;
    archived?: boolean;
    isFavorite?: boolean;
    model?: string;
    reasoningEffort?: ReasoningEffort;
  },
): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${id}`, {
    method: 'PATCH',
    body: data,
  });
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<Session> {
  return updateSession(id, { isFavorite });
}

export async function deleteSession(id: string): Promise<void> {
  await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
}

export interface MessageAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface Message {
  id: string;
  role: string;
  contentJson: string;
  model: string | null;
  toolMeta: string | null;
  imagesJson: string | null;
  createdAt: number;
  attachments?: MessageAttachment[];
}

export interface MessagesResponse {
  messages: Message[];
  nextCursor?: string;
}

export async function fetchMessages(sessionId: string): Promise<MessagesResponse> {
  return apiFetch<MessagesResponse>(`/api/sessions/${sessionId}/messages`);
}
