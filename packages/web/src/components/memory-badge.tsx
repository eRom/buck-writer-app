import { useMemoryStatus } from '@/stores/memory-status';

export function MemoryBadge() {
  const degraded = useMemoryStatus((s) => s.degraded);
  if (!degraded) return null;
  return (
    <div
      role="status"
      className="inline-flex items-center gap-1 text-xs text-amber-500"
      title="La memoire longue duree est temporairement indisponible"
    >
      <span aria-hidden="true">⚠</span>
      <span>memoire indisponible</span>
    </div>
  );
}
