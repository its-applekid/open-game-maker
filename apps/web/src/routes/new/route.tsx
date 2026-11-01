import type { ScreenRoute } from '../../app/screen';

export const route: ScreenRoute = {
  path: '/new',
  element: <h1>New game</h1>,
  chrome: 'app',
  auth: 'required',
};
