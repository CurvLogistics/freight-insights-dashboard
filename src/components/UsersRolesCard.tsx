import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, RefreshCw, Trash2, Users, X } from 'lucide-react';
import { useData } from '@/context/DataContext';
import {
  listUsersAndInvites, setUserRole, removeUser, revokeInvite,
  type AssignableRole, type DashboardInvite, type DashboardUser,
} from '@/lib/usersApi';
import CreateUserDialog from '@/components/CreateUserDialog';
import { useRole } from '@/auth/useRole';
import { ROLE_LABELS as SHARED_ROLE_LABELS, canGrant } from '@/auth/permissions';
import { PENDING_USERS_KEY } from '@/hooks/usePendingUsers';

const ROLE_LABELS: Record<AssignableRole, string> = { none: 'No access', ...SHARED_ROLE_LABELS };

const ROLE_HELP = 'What each role can see and do is in the Roles & permissions table below. Only an Admin can give or change the Admin role.';

const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-US') : '—');

/** Needs users.manage. People sign up themselves or are invited here; this is where access is granted. */
export default function UsersRolesCard() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { rawLoads } = useData();
  const [users, setUsers] = useState<DashboardUser[] | null>(null);
  const [invites, setInvites] = useState<DashboardInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Broker names exactly as Turvo spells them, so a broker's loads always match
  const brokers = useMemo(
    () => [...new Set(rawLoads.map(l => l.broker?.trim()).filter((b): b is string => !!b && b.toLowerCase() !== 'unassigned'))].sort(),
    [rawLoads],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { users: list, invites: pending } = await listUsersAndInvites(getToken);
      setUsers(list);
      setInvites(pending);
      // Keep the sidebar "waiting" badge in step with this card after a save or remove
      queryClient.setQueryData(PENDING_USERS_KEY, list.filter(u => u.role === 'none').length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, [getToken, queryClient]);

  useEffect(() => { void load(); }, [load]);

  const waiting = users?.filter(u => u.role === 'none').length ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users &amp; roles
              {waiting > 0 && <Badge variant="destructive">{waiting} waiting</Badge>}
            </CardTitle>
            <CardDescription>
              Two ways in: people sign up with their work email and wait here with no access until you give them a role,
              or you create them with Create user and they get an email invite with the role already set.
              Changes apply the next time they sign in or refresh.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CreateUserDialog brokers={brokers} onCreated={load} />
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {users && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Joined</TableHead>
                  <TableHead className="text-xs w-[160px]">Role</TableHead>
                  <TableHead className="text-xs w-[220px]">Broker</TableHead>
                  <TableHead className="text-xs w-[130px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map(i => (
                  <InviteRow key={i.id} invite={i} onRevoked={load} />
                ))}
                {users.map(u => (
                  <UserRow key={u.id} user={u} brokers={brokers} onSaved={load} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{ROLE_HELP}</p>
      </CardContent>
    </Card>
  );
}

function UserRow({ user, brokers, onSaved }: { user: DashboardUser; brokers: string[]; onSaved: () => Promise<void> }) {
  const { getToken } = useAuth();
  const { role: myRole } = useRole();
  // Only an Admin can touch another Admin, or hand out Admin
  const locked = user.isMe || (user.role === 'admin' && myRole !== 'admin');
  const roleOptions = (Object.keys(ROLE_LABELS) as AssignableRole[]).filter(r => r === user.role || canGrant({ role: myRole }, r));
  const [role, setRole] = useState<AssignableRole>(user.role);
  const [broker, setBroker] = useState<string | null>(user.brokerName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = role !== user.role || (role === 'user' && broker !== user.brokerName);
  const canSave = dirty && (role !== 'user' || !!broker);
  // Keep a broker name that's no longer in the current data selectable
  const brokerOptions = broker && !brokers.includes(broker) ? [broker, ...brokers] : brokers;

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await removeUser(getToken, user.id);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove');
      setSaving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await setUserRole(getToken, user.id, role, role === 'user' ? broker : null);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableRow className={user.role === 'none' ? 'bg-warning/10' : undefined}>
      <TableCell className="text-xs">
        <div className="font-medium">{user.email}{user.isMe && <span className="text-muted-foreground"> (you)</span>}</div>
        {user.name && <div className="text-muted-foreground">{user.name}</div>}
        {error && <div className="text-destructive mt-0.5">{error}</div>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{fmtDate(user.createdAt)}</TableCell>
      <TableCell>
        <Select value={role} onValueChange={v => setRole(v as AssignableRole)} disabled={locked}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {roleOptions.map(r => (
              <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {role === 'user' ? (
          <Select value={broker ?? undefined} onValueChange={setBroker} disabled={locked}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick their Turvo name" /></SelectTrigger>
            <SelectContent>
              {brokerOptions.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">{role === 'none' ? '—' : 'All loads'}</span>
        )}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap space-x-1">
        {dirty && (
          <Button size="sm" className="h-8" onClick={() => void save()} disabled={!canSave || saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
          </Button>
        )}
        {!locked && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" disabled={saving} title="Remove user">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {user.email}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Their account is deleted and they're signed out right away. To come back they'd have to sign up again
                  and be given a role. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void remove()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Remove user
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Invited but hasn't signed up yet. The role is fixed by the invite; revoke and re-invite to change it. */
function InviteRow({ invite, onRevoked }: { invite: DashboardInvite; onRevoked: () => Promise<void> }) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await revokeInvite(getToken, invite.id);
      await onRevoked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke');
      setBusy(false);
    }
  };

  return (
    <TableRow className="bg-muted/30">
      <TableCell className="text-xs">
        <div className="font-medium flex items-center gap-1.5">
          {invite.email}
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Invited</Badge>
        </div>
        {invite.name && <div className="text-muted-foreground">{invite.name}</div>}
        {error && <div className="text-destructive mt-0.5">{error}</div>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">Invited {fmtDate(invite.createdAt)}</TableCell>
      <TableCell className="text-xs">{ROLE_LABELS[invite.role]}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{invite.role === 'user' ? invite.brokerName ?? '—' : 'All loads'}</TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" disabled={busy} title="Revoke invite">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke the invite for {invite.email}?</AlertDialogTitle>
              <AlertDialogDescription>
                The link in their email stops working. You can send a new invite later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void revoke()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Revoke invite
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
