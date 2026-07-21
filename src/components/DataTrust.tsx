import { ShieldCheck, ShieldAlert, ShieldQuestion, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type TrustLevel = 'verified' | 'partial' | 'incomplete' | 'estimated';

const config: Record<TrustLevel, { icon: React.ElementType; label: string; color: string; border: string; bg: string }> = {
  verified:   { icon: ShieldCheck,    label: 'Verified',    color: 'text-success',                       border: 'border-success/30',    bg: 'bg-success/5' },
  partial:    { icon: ShieldAlert,    label: 'Partial',     color: 'text-warning',                       border: 'border-warning/30',    bg: 'bg-warning/5' },
  incomplete: { icon: ShieldQuestion, label: 'Incomplete',  color: 'text-destructive',                   border: 'border-destructive/30', bg: 'bg-destructive/5' },
  estimated:  { icon: ShieldAlert,    label: 'Estimated',   color: 'text-muted-foreground',              border: 'border-border',         bg: 'bg-muted/30' },
};

interface DataTrustBadgeProps {
  level: TrustLevel;
  tooltip?: string;
}

export function DataTrustBadge({ level, tooltip }: DataTrustBadgeProps) {
  const c = config[level];
  const Icon = c.icon;

  const badge = (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 gap-1 font-medium cursor-default ${c.color} ${c.border} ${c.bg}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </Badge>
  );

  if (!tooltip) return badge;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface DataWarningProps {
  warnings: string[];
}

export function DataWarnings({ warnings }: DataWarningProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 mt-2">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-warning" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}
