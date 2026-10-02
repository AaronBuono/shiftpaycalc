import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthForm } from '@/components/auth/auth-form';
import { getSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  if (await getSession()) redirect('/');
  const { error } = await searchParams;
  return (
    <div className="grid w-full max-w-sm gap-4">
      {error && (
        <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
          {error === 'invite' ? 'That Google account doesn’t have an invite.' : 'Sign-in failed. Try again.'}
        </p>
      )}
      <AuthForm mode="login" googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />
    </div>
  );
}
