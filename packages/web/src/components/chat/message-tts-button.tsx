import { Play, Pause, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTts } from '@/hooks/use-tts';

interface Props {
  messageId: string;
}

export function MessageTtsButton({ messageId }: Props) {
  const { state, toggle } = useTts(messageId);

  const icon =
    state === 'loading' ? (
      <Loader2 className="size-3 animate-spin" />
    ) : state === 'playing' ? (
      <Pause className="size-3" />
    ) : state === 'error' ? (
      <AlertCircle className="size-3" />
    ) : (
      <Play className="size-3" />
    );

  const label =
    state === 'playing' ? 'Arrêter la lecture' : 'Lire à voix haute';

  return (
    <button
      onClick={() => {
        void toggle();
      }}
      aria-label={label}
      title={label}
      disabled={state === 'loading'}
      className={cn(
        'hover-elevate rounded-md p-1 text-muted-foreground opacity-0 transition-opacity',
        'group-hover:opacity-100 focus-visible:opacity-100',
        'disabled:opacity-60',
      )}
    >
      {icon}
    </button>
  );
}
