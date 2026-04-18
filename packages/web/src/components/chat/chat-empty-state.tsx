import { Sparkles } from 'lucide-react';

export function ChatEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Sparkles className="size-5" />
      </div>
      <h2 className="text-lg font-semibold">Commencez une nouvelle conversation</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Selectionnez ou creez une conversation pour echanger avec vos modeles preferes.
      </p>
    </div>
  );
}
