import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { LoginRedirect } from './route';

function Location() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}`}</output>;
}

function renderLogin(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginRedirect />} />
        <Route path="/signin" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the shareable sign-in URL', () => {
  it('sends /login to the sign-in screen', async () => {
    renderLogin('/login');

    expect(await screen.findByText('/signin')).toBeInTheDocument();
  });

  it('keeps the destination, so a deep link signs in and then continues to the game', async () => {
    renderLogin('/login?next=%2Fg%2Fg-1');

    expect(await screen.findByText('/signin?next=%2Fg%2Fg-1')).toBeInTheDocument();
  });
});
