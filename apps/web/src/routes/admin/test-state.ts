import { registerTestApi } from '../../app/testHook';

export const adminTestState: { lastTimeline: unknown } = { lastTimeline: null };
let registered = false;

export function registerAdminTestApi(): void {
  if (registered || !window.__ogmHost) return;
  const api = {
    get route() {
      return window.location.pathname;
    },
    get lastTimeline() {
      return adminTestState.lastTimeline;
    },
  };
  registerTestApi('admin', api);
  window.__ogmHost.admin = api;
  registered = true;
}
