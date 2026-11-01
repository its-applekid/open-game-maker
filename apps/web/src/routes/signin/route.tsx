import type { ScreenRoute } from '../../app/screen';

export const route: ScreenRoute = {
  path: '/signin',
  element: <h1>Sign in</h1>,
  chrome: 'bare',
  auth: 'none',
};
