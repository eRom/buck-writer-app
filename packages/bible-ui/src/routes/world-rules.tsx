import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpQuery, useMcpMutation } from '@/hooks/use-mcp';
import { EntityList } from '@/components/entities/entity-list';
import { EntityForm } from '@/components/entities/entity-form';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus } from 'lucide-react';
import type { WorldRule } from '@/types/entities';

export const Route = createFileRoute('/world-rules')({ component: WorldRulesPage });

function WorldRulesPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useMcpQuery<WorldRule[]>('list_world_rules');
  const createMutation = useMcpMutation('create_world_rule', ['list_world_rules']);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (error) return <div className="p-8 text-sm text-destructive">Erreur : {error.message}</div>;

  return (
    <div className="p-8 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Règles</h1>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" /> Nouveau
        </Button>
      </header>
      <EntityList
        entities={data ?? []}
        type="world-rule"
        onSelect={(e) => navigate({ to: '/world-rules/$id', params: { id: e.id } })}
        emptyMessage="Aucune règle. Créez la première."
      />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nouvelle règle</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <EntityForm
              type="world-rule"
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
