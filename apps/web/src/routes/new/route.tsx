import type { ScreenRoute } from '../../app/screen';
import { NewGameScreen } from './NewGameScreen';

export const route: ScreenRoute = {
  path: '/new',
  element: <NewGameScreen />,
  chrome: 'app',
  auth: 'required',
};
