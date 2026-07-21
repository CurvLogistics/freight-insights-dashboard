import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface InfoTipProps {
  text: string;
  className?: string;
}

export default function InfoTip({ text, className = '' }: InfoTipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className={`inline-block w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help shrink-0 ${className}`} />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
