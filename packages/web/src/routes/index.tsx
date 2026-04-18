import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { fetchMe, type MeResponse } from '@/lib/session';
import { ChatShell } from '@/components/layout/chat-shell';
import { SidebarLeft } from '@/components/layout/sidebar-left';
import { PanelRight } from '@/components/layout/panel-right';
import { ChatStream } from '@/components/chat/chat-stream';

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
        <PanelRight collapsed={collapsed} onToggle={onToggle} sessionId={sessionId} />
      )}
    />
  );
}
