import type { ScreenRoute } from '../../app/screen';

export const route: ScreenRoute = {
  path: '/connect/github',
  element: <h1>Connect GitHub</h1>,
  chrome: 'app',
  auth: 'none',
};
