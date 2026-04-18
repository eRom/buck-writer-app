import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpQuery, useMcpMutation } from '@/hooks/use-mcp';
import { EntityList } from '@/components/entities/entity-list';
import { EntityForm } from '@/components/entities/entity-form';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus } from 'lucide-react';
import type { Research } from '@/types/entities';

export const Route = createFileRoute('/research')({ component: ResearchPage });

function ResearchPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useMcpQuery<Research[]>('list_research');
  const createMutation = useMcpMutation('create_research', ['list_research']);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (error) return <div className="p-8 text-sm text-destructive">Erreur : {error.message}</div>;

  return (
    <div className="p-8 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recherches</h1>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" /> Nouveau
        </Button>
      </header>
      <EntityList
        entities={data ?? []}
        type="research"
        onSelect={(e) => navigate({ to: '/research/$id', params: { id: e.id } })}
        emptyMessage="Aucune recherche. Créez la première."
      />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nouvelle recherche</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <EntityForm
              type="research"
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
