import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface InfoTipProps {
  /** What the metric is for / how it is calculated. */
  text: string;
  /** Where the data comes from. Shown as a separate "Data:" line. */
  source?: string;
  className?: string;
}

export default function InfoTip({ text, source, className = '' }: InfoTipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="What is this metric?"
            // Many metric cards are clickable — don't open the drawer when the icon is tapped.
            onClick={e => e.stopPropagation()}
            className={`inline-flex items-center shrink-0 cursor-help rounded-full text-muted-foreground/60 hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        {/* Content isn't portaled, so reset text styles it would inherit from uppercase/centered labels. */}
        <TooltipContent side="top" className="max-w-[300px] text-xs leading-relaxed text-left normal-case tracking-normal font-normal">
          <div>{text}</div>
          {source && (
            <div className="mt-1.5 pt-1.5 border-t border-border text-muted-foreground">
              <span className="font-medium text-popover-foreground">Data: </span>{source}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}