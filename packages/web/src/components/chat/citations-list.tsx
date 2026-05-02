import type { Annotation } from './chat-stream';

interface Props {
  annotations?: Annotation[];
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function favicon(url: string): string | null {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return null;
  }
}

export function CitationsList({ annotations }: Props) {
  if (!annotations || annotations.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {annotations.map((a, i) => {
        const host = hostname(a.url);
        const ico = favicon(a.url);
        return (
          <a
            key={`${a.url}-${i}`}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            title={a.title ?? a.url}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {ico ? (
              <img src={ico} alt="" className="size-3.5 shrink-0 rounded-sm" />
            ) : null}
            <span className="max-w-[180px] truncate">{host}</span>
          </a>
        );
      })}
    </div>
  );
}
