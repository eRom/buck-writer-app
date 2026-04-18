import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpQuery, useMcpMutation } from '@/hooks/use-mcp';
import { EntityList } from '@/components/entities/entity-list';
import { EntityForm } from '@/components/entities/entity-form';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus } from 'lucide-react';
import type { Character } from '@/types/entities';

export const Route = createFileRoute('/characters')({ component: CharactersPage });

function CharactersPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useMcpQuery<Character[]>('list_characters');
  const createMutation = useMcpMutation('create_character', ['list_characters']);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (error) return <div className="p-8 text-sm text-destructive">Erreur : {error.message}</div>;

  return (
    <div className="p-8 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Personnages</h1>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" /> Nouveau
        </Button>
      </header>
      <EntityList
        entities={data ?? []}
        type="character"
        onSelect={(e) => navigate({ to: '/characters/$id', params: { id: e.id } })}
        emptyMessage="Aucun personnage. Créez le premier."
      />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nouveau personnage</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <EntityForm
              type="character"
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
