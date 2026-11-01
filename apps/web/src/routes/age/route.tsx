import type { ScreenRoute } from '../../app/screen';
import { AgeScreen } from './AgeScreen';

export const route: ScreenRoute = {
  path: '/age',
  element: <AgeScreen />,
  chrome: 'bare',
  auth: 'none',
};
