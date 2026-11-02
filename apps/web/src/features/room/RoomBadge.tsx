import { useState } from 'react';

import type { Membership } from '@ogm/contracts';

import { MembersPopover } from './MembersPopover';

type RoomBadgeProps = {
  members: Record<string, Membership>;
  onEnd(): void;
  onKick(userId: string): void;
  owner: boolean;
};

export function RoomBadge(props: RoomBadgeProps) {
  const [open, setOpen] = useState(false);
  const count = Object.values(props.members).filter((member) => member.connected).length;
  return (
    <span className="room-badge-wrap">
      <button
        className="room-badge tap-primary"
        type="button"
        aria-expanded={open}
        aria-label={`${count} room ${count === 1 ? 'member' : 'members'}`}
        onClick={() => setOpen((current) => !current)}
      >
        {count}
      </button>
      {open ? <MembersPopover {...props} /> : null}
    </span>
  );
}
