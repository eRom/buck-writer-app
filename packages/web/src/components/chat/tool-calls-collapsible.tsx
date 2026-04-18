import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  count: number;
  hasPendingApproval: boolean;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function ToolCallsCollapsible({ count, hasPendingApproval, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (hasPendingApproval) setOpen(true);
  }, [hasPendingApproval]);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 font-mono text-[11px]',
          hasPendingApproval ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
        {count} outil{count > 1 ? 's' : ''} utilise{count > 1 ? 's' : ''}
      </button>
      {open && <div className="mt-1 space-y-1.5">{children}</div>}
    </div>
  );
}
