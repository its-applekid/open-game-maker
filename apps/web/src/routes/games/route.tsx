import type { ScreenRoute } from '../../app/screen';
import { GamesScreen } from './GamesScreen';

export const route: ScreenRoute = {
  path: '/games',
  element: <GamesScreen />,
  chrome: 'app',
  auth: 'required',
};
