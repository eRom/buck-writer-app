import type { ReactNode } from 'react';

export function RightPanel({ children }: { children?: ReactNode }) {
  return (
    <aside className="flex h-full w-[300px] flex-col border-l border-border bg-card overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {children ?? (
          <p className="text-xs text-muted-foreground">Sélectionner une entité…</p>
        )}
      </div>
    </aside>
  );
}
