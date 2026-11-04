import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  authClient: {
    signIn: {
      magicLink: vi.fn(),
      passkey: vi.fn(),
      social: vi.fn(),
    },
    passkey: { addPasskey: vi.fn() },
    useListPasskeys: vi.fn(),
  },
  authErrorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
  getAuthCapabilities: vi.fn(),
  safeNext: (value: string | null, fallback: string) => value ?? fallback,
  useSession: vi.fn(),
}));

vi.mock('../../lib/api/auth', () => auth);

import { SignInScreen } from './SignInScreen';

function renderSignIn(entry = '/signin') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/signin" element={<SignInScreen />} />
        <Route path="/games" element={<h1>Games destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function enablePasskeys() {
  vi.stubGlobal('PublicKeyCredential', {
    isConditionalMediationAvailable: vi.fn(async () => false),
  });
}

beforeEach(() => {
  auth.authClient.signIn.magicLink.mockResolvedValue({ data: { status: true }, error: null });
  auth.authClient.signIn.passkey.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  auth.authClient.signIn.social.mockResolvedValue({ data: { url: 'https://accounts.google.com' }, error: null });
  auth.authClient.passkey.addPasskey.mockResolvedValue({ data: {}, error: null });
  auth.authClient.useListPasskeys.mockReturnValue({ data: [], isPending: false });
  auth.getAuthCapabilities.mockResolvedValue({ providers: ['magic-link', 'passkey', 'google'] });
  auth.useSession.mockReturnValue({ data: null, isPending: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('SignInScreen', { timeout: 10_000 }, () => {
  it('sends a magic link and shows the check-email state', async () => {
    renderSignIn('/signin?next=%2Fgames');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'kim@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Check your email');
    expect(auth.authClient.signIn.magicLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'kim@example.com', callbackURL: expect.stringContaining('/signin?') }),
    );
  });

  it('keeps the sent confirmation tied to the submitted email', async () => {
    let resolve!: (value: { data: { status: boolean }; error: null }) => void;
    auth.authClient.signIn.magicLink.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    renderSignIn();

    const input = screen.getByLabelText('Email');
    fireEvent.change(input, { target: { value: 'first@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    fireEvent.change(input, { target: { value: 'second@example.com' } });
    await act(async () => resolve({ data: { status: true }, error: null }));

    expect(await screen.findByRole('status')).toHaveTextContent('first@example.com');
    expect(screen.queryByText(/second@example.com/)).not.toBeInTheDocument();
  });

  it('hides Google when the backend reports it unconfigured', async () => {
    auth.getAuthCapabilities.mockResolvedValue({ providers: ['magic-link', 'passkey'] });
    renderSignIn();

    await waitFor(() => expect(auth.getAuthCapabilities).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
  });

  it('calls passkey and Google sign-in when those methods are available', async () => {
    enablePasskeys();
    renderSignIn();

    fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));

    expect(auth.authClient.signIn.passkey).toHaveBeenCalledWith();
    expect(auth.authClient.signIn.social).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
  });

  it('starts conditional passkey mediation only while the screen is mounted', async () => {
    const conditional = vi.fn(async () => true);
    vi.stubGlobal('PublicKeyCredential', { isConditionalMediationAvailable: conditional });
    const view = renderSignIn();

    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email webauthn');
    await waitFor(() => expect(auth.authClient.signIn.passkey).toHaveBeenCalledWith({ autoFill: true }));

    auth.authClient.signIn.passkey.mockClear();
    let availability!: (available: boolean) => void;
    conditional.mockReturnValueOnce(new Promise((resolve) => (availability = resolve)));
    view.unmount();
    const remounted = renderSignIn();
    remounted.unmount();
    await act(async () => availability(true));

    expect(auth.authClient.signIn.passkey).not.toHaveBeenCalled();
  });

  it('shows ordinary sign-in errors and permits a retry', async () => {
    enablePasskeys();
    auth.authClient.signIn.passkey.mockRejectedValueOnce(new Error('Passkey was cancelled.'));
    renderSignIn();

    fireEvent.click(await screen.findByRole('button', { name: 'Use a passkey' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Passkey was cancelled.');
    expect(screen.getByRole('button', { name: 'Use a passkey' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use a passkey' }));
    await waitFor(() => expect(auth.authClient.signIn.passkey).toHaveBeenCalledTimes(2));
  });

  it('offers passkey registration after a magic-link completion', async () => {
    enablePasskeys();
    auth.useSession.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    renderSignIn('/signin?next=%2Fgames&magic=1');

    fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }));

    await waitFor(() =>
      expect(auth.authClient.passkey.addPasskey).toHaveBeenCalledWith({
        fetchOptions: { signal: expect.any(AbortSignal) },
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Games destination' })).toBeVisible();
  });

  it('starts only one passkey registration when activation re-enters before rendering', async () => {
    enablePasskeys();
    auth.useSession.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    auth.authClient.passkey.addPasskey.mockReturnValue(new Promise(() => undefined));
    const view = renderSignIn('/signin?next=%2Fgames&magic=1');

    const button = await screen.findByRole('button', { name: 'Add a passkey' });
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(auth.authClient.passkey.addPasskey).toHaveBeenCalledTimes(1);
    expect(auth.authClient.passkey.addPasskey).toHaveBeenCalledWith({
      fetchOptions: { signal: expect.any(AbortSignal) },
    });
    const signal = auth.authClient.passkey.addPasskey.mock.calls[0]?.[0]?.fetchOptions.signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it('keeps passkey enrollment recoverable and prevents skipping a pending save', async () => {
    enablePasskeys();
    auth.useSession.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    let reject!: (error: Error) => void;
    auth.authClient.passkey.addPasskey.mockReturnValueOnce(new Promise((_, fail) => (reject = fail)));
    renderSignIn('/signin?next=%2Fgames&magic=1');

    fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }));
    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
    await act(async () => reject(new Error('Registration cancelled.')));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Registration cancelled. You can still sign in with an email link.',
    );
    expect(screen.getByRole('button', { name: 'Add a passkey' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('heading', { name: 'Games destination' })).toBeVisible();
  });

  it('uses a fresh registration request after a failed attempt', async () => {
    enablePasskeys();
    auth.useSession.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    auth.authClient.passkey.addPasskey.mockRejectedValueOnce(new Error('Registration cancelled.'));
    renderSignIn('/signin?next=%2Fgames&magic=1');

    fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }));
    await screen.findByRole('alert');
    const firstSignal = auth.authClient.passkey.addPasskey.mock.calls[0]?.[0]?.fetchOptions.signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));

    expect(firstSignal.aborted).toBe(false);
    const retrySignal = auth.authClient.passkey.addPasskey.mock.calls[1]?.[0]?.fetchOptions.signal as AbortSignal;
    expect(retrySignal).not.toBe(firstSignal);
    expect(retrySignal.aborted).toBe(false);
    expect(await screen.findByRole('heading', { name: 'Games destination' })).toBeVisible();
  });

  it('sends an existing session to next', async () => {
    auth.useSession.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    renderSignIn('/signin?next=%2Fgames');

    expect(await screen.findByRole('heading', { name: 'Games destination' })).toBeVisible();
  });
});
