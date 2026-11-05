import { useQuery } from "@tanstack/react-query";
import { useAuth } from '@clerk/react';
import { useRole } from '@/auth/useRole';
import { listUsers } from '@/lib/usersApi';

/** Shared with UsersRolesCard so the sidebar badge updates as soon as an admin grants access. */
export const PENDING_USERS_KEY = ['pending-users'] as const;

/**
 * Admins only: how many people signed up and are still waiting for access (role "none").
 * Re-checks every 5 minutes and whenever the tab gets focus. Returns 0 for everyone else.
 */
export function usePendingUsers(): number {
    const { isAdmin, isLoaded } = useRole();
    const { getToken } = useAuth();

    const { data } = useQuery({
        queryKey: PENDING_USERS_KEY,
        queryFn: async () => (await listUsers(getToken)).filter(u => u.role === 'none').length,
        enabled: isLoaded && isAdmin,
        refetchInterval: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        staleTime: 60 * 1000,
        retry: false,
    });

    return isAdmin ? data ?? 0 : 0;
}