import { BookOpen } from 'lucide-react';

export function TopBar() {
  return (
    <header className="flex h-[38px] items-center justify-between border-b border-border bg-background px-3">
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 text-primary" />
        <span className="text-[13px] font-semibold">Bible — Buck Writer</span>
      </div>
      <div className="text-[11px] text-muted-foreground">{/* breadcrumb */}</div>
    </header>
  );
}
