import type { ScreenRoute } from '../../app/screen';
import { GameScreen } from './GameScreen';
import { releasesRoute } from './releases/route';
import { versionsRoute } from './versions/route';

export const route: ScreenRoute = {
  path: '/g/:gameId',
  element: <GameScreen />,
  chrome: 'app',
  auth: 'required',
  children: [versionsRoute, releasesRoute],
};
