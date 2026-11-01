import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Notify = typeof import('./index') & typeof import('./slice');

let notify: Notify;
let calls: { url: string; init?: RequestInit }[];

function respond(routes: Record<string, () => Response>) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return routes[url]?.() ?? new Response('', { status: 404 });
    }),
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(async () => {
  vi.resetModules();
  notify = { ...(await import('./index')), ...(await import('./slice')) };
  const subscription = {
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'pk', auth: 'au' }, expirationTime: null }),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { subscribe: vi.fn(async () => subscription) } }) },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('subscribePush', () => {
  it('registers the browser subscription with the backend', async () => {
    respond({
      '/api/v1/push/vapid': () => json({ publicKey: 'BEl6' }),
      '/api/v1/push/subscriptions': () => json({}, 201),
    });

    await notify.subscribePush();

    const post = calls.find((c) => c.url === '/api/v1/push/subscriptions');
    expect(post?.init?.method).toBe('POST');
    expect(JSON.parse(post!.init!.body as string)).toEqual({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'pk', auth: 'au' },
    });
  });

  it('posts nothing while the backend has no push key route yet', async () => {
    respond({});

    await expect(notify.subscribePush()).rejects.toMatchObject({ name: 'ApiError', status: 404 });
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/push/vapid']);
  });
});

describe('requestPushPermission', () => {
  it('remembers a denial so the prompt is not offered again', async () => {
    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => 'denied') });
    expect(notify.canAskForPush()).toBe(true);

    await notify.requestPushPermission();

    expect(notify.canAskForPush()).toBe(false);
  });
});

describe('useNotificationFeed', () => {
  class FakeEventSource extends EventTarget {
    static CLOSED = 2;
    static last: FakeEventSource;
    readyState = 0;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    close = vi.fn();
    constructor(public url: string) {
      super();
      FakeEventSource.last = this;
    }
  }

  it('shows a toast for a finished build', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const { unmount } = renderHook(() => notify.useNotificationFeed());

    expect(FakeEventSource.last.url).toBe('/api/v1/notifications/stream');
    FakeEventSource.last.dispatchEvent(
      new MessageEvent('build.done', { data: JSON.stringify({ text: 'Mossy Leap is built' }) }),
    );

    expect(notify.notifyState().toasts.map((t) => t.text)).toEqual(['Mossy Leap is built']);
    unmount();
    expect(FakeEventSource.last.close).toHaveBeenCalled();
  });
});
