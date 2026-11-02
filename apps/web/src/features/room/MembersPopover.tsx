import type { Membership } from '@ogm/contracts';

type MembersPopoverProps = {
  members: Record<string, Membership>;
  onEnd(): void;
  onKick(userId: string): void;
  owner: boolean;
};

export function MembersPopover({ members, onEnd, onKick, owner }: MembersPopoverProps) {
  const ordered = Object.values(members).sort((left, right) => left.playerIndex - right.playerIndex);
  return (
    <div className="members-popover" role="dialog" aria-label="Room members">
      <ul>
        {ordered.map((member) => (
          <li key={member.userId}>
            <span>{member.name}</span>
            <small>
              Player {member.playerIndex + 1} · {member.connected ? 'Connected' : 'Disconnected'}
            </small>
            {owner && member.role !== 'owner' ? (
              <button
                className="tap-secondary"
                type="button"
                aria-label={`Kick ${member.name}`}
                onClick={() => onKick(member.userId)}
              >
                Kick
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {owner ? (
        <button className="end-room" type="button" onClick={onEnd}>
          End room
        </button>
      ) : null}
    </div>
  );
}
