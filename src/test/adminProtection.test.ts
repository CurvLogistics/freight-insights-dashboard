import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ROLE_PERMISSIONS } from '@/auth/permissions';

/** The signed-in caller's role, read by the mocked verifyToken. */
let callerRole = 'management';
/** Role stored on each target user in Clerk. */
const targetRoles: Record<string, string | undefined> = { user_admin: 'admin', user_broker: 'user' };

const clerk = {
  users: {
    getUser: vi.fn(async (id: string) => ({ id, publicMetadata: { role: targetRoles[id] } })),
    getUserList: vi.fn(),
    updateUserMetadata: vi.fn(),
    deleteUser: vi.fn(),
  },
  invitations: {
    getInvitationList: vi.fn(),
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
  },
};

vi.mock('@clerk/backend', () => ({
  createClerkClient: () => clerk,
  verifyToken: async () => ({ sub: 'user_me', metadata: { role: callerRole } }),
}));

const { default: handler } = await import('../../api/users');

function call(method: string, { body, query = {} }: { body?: unknown; query?: Record<string, string> } = {}) {
  const req = { method, body, query, headers: { 'x-clerk-session': 'token' } } as unknown as VercelRequest;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader() { return this; },
  };
  return Promise.resolve(handler(req, res as unknown as VercelResponse)).then(() => res);
}

const invite = (role: string) => ({ name: 'Jane Doe', email: 'jane@example.com', role, brokerName: role === 'user' ? 'Jane Doe' : null });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_SECRET_KEY = 'sk_test';
  clerk.users.getUserList.mockResolvedValue({ data: [], totalCount: 0 });
  clerk.invitations.getInvitationList.mockResolvedValue({ data: [], totalCount: 0 });
  clerk.invitations.createInvitation.mockResolvedValue({ id: 'inv_1' });
});

describe('Admin protection when Management can manage users', () => {
  beforeEach(() => {
    callerRole = 'management';
    ROLE_PERMISSIONS.management.push('users.manage');
  });
  afterEach(() => {
    ROLE_PERMISSIONS.management = ROLE_PERMISSIONS.management.filter(p => p !== 'users.manage');
  });

  it('still lets them invite a Broker and change a Broker', async () => {
    expect((await call('PUT', { body: invite('user') })).statusCode).toBe(201);
    expect((await call('POST', { body: { userId: 'user_broker', role: 'management' } })).statusCode).toBe(200);
  });

  it("can't invite an Admin", async () => {
    const res = await call('PUT', { body: invite('admin') });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Only an Admin can give the Admin role' });
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
  });

  it("can't promote someone to Admin", async () => {
    const res = await call('POST', { body: { userId: 'user_broker', role: 'admin' } });
    expect(res.statusCode).toBe(403);
    expect(clerk.users.updateUserMetadata).not.toHaveBeenCalled();
  });

  it("can't demote an Admin", async () => {
    const res = await call('POST', { body: { userId: 'user_admin', role: 'user', brokerName: 'X' } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Only an Admin can change another Admin's role" });
    expect(clerk.users.updateUserMetadata).not.toHaveBeenCalled();
  });

  it("can't remove an Admin", async () => {
    const res = await call('DELETE', { query: { userId: 'user_admin' } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Only an Admin can remove an Admin' });
    expect(clerk.users.deleteUser).not.toHaveBeenCalled();
  });
});

describe('Admin', () => {
  beforeEach(() => { callerRole = 'admin'; });

  it('can invite, promote, demote and remove Admins', async () => {
    expect((await call('PUT', { body: invite('admin') })).statusCode).toBe(201);
    expect((await call('POST', { body: { userId: 'user_broker', role: 'admin' } })).statusCode).toBe(200);
    expect((await call('POST', { body: { userId: 'user_admin', role: 'management' } })).statusCode).toBe(200);
    expect((await call('DELETE', { query: { userId: 'user_admin' } })).statusCode).toBe(200);
  });

  it("can't change their own role", async () => {
    const res = await call('POST', { body: { userId: 'user_me', role: 'management' } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "You can't change your own role" });
  });
});

describe('Management by default', () => {
  it('cannot manage users at all', async () => {
    callerRole = 'management';
    expect((await call('GET')).statusCode).toBe(403);
    expect((await call('PUT', { body: invite('user') })).statusCode).toBe(403);
  });
});
