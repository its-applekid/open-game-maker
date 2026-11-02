import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { adminKeys, adminRequest, invalidateAdmin, useAdminBuilds } from './api';
import { ConfirmDialog } from './ConfirmDialog';
import type { AdminGame } from './types';

type Action = { kind: 'delist' | 'flag'; game: AdminGame };

export function Oversight() {
  const data = useAdminBuilds();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState<'spam' | 'harmful' | 'other'>('harmful');
  const delist = useMutation({
    mutationFn: (gameId: string) =>
      adminRequest(`/admin/games/${encodeURIComponent(gameId)}/delist`, { method: 'POST' }),
    onSuccess: () => invalidateAdmin(adminKeys.games(), adminKeys.builds()),
  });
  const flag = useMutation({
    mutationFn: (gameId: string) =>
      adminRequest(`/admin/games/${encodeURIComponent(gameId)}/flag-abuse`, { method: 'POST', json: { reason } }),
    onSuccess: () => invalidateAdmin(adminKeys.games()),
  });
  const confirm = () => {
    if (!action) return;
    if (action.kind === 'delist') delist.mutate(action.game.id);
    else flag.mutate(action.game.id);
    setAction(null);
  };

  if (data.isPending) return <p className="admin-state">Loading games…</p>;
  if (data.isError) return <p className="admin-state">Not allowed</p>;
  const latest = new Map<string, (typeof data.data.builds)[number]>();
  for (const build of data.data.builds) if (!latest.has(build.game.id)) latest.set(build.game.id, build);
  const owners = new Map(data.data.members.map((member) => [member.userId, member.email]));

  return (
    <section>
      <p className="admin-kicker">Family</p>
      <h2>Game oversight</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Game</th>
              <th scope="col">Owner</th>
              <th scope="col">Visibility</th>
              <th scope="col">Published version</th>
              <th scope="col">Last build</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.data.games.map((game) => (
              <tr key={game.id}>
                <td data-label="Game">{game.title}</td>
                <td data-label="Owner">{owners.get(game.ownerId) ?? 'Unknown'}</td>
                <td data-label="Visibility">{game.delistedAt ? 'delisted' : game.visibility}</td>
                <td data-label="Published version">Unknown</td>
                <td data-label="Last build">{latest.get(game.id)?.job.state ?? 'No builds'}</td>
                <td data-label="Actions">
                  <div className="admin-row-actions">
                    {!game.delistedAt ? (
                      <button
                        className="admin-secondary tap-primary"
                        type="button"
                        onClick={() => setAction({ kind: 'delist', game })}
                      >
                        Delist
                      </button>
                    ) : null}
                    <button
                      className="admin-secondary tap-secondary"
                      type="button"
                      onClick={() => setAction({ kind: 'flag', game })}
                    >
                      Flag abuse
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {action ? (
        <ConfirmDialog
          title={action.kind === 'delist' ? 'Delist this game?' : 'Flag this game?'}
          onCancel={() => setAction(null)}
          onConfirm={confirm}
        >
          <p>{action.game.title}</p>
          {action.kind === 'flag' ? (
            <label>
              Reason
              <select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
                <option value="spam">Spam</option>
                <option value="harmful">Harmful</option>
                <option value="other">Other</option>
              </select>
            </label>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
