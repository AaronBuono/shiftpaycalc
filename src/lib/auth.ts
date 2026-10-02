import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getDb, schema, type Db } from '@/db';

export function isAdminEmail(email: string | null | undefined) {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return !!admin && email?.trim().toLowerCase() === admin;
}

async function findOpenInvite(db: Db, email: string) {
  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.email, email.trim().toLowerCase()),
        isNull(schema.invites.usedAt),
        gt(schema.invites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return invite;
}

function createAuth(db: Db) {
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
      : undefined;

  return betterAuth({
    appName: 'Shift Pay',
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    socialProviders: google,
    user: {
      // Invite-only: an account can only be created for ADMIN_EMAIL or an
      // email with an open invite — for both password and Google sign-up.
      validateUserInfo: async ({ user, source }) => {
        if (source.action !== 'create-user') return;
        const email = String(user.email ?? '');
        if (isAdminEmail(email) || (await findOpenInvite(db, email))) return;
        return { error: 'invite_required', errorDescription: 'Sign-up is by invite only.' };
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await db
              .update(schema.invites)
              .set({ usedAt: new Date() })
              .where(and(eq(schema.invites.email, created.email.toLowerCase()), isNull(schema.invites.usedAt)));
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __auth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  globalForAuth.__auth ??= getDb()
    .then(createAuth)
    .catch((err) => {
      globalForAuth.__auth = undefined;
      throw err;
    });
  return globalForAuth.__auth;
}

export const getSession = cache(async () => {
  // Read the request first: it marks the page dynamic before any DB access,
  // so `next build` never tries to connect to the database.
  const requestHeaders = await headers();
  const auth = await getAuth();
  return auth.api.getSession({ headers: requestHeaders });
});

/** For pages and server actions: the signed-in user, or redirect to /login. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect('/login');
  return session.user;
}
