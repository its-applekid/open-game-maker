import type { ScreenRoute } from '../../app/screen';

export const route: ScreenRoute = {
  path: '/join/:inviteToken',
  element: <h1>Join</h1>,
  chrome: 'bare',
  auth: 'none',
};
