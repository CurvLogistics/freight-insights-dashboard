import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { useData } from '@/context/DataContext';
import { listUsers, setUserRole, type AssignableRole, type DashboardUser } from '@/lib/usersApi';

const ROLE_LABELS: Record<AssignableRole, string> = {
  none: 'No access',
  user: 'Broker',
  management: 'Management',
  admin: 'Admin',
};

const ROLE_HELP = 'Broker: only their own loads · Management: all loads + Ask Claude · Admin: everything + Sync and roles';

const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-US') : '—');

/** Admin only. People sign up themselves; this is where an admin grants them access. */
export default function UsersRolesCard() {
  const { getToken } = useAuth();
  const { rawLoads } = useData();
  const [users, setUsers] = useState<DashboardUser[] | null>(null);
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
      setUsers(await listUsers(getToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

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
              People sign up with their work email, then appear here with no access until you give them a role.
              Changes apply the next time they sign in or refresh.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5 shrink-0">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
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
                  <TableHead className="text-xs w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
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
  const [role, setRole] = useState<AssignableRole>(user.role);
  const [broker, setBroker] = useState<string | null>(user.brokerName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = role !== user.role || (role === 'user' && broker !== user.brokerName);
  const canSave = dirty && (role !== 'user' || !!broker);
  // Keep a broker name that's no longer in the current data selectable
  const brokerOptions = broker && !brokers.includes(broker) ? [broker, ...brokers] : brokers;

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
        <Select value={role} onValueChange={v => setRole(v as AssignableRole)} disabled={user.isMe}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_LABELS) as AssignableRole[]).map(r => (
              <SelectItem key={r} value={r} className="text-xs">{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {role === 'user' ? (
          <Select value={broker ?? undefined} onValueChange={setBroker}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick their Turvo name" /></SelectTrigger>
            <SelectContent>
              {brokerOptions.map(b => <SelectItem key={b} value={b} className="text-xs">{b}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">{role === 'none' ? '—' : 'All loads'}</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {dirty && (
          <Button size="sm" className="h-8" onClick={() => void save()} disabled={!canSave || saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
