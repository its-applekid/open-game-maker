import { useEffect, useState } from 'react';

import { Icon } from '../../components/Icon';

type CopyLinkProps = { id: string; slug?: string | null; title: string };

// The canonical shareable address of a game: `origin/play/<slug>`, which resolves to the game and survives a rename
// (#513). Games written before slugs existed fall back to their id, which the same route resolves.
export function playPath(game: { id: string; slug?: string | null }): string {
  return `/play/${encodeURIComponent(game.slug ?? game.id)}`;
}

const RESET_MS = 1_500;

export function CopyLink({ id, slug, title }: CopyLinkProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className="game-copy"
      aria-label={`Copy link to ${title}`}
      data-copied={copied ? 'true' : undefined}
      onClick={(event) => {
        event.stopPropagation();
        const url = `${window.location.origin}${playPath({ id, slug })}`;
        // Browsers without the async clipboard API (an insecure context, an older webview) leave the control a no-op.
        void navigator.clipboard?.writeText(url).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      <Icon name="link" />
    </button>
  );
}
