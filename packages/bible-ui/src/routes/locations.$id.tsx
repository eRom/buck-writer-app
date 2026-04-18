import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpQuery, useMcpMutation } from '@/hooks/use-mcp';
import { EntityForm } from '@/components/entities/entity-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { Location } from '@/types/entities';

export const Route = createFileRoute('/locations/$id')({ component: LocationDetail });

function LocationDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useMcpQuery<Location>('get_location', { id });
  const updateMutation = useMcpMutation('update_location', ['list_locations', 'get_location']);
  const deleteMutation = useMcpMutation('delete_location', ['list_locations']);
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
        <h1 className="text-2xl font-bold">{data.name}</h1>
        <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="size-4" /> Supprimer
        </Button>
      </header>
      <EntityForm
        type="location"
        initial={data}
        onSubmit={(d) => updateMutation.mutate({ id, ...d })}
        onCancel={() => navigate({ to: '/locations' })}
        submitting={updateMutation.isPending}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Supprimer ce lieu ?"
        description="Cette action est irréversible."
        destructive
        onConfirm={() =>
          deleteMutation.mutate({ id }, { onSuccess: () => navigate({ to: '/locations' }) })
        }
      />
    </div>
  );
}
