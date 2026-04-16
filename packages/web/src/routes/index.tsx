import { createFileRoute } from '@tanstack/react-router';
import { fetchMe, type MeResponse } from '@/lib/session';
import { ChatLayout } from '@/components/chat/chat-layout';
import { Sidebar } from '@/components/chat/sidebar';
import { useState } from 'react';

export const Route = createFileRoute('/')({
  loader: async (): Promise<MeResponse> => {
    const me = await fetchMe();
    if (!me) throw new Error('unauthenticated');
    return me;
  },
  component: Home,
});

function Home() {
  const [activeSessionId, setActiveSessionId] = useState<string>();

  return (
    <ChatLayout
      sidebar={
        <Sidebar
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={setActiveSessionId}
        />
      }
    >
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        {activeSessionId
          ? `Session ${activeSessionId} (chat a venir)`
          : 'Selectionne ou cree une conversation pour commencer.'}
      </div>
    </ChatLayout>
  );
}
