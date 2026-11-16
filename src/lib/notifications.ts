import type { Load, ViewType } from '@/types/loads';
import { isActiveLoad, isMissingRevenue } from '@/lib/computeLoads';
import { businessTodayDate } from '@/lib/filters';

/** Ready to bill but not invoiced this many days → nudge billing (same idea as the Exception Center default). */
export const UNBILLED_ALERT_DAYS = 7;
/** The sync runs daily at ~5 AM ET; older than this means it missed a run. */
export const STALE_SYNC_HOURS = 26;

export interface AppNotification {
  /** Stable per alert; `version` changes when the alert's numbers change, so it shows as new again. */
  id: string;
  version: string;
  tone: 'warn' | 'info';
  title: string;
  detail: string;
  /** Page that fixes it. */
  page: ViewType;
}

export interface NotificationInput {
  loads: Load[];
  pendingUsers: number;
  lastSyncedAt: string | null;
  dataError: string | null;
  now?: Date;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Built from data the dashboard already has, so there's nothing to store on the server. */
export function buildNotifications({ loads, pendingUsers, lastSyncedAt, dataError, now = new Date() }: NotificationInput): AppNotification[] {
  const out: AppNotification[] = [];

  if (pendingUsers > 0) {
    out.push({
      id: 'pending-users', version: String(pendingUsers), tone: 'warn', page: 'settings',
      title: `${plural(pendingUsers, 'person is', 'people are')} waiting for access`,
      detail: 'Give them a role in Settings → Users & roles.',
    });
  }

  if (dataError) {
    out.push({ id: 'data-error', version: dataError, tone: 'warn', page: 'settings', title: "Couldn't load the latest data", detail: dataError });
  } else if (lastSyncedAt) {
    const hours = (now.getTime() - new Date(lastSyncedAt).getTime()) / 3_600_000;
    if (hours >= STALE_SYNC_HOURS) {
      out.push({
        id: 'stale-sync', version: lastSyncedAt, tone: 'warn', page: 'settings',
        title: 'Turvo sync is overdue',
        detail: `Last synced ${Math.floor(hours / 24) >= 1 ? plural(Math.floor(hours / 24), 'day') : plural(Math.floor(hours), 'hour')} ago. Numbers may be out of date.`,
      });
    }
  }

  const active = loads.filter(isActiveLoad);
  const today = businessTodayDate(now).getTime();
  const unbilled = active.filter(l => {
    if (!l.readyToBillDate || l.invoiceSentDate) return false;
    const ready = new Date(l.readyToBillDate.slice(0, 10) + 'T00:00:00Z').getTime();
    return Math.floor((today - ready) / 86_400_000) >= UNBILLED_ALERT_DAYS;
  });
  if (unbilled.length) {
    out.push({
      id: 'unbilled', version: String(unbilled.length), tone: 'info', page: 'exceptions',
      title: `${plural(unbilled.length, 'load')} ready to bill, not invoiced`,
      detail: `Waiting ${UNBILLED_ALERT_DAYS}+ days. See the Exception Center.`,
    });
  }

  const missingRevenue = active.filter(isMissingRevenue).length;
  if (missingRevenue) {
    out.push({
      id: 'missing-revenue', version: String(missingRevenue), tone: 'info', page: 'exceptions',
      title: `${plural(missingRevenue, 'load')} missing revenue`,
      detail: 'No customer bill in Turvo yet, so profit is off for these.',
    });
  }

  return out;
}
