import type { ScreenRoute } from '../../app/screen';
import { GameScreen } from './GameScreen';
import { gameExtraRoutes } from './extras';

export const route: ScreenRoute = {
  path: '/g/:gameId',
  element: <GameScreen />,
  chrome: 'app',
  auth: 'required',
  children: gameExtraRoutes,
};
