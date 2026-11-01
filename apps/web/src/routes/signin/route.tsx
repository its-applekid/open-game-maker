import type { ScreenRoute } from '../../app/screen';
import { SignInScreen } from './SignInScreen';

export const route: ScreenRoute = {
  path: '/signin',
  element: <SignInScreen />,
  chrome: 'bare',
  auth: 'none',
};
