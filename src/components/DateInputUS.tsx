import { useEffect, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatUSDate, fromISODate, parseUSDate, toISODate } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface DateInputUSProps {
  /** ISO date "YYYY-MM-DD" */
  value: string;
  onChange: (iso: string) => void;
  className?: string;
}

/**
 * Date field that always shows MM/DD/YYYY, whatever the browser's language.
 * (<input type="date"> follows the browser locale, which is why European
 * browsers were showing DD/MM/YYYY.) Type a date or pick it from the calendar.
 */
export default function DateInputUS({ value, onChange, className }: DateInputUSProps) {
  const [text, setText] = useState(formatUSDate(value));
  const [open, setOpen] = useState(false);

  useEffect(() => { setText(value ? formatUSDate(value) : ''); }, [value]);

  const commit = () => {
    const iso = parseUSDate(text);
    if (iso) { if (iso !== value) onChange(iso); }
    else setText(value ? formatUSDate(value) : ''); // revert bad input
  };

  return (
    <div className={cn('relative', className)}>
      <Input
        value={text}
        placeholder="MM/DD/YYYY"
        inputMode="numeric"
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        className="h-9 w-full pr-8 text-xs"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Pick a date"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={fromISODate(value)}
            defaultMonth={fromISODate(value)}
            onSelect={d => { if (d) { onChange(toISODate(d)); setOpen(false); } }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
