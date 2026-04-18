import { Link } from '@tanstack/react-router';
import { MessageSquare, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Session } from '@/lib/sessions';

interface Props {
  session: Session;
  active: boolean;
  onToggleFavorite: (id: string, next: boolean) => void;
  collapsed: boolean;
}

export function SessionItem({ session, active, onToggleFavorite, collapsed }: Props) {
  if (collapsed) {
    return (
      <Link
        to="/"
        search={{ session: session.id }}
        aria-label={session.title}
        className={cn(
          'hover-elevate mx-auto my-0.5 flex size-8 items-center justify-center rounded-md',
          active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70',
        )}
      >
        <MessageSquare className="size-4" />
      </Link>
    );
  }
  const isFav = Boolean(session.isFavorite);
  return (
    <Link
      to="/"
      search={{ session: session.id }}
      className={cn(
        'hover-elevate group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80',
      )}
    >
      <MessageSquare className="size-3.5 shrink-0 text-sidebar-foreground/40" />
      <span className="flex-1 truncate">{session.title}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(session.id, !isFav);
        }}
        aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        className={cn(
          'shrink-0 transition-opacity',
          isFav ? 'text-primary opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100',
        )}
      >
        <Star className={cn('size-3.5', isFav && 'fill-primary')} />
      </button>
    </Link>
  );
}
