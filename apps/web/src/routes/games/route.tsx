import type { ScreenRoute } from '../../app/screen';
import { GamesScreen } from './GamesScreen';

// The library lives at `/all`; `/games` is only a redirect to it (#513).
export const route: ScreenRoute = {
  path: '/all',
  element: <GamesScreen />,
  chrome: 'app',
  auth: 'required',
};
