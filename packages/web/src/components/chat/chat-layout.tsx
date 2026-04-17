import { useState } from 'react';

interface ChatLayoutProps {
  sidebar: React.ReactNode;
  rightPanel?: React.ReactNode;
  children: React.ReactNode;
}

export function ChatLayout({ sidebar, rightPanel, children }: ChatLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {sidebarOpen && (
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
          {sidebar}
        </aside>
      )}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-2 top-2 z-10 rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
        aria-label={sidebarOpen ? 'Fermer la sidebar' : 'Ouvrir la sidebar'}
      >
        {sidebarOpen ? '\u2190' : '\u2192'}
      </button>
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
      {rightPanel && (
        <>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground"
            aria-label={rightPanelOpen ? 'Fermer le workspace' : 'Ouvrir le workspace'}
          >
            {rightPanelOpen ? '\u2192' : '\u2190'}
          </button>
          {rightPanelOpen && (
            <aside className="flex w-60 shrink-0 flex-col border-l border-border bg-sidebar">
              {rightPanel}
            </aside>
          )}
        </>
      )}
    </div>
  );
}
