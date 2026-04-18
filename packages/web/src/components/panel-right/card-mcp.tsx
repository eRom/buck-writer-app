import { Plug } from 'lucide-react';

export function CardMcp() {
  return (
    <section className="rounded-lg border border-card-border bg-card p-3">
      <header className="mb-2 flex items-center gap-1.5">
        <Plug className="size-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">MCP</h3>
      </header>
      <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
        Aucun serveur MCP configure
      </p>
    </section>
  );
}
