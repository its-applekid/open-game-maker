import { useNavigate } from 'react-router';

import type { GameExtraProps } from '../extras';

export function VersionControls({ gameId, branchId }: GameExtraProps) {
  const navigate = useNavigate();
  const query = `?v=${encodeURIComponent(branchId)}`;
  return (
    <div className="version-controls" role="group" aria-label="Versions and releases">
      <button
        className="tap-secondary"
        type="button"
        aria-label="Versions"
        onClick={() => navigate(`/g/${encodeURIComponent(gameId)}/versions${query}`)}
      >
        <span aria-hidden="true">⑂</span>
      </button>
      <button
        className="tap-secondary"
        type="button"
        aria-label="Releases"
        onClick={() => navigate(`/g/${encodeURIComponent(gameId)}/releases${query}`)}
      >
        <span aria-hidden="true">★</span>
      </button>
    </div>
  );
}
