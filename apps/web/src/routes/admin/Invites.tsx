import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { adminKeys, adminRequest, invalidateAdmin, useAdminSettings, useInvites } from './api';
import { ConfirmDialog } from './ConfirmDialog';
import type { AdminInvitation } from './types';

type Pending =
  | { kind: 'create'; email: string; capability: 'creator' | 'player' }
  | { kind: 'revoke'; invite: AdminInvitation }
  | { kind: 'friends'; enabled: boolean };

export function Invites() {
  const invites = useInvites();
  const settings = useAdminSettings();
  const [email, setEmail] = useState('');
  const [capability, setCapability] = useState<'creator' | 'player'>('player');
  const [pending, setPending] = useState<Pending | null>(null);
  const create = useMutation({
    mutationFn: (value: Extract<Pending, { kind: 'create' }>) =>
      adminRequest('/invites', {
        method: 'POST',
        json: { kind: 'member', email: value.email, capability: value.capability },
      }),
    onSuccess: async () => {
      setEmail('');
      await invalidateAdmin(adminKeys.invites());
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => adminRequest(`/admin/invites/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => invalidateAdmin(adminKeys.invites()),
  });
  const friends = useMutation({
    mutationFn: (friendsAllowed: boolean) =>
      adminRequest('/admin/settings', { method: 'PATCH', json: { friendsAllowed } }),
    onSuccess: () => invalidateAdmin(adminKeys.settings()),
  });
  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'create') create.mutate(pending);
    else if (pending.kind === 'revoke') revoke.mutate(pending.invite.id);
    else friends.mutate(pending.enabled);
    setPending(null);
  };

  if (invites.isPending || settings.isPending) return <p className="admin-state">Loading invitations…</p>;
  if (invites.isError || settings.isError) return <p className="admin-state">Not allowed</p>;
  return (
    <section>
      <p className="admin-kicker">Family</p>
      <h2>Invitations</h2>
      <form
        className="admin-form admin-card"
        onSubmit={(event) => {
          event.preventDefault();
          setPending({ kind: 'create', email, capability });
        }}
      >
        <label>
          Email
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Access
          <select value={capability} onChange={(event) => setCapability(event.target.value as 'creator' | 'player')}>
            <option value="player">Player</option>
            <option value="creator">Creator</option>
          </select>
        </label>
        <button className="admin-primary tap-primary" type="submit">
          Create invite
        </button>
      </form>
      <button
        aria-checked={settings.data.friendsAllowed}
        className="admin-toggle tap-secondary"
        role="switch"
        type="button"
        onClick={() => setPending({ kind: 'friends', enabled: !settings.data.friendsAllowed })}
      >
        <span>Friends can receive play invites</span>
        <span>{settings.data.friendsAllowed ? 'On' : 'Off'}</span>
      </button>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Kind</th>
              <th scope="col">State</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.data.invitations.map((invite) => (
              <tr key={invite.id}>
                <td data-label="Email">{invite.email}</td>
                <td data-label="Kind">{invite.kind}</td>
                <td data-label="State">{inviteState(invite)}</td>
                <td data-label="Actions">
                  {inviteState(invite) === 'pending' ? (
                    <button
                      className="admin-secondary tap-secondary"
                      type="button"
                      onClick={() => setPending({ kind: 'revoke', invite })}
                    >
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pending ? (
        <ConfirmDialog title="Confirm invitation change?" onCancel={() => setPending(null)} onConfirm={confirm}>
          <p>
            {pending.kind === 'create'
              ? pending.email
              : pending.kind === 'revoke'
                ? pending.invite.email
                : pending.enabled
                  ? 'Allow play invitations'
                  : 'Stop play invitations'}
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function inviteState(invite: AdminInvitation): 'accepted' | 'revoked' | 'expired' | 'pending' {
  if (invite.acceptedAt) return 'accepted';
  if (invite.revokedAt) return 'revoked';
  if (Date.parse(invite.expiresAt) <= Date.now()) return 'expired';
  return 'pending';
}
