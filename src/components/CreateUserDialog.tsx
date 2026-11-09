import { useState } from 'react';
import { useAuth } from '@clerk/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, UserPlus } from 'lucide-react';
import { createUser, type NewUser } from '@/lib/usersApi';
import { useRole } from '@/auth/useRole';
import { ROLE_LABELS, canGrant } from '@/auth/permissions';

type InviteRole = NewUser['role'];

/** Broker first: the most common invite. */
const ROLE_ORDER: InviteRole[] = ['user', 'management', 'admin'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Needs users.manage: invites someone by email with their role (and broker) already set. */
export default function CreateUserDialog({ brokers, onCreated }: { brokers: string[]; onCreated: () => Promise<void> }) {
  const { getToken } = useAuth();
  const { role: myRole } = useRole();
  const roleOptions = ROLE_ORDER.filter(r => canGrant({ role: myRole }, r));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole | null>(null);
  const [broker, setBroker] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = !!name.trim() && EMAIL_RE.test(email.trim()) && !!role && (role !== 'user' || !!broker);

  const reset = () => {
    setName('');
    setEmail('');
    setRole(null);
    setBroker(null);
    setError(null);
  };

  const submit = async () => {
    if (!valid || !role) return;
    setSaving(true);
    setError(null);
    try {
      await createUser(getToken, { name: name.trim(), email: email.trim(), role, brokerName: role === 'user' ? broker : null });
      toast.success(`Invite sent to ${email.trim()}`, { description: 'Their role is set; they just need to accept the email.' });
      setOpen(false);
      reset();
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />
          Create user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            They get an email invite. When they sign up, they go straight in with this role.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={e => { e.preventDefault(); void submit(); }}
        >
          <div className="space-y-1">
            <Label htmlFor="new-user-name" className="text-xs">Name</Label>
            <Input id="new-user-name" value={name} onChange={e => setName(e.target.value)} className="h-8 text-sm" autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-user-email" className="text-xs">Work email</Label>
            <Input id="new-user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select value={role ?? undefined} onValueChange={v => setRole(v as InviteRole)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Pick a role" /></SelectTrigger>
              <SelectContent>
                {roleOptions.map(r => <SelectItem key={r} value={r} className="text-sm">{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {role === 'user' && (
            <div className="space-y-1">
              <Label className="text-xs">Broker</Label>
              <Select value={broker ?? undefined} onValueChange={setBroker}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Pick their Turvo name" /></SelectTrigger>
                <SelectContent>
                  {brokers.map(b => <SelectItem key={b} value={b} className="text-sm">{b}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">They only see loads where this is the broker.</p>
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!valid || saving} className="gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
