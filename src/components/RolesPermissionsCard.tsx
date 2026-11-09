import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { ShieldCheck } from 'lucide-react';
import { FEATURE_PERMISSIONS, PAGES, PAGE_IDS, ROLES, ROLE_LABELS, can, type Permission } from '@/auth/permissions';

const GROUPS: { label: string; rows: { permission: Permission; label: string }[] }[] = [
  {
    label: 'Data & features',
    rows: (Object.keys(FEATURE_PERMISSIONS) as (keyof typeof FEATURE_PERMISSIONS)[]).map(p => ({ permission: p, label: FEATURE_PERMISSIONS[p] })),
  },
  { label: 'Pages', rows: PAGE_IDS.map(id => ({ permission: `page.${id}` as const, label: PAGES[id] })) },
];

/** Read-only: built straight from src/auth/permissions.ts, the same list the server checks, so it always matches what's live. */
export default function RolesPermissionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Roles &amp; permissions
        </CardTitle>
        <CardDescription>What each role can see and do. Admin always has everything.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Permission</TableHead>
              {ROLES.map(r => <TableHead key={r} className="text-xs text-center w-[110px]">{ROLE_LABELS[r]}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {GROUPS.flatMap(g => [
              <TableRow key={g.label} className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={ROLES.length + 1} className="text-xs font-semibold py-1.5">{g.label}</TableCell>
              </TableRow>,
              ...g.rows.map(({ permission, label }) => (
                <TableRow key={permission}>
                  <TableCell className="text-xs">{label}</TableCell>
                  {ROLES.map(r => (
                    <TableCell key={r} className="text-center text-sm">
                      {can(r, permission)
                        ? <span className="text-success" aria-label="Yes">✓</span>
                        : <span className="text-muted-foreground" aria-label="No">–</span>}
                    </TableCell>
                  ))}
                </TableRow>
              )),
            ])}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
