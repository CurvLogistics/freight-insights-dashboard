import { useCallback } from 'react';
import { useUser } from '@clerk/react';
import { can as roleCan, normalizeRole, type Permission } from './permissions';

export type { Role } from './permissions';

export function useRole() {
  const { user, isLoaded } = useUser();
  const meta = (user?.publicMetadata ?? {}) as {
    role?: string;
    brokerName?: string;
  };

  const role = normalizeRole(meta.role);
  /** Same check the server makes (see src/auth/permissions.ts). */
  const can = useCallback((permission: Permission) => roleCan(role, permission), [role]);

  return {
    isLoaded,
    role,
    can,
    brokerName: meta.brokerName,
    email: user?.primaryEmailAddress?.emailAddress,
    isAdmin: role === 'admin',
    canSeeAll: can('loads.all'),
  };
}
