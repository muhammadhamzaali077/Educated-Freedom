import { Hono } from 'hono';
import { auth } from '../../auth/index.js';
import { loadDashboardData } from '../../lib/reports.js';
import type { AuthVars } from '../../middleware/auth.js';
import { DashboardHome } from '../../views/pages/dashboard.js';

const app = new Hono<{ Variables: AuthVars }>();

app.get('/dashboard', async (c) => {
  const user = c.get('user');
  const role = (user as { role?: string | null }).role ?? null;
  const data = await loadDashboardData();
  return c.html(<DashboardHome userName={user.name} userRole={role} data={data} />);
});

app.post('/logout', async (c) => {
  const response = await auth.api.signOut({
    headers: c.req.raw.headers,
    asResponse: true,
  });
  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie')
        ? [response.headers.get('set-cookie') as string]
        : [];
  for (const cookie of setCookies) {
    c.header('set-cookie', cookie, { append: true });
  }
  if (c.req.header('HX-Request')) {
    c.header('HX-Redirect', '/login');
    return c.body(null, 204);
  }
  return c.redirect('/login');
});

export default app;
