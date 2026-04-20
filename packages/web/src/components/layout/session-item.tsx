import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { deleteSession, updateSession, type Session } from '@/lib/sessions';

interface Props {
  session: Session;
  active: boolean;
  onToggleFavorite: (id: string, next: boolean) => void;
  collapsed: boolean;
}

export function SessionItem({ session, active, onToggleFavorite, collapsed }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const renameMut = useMutation({
    mutationFn: (next: string) => updateSession(session.id, { title: next }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSession(session.id),
    onSuccess: () => {
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ['sessions'] });
      if (active) navigate({ to: '/', search: {} });
    },
  });

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

  const commitRename = () => {
    const v = title.trim();
    setRenaming(false);
    if (v && v !== session.title) renameMut.mutate(v);
    else setTitle(session.title);
  };

  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    }
    if (e.key === 'Escape') {
      setTitle(session.title);
      setRenaming(false);
    }
  };

  const onRenameSubmit = (e: FormEvent) => {
    e.preventDefault();
    commitRename();
  };

  return (
    <>
      <Link
        to="/"
        search={{ session: session.id }}
        className={cn(
          'hover-elevate group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]',
          active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80',
        )}
      >
        <MessageSquare className="size-3.5 shrink-0 text-sidebar-foreground/40" />
        {renaming ? (
          <form onSubmit={onRenameSubmit} className="flex-1">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={commitRename}
              onKeyDown={onRenameKey}
              onClick={(e) => e.preventDefault()}
              className="w-full rounded-sm bg-background/60 px-1 ring-1 ring-primary/60 focus:outline-none focus:ring-primary"
            />
          </form>
        ) : (
          <span className="flex-1 truncate">{session.title}</span>
        )}
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
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              aria-label="Actions"
              className={cn(
                'shrink-0 text-sidebar-foreground/60 transition-opacity hover:text-sidebar-foreground',
                menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
              )}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setTitle(session.title);
                setRenaming(true);
                setMenuOpen(false);
              }}
            >
              <Pencil className="size-3.5" />
              Renommer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
                setMenuOpen(false);
              }}
            >
              <Trash2 className="size-3.5" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Link>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la session ?</DialogTitle>
            <DialogDescription>
              « {session.title} » sera définitivement supprimée. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleteMut.isPending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
