import { Navigate, useLocation } from 'react-router';

import type { ScreenRoute } from '../../app/screen';

// `/games` was the list's address before it moved to `/all`; old links and bookmarks land on the list (#513).
export function LegacyGamesRedirect() {
  const location = useLocation();
  return <Navigate replace to={`/all${location.search}`} />;
}

export const route: ScreenRoute = {
  path: '/games',
  element: <LegacyGamesRedirect />,
  chrome: 'app',
  auth: 'required',
};
