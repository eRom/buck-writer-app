import { Search, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function SidebarLeftHeader({ collapsed, onToggle, query, onQueryChange }: Props) {
  if (collapsed) {
    return (
      <div className="flex h-10 items-center justify-center">
        <button
          onClick={onToggle}
          aria-label="Deployer la sidebar"
          className="hover-elevate rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/40" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher..."
          className="h-8 pl-7 text-[13px]"
        />
      </div>
      <button
        onClick={onToggle}
        aria-label="Replier la sidebar"
        className="hover-elevate rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
      >
        <PanelLeftClose className="size-4" />
      </button>
    </div>
  );
}
