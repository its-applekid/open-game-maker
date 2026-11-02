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
        currentUserId={me.data.user.id}
        members={members.data.members}
        onChangeRole={(userId, nextRole) => role.mutate({ userId, nextRole })}
        onRemove={(userId) => remove.mutate(userId)}
      />
    </section>
  );
}

export function MembersTable({
  currentUserId,
  members,
  onChangeRole,
  onRemove,
}: {
  currentUserId: string;
  members: AdminMember[];
  onChangeRole(userId: string, role: 'admin' | 'member'): void;
  onRemove(userId: string): void;
}) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'role') onChangeRole(pending.member.userId, pending.role);
    else onRemove(pending.member.userId);
    setPending(null);
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
                            setPending({ kind: 'role', member, role: member.role === 'admin' ? 'member' : 'admin' })
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
                          onClick={() => setPending({ kind: 'remove', member })}
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
