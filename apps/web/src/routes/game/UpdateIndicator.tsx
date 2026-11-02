import { useCallback, useEffect, useRef, useState } from 'react';

import type { PublishedCapability } from '../../features/editor/api';
import { getOptionalPublished } from '../../features/editor/api';

export type PublishedApi = (gameId: string, etag?: string) => Promise<PublishedCapability>;

export function UpdateIndicator({
  api = getOptionalPublished,
  currentBuildId,
  gameId,
  onError,
  onPublishedBuild,
  onUpdate,
}: {
  api?: PublishedApi;
  currentBuildId: string;
  gameId: string;
  onError?(error: unknown): void;
  onPublishedBuild?(buildId: string | undefined): void;
  onUpdate(): void;
}) {
  const etagRef = useRef<string | undefined>(undefined);
  const [publishedBuildId, setPublishedBuildId] = useState<string | undefined>(undefined);
  const poll = useCallback(async () => {
    const result = await api(gameId, etagRef.current);
    if (!result.available) {
      setPublishedBuildId(undefined);
      onPublishedBuild?.(undefined);
      return;
    }
    if (result.etag !== undefined) etagRef.current = result.etag;
    if (result.modified) {
      setPublishedBuildId(result.value.buildId);
      onPublishedBuild?.(result.value.buildId);
    }
  }, [api, gameId, onPublishedBuild]);

  useEffect(() => {
    const run = () => void poll().catch((error: unknown) => onError?.(error));
    run();
    const interval = setInterval(run, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [onError, poll]);

  return publishedBuildId !== undefined && publishedBuildId !== currentBuildId ? (
    <button className="update-indicator tap-secondary" type="button" onClick={onUpdate}>
      Update available
    </button>
  ) : null;
}
