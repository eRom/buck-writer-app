import {
  PanelRightClose,
  PanelRight as PanelRightIcon,
  Folder,
  ListChecks,
} from 'lucide-react';
import { CardWorkspace } from '@/components/panel-right/card-workspace';
import { CardTodos } from '@/components/panel-right/card-todos';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

const COLLAPSED_ICONS = [
  { key: 'todos', icon: ListChecks, label: 'Todos' },
  { key: 'workspace', icon: Folder, label: 'Workspace' },
];

export function PanelRight({ collapsed, onToggle }: Props) {
  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center py-2">
        <button
          onClick={onToggle}
          aria-label="Deployer le panneau"
          className="hover-elevate mb-3 rounded-md p-1.5 text-sidebar-foreground/70"
        >
          <PanelRightIcon className="size-4" />
        </button>
        {COLLAPSED_ICONS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={onToggle}
            aria-label={label}
            className="hover-elevate my-0.5 rounded-md p-1.5 text-sidebar-foreground/70"
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end p-2">
        <button
          onClick={onToggle}
          aria-label="Replier le panneau"
          className="hover-elevate rounded-md p-1.5 text-sidebar-foreground/70"
        >
          <PanelRightClose className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        <CardTodos />
        <CardWorkspace />
      </div>
    </div>
  );
}
