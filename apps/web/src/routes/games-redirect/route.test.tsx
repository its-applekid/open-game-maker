import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { LegacyGamesRedirect } from './route';

function Location() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}`}</output>;
}

function renderRedirect(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/games" element={<LegacyGamesRedirect />} />
        <Route path="/all" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('legacy /games address', () => {
  afterEach(() => cleanup());

  it('sends the old list address to /all', async () => {
    renderRedirect('/games');

    expect(await screen.findByText('/all')).toBeVisible();
  });

  it('carries the query so a spotlight link keeps working', async () => {
    renderRedirect('/games?spotlight=g_1');

    expect(await screen.findByText('/all?spotlight=g_1')).toBeVisible();
  });
});
