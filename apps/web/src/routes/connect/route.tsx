import type { ScreenRoute } from '../../app/screen';
import { ConnectGitHubScreen } from './ConnectGitHubScreen';

export const route: ScreenRoute = {
  path: '/connect/github',
  element: <ConnectGitHubScreen />,
  chrome: 'bare',
  auth: 'required',
};
