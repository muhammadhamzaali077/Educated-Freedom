import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';

const allowSignup = process.env.WINDBROOK_ALLOW_SIGNUP === 'true';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-rotate-before-deploy',
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.authAccount,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: false,
    disableSignUp: !allowSignup,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      role: { type: 'string', required: false },
    },
  },
  advanced: {
    cookiePrefix: 'windbrook',
  },
});

export type Auth = typeof auth;
type SessionShape = typeof auth.$Infer.Session;
export type AuthUser = SessionShape['user'];
export type AuthSession = SessionShape['session'];
