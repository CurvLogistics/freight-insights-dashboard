export const config = { matcher: '/:path*' };

export default function middleware(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    const [user, pass] = atob(auth.slice(6)).split(':');
    if (user === process.env.DASHBOARD_USER && pass === process.env.DASHBOARD_PASSWORD) return;
  }
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="FreightOps"' },
  });
}