import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpQuery, useMcpMutation } from '@/hooks/use-mcp';
import { EntityList } from '@/components/entities/entity-list';
import { EntityForm } from '@/components/entities/entity-form';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus } from 'lucide-react';
import type { Note } from '@/types/entities';

export const Route = createFileRoute('/notes')({ component: NotesPage });

function NotesPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useMcpQuery<Note[]>('list_notes');
  const createMutation = useMcpMutation('create_note', ['list_notes']);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (error) return <div className="p-8 text-sm text-destructive">Erreur : {error.message}</div>;

  return (
    <div className="p-8 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notes</h1>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" /> Nouveau
        </Button>
      </header>
      <EntityList
        entities={data ?? []}
        type="note"
        onSelect={(e) => navigate({ to: '/notes/$id', params: { id: e.id } })}
        emptyMessage="Aucune note. Créez la première."
      />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nouvelle note</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <EntityForm
              type="note"
              onSubmit={(d) => createMutation.mutate(d, { onSuccess: () => setSheetOpen(false) })}
              onCancel={() => setSheetOpen(false)}
              submitting={createMutation.isPending}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
