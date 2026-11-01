import { Outlet } from 'react-router';

import type { ScreenRoute } from '../../app/screen';

export const route: ScreenRoute = {
  path: '/admin',
  element: (
    <>
      <h1>Admin</h1>
      <Outlet />
    </>
  ),
  chrome: 'app',
  auth: 'required',
  children: [
    { path: 'members', element: <h2>Members</h2> },
    { path: 'invites', element: <h2>Invites</h2> },
    { path: 'budgets', element: <h2>Budgets</h2> },
    { path: 'builds', element: <h2>Builds</h2> },
    { path: 'intake', element: <h2>Intake</h2> },
  ],
};
