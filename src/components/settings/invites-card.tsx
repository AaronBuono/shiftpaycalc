'use client';

import { Copy } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { createInvite, revokeInvite } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Invite = { token: string; email: string; status: 'pending' | 'joined' | 'expired' };

export function InvitesCard({ invites }: { invites: Invite[] }) {
  const [email, setEmail] = useState('');
  const [pending, startTransition] = useTransition();
  const link = (token: string) => `${window.location.origin}/signup?invite=${token}`;

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(link(token));
      toast.success('Invite link copied');
    } catch {
      toast.message(link(token));
    }
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createInvite(email);
      if (res.ok && res.data) {
        setEmail('');
        await copy(res.data.token);
      } else if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={create} className="flex max-w-md gap-2">
        <Input type="email" required placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Invite email" />
        <Button type="submit" disabled={pending} className="h-10 px-4">
          Create invite
        </Button>
      </form>
      <p className="text-muted-foreground -mt-2 text-xs">
        The link only works for that email address and expires after 14 days. Send it to them yourself.
      </p>
      {invites.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {invites.map((i) => {
            const status = { pending: 'Pending', joined: 'Joined', expired: 'Expired' }[i.status];
            return (
              <li key={i.token} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="truncate">{i.email}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={status === 'Pending' ? 'text-evening text-xs' : 'text-muted-foreground text-xs'}>{status}</span>
                  {status === 'Pending' && (
                    <>
                      <Button size="icon-sm" variant="ghost" aria-label="Copy link" onClick={() => copy(i.token)}>
                        <Copy />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={pending}
                        onClick={() => startTransition(async () => void (await revokeInvite(i.token)))}
                      >
                        Revoke
                      </Button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
