import { api } from '../api/client';
import { notifyState, setDenied } from './slice';

// Web Push: asked for only from a tap, never on load. A denial is remembered so the prompt is not offered again.
// The public-key route is OGM-016's to name; this is the one place to change when it does.
export async function fetchVapidPublicKey(): Promise<string> {
  const { publicKey } = await api<{ publicKey: string }>('/push/vapid');
  return publicKey;
}

export function canAskForPush(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator && !notifyState().denied;
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') setDenied(true);
  return permission;
}

export async function subscribePush(): Promise<void> {
  const key = await fetchVapidPublicKey();
  const registration = await navigator.serviceWorker.ready;
  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  const { endpoint, keys } = sub.toJSON();
  await api('/push/subscriptions', { method: 'POST', json: { endpoint, keys } });
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
