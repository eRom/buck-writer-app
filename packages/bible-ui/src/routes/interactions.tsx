import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpQuery, useMcpMutation } from '@/hooks/use-mcp';
import { EntityList } from '@/components/entities/entity-list';
import { EntityForm } from '@/components/entities/entity-form';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus } from 'lucide-react';
import type { Interaction } from '@/types/entities';

export const Route = createFileRoute('/interactions')({ component: InteractionsPage });

function InteractionsPage() {
  const navigate = useNavigate();
  const { data: raw, isLoading, error } = useMcpQuery<{ results: Interaction[] }>('list_interactions');
  const data = raw?.results ?? [];
  const createMutation = useMcpMutation('create_interaction', ['list_interactions']);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (error) return <div className="p-8 text-sm text-destructive">Erreur : {error.message}</div>;

  return (
    <div className="p-8 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Interactions</h1>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" /> Nouveau
        </Button>
      </header>
      <EntityList
        entities={data}
        type="interaction"
        onSelect={(e) => navigate({ to: '/interactions/$id', params: { id: e.id } })}
        emptyMessage="Aucune interaction. Créez la première."
      />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nouvelle interaction</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <EntityForm
              type="interaction"
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
