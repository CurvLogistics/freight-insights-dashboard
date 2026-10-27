import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

/** Checked = included. Unchecking a team excludes it (e.g. uncheck Intermodal). */
export default function TeamFilter({ teams, excluded, onChange }: {
  teams: string[]; excluded: string[]; onChange: (excluded: string[]) => void;
}) {
  const included = teams.filter(t => !excluded.includes(t));
  const label =
    excluded.length === 0 ? 'All Teams'
    : included.length === 1 ? included[0]
    : excluded.length === 1 ? `All except ${excluded[0]}`
    : `${included.length} of ${teams.length} teams`;
  const toggle = (t: string, on: boolean) => onChange(on ? excluded.filter(x => x !== t) : [...excluded, t]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 text-xs gap-1 font-normal max-w-[190px]">
          <span className="truncate">{label}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <button type="button" className="text-xs text-primary hover:underline px-1 pb-2" onClick={() => onChange([])}>
          Include all
        </button>
        {teams.map(t => (
          <div key={t} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted">
            <Checkbox id={`team-${t}`} checked={!excluded.includes(t)} onCheckedChange={v => toggle(t, v === true)} />
            <label htmlFor={`team-${t}`} className="text-xs flex-1 cursor-pointer">{t}</label>
            <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => onChange(teams.filter(x => x !== t))}>Only</button>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
