type TestRouter = {
  navigate(to: string): unknown;
  state: { location: { pathname: string } };
};

export type OgmHost = {
  version: 1;
  route(): string;
  navigate(to: string): void;
  register(name: string, api: object): void;
  get(name: string): object | undefined;
  snapshot(): { route: string; registered: string[] };
  admin?: { readonly route: string; readonly lastTimeline: unknown };
};

declare global {
  interface Window {
    __ogmHost?: OgmHost;
  }
}

export function installTestHook(router: TestRouter): OgmHost | undefined {
  if (!new URLSearchParams(window.location.search).has('test')) {
    return undefined;
  }

  const registry = new Map<string, object>();
  const host: OgmHost = {
    version: 1,
    route: () => router.state.location.pathname,
    navigate: (to) => {
      void router.navigate(to);
    },
    register: (name, api) => {
      if (registry.has(name)) {
        throw new Error(`test API ${name} is already registered`);
      }
      registry.set(name, api);
    },
    get: (name) => registry.get(name),
    snapshot: () => ({
      route: router.state.location.pathname,
      registered: [...registry.keys()].sort(),
    }),
  };

  window.__ogmHost = host;
  return host;
}

export function registerTestApi(name: string, api: object): void {
  window.__ogmHost?.register(name, api);
}
