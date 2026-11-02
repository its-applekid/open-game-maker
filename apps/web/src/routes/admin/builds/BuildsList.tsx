import { useState } from 'react';
import { Link } from 'react-router';

import { formatUnits } from '../../../features/build-chat/units';
import { useAdminBuilds, useAdminSettings } from '../api';
import { Rollups } from './Rollups';

export function BuildsList() {
  const data = useAdminBuilds();
  const settings = useAdminSettings();
  const [gameId, setGameId] = useState('');
  const [memberId, setMemberId] = useState('');
  if (data.isPending || settings.isPending) return <p className="admin-state">Loading builds…</p>;
  if (data.isError || settings.isError) return <p className="admin-state">Not allowed</p>;
  const builds = data.data.builds.filter(
    ({ game, member }) => (!gameId || game.id === gameId) && (!memberId || member.userId === memberId),
  );
  return (
    <section>
      <p className="admin-kicker">Analytics</p>
      <h2>Builds</h2>
      <div className="admin-filters">
        <label>
          Game
          <select value={gameId} onChange={(event) => setGameId(event.target.value)}>
            <option value="">All games</option>
            {data.data.games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Member
          <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>
            <option value="">All members</option>
            {data.data.members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.email}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Game</th>
              <th scope="col">Member</th>
              <th scope="col">Kind</th>
              <th scope="col">State</th>
              <th scope="col">Cost</th>
              <th scope="col">Retries</th>
              <th scope="col">Duration</th>
            </tr>
          </thead>
          <tbody>
            {builds.map(({ job, game, member, retries }) => (
              <tr key={job.id}>
                <td data-label="Game">
                  <Link to={job.id}>{game.title}</Link>
                </td>
                <td data-label="Member">{member.email ?? 'Unknown'}</td>
                <td data-label="Kind">{job.kind}</td>
                <td data-label="State">{job.state}</td>
                <td data-label="Cost">
                  {formatUnits(job.usageMicroUsd, settings.data.unitLabel, settings.data.microUsdPerUnit)}
                </td>
                <td data-label="Retries">{retries}</td>
                <td data-label="Duration">{formatDuration(job.createdAt, job.terminalAt ?? job.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Rollups games={data.data.games} members={data.data.members} />
    </section>
  );
}

function formatDuration(start: string, end: string): string {
  const minutes = Math.max(0, Date.parse(end) - Date.parse(start)) / 60_000;
  return minutes < 1 ? '<1 min' : `${Math.round(minutes)} min`;
}
