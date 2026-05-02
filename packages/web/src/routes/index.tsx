import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { fetchMe, type MeResponse } from '@/lib/session';
import { fetchSettings } from '@/lib/settings';
import { ChatShell } from '@/components/layout/chat-shell';
import { SidebarLeft } from '@/components/layout/sidebar-left';
import { PanelRight } from '@/components/layout/panel-right';
import { ChatStream } from '@/components/chat/chat-stream';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useRealtimeVoice } from '@/hooks/use-realtime-voice';
import { useRealtimeHotkey } from '@/hooks/use-realtime-hotkey';

const search = z.object({
  session: z.string().optional(),
});

export const Route = createFileRoute('/')({
  validateSearch: search,
  loader: async (): Promise<MeResponse> => {
    const me = await fetchMe();
    if (!me) throw redirect({ to: '/login' });
    return me;
  },
  component: Home,
});

function Home() {
  const me = Route.useLoaderData();
  const { session } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [localSessionId, setLocalSessionId] = useState<string | null>(session ?? null);
  const sessionId = session ?? localSessionId;

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });

  const startOpts = {
    voice: settings?.realtimeDefaultVoice ?? 'coral',
    turnDetection: settings?.realtimeTurnDetection ?? {
      mode: 'server_vad' as const,
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
      interrupt_response: true,
    },
    tools: settings?.realtimeTools ?? { bible: true, webSearch: true },
  };

  // Stop Live automatiquement si on change de session
  const { stop } = useRealtimeVoice(sessionId ?? null);
  useEffect(() => {
    const s = useRealtimeStore.getState();
    if (s.state !== 'idle' && s.chatSessionId && s.chatSessionId !== sessionId) {
      void stop();
    }
  }, [sessionId, stop]);

  // Hotkey global Cmd+Shift+L
  useRealtimeHotkey({
    chatSessionId: sessionId ?? null,
    startOpts,
    silenceTimeoutSec: settings?.realtimeSilenceTimeoutSec ?? 30,
  });

  return (
    <ChatShell
      sidebarLeft={({ collapsed, onToggle }) => (
        <SidebarLeft collapsed={collapsed} onToggle={onToggle} email={me.email} />
      )}
      main={
        <ChatStream
          sessionId={sessionId}
          onSessionCreated={(id) => {
            setLocalSessionId(id);
            navigate({ search: { session: id }, replace: true });
          }}
        />
      }
      panelRight={({ collapsed, onToggle }) => (
        <PanelRight collapsed={collapsed} onToggle={onToggle} />
      )}
    />
  );
}
