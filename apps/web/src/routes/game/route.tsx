import type { ScreenRoute } from '../../app/screen';
import { GameScreen } from './GameScreen';

export const route: ScreenRoute = {
  path: '/g/:gameId',
  element: <GameScreen />,
  chrome: 'app',
  auth: 'required',
  children: [
    { path: 'versions', element: <h2>Versions</h2> },
    { path: 'releases', element: <h2>Releases</h2> },
  ],
};
