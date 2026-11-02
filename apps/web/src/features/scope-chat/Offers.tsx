import type { AllowanceExceeded } from '@ogm/contracts';

const LABELS: Record<AllowanceExceeded['offers'][number], string> = {
  trim: 'Trim it',
  split: 'Split it',
  queue: 'Queue for the reset',
  ask_admin: 'Ask an admin',
};

export function Offers({
  offers,
  disabled = false,
  onChoose,
}: {
  offers: AllowanceExceeded['offers'];
  disabled?: boolean;
  onChoose(offer: AllowanceExceeded['offers'][number]): void;
}) {
  return (
    <section className="scope-offers" aria-label="Build options">
      {offers.map((offer) => (
        <button className="tap-secondary" disabled={disabled} key={offer} type="button" onClick={() => onChoose(offer)}>
          {LABELS[offer]}
        </button>
      ))}
    </section>
  );
}
