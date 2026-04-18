import { useState } from 'react';
import type { FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { AnyEntity, EntityType } from '@/types/entities';

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'csv';
}

// Field configs aligned with the actual bible-mcp DB schema (cf. types/entities.ts).
// CSV fields (interaction.characters, event.characters, note.tags, research.sources)
// are stored as plain comma-separated strings on the server; the form keeps them
// as strings end-to-end (no client-side split).
const FIELDS: Record<EntityType, FieldDef[]> = {
  character: [
    { key: 'name', label: 'Nom', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'traits', label: 'Traits', type: 'textarea' },
    { key: 'background', label: 'Background', type: 'textarea' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  location: [
    { key: 'name', label: 'Nom', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'atmosphere', label: 'Atmosphère', type: 'textarea' },
    { key: 'geography', label: 'Géographie', type: 'textarea' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  event: [
    { key: 'title', label: 'Titre', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'chapter', label: 'Chapitre', type: 'text' },
    { key: 'sort_order', label: 'Ordre', type: 'number' },
    { key: 'location_id', label: 'ID lieu', type: 'text' },
    { key: 'characters', label: 'Personnages (csv ids)', type: 'csv' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  note: [
    { key: 'content', label: 'Contenu', type: 'textarea' },
    { key: 'tags', label: 'Tags (csv)', type: 'csv' },
  ],
  research: [
    { key: 'topic', label: 'Sujet', type: 'text' },
    { key: 'content', label: 'Contenu', type: 'textarea' },
    { key: 'sources', label: 'Sources (csv URLs)', type: 'csv' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  'world-rule': [
    { key: 'category', label: 'Catégorie', type: 'text' },
    { key: 'title', label: 'Titre', type: 'text' },
    { key: 'description', label: 'Énoncé', type: 'textarea' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  interaction: [
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'nature', label: 'Nature', type: 'text' },
    { key: 'characters', label: 'Personnages (csv ids)', type: 'csv' },
    { key: 'chapter', label: 'Chapitre', type: 'text' },
    { key: 'sort_order', label: 'Ordre', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
};

export function EntityForm({
  type,
  initial,
  onSubmit,
  onCancel,
  submitting = false,
}: {
  type: EntityType;
  initial?: Partial<AnyEntity>;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(
    (initial as Record<string, unknown>) ?? {},
  );
  const fields = FIELDS[type];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={f.key} className="text-sm font-medium">
            {f.label}
          </Label>
          {f.type === 'textarea' ? (
            <Textarea
              id={f.key}
              value={(values[f.key] as string) ?? ''}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              rows={5}
            />
          ) : (
            <Input
              id={f.key}
              type={f.type === 'number' ? 'number' : 'text'}
              value={(values[f.key] as string | number) ?? ''}
              onChange={(e) =>
                setValues({
                  ...values,
                  [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                })
              }
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
