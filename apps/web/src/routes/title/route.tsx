import type { ScreenRoute } from '../../app/screen';
import { TitleScreen } from './TitleScreen';

export const route: ScreenRoute = {
  path: '/',
  element: <TitleScreen />,
  chrome: 'bare',
  auth: 'none',
};
