import { type ReactNode } from 'react';
import { usePanelsState } from '@/lib/use-panels-state';

interface Props {
  sidebarLeft: (args: { collapsed: boolean; onToggle: () => void }) => ReactNode;
  main: ReactNode;
  panelRight: (args: { collapsed: boolean; onToggle: () => void }) => ReactNode;
}

export function ChatShell({ sidebarLeft, main, panelRight }: Props) {
  const { leftCollapsed, setLeftCollapsed, rightCollapsed, setRightCollapsed } = usePanelsState();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside
        className="shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out"
        style={{ width: leftCollapsed ? 52 : 300 }}
      >
        {sidebarLeft({ collapsed: leftCollapsed, onToggle: () => setLeftCollapsed((v) => !v) })}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{main}</main>
      <aside
        className="shrink-0 border-l border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out"
        style={{ width: rightCollapsed ? 40 : 300 }}
      >
        {panelRight({ collapsed: rightCollapsed, onToggle: () => setRightCollapsed((v) => !v) })}
      </aside>
    </div>
  );
}
