import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpQuery, useMcpMutation } from '@/hooks/use-mcp';
import { EntityForm } from '@/components/entities/entity-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { WorldRule } from '@/types/entities';

export const Route = createFileRoute('/world-rules_/$id')({ component: WorldRuleDetail });

function WorldRuleDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useMcpQuery<WorldRule>('get_world_rule', { id });
  const updateMutation = useMcpMutation('update_world_rule', ['list_world_rules', 'get_world_rule']);
  const deleteMutation = useMcpMutation('delete_world_rule', ['list_world_rules']);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Chargement…</div>;
  if (error || !data)
    return (
      <div className="p-8 text-sm text-destructive">
        Erreur : {error?.message ?? 'introuvable'}
      </div>
    );

  return (
    <div className="p-8 space-y-4 max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{data.title}</h1>
        <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="size-4" /> Supprimer
        </Button>
      </header>
      <EntityForm
        type="world-rule"
        initial={data}
        onSubmit={(d) => updateMutation.mutate({ id, ...d })}
        onCancel={() => navigate({ to: '/world-rules' })}
        submitting={updateMutation.isPending}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Supprimer cette règle ?"
        description="Cette action est irréversible."
        destructive
        onConfirm={() =>
          deleteMutation.mutate({ id }, { onSuccess: () => navigate({ to: '/world-rules' }) })
        }
      />
    </div>
  );
}
