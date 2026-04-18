import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpQuery, useMcpMutation } from '@/hooks/use-mcp';
import { EntityForm } from '@/components/entities/entity-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { Event } from '@/types/entities';

export const Route = createFileRoute('/events/$id')({ component: EventDetail });

function EventDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useMcpQuery<Event>('get_event', { id });
  const updateMutation = useMcpMutation('update_event', ['list_events', 'get_event']);
  const deleteMutation = useMcpMutation('delete_event', ['list_events']);
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
        type="event"
        initial={data}
        onSubmit={(d) => updateMutation.mutate({ id, ...d })}
        onCancel={() => navigate({ to: '/events' })}
        submitting={updateMutation.isPending}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Supprimer cet événement ?"
        description="Cette action est irréversible."
        destructive
        onConfirm={() =>
          deleteMutation.mutate({ id }, { onSuccess: () => navigate({ to: '/events' }) })
        }
      />
    </div>
  );
}
