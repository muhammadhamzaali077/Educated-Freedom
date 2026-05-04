import { Hono } from 'hono';
import { z } from 'zod';
import { auth } from '../../auth/index.js';
import { LoginErrorFragment, LoginPage } from '../../views/pages/login.js';

const app = new Hono();

app.get('/login', (c) => c.html(<LoginPage />));

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.post('/login', async (c) => {
  const form = await c.req.parseBody();
  const parsed = loginSchema.safeParse({
    email: typeof form.email === 'string' ? form.email : '',
    password: typeof form.password === 'string' ? form.password : '',
  });

  if (!parsed.success) {
    c.status(400);
    return c.html(<LoginErrorFragment message="Email and password are required." />);
  }

  let response: Response;
  try {
    response = await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      asResponse: true,
    });
  } catch {
    c.status(401);
    return c.html(<LoginErrorFragment message="Email or password is incorrect." />);
  }

  if (!response.ok) {
    c.status(401);
    return c.html(<LoginErrorFragment message="Email or password is incorrect." />);
  }

  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie')
        ? [response.headers.get('set-cookie') as string]
        : [];
  for (const cookie of setCookies) {
    c.header('set-cookie', cookie, { append: true });
  }

  c.header('HX-Redirect', '/dashboard');
  return c.body(null, 204);
});

export default app;
