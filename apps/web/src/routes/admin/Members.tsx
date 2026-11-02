import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { adminKeys, adminRequest, invalidateAdmin, useAdminMe, useMembers } from './api';
import { ConfirmDialog } from './ConfirmDialog';
import type { AdminMember } from './types';

type PendingAction =
  { kind: 'role'; member: AdminMember; role: 'admin' | 'member' } | { kind: 'remove'; member: AdminMember };

export function Members() {
  const me = useAdminMe();
  const members = useMembers();
  const role = useMutation({
    mutationFn: ({ userId, nextRole }: { userId: string; nextRole: 'admin' | 'member' }) =>
      adminRequest(`/admin/members/${encodeURIComponent(userId)}`, { method: 'PATCH', json: { role: nextRole } }),
    onSuccess: () => invalidateAdmin(adminKeys.members(), adminKeys.me()),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => adminRequest(`/admin/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    onSuccess: () => invalidateAdmin(adminKeys.members()),
  });

  if (members.isPending || me.isPending) return <p className="admin-state">Loading members…</p>;
  if (members.isError || me.isError) return <p className="admin-state">Not allowed</p>;
  return (
    <section>
      <div className="admin-title-row">
        <div>
          <p className="admin-kicker">Family</p>
          <h2>Members</h2>
        </div>
      </div>
      <MembersTable
        busy={role.isPending || remove.isPending}
        currentUserId={me.data.user.id}
        error={role.isError || remove.isError}
        members={members.data.members}
        onChangeRole={(userId, nextRole) => role.mutateAsync({ userId, nextRole })}
        onRemove={(userId) => remove.mutateAsync(userId)}
        onPrepare={() => {
          role.reset();
          remove.reset();
        }}
      />
    </section>
  );
}

export function MembersTable({
  currentUserId,
  busy = false,
  error = false,
  members,
  onChangeRole,
  onRemove,
  onPrepare = () => undefined,
}: {
  currentUserId: string;
  busy?: boolean;
  error?: boolean;
  members: AdminMember[];
  onChangeRole(userId: string, role: 'admin' | 'member'): void | Promise<unknown>;
  onRemove(userId: string): void | Promise<unknown>;
  onPrepare?(): void;
}) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const openPending = (next: PendingAction) => {
    onPrepare();
    setPending(next);
  };
  const confirm = async () => {
    if (!pending || busy) return;
    try {
      if (pending.kind === 'role') await onChangeRole(pending.member.userId, pending.role);
      else await onRemove(pending.member.userId);
      setPending(null);
    } catch {
      // The dialog stays open and renders the mutation error supplied by the parent.
    }
  };

  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Role</th>
              <th scope="col">Access</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const immutable = member.role === 'owner' || member.userId === currentUserId;
              return (
                <tr key={member.userId}>
                  <td data-label="Member">{member.email}</td>
                  <td data-label="Role">{member.role}</td>
                  <td data-label="Access">{member.capability}</td>
                  <td data-label="Actions">
                    <div className="admin-row-actions">
                      {!immutable ? (
                        <button
                          className="admin-secondary tap-secondary"
                          type="button"
                          onClick={() =>
                            openPending({ kind: 'role', member, role: member.role === 'admin' ? 'member' : 'admin' })
                          }
                        >
                          {member.role === 'admin' ? 'Remove admin' : 'Make admin'}
                        </button>
                      ) : null}
                      {!immutable && member.role === 'member' ? (
                        <button
                          aria-label={`Remove ${member.email}`}
                          className="admin-secondary tap-secondary"
                          type="button"
                          onClick={() => openPending({ kind: 'remove', member })}
                        >
                          Remove member
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pending ? (
        <ConfirmDialog
          busy={busy}
          error={error ? 'Change could not be saved. Try again.' : undefined}
          title={pending.kind === 'remove' ? 'Remove member?' : 'Change admin role?'}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
        >
          <p>{pending.member.email}</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
