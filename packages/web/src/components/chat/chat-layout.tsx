import { useState } from 'react';

interface ChatLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function ChatLayout({ sidebar, children }: ChatLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
    </div>
  );
}
