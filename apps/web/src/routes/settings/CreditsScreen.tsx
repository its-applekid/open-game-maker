import { useQuery } from '@tanstack/react-query';

import { CreditsList } from './CreditsList';
import { getCredits } from './credits';
import { SOFTWARE_NOTICES } from './notices';

export function CreditsScreen() {
  const credits = useQuery({ queryKey: ['credits'], queryFn: () => getCredits() });

  return (
    <section className="credits-screen">
      <h2>Credits</h2>
      {credits.isPending ? <p>Loading…</p> : null}
      {credits.isError ? <p role="alert">Unavailable</p> : null}
      {credits.data ? <CreditsList packs={credits.data.packs} /> : null}
      <section className="software-notices">
        <h3>Third-party software</h3>
        <ul>
          {SOFTWARE_NOTICES.map((notice) => (
            <li key={notice.name}>
              <a href={notice.source} rel="noreferrer">
                {notice.name}
              </a>
              <span>{notice.license}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
