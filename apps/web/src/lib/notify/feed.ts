import { useEffect } from 'react';

import { sse } from '../api/client';
import { pushToast } from './slice';

// One SSE connection for the whole app, shared by every screen that shows the feed. EventSource reconnects by itself
// after a dropped connection; a stream that never opens (OGM-016 not merged, signed out) is retried with backoff and
// then left closed.
const EVENTS = ['build.done', 'job.started', 'intake.report'] as const;
const MAX_FAILED_OPENS = 5;

let users = 0;
let source: EventSource | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let failedOpens = 0;

export function useNotificationFeed(): void {
  useEffect(() => {
    if (users++ === 0) open();
    return () => {
      if (--users === 0) close();
    };
  }, []);
}

function open(): void {
  const es = (source = sse('/notifications/stream'));
  es.onopen = () => {
    failedOpens = 0;
  };
  for (const name of EVENTS) es.addEventListener(name, (e) => pushToast(toastText(e as MessageEvent<string>)));
  es.onerror = () => {
    if (es.readyState !== EventSource.CLOSED) return;
    source = null;
    if (++failedOpens >= MAX_FAILED_OPENS) return;
    retry = setTimeout(
      () => {
        if (users > 0 && !source) open();
      },
      1000 * 2 ** failedOpens,
    );
  };
}

function close(): void {
  clearTimeout(retry);
  source?.close();
  source = null;
  failedOpens = 0;
}

function toastText(e: MessageEvent<string>): string {
  try {
    const data = JSON.parse(e.data) as { text?: unknown };
    if (typeof data.text === 'string') return data.text;
  } catch {
    /* plain text payload */
  }
  return e.data;
}
