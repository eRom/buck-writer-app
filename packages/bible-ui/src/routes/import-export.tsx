import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useMcpMutation } from '@/hooks/use-mcp';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/import-export')({ component: ImportExport });

function ImportExport() {
  const [exported, setExported] = useState<string | null>(null);
  const [importData, setImportData] = useState('');
  const exportMut = useMcpMutation('export_bible');
  const importMut = useMcpMutation('import_bulk');

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Import / Export</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Export complet</h2>
        <p className="text-xs text-muted-foreground">
          Génère un document Markdown structuré avec toutes les entités.
        </p>
        <Button
          onClick={() =>
            exportMut.mutate(
              {},
              {
                onSuccess: (d) => setExported(typeof d === 'string' ? d : JSON.stringify(d, null, 2)),
              },
            )
          }
          disabled={exportMut.isPending}
        >
          Exporter en Markdown
        </Button>
        {exported && (
          <Textarea readOnly value={exported} rows={12} className="font-mono text-xs" />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Import (JSON)</h2>
        <p className="text-xs text-muted-foreground">
          Format attendu : objet JSON avec clés <code>characters</code>, <code>locations</code>,{' '}
          <code>events</code>, <code>interactions</code>, <code>world_rules</code>,{' '}
          <code>research</code>, <code>notes</code> (toutes optionnelles).
        </p>
        <Textarea
          value={importData}
          onChange={(e) => setImportData(e.target.value)}
          rows={10}
          placeholder='{"characters":[…], …}'
          className="font-mono text-xs"
        />
        <Button
          variant="destructive"
          onClick={() => {
            try {
              const parsed = JSON.parse(importData);
              importMut.mutate({ data: parsed });
            } catch (err) {
              alert('JSON invalide: ' + String(err));
            }
          }}
          disabled={!importData || importMut.isPending}
        >
          Importer (transaction tout-ou-rien)
        </Button>
      </section>
    </div>
  );
}
