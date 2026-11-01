import { Outlet } from 'react-router';

import type { ScreenRoute } from '../../app/screen';

export const route: ScreenRoute = {
  path: '/g/:gameId',
  element: (
    <>
      <h1>Game</h1>
      <Outlet />
    </>
  ),
  chrome: 'app',
  auth: 'required',
  children: [
    { path: 'versions', element: <h2>Versions</h2> },
    { path: 'releases', element: <h2>Releases</h2> },
  ],
};
