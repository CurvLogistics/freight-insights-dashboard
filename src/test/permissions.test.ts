import { describe, expect, it } from 'vitest';
import { PAGE_IDS, PERMISSIONS, can, canGrant, normalizeRole, type Permission } from '@/auth/permissions';

const ALL = Object.keys(PERMISSIONS) as Permission[];
const PAGES = PAGE_IDS.map(id => `page.${id}` as Permission);

describe('Roles & permissions', () => {
  it('gives Admin everything', () => {
    expect(ALL.every(p => can('admin', p))).toBe(true);
  });

  it('keeps Management as before: all loads, Ask Claude and every page, but no sync, import or user management', () => {
    expect(ALL.filter(p => can('management', p)).sort()).toEqual(['askClaude', 'loads.all', ...PAGES].sort());
  });

  it('keeps Broker as before: every page, only their own loads, nothing else', () => {
    expect(ALL.filter(p => can('user', p)).sort()).toEqual([...PAGES].sort());
  });

  it('treats unknown or missing roles as Broker, and no role as nothing', () => {
    expect(normalizeRole('owner')).toBe('user');
    expect(normalizeRole(undefined)).toBe('user');
    expect(normalizeRole('management')).toBe('management');
    expect(can(null, 'page.dashboard')).toBe(false);
  });

  it('lets only an Admin give the Admin role', () => {
    expect(canGrant({ role: 'admin' }, 'admin')).toBe(true);
    expect(canGrant({ role: 'management' }, 'admin')).toBe(false);
    expect(canGrant({ role: 'management' }, 'user')).toBe(true);
  });
});
