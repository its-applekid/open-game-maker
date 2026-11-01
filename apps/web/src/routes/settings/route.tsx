import type { ScreenRoute } from '../../app/screen';

export const route: ScreenRoute = {
  path: '/settings',
  element: <h1>Settings</h1>,
  chrome: 'app',
  auth: 'required',
};
