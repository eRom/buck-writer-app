import { Link } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Users,
  Map,
  Calendar,
  FileText,
  Search,
  BookMarked,
  Network,
  Activity,
  FolderTree,
  Database,
  Archive,
} from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/characters', label: 'Personnages', icon: Users },
  { to: '/locations', label: 'Lieux', icon: Map },
  { to: '/events', label: 'Événements', icon: Calendar },
  { to: '/notes', label: 'Notes', icon: FileText },
  { to: '/research', label: 'Recherches', icon: Search },
  { to: '/world-rules', label: 'Règles', icon: BookMarked },
  { to: '/interactions', label: 'Interactions', icon: Network },
  { to: '/timeline', label: 'Timeline', icon: Activity },
  { to: '/graph', label: 'Graph', icon: FolderTree },
  { to: '/search', label: 'Recherche', icon: Search },
  { to: '/import-export', label: 'Import/Export', icon: Database },
  { to: '/backups', label: 'Backups', icon: Archive },
] as const;

export function SidebarLeft() {
  return (
    <aside className="flex h-full w-[300px] flex-col border-r border-sidebar-border bg-sidebar select-none overflow-hidden">
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <nav className="space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              // @ts-expect-error — routes créées dans les tasks suivantes
              to={to}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium leading-tight text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50"
              activeProps={{
                className: 'bg-sidebar-accent text-sidebar-accent-foreground',
              }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
