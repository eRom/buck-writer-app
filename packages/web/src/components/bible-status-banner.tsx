import { AlertTriangle } from 'lucide-react';
import { useBibleStatus } from '@/lib/mcp';

export function BibleStatusBanner() {
  const { data } = useBibleStatus();
  if (!data || data.healthy) return null;
  return (
    <div className="flex items-center gap-3 border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
      <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
      <p className="flex-1 text-sm text-yellow-800 dark:text-yellow-200">
        <span className="font-medium">La bible est injoignable.</span>
        {' '}Le chat fonctionne mais les outils bible (recherche, personnages, lieux) sont indisponibles.
      </p>
    </div>
  );
}
