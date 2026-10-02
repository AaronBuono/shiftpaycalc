import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthForm } from '@/components/auth/auth-form';
import { getDb, schema } from '@/db';
import { getSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  if (await getSession()) redirect('/');
  const { invite } = await searchParams;
  let inviteEmail: string | undefined;
  let invalid = false;
  if (typeof invite === 'string' && invite) {
    const db = await getDb();
    const [row] = await db
      .select({ email: schema.invites.email })
      .from(schema.invites)
      .where(and(eq(schema.invites.token, invite), isNull(schema.invites.usedAt), gt(schema.invites.expiresAt, new Date())));
    inviteEmail = row?.email;
    invalid = !row;
  }
  return (
    <div className="grid w-full max-w-sm gap-4">
      {invalid && (
        <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
          This invite link has expired or was already used.
        </p>
      )}
      <AuthForm mode="signup" googleEnabled={!!process.env.GOOGLE_CLIENT_ID} inviteEmail={inviteEmail} />
    </div>
  );
}
