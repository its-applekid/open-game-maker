import { useMemo, useState } from 'react';

import type { ReapplyReport } from '@ogm/contracts/browser';

type ReapplyCardProps = {
  report: ReapplyReport;
  onConfirm(choices: Record<string, unknown>): void;
};

export function ReapplyCard({ report, onConfirm }: ReapplyCardProps) {
  const [choices, setChoices] = useState<Record<string, unknown>>({});
  const required = useMemo(
    () => [...report.needsChoice.map(({ key }) => key), ...report.conflicts.map(({ key }) => key)],
    [report],
  );
  const choose = (key: string, value: unknown) => setChoices((current) => ({ ...current, [key]: value }));
  const complete = required.every((key) => Object.hasOwn(choices, key));

  return (
    <section className="reapply-card" aria-label="Apply the new build">
      <h2>Review your changes</h2>
      <ReportGroup title="Carried" count={report.carried.length}>
        {report.carried.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ReportGroup>
      <ReportGroup title="Renamed" count={report.renamed.length}>
        {report.renamed.map(({ from, to }) => (
          <li key={from}>{`${from} → ${to}`}</li>
        ))}
      </ReportGroup>
      <ReportGroup title="Needs a choice" count={report.needsChoice.length}>
        {report.needsChoice.map(({ key, mine, allowed }) => (
          <li key={key}>
            <span>{key}</span>
            <button className="tap-secondary" type="button" onClick={() => choose(key, mine)}>
              {`Keep my ${key}`}
            </button>
            <button className="tap-secondary" type="button" onClick={() => choose(key, allowed)}>
              {`Use allowed ${key}`}
            </button>
          </li>
        ))}
      </ReportGroup>
      <ReportGroup title="Conflicts" count={report.conflicts.length}>
        {report.conflicts.map(({ key, mine, builder }) => (
          <li key={key}>
            <span>{key}</span>
            <button className="tap-secondary" type="button" onClick={() => choose(key, mine)}>
              {`Keep my ${key}`}
            </button>
            <button className="tap-secondary" type="button" onClick={() => choose(key, builder)}>
              {`Use builder ${key}`}
            </button>
          </li>
        ))}
      </ReportGroup>
      <ReportGroup title="Dropped" count={report.dropped.length}>
        {report.dropped.map(({ key, reason }) => (
          <li key={key}>{`${key} — ${reason}`}</li>
        ))}
      </ReportGroup>
      <button className="tap-primary" type="button" disabled={!complete} onClick={() => onConfirm(choices)}>
        Apply update
      </button>
    </section>
  );
}

function ReportGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h3>{`${title} ${count}`}</h3>
      {count > 0 ? <ul>{children}</ul> : null}
    </section>
  );
}
