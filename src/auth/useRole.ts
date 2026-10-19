import { useUser } from '@clerk/react';

export type Role = 'admin' | 'management' | 'user';

export function useRole() {
  const { user, isLoaded } = useUser();
  const meta = (user?.publicMetadata ?? {}) as {
    role?: Role;
    brokerName?: string;
  };

  const role: Role = meta.role ?? 'user';

  return {
    isLoaded,
    role,
    brokerName: meta.brokerName,
    email: user?.primaryEmailAddress?.emailAddress,
    isAdmin: role === 'admin',
    canSeeAll: role === 'admin' || role === 'management',
  };
}