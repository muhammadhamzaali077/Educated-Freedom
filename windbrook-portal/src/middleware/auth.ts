import type { MiddlewareHandler } from 'hono';
import { auth, type AuthSession, type AuthUser } from '../auth/index.js';

export type AuthVars = {
  user: AuthUser;
  session: AuthSession;
};

const PUBLIC_PREFIXES = ['/login', '/api/auth/', '/css/', '/vendor/', '/fonts/', '/js/', '/healthz'];

export const requireSession: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
  const path = c.req.path;
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return next();
  }

  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) {
    if (c.req.header('HX-Request')) {
      c.header('HX-Redirect', '/login');
      return c.body(null, 204);
    }
    return c.redirect('/login');
  }

  c.set('user', result.user);
  c.set('session', result.session);
  return next();
};
