import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { logger } from 'hono/logger';
import { auth } from './auth/index.js';
import { requireSession, type AuthVars } from './middleware/auth.js';
import loginRoutes from './routes/pages/login.js';
import dashboardRoutes from './routes/pages/dashboard.js';
import clientsRoutes from './routes/pages/clients.js';
import reportsRoutes from './routes/pages/reports.js';
import devSacsRoutes from './routes/pages/dev-sacs.js';
import devTccRoutes from './routes/pages/dev-tcc.js';
import canvaRoutes from './routes/pages/canva.js';
import { NotFoundPage, ServerErrorPage } from './views/pages/error-pages.js';
import { sqlite } from './db/client.js';
import dashboardPartials from './routes/partials/dashboard.js';

export const app = new Hono<{ Variables: AuthVars }>();

app.use('*', logger());

app.use('/css/*', serveStatic({ root: './public' }));
app.use('/vendor/*', serveStatic({ root: './public' }));
app.use('/fonts/*', serveStatic({ root: './public' }));
app.use('/js/*', serveStatic({ root: './public' }));

app.get('/healthz', (c) => {
  try {
    const r = sqlite.prepare('SELECT 1 as ok').get() as { ok: number } | undefined;
    if (r?.ok !== 1) return c.json({ status: 'unhealthy' }, 503);
    return c.json({ status: 'ok' }, 200);
  } catch (err) {
    return c.json({ status: 'unhealthy', error: String(err) }, 503);
  }
});

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.use('*', requireSession);

app.route('/', loginRoutes);
app.get('/', (c) => c.redirect('/dashboard'));
app.route('/', dashboardRoutes);
app.route('/', dashboardPartials);
app.route('/', clientsRoutes);
app.route('/', reportsRoutes);
app.route('/', devSacsRoutes);
app.route('/', devTccRoutes);
app.route('/', canvaRoutes);

app.notFound((c) => c.html(<NotFoundPage />, 404));
app.onError((err, c) => {
  console.error(err);
  return c.html(<ServerErrorPage />, 500);
});
