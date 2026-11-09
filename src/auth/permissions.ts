/**
 * Who can do what — the one list both the dashboard and the API (api/_lib/auth.ts) read.
 * Kept free of `@/` imports so the server can import it too.
 */

export const ROLES = ['admin', 'management', 'user'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', management: 'Management', user: 'Broker' };

/** Every page in the sidebar, in sidebar order. */
export const PAGES = {
  dashboard: 'Executive Overview',
  productivity: 'Productivity',
  service: 'Service Performance',
  lanes: 'Lane Intelligence',
  'customer-scorecard': 'Customer Scorecard',
  'carrier-scorecard': 'Carrier Scorecard',
  'cash-flow': 'Cash Flow',
  exceptions: 'Exception Center',
  insights: 'Insights',
  settings: 'Settings',
} as const;
export type PageId = keyof typeof PAGES;
export const PAGE_IDS = Object.keys(PAGES) as PageId[];

/** Data & features; pages are added below as "page.<id>". */
export const FEATURE_PERMISSIONS = {
  'loads.all': 'See all loads (otherwise only loads where they are the broker)',
  askClaude: 'Ask Claude',
  'sync.run': 'Run Turvo sync',
  'data.import': 'Import historical CSV',
  'users.manage': 'Manage users & roles',
} as const;

export type Permission = keyof typeof FEATURE_PERMISSIONS | `page.${PageId}`;

export const PERMISSIONS = {
  ...FEATURE_PERMISSIONS,
  ...(Object.fromEntries(PAGE_IDS.map(id => [`page.${id}`, PAGES[id]])) as Record<`page.${PageId}`, string>),
} as Record<Permission, string>;

const ALL_PAGES = PAGE_IDS.map(id => `page.${id}` as const);

/** Admin always has everything. Management and Broker match the behaviour before this list existed. */
export const ROLE_PERMISSIONS: Record<Exclude<Role, 'admin'>, Permission[]> = {
  management: ['loads.all', 'askClaude', ...ALL_PAGES],
  user: [...ALL_PAGES],
};

/** Clerk metadata can hold anything; unknown or missing roles are treated as Broker. */
export function normalizeRole(role: unknown): Role {
  return ROLES.includes(role as Role) ? (role as Role) : 'user';
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role === 'admin') return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Only an Admin can hand out the Admin role (anyone with users.manage can give the others). */
export function canGrant(granter: { role: Role }, role: string): boolean {
  return role !== 'admin' || granter.role === 'admin';
}
