import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** The signed-in caller's role, read by the mocked verifyToken. */
let callerRole = 'admin';

const clerk = {
  users: {
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

function call(method: string, { body, query = {}, origin }: { body?: unknown; query?: Record<string, string>; origin?: string } = {}) {
  const req = {
    method,
    body,
    query,
    headers: { 'x-clerk-session': 'token', ...(origin ? { origin } : {}) },
  } as unknown as VercelRequest;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader() { return this; },
  };
  return Promise.resolve(handler(req, res as unknown as VercelResponse)).then(() => res);
}

const broker = { name: 'Jane Doe', email: 'Jane@Example.com', role: 'user', brokerName: 'Jane Doe' };

beforeEach(() => {
  vi.clearAllMocks();
  callerRole = 'admin';
  process.env.CLERK_SECRET_KEY = 'sk_test';
  clerk.users.getUserList.mockResolvedValue({ data: [], totalCount: 0 });
  clerk.invitations.getInvitationList.mockResolvedValue({ data: [], totalCount: 0 });
  clerk.invitations.createInvitation.mockResolvedValue({ id: 'inv_1' });
  clerk.invitations.revokeInvitation.mockResolvedValue({ id: 'inv_1' });
});

describe('Create user (invite)', () => {
  it('refuses non-admins and sends nothing', async () => {
    callerRole = 'management';
    const res = await call('PUT', { body: broker });
    expect(res.statusCode).toBe(403);
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
  });

  it('sends an invite carrying the role, broker and name, back to the dashboard the admin is on', async () => {
    const res = await call('PUT', { body: broker, origin: 'http://localhost:8080' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true, invitationId: 'inv_1' });
    expect(clerk.invitations.createInvitation).toHaveBeenCalledWith({
      emailAddress: 'jane@example.com',
      redirectUrl: 'http://localhost:8080',
      notify: true,
      publicMetadata: { role: 'user', brokerName: 'Jane Doe', invitedName: 'Jane Doe' },
    });
  });

  it('drops the broker for Management and never links to an unknown site', async () => {
    await call('PUT', { body: { ...broker, role: 'management' }, origin: 'https://evil.example' });
    const args = clerk.invitations.createInvitation.mock.calls[0][0];
    expect(args.publicMetadata).toEqual({ role: 'management', brokerName: null, invitedName: 'Jane Doe' });
    expect(args.redirectUrl).toBe('https://freight-insights-dashboard.vercel.app');
  });

  it('requires a name', async () => {
    const res = await call('PUT', { body: { ...broker, name: '  ' } });
    expect(res.statusCode).toBe(400);
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
  });

  it('rejects a bad email', async () => {
    const res = await call('PUT', { body: { ...broker, email: 'jane@' } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Enter a valid email address' });
  });

  it('rejects roles other than Broker, Management or Admin', async () => {
    for (const role of ['none', 'owner', undefined]) {
      const res = await call('PUT', { body: { ...broker, role } });
      expect(res.statusCode).toBe(400);
    }
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
  });

  it('requires a broker for the Broker role', async () => {
    const res = await call('PUT', { body: { ...broker, brokerName: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Pick a broker for this user' });
  });

  it('gives a clear error when the email already has an account', async () => {
    clerk.users.getUserList.mockResolvedValue({ data: [{ id: 'user_x' }], totalCount: 1 });
    const res = await call('PUT', { body: broker });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'This email already has an account' });
    expect(clerk.invitations.createInvitation).not.toHaveBeenCalled();
  });

  it('gives a clear error when an invite is already pending', async () => {
    clerk.invitations.getInvitationList.mockResolvedValue({ data: [{ id: 'inv_0', emailAddress: 'jane@example.com' }], totalCount: 1 });
    const res = await call('PUT', { body: broker });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'An invite is already pending for this email' });
  });

  it('lists pending invites next to users', async () => {
    clerk.invitations.getInvitationList.mockResolvedValue({
      data: [{ id: 'inv_1', emailAddress: 'jane@example.com', createdAt: 1, publicMetadata: { role: 'user', brokerName: 'Jane Doe', invitedName: 'Jane Doe' } }],
      totalCount: 1,
    });
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(clerk.invitations.getInvitationList).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect((res.body as { invites: unknown[] }).invites).toEqual([
      { id: 'inv_1', email: 'jane@example.com', name: 'Jane Doe', createdAt: 1, role: 'user', brokerName: 'Jane Doe' },
    ]);
  });

  it('revokes an invite', async () => {
    const res = await call('DELETE', { query: { invitationId: 'inv_1' } });
    expect(res.statusCode).toBe(200);
    expect(clerk.invitations.revokeInvitation).toHaveBeenCalledWith('inv_1');
    expect(clerk.users.deleteUser).not.toHaveBeenCalled();
  });
});
