import type { ScreenRoute } from '../../app/screen';
import { GameScreen } from './GameScreen';
import { versionsRoute } from './versions/route';

export const route: ScreenRoute = {
  path: '/g/:gameId',
  element: <GameScreen />,
  chrome: 'app',
  auth: 'required',
  children: [versionsRoute, { path: 'releases', element: <h2>Releases</h2> }],
};
