import { BookOpen, ExternalLink } from 'lucide-react';
import { useBibleStatus } from '@/lib/mcp';

const BIBLE_UI_URL = import.meta.env.VITE_BIBLE_UI_URL ?? 'http://localhost:5174';

export function CardReferentiel() {
  const { data } = useBibleStatus();
  const healthy = data?.healthy ?? false;

  const content = (
    <section className="rounded-lg border border-card-border bg-card p-3 transition-all hover-elevate">
      <header className="mb-2 flex items-center gap-1.5">
        <BookOpen className="size-3.5 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Referentiel</h3>
        {healthy && <ExternalLink className="ml-auto size-3 text-muted-foreground" />}
      </header>
      <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2 py-1.5">
        <div className="flex flex-col">
          <span className="text-xs">Bible MCP</span>
          <span className="text-[10px] text-muted-foreground">
            {healthy ? `actif · ${data?.toolCount ?? 0} outils` : 'indisponible'}
          </span>
        </div>
        <span
          className={
            healthy
              ? 'inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400'
              : 'inline-flex items-center rounded-md bg-gray-500/10 px-2 py-0.5 text-[10px] font-medium text-gray-400'
          }
        >
          {healthy ? 'on' : 'off'}
        </span>
      </div>
    </section>
  );

  if (!healthy) {
    return (
      <div className="opacity-60 pointer-events-none" title="Bible MCP indisponible">
        {content}
      </div>
    );
  }

  return (
    <a
      href={BIBLE_UI_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block cursor-pointer"
      title="Ouvrir Bible UI"
    >
      {content}
    </a>
  );
}
