'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Logo } from '@/components/dashboard/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

type Mode = 'login' | 'signup';

export function AuthForm({ mode, googleEnabled, inviteEmail }: { mode: Mode; googleEnabled: boolean; inviteEmail?: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(inviteEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res =
        mode === 'login'
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ name: name || email.split('@')[0], email, password });
      if (res.error) {
        const msg = `${res.error.code ?? ''} ${res.error.message ?? ''}`;
        setError(/invite/i.test(msg) ? 'Sign-up is invite only. Ask for an invite link.' : (res.error.message ?? 'Something went wrong.'));
        return;
      }
      router.push('/');
      router.refresh();
    });
  }

  return (
    <div className="bg-card w-full max-w-sm rounded-2xl border p-6 shadow-xl sm:p-8">
      <div className="mb-6 flex items-center gap-2">
        <Logo className="size-9" />
        <span className="text-xl font-bold tracking-tight">Shift Pay</span>
      </div>
      <h1 className="text-lg font-medium">{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {mode === 'login' ? 'Your roster and pay, in one place.' : inviteEmail ? `Invite for ${inviteEmail}` : 'Sign-up is by invite only.'}
      </p>

      <form onSubmit={submit} className="grid gap-4">
        {mode === 'signup' && (
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            readOnly={!!inviteEmail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'signup' ? 10 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'signup' && <p className="text-muted-foreground text-xs">At least 10 characters.</p>}
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="text-muted-foreground my-4 flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" /> or <span className="bg-border h-px flex-1" />
          </div>
          <Button
            variant="secondary"
            className="h-10 w-full"
            disabled={pending}
            onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: '/', errorCallbackURL: '/login?error=invite' })}
          >
            Continue with Google
          </Button>
        </>
      )}

      <p className="text-muted-foreground mt-6 text-center text-sm">
        {mode === 'login' ? (
          <>
            Have an invite?{' '}
            <Link href="/signup" className="text-primary hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
