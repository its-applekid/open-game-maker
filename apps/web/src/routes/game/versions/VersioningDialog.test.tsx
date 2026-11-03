import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VersioningDialog } from './VersioningDialog';

describe('VersioningDialog', () => {
  it('traps focus, closes on Escape while idle, and restores the invoking control', async () => {
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });

    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'New version' });
    const name = screen.getByRole('textbox', { name: 'Name' });
    const confirm = screen.getByRole('button', { name: 'Create' });
    await waitFor(() => expect(name).toHaveFocus());

    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(name).toHaveFocus();

    name.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  }, 10_000);
});

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open ? (
        <VersioningDialog title="New version" onClose={() => setOpen(false)}>
          <label>
            Name
            <input aria-label="Name" />
          </label>
          <button type="button">Create</button>
        </VersioningDialog>
      ) : null}
    </>
  );
}
