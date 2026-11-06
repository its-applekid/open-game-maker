import { Navigate, useLocation } from 'react-router';

import type { ScreenRoute } from '../../app/screen';

// The one sign-in URL an operator shares with testers. It keeps the query string, so `/login?next=/g/x`
// lands on the same place `/signin?next=/g/x` does.
export function LoginRedirect() {
  const location = useLocation();
  return <Navigate replace to={`/signin${location.search}`} />;
}

export const route: ScreenRoute = {
  path: '/login',
  element: <LoginRedirect />,
  chrome: 'bare',
  auth: 'none',
};
