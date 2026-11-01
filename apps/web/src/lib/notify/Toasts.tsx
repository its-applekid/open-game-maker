import { useEffect } from 'react';

import { dismissToast, useNotify, type Toast } from './slice';
import './toasts.css';

const SHOW_MS = 6000;

export function Toasts() {
  const toasts = useNotify((s) => s.toasts);
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <ToastLine key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastLine({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);
  return <p className="toast">{toast.text}</p>;
}
