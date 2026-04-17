import { Link } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';

interface BudgetBannerProps {
  totalUsd: number;
  limitUsd: number;
  resetDate: string;
}

export function BudgetBanner({ totalUsd, limitUsd, resetDate }: BudgetBannerProps) {
  const resetDateObj = new Date(resetDate);
  const formatted = resetDateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  return (
    <div className="flex items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-3">
      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
      <div className="flex-1 text-sm">
        <span className="font-medium text-destructive">Budget mensuel atteint</span>
        <span className="text-muted-foreground">
          {' '}&mdash; ${totalUsd.toFixed(2)} / ${limitUsd.toFixed(2)}. Réinitialisation le {formatted}.{' '}
        </span>
        <Link to="/settings/budget" className="text-destructive underline hover:no-underline">
          Modifier la limite
        </Link>
      </div>
    </div>
  );
}
