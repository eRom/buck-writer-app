import type { ReactNode } from 'react';
import { TopBar } from './topbar';
import { SidebarLeft } from './sidebar-left';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <SidebarLeft />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
