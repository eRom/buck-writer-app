import { Search, PanelLeftClose, PanelLeft, SquarePen } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Input } from '@/components/ui/input';
import { createSession } from '@/lib/sessions';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function SidebarLeftHeader({ collapsed, onToggle, query, onQueryChange }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const newSession = useMutation({
    mutationFn: () => createSession(),
    onSuccess: async (session) => {
      await qc.invalidateQueries({ queryKey: ['sessions'] });
      navigate({ to: '/', search: { session: session.id } });
    },
  });

  if (collapsed) {
    return (
      <div className="flex h-10 items-center justify-center gap-1">
        <button
          onClick={() => newSession.mutate()}
          disabled={newSession.isPending}
          aria-label="Nouvelle session"
          className="hover-elevate rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-50"
        >
          <SquarePen className="size-4" />
        </button>
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
        onClick={() => newSession.mutate()}
        disabled={newSession.isPending}
        aria-label="Nouvelle session"
        title="Nouvelle session"
        className="hover-elevate rounded-md p-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground disabled:opacity-50"
      >
        <SquarePen className="size-4" />
      </button>
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
