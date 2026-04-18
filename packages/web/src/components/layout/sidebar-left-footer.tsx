import { Link } from '@tanstack/react-router';
import { Settings, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MemoryBadge } from '@/components/memory-badge';

interface Props {
  collapsed: boolean;
  email: string;
  onLogout: () => void;
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

export function SidebarLeftFooter({ collapsed, email, onLogout }: Props) {
  if (collapsed) {
    return (
      <div className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="hover-elevate flex h-8 w-full items-center justify-center rounded-md bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground"
              aria-label="Menu utilisateur"
            >
              {initials(email)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end">
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 size-4" /> Parametres
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLogout}>
              <LogOut className="mr-2 size-4" /> Deconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
  return (
    <div className="border-t border-sidebar-border p-2">
      <div className="px-2 pb-1">
        <MemoryBadge />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="hover-elevate flex w-full items-center gap-2 rounded-md p-2 text-left">
            <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
              {initials(email)}
            </span>
            <span className="truncate text-[13px] text-sidebar-foreground">{email}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings className="mr-2 size-4" /> Parametres
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLogout}>
            <LogOut className="mr-2 size-4" /> Deconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
