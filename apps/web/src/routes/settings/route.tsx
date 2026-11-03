import type { ScreenRoute } from '../../app/screen';
import { CreditsScreen } from './CreditsScreen';
import { SettingsScreen } from './SettingsScreen';

export const route: ScreenRoute = {
  path: '/settings',
  element: <SettingsScreen />,
  children: [{ path: 'credits', element: <CreditsScreen /> }],
  chrome: 'app',
  auth: 'required',
};
