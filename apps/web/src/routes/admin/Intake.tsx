import { useIntake } from './api';
import type { IntakeStatus } from './types';

export function Intake() {
  const intake = useIntake();
  if (intake.isPending) return <p className="admin-state">Loading intake…</p>;
  if (intake.isError) return <p className="admin-state">Not allowed</p>;
  return <IntakeSummary data={intake.data} />;
}

export function IntakeSummary({ data, now = Date.now() }: { data: IntakeStatus; now?: number }) {
  const counts = {
    Pending: data.drops.filter(({ status }) => status === 'queued' || status === 'awaiting-license').length,
    Downloaded: data.drops.filter(({ status }) => status === 'imported').length,
    Skipped: data.drops.filter(({ status }) => status === 'duplicate').length,
    Rejected: data.drops.filter(({ status }) => status === 'blocked').length,
    Failed: data.parseErrors,
  };
  const observedAt = data.drops[0]?.time;
  const stale = observedAt ? now - Date.parse(observedAt) > 15 * 60_000 : false;
  return (
    <section>
      <p className="admin-kicker">Drive listener</p>
      <h2>Intake</h2>
      {observedAt ? (
        <p>
          Observed {new Date(observedAt).toLocaleString()}
          {stale ? ' · stale' : ''}
        </p>
      ) : (
        <p>No intake reports yet.</p>
      )}
      <div className="admin-stat-grid">
        {Object.entries(counts).map(([label, value]) => (
          <article className="admin-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Drop</th>
              <th scope="col">State</th>
              <th scope="col">Collection</th>
              <th scope="col">Problems</th>
              <th scope="col">Observed</th>
            </tr>
          </thead>
          <tbody>
            {data.drops.map((drop) => (
              <tr key={drop.dropId}>
                <td data-label="Drop">{drop.name}</td>
                <td data-label="State">{drop.status}</td>
                <td data-label="Collection">{drop.collection ?? '—'}</td>
                <td data-label="Problems">{drop.problems}</td>
                <td data-label="Observed">{new Date(drop.time).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
