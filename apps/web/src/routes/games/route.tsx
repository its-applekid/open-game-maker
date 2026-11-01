import type { ScreenRoute } from '../../app/screen';

export const route: ScreenRoute = {
  path: '/games',
  element: <h1>Games</h1>,
  chrome: 'app',
  auth: 'required',
};
