import { useMemo, useState } from 'react';
import { Bell, AlertTriangle, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useData } from '@/context/DataContext';
import { useRole } from '@/auth/useRole';
import { usePendingUsers } from '@/hooks/usePendingUsers';
import { buildNotifications, type AppNotification } from '@/lib/notifications';

/** What this browser has already seen (id → version). Per viewer only; empty in private windows is fine. */
const SEEN_KEY = 'freightops.notifications.seen';

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeSeen(seen: Record<string, string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // storage blocked: the badge just comes back next visit
  }
}

/** Bell next to the profile button. Alerts are worked out from loaded data; opening the list marks them read. */
export default function NotificationBell() {
  const { rawLoads, lastSyncedAt, dataError, setCurrentView } = useData();
  const { can } = useRole();
  const pendingUsers = usePendingUsers();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);

  const items = useMemo(
    () => buildNotifications({ loads: rawLoads, pendingUsers, lastSyncedAt, dataError })
      .filter(n => can(`page.${n.page}`)),
    [rawLoads, pendingUsers, lastSyncedAt, dataError, can],
  );
  const unread = items.filter(n => seen[n.id] !== n.version).length;

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o && unread) {
      const next = { ...seen, ...Object.fromEntries(items.map(n => [n.id, n.version])) };
      setSeen(next);
      writeSeen(next);
    }
  };

  const go = (n: AppNotification) => {
    setCurrentView(n.page);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={unread ? `${unread} new notifications` : 'Notifications'}
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b text-sm font-semibold">Notifications</div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">All clear. Nothing needs attention.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto divide-y">
            {items.map(n => {
              const Icon = n.tone === 'warn' ? AlertTriangle : Info;
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => go(n)} className="w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-muted/50">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${n.tone === 'warn' ? 'text-warning' : 'text-muted-foreground'}`} />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{n.title}</span>
                      <span className="block text-[11px] text-muted-foreground break-words">{n.detail}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
