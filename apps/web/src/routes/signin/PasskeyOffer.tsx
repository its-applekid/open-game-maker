import { useEffect, useRef, useState } from 'react';

import { authClient, authErrorMessage } from '../../lib/api/auth';

export function PasskeyOffer({ onDone }: { onDone: () => void }) {
  const passkeys = authClient.useListPasskeys();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (passkeys.data && passkeys.data.length > 0) onDone();
  }, [onDone, passkeys.data]);

  async function addPasskey() {
    setSaving(true);
    setError('');
    try {
      const result = await authClient.passkey.addPasskey();
      if (result.error) throw result.error;
      if (mounted.current) onDone();
    } catch (caught) {
      if (!mounted.current) return;
      setError(authErrorMessage(caught, 'Could not add the passkey.'));
      setSaving(false);
    }
  }

  if (passkeys.isPending || (passkeys.data?.length ?? 0) > 0) return null;
  return (
    <main className="auth-screen signin-screen">
      <section className="auth-card passkey-offer">
        <h1>Make next time easier</h1>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button className="auth-primary" disabled={saving} type="button" onClick={() => void addPasskey()}>
          {saving ? 'Adding…' : 'Add a passkey'}
        </button>
        <button className="auth-skip" disabled={saving} type="button" onClick={onDone}>
          Not now
        </button>
      </section>
    </main>
  );
}
