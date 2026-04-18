import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  defaultOpen?: boolean;
  label?: string;
}

export function ReasoningCollapsible({ children, defaultOpen = false, label = 'Reflexion' }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        {label}
      </button>
      {open && (
        <div className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}
